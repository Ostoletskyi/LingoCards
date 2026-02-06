// tools/fix_verbs_rich.mjs
import fs from "node:fs";

function parseArgs(argv){
  const out = { in: "", out: "", report: "" };
  for (let i=2; i<argv.length; i++){
    const a = argv[i];
    if (a === "--in") out.in = argv[++i] ?? "";
    else if (a === "--out") out.out = argv[++i] ?? "";
    else if (a === "--report") out.report = argv[++i] ?? "";
  }
  return out;
}

function readJson(p){
  const txt = fs.readFileSync(p, "utf8");
  return JSON.parse(txt);
}
function writeJson(p, obj){
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function asStr(x){ return (x === null || x === undefined) ? "" : String(x); }
function trim(x){ return asStr(x).trim(); }

function hasCyrillic(s){
  return /[А-Яа-яЁё]/.test(s);
}

function cleanPrefixToken(s){
  let t = trim(s);
  if (!t) return "";

  // вырезаем скобки/кавычки/мусор
  t = t.replace(/[()"'`]/g, "");
  t = t.replace(/\s+/g, "");

  // "verweigern" и подобное — это НЕ приставка, а слово (длинное)
  if (t.length > 10) return "";
  if (hasCyrillic(t)) return "";
  if (!/^[A-Za-zÄÖÜäöüß\-]+$/.test(t)) return "";

  // привести к виду "ab-" / "zurück-"
  if (!t.endsWith("-")) t = t + "-";

  // длина приставки без дефиса
  const core = t.slice(0, -1);

  // допустимы короткие приставки и "zurück"
  if (core.length < 1 || core.length > 10) return "";

  return t;
}

function uniq(arr){
  const seen = new Set();
  const out = [];
  for (const x of arr){
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

// ---------- строгая грамматика приставок ----------

// Канонический список НЕОТДЕЛЯЕМЫХ приставок (они ВСЕГДА inseparable)
const INSEPARABLE = new Set([
  "be-","emp-","ent-","er-","ge-","miss-","ver-","zer-"
]);

// Часто встречающиеся ОТДЕЛЯЕМЫЕ приставки (можно расширять)
const SEPARABLE = new Set([
  "ab-","an-","auf-","aus-","bei-","ein-","fest-","fort-",
  "her-","hin-","los-","mit-","nach-","vor-","weg-","zu-","zurück-",
  "zusammen-","dazu-","darauf-","darin-","davon-","davor-","danach-"
]);

function normalizePrefixesToTwoLines(v){
  const p = v?.prefixes;

  const sepRaw = Array.isArray(p?.separable) ? p.separable : [];
  const insRaw = Array.isArray(p?.inseparable) ? p.inseparable : [];
  let notes = trim(p?.notes ?? "");

  // выкинуть мусорные заглушки
  if (/^не\s*применимо\.?$/i.test(notes)) notes = "";
  if (/^n\/a$/i.test(notes)) notes = "";

  const sep = uniq(sepRaw.map(cleanPrefixToken).filter(Boolean));
  const ins = uniq(insRaw.map(cleanPrefixToken).filter(Boolean));

  const lines = [];

  // 1) показываем только непустые строки
  if (sep.length) lines.push(`отделяемые: ${sep.join(", ")}`);
  if (ins.length) lines.push(`неотделяемые: ${ins.join(", ")}`);

  // 2) notes добавляем только если реально полезно
  // и всегда с явной меткой
  if (notes) lines.push(`примечание: ${notes}`);

  // 3) если вообще ничего нет — возвращаем пусто (блок должен скрыться)
  return lines;
}

// ---------- examples cleanup ----------

function stripExampleLabel(s){
  let t = trim(s);
  if (!t) return "";

  // убираем только в начале строки
  t = t.replace(/^(Präsens|Praesens)\s*:\s*/i, "");
  t = t.replace(/^(Präteritum|Praeteritum)\s*:\s*/i, "");
  t = t.replace(/^Perfekt\s*:\s*/i, "");
  t = t.replace(/^Modal(\s*\([^)]*\))?\s*:\s*/i, "");
  return t.trim();
}

function cleanExamples(v){
  const ex = v?.examples;
  if (!ex || typeof ex !== "object") return false;

  let changed = false;

  // examples: { praesens:{de,ru}, modal:{modalVerb,de,ru}, praeteritum:{...}, perfekt:{...} }
  const keys = ["praesens","modal","praeteritum","perfekt"];
  for (const k of keys){
    const o = ex[k];
    if (!o || typeof o !== "object") continue;

    if ("de" in o){
      const before = asStr(o.de);
      const after = stripExampleLabel(o.de);
      if (before !== after){ o.de = after; changed = true; }
    }

    // RU ярлыки тоже иногда встречаются, но обычно ты хочешь убрать и там, чтобы не мешали
    if ("ru" in o){
      const before = asStr(o.ru);
      const after = stripExampleLabel(o.ru);
      if (before !== after){ o.ru = after; changed = true; }
    }
  }

  return changed;
}

function cleanTranslations(v){
  if (!Array.isArray(v.translations)) return false;
  const beforeLen = v.translations.length;

  while (v.translations.length && !trim(v.translations[v.translations.length - 1])){
    v.translations.pop();
  }

  return beforeLen !== v.translations.length;
}

// ---------- main ----------

function main(){
  const args = parseArgs(process.argv);
  if (!args.in || !args.out){
    console.log("Usage: node fix_verbs_rich.mjs --in verbs_rich.json --out verbs_rich.fixed.json [--report report.json]");
    process.exit(2);
  }

  const data = readJson(args.in);

  // где лежит массив глаголов
  const verbs = Array.isArray(data?.verbs) ? data.verbs : (Array.isArray(data) ? data : null);
  if (!verbs){
    console.error("[FAIL] Cannot find verbs array (expected {verbs:[...]})");
    process.exit(3);
  }

  const report = {
    total: verbs.length,
    prefixes: {
      changed: 0,
      emptied: 0,
      movedSepToIns: 0,
      movedInsToSep: 0,
      droppedUnknown: 0
    },
    examples: { changed: 0 },
    translations: { trimmed: 0 },
    suspicious: { cyrillicInDe: 0 },
  };

  for (const v of verbs){
    // 1) prefixes -> две строки (строго)
    const before = JSON.stringify(v.prefixes ?? null);
    const lines = normalizePrefixesToTwoLines(v, report);
    v.prefixes = lines; // теперь массив строк: рендерит красиво и без [object Object]
    const after = JSON.stringify(v.prefixes ?? null);

    if (before !== after) report.prefixes.changed++;
    if (Array.isArray(lines) && lines.length === 0) report.prefixes.emptied++;

    // 2) примеры: убрать ярлыки в тексте
    if (cleanExamples(v)) report.examples.changed++;

    // 3) переводы: убрать пустые хвосты
    if (cleanTranslations(v)) report.translations.trimmed++;

    // 4) QA: кириллица в немецких примерах (это реально бывает, как у тебя)
    const ex = v?.examples;
    if (ex && typeof ex === "object"){
      for (const k of ["praesens","modal","praeteritum","perfekt"]){
        const o = ex[k];
        const de = trim(o?.de ?? "");
        if (de && hasCyrillic(de)) report.suspicious.cyrillicInDe++;
      }
    }
  }

  writeJson(args.out, data);
  if (args.report) writeJson(args.report, report);

  console.log(`[OK] Wrote: ${args.out}`);
  if (args.report) console.log(`[OK] Report: ${args.report}`);
  console.log(`[LC] Verbs: ${verbs.length}`);
  console.log(`[LC] Prefixes changed: ${report.prefixes.changed} (emptied: ${report.prefixes.emptied})`);
  console.log(`[LC] Prefixes moved: sep->ins=${report.prefixes.movedSepToIns}, ins->sep=${report.prefixes.movedInsToSep}, droppedUnknown=${report.prefixes.droppedUnknown}`);
  console.log(`[LC] Examples changed: ${report.examples.changed}`);
  console.log(`[LC] Translations trimmed: ${report.translations.trimmed}`);
  console.log(`[LC] Suspicious: cyrillicInDe=${report.suspicious.cyrillicInDe}`);
}

main();
