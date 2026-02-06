// js/data/verbsLoad.js

function asStr(x){
  if (x === null || x === undefined) return "";
  return String(x);
}

function trimStr(x){
  return asStr(x).trim();
}

function asArr(x){
  if (Array.isArray(x)) return x;
  if (typeof x === "string" && x.trim()) return [x];
  return [];
}

function splitLinesSmart(x){
  const s = trimStr(x);
  if (!s) return [];
  return s.split(/\r?\n/g).map(v => v.trim()).filter(Boolean);
}

function pickFirst(obj, keys){
  // берёт первое непустое значение по списку ключей
  for (const k of keys){
    if (!k) continue;
    const v = obj?.[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "string"){
      if (v.trim()) return v;
      continue;
    }
    // числа/объекты/массивы — тоже возвращаем, дальше нормализуем
    return v;
  }
  return undefined;
}

function normalizeFreq(v){
  // поддержка:
  // freq: 5
  // frequency: 5
  // freq: { score:5, label:"TOP" }
  // freq_raw: "TOP = 5"
  // freq_score: 5
  const f =
    v?.freq ??
    v?.frequency ??
    v?.freq_score ??
    v?.frequency_score ??
    v?.freq_raw ??
    0;

  if (typeof f === "number") return Number.isFinite(f) ? f : 0;

  if (typeof f === "string"){
    const m = f.match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  }

  if (f && typeof f === "object"){
    const n = Number(f.score ?? f.value ?? f.freq_score ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function normalizeForms(v){
  // поддержка разных форматов:
  // forms: { p3, pret, p2, aux }
  // forms: { praesens3, praeteritum3, perfekt:{aux,partizip2,full} }
  // forms: [p3, pret, "hat ..."]  (из Excel)
  // forms_lines / formsLine / "forms (3 lines)" (алиасы)
  const finRaw =
    v?.forms ??
    pickFirst(v, ["forms_lines","formsLine","forms (3 lines)","forms_3_lines"]) ??
    {};

  const out = { p3:"", pret:"", p2:"", aux:"" };

  // если finRaw — строка с 3 строками
  if (typeof finRaw === "string" && finRaw.includes("\n")){
    const a = splitLinesSmart(finRaw);
    const fin = a;
    if (fin[0]) out.p3 = fin[0];
    if (fin[1]) out.pret = fin[1];
    if (fin[2]){
      const parts = fin[2].split(/\s+/);
      if (parts[0]) out.aux = parts[0];
      if (parts.length > 1) out.p2 = parts.slice(1).join(" ");
    }
    // NOTE: forms are an object {p3, pret, aux, p2}. Earlier a bad refactor
    // accidentally tried to `.filter()` this object, which broke imports.
    return out;
  }

  // если finRaw — массив
  if (Array.isArray(finRaw)){
    const a = finRaw.map(trimStr).filter(Boolean);
    if (a[0]) out.p3 = a[0];
    if (a[1]) out.pret = a[1];
    if (a[2]){
      const parts = a[2].split(/\s+/);
      if (parts[0]) out.aux = parts[0];
      if (parts.length > 1) out.p2 = parts.slice(1).join(" ");
    }
    return out;
  }

  const fin = finRaw || {};

  // вариант 1: уже плоско
  out.p3   = trimStr(fin.p3 ?? fin.praesens_3 ?? fin.prasens_3 ?? fin.praesens3);
  out.pret = trimStr(fin.pret ?? fin.praeteritum ?? fin.praeteritum3 ?? fin.prateritum);
  out.p2   = trimStr(fin.p2 ?? fin.partizip_2 ?? fin.partizip2 ?? fin.partizip);
  out.aux  = trimStr(fin.aux ?? fin.auxiliary ?? fin.hilfsverb);

  // вариант 2: формат "perfekt"
  if ((!out.aux || !out.p2) && fin.perfekt && typeof fin.perfekt === "object"){
    const aux = trimStr(fin.perfekt.aux);
    const p2  = trimStr(fin.perfekt.partizip2 ?? fin.perfekt.partizip_2 ?? fin.perfekt.p2);
    if (!out.aux) out.aux = aux;
    if (!out.p2) out.p2 = p2;

    const full = trimStr(fin.perfekt.full);
    if ((!out.aux || !out.p2) && full){
      const parts = full.split(/\s+/);
      if (parts.length >= 2){
        if (!out.aux) out.aux = parts[0];
        if (!out.p2) out.p2 = parts.slice(1).join(" ");
      }
    }
  }

  // Fix frequent data issue: some "sein" verbs get imported with "hat".
  // We do a minimal, conservative correction for high-frequency verbs.
  try{
    const inf = trimStr(v?.infinitive ?? v?.inf ?? v?.Infinitiv).toLowerCase();
    const seinVerbs = new Set([
      'gehen','kommen','fahren','laufen','rennen','fliegen','reisen','steigen','fallen','sterben',
      'bleiben','werden','passieren','wachsen','aufstehen','einsteigen','aussteigen','ankommen',
      'abfahren','zurueckkommen','zurückkommen','umziehen','aufwachen','einschlafen','aufwachsen',
      'hinfahren','herkommen'
    ]);
    if (inf && seinVerbs.has(inf)){
      const a = trimStr(out.aux).toLowerCase();
      if (a === 'hat') out.aux = 'ist';
    }
  }catch(e){ /* ignore */ }

  return out;
}

function normalizeTranslations(v){
  // поддержка:
  // meanings / translations / translations.ru / translations_lines / translationsLine / "translations (lines)"
  let arr =
    asArr(v?.meanings).length ? asArr(v.meanings) :
    asArr(v?.translations).length ? asArr(v.translations) :
    asArr(v?.translations_ru).length ? asArr(v.translations_ru) :
    [];

  // schema v2: translations: { ru:[...] }
  if ((!arr || !arr.length) && v?.translations && typeof v.translations === "object"){
    const ru = v.translations.ru;
    if (Array.isArray(ru)) arr = ru;
  }

  // алиасы из LC_Parsed
  if ((!arr || !arr.length)){
    const tLines = pickFirst(v, ["translations_lines","translationsLine","translations (lines)","translations_lines_ru"]);
    if (typeof tLines === "string") arr = splitLinesSmart(tLines);
    else if (Array.isArray(tLines)) arr = tLines;
  }

  // если дали одним блоком строки
  if (arr.length === 1 && typeof arr[0] === "string" && arr[0].includes("\n")){
    arr = splitLinesSmart(arr[0]);
  }

  return arr.map(trimStr).filter(Boolean);
}

function normalizeSynonyms(v){
  // поддержка:
  // synonyms: [{word, translation}, ...]
  // synonyms: [{de,ru}, ...]
  // synonyms: ["anfangen — начинать", ...]
  // synonyms_lines / synonymsLine / "synonyms (lines)"
  const s =
    v?.synonyms ??
    pickFirst(v, ["synonyms_lines","synonymsLine","synonyms (lines)"]);

  if (!s) return [];

  if (typeof s === "string"){
    return splitLinesSmart(s);
  }

  if (Array.isArray(s)){
    if (s.every(x => typeof x === "string")) return s.map(trimStr).filter(Boolean);

    const lines = [];
    for (const it of s){
      if (!it || typeof it !== "object") continue;
      const de = trimStr(it.word ?? it.de ?? it.syn ?? it.lemma);
      const ru = trimStr(it.translation ?? it.ru ?? it.tr);
      if (!de && !ru) continue;
      lines.push(ru ? `${de} — ${ru}` : de);
    }
    return lines;
  }

  return [];
}

function normalizePrefixes(v){
  // prefixes может быть:
  // 1) массив объектов
  // 2) строка-блок
  // 3) объект { separable, inseparable, notes } (из LC_Parsed)
  // 4) алиасы prefixes_lines / prefixesLine / "prefixes (lines)"
  const p =
    v?.prefixes ??
    pickFirst(v, ["prefixes_lines","prefixesLine","prefixes (lines)","prefixes_lines_raw"]);

  if (!p) return [];

  // 1) массив объектов
  if (Array.isArray(p)){
    return p.map(x => {
      if (!x || typeof x !== "object") return null;
      return {
        ...x,
        prefix: trimStr(x.prefix ?? x.word),
        meaning: trimStr(x.meaning ?? x.translation ?? ""),
        examples: Array.isArray(x.examples) ? x.examples.map(trimStr).filter(Boolean) : splitLinesSmart(x.examples),
        examples_ru: Array.isArray(x.examples_ru) ? x.examples_ru.map(trimStr).filter(Boolean) : splitLinesSmart(x.examples_ru),
      };
    }).filter(x => {
      if (!x) return false;
      // "ge-" is NOT a verb prefix (it's a Partizip II marker), so keep it out.
      const px = trimStr(x.prefix).toLowerCase();
      return !(px === 'ge' || px === 'ge-' || px === 'ge–' || px === 'ge—');
    });
  }

  // 2) строковый формат — делаем псевдо-объект, чтобы prefixesBlock показал строки
  if (typeof p === "string"){
    const lines = splitLinesSmart(p);
    if (!lines.length) return [];
    return [{
      prefix: "prefixes",
      meaning: "",
      examples: lines,
      examples_ru: []
    }];
  }

  // 3) объектный формат LC_Parsed
  if (p && typeof p === "object"){
    const lines = [];
    const sep = p.separable ?? p.sep ?? p.separablePrefixes;
    const inse = p.inseparable ?? p.insep ?? p.inseparablePrefixes;
    const notes = trimStr(p.notes ?? p.note ?? "");

    const fmt = (label, val) => {
      if (Array.isArray(val)) val = val.filter(Boolean).join(", ");
      const s = trimStr(val);
      return `${label}: ${s || "—"}`;
    };

    if (sep !== undefined) lines.push(fmt("отделяемые", sep));
    if (inse !== undefined) lines.push(fmt("неотделяемые", inse));
    if (notes) lines.push(notes);

    if (!lines.length) return [];
    return [{
      prefix: "prefixes",
      meaning: "",
      examples: lines,
      examples_ru: []
    }];
  }

  return [];
}

function normalizeExamples(v){
  // Если examples.{praesens|modal|...} = {de,ru,...},
  // превращаем в строки и складываем ru отдельно.
  const exIn = v?.examples;
  const outDe = {};
  const outRu = {};

  const setKV = (k, deStr, ruStr) => {
    const de = trimStr(deStr);
    const ru = trimStr(ruStr);
    if (de) outDe[k] = de;
    if (ru) outRu[k] = ru;
  };

  if (exIn && typeof exIn === "object" && !Array.isArray(exIn)){
    const keys = ["praesens","modal","praeteritum","perfekt","partizip","impersonal"];
    for (const k of keys){
      const val = exIn[k];
      if (!val) continue;

      if (typeof val === "object" && !Array.isArray(val)){
        const de = trimStr(val.de);
        const ru = trimStr(val.ru);
        const mv = trimStr(val.modalVerb ?? val.modal);

        if (k === "modal"){
          const head = mv ? `Modal (${mv}): ` : "Modal: ";
          setKV(k, de ? (de.startsWith("Modal") ? de : head + de) : "", ru);
        } else {
          const headMap = {
            praesens: "Präsens: ",
            praeteritum: "Präteritum: ",
            perfekt: "Perfekt: ",
            partizip: "Partizip: ",
            impersonal: ""
          };
          const head = headMap[k] ?? "";
          setKV(k, de ? (de.match(/^(Präsens|Präteritum|Perfekt|Partizip):/i) ? de : head + de) : "", ru);
        }
        continue;
      }

      if (typeof val === "string"){
        setKV(k, val, "");
        continue;
      }
    }
  }

  // алиасы examples_lines / examplesLine / "examples (lines)" (если когда-то добавишь в экспорт)
  if (!Object.keys(outDe).length){
    const exLines = pickFirst(v, ["examples_lines","examplesLine","examples (lines)"]);
    if (typeof exLines === "string" && exLines.trim()){
      // кладём как массив строк
      return {
        examples: splitLinesSmart(exLines),
        examples_ru: null,
        example_ru: trimStr(v?.example_ru ?? "")
      };
    }
  }

  const exRuIn = (v?.examples_ru && typeof v.examples_ru === "object") ? v.examples_ru : null;
  if (exRuIn){
    for (const k of Object.keys(exRuIn)){
      const s = trimStr(exRuIn[k]);
      if (s) outRu[k] = s;
    }
  }

  return {
    examples: Array.isArray(exIn) ? exIn.map(trimStr).filter(Boolean) : outDe,
    examples_ru: Object.keys(outRu).length ? outRu : null,
    example_ru: trimStr(v?.example_ru ?? "")
  };
}

function normalizeVerb(v){
  if (!v || typeof v !== "object") return null;

  // schema v2 (cards[])
  const isCard = v?.type === "verb" && v?.lemma && typeof v.lemma === "object";

  const inf = isCard
    ? trimStr(v.lemma.infinitive)
    : trimStr(v.inf ?? v.infinitive ?? v.Inf ?? v.lemma ?? v.base ?? v.id);

  if (!inf) return null;

  // ✅ частотность
  const freq = isCard ? normalizeFreq(v.freq ?? v.frequency ?? v) : normalizeFreq(v);

  // ✅ формы
  const forms = isCard
    ? normalizeForms({
        forms: {
          praesens_3: v.forms?.praesens3 ?? v.forms?.praesens_3,
          praeteritum: v.forms?.praeteritum3 ?? v.forms?.praeteritum,
          auxiliary: v.forms?.perfekt?.aux ?? v.forms?.aux,
          partizip_2: v.forms?.perfekt?.partizip2 ?? v.forms?.p2
        }
      })
    : normalizeForms(v);

  // ✅ переводы
  const meanings = isCard
    ? (Array.isArray(v.translations?.ru) ? v.translations.ru.map(trimStr).filter(Boolean) : [])
    : normalizeTranslations(v);

  // ✅ синонимы строками
  const synLines = normalizeSynonyms(v);

  // ✅ приставки как массив объектов
  const prefObjs = normalizePrefixes(v);

  // ✅ примеры нормализуем (убиваем [object Object] в примерах)
  const exNorm = normalizeExamples(v);

  return {
    inf,
    forms,
    freq,

    meanings,
    translations: meanings,

    rektion: Array.isArray(v.rektion) ? v.rektion.map(trimStr).filter(Boolean) : [],
    rektion_usage: (v.rektion_usage && typeof v.rektion_usage === "object") ? v.rektion_usage : {},

    examples: exNorm.examples,
    examples_ru: exNorm.examples_ru,
    example_ru: exNorm.example_ru,

    // всегда строки
    synonyms: synLines,

    // всегда массив объектов
    prefixes: prefObjs,
  };
}

function parseJsonText(text){
  try { return JSON.parse(text); }
  catch (e){ return { __error: String(e) }; }
}

// Public normalizer used by UI sidebars.
// Accepts already-parsed JSON (array/object) and returns {ok, verbs, error}.
export function normalizeVerbDataset(raw){
  if (!raw) return { ok:false, error:"Empty JSON" };
  if (raw.__error) return { ok:false, error:`JSON parse error: ${raw.__error}` };

  // Supported roots:
  // 1) []
  // 2) { verbs: [] }
  // 3) { cards: [] } (schema v2)
  let arr = null;
  if (Array.isArray(raw)) arr = raw;
  else if (Array.isArray(raw.verbs)) arr = raw.verbs;
  else if (Array.isArray(raw.cards)) arr = raw.cards;

  if (!arr) return { ok:false, error:"No verbs[] or cards[] found in JSON" };

  const verbs = arr.map(normalizeVerb).filter(Boolean);
  if (!verbs.length) return { ok:false, error:"No valid verbs after normalize()" };

  return { ok:true, verbs };
}

// ✅ named export
export async function loadVerbsFromFile(file){
  try{
    const text = await file.text();
    const raw = parseJsonText(text);
    return normalizeVerbDataset(raw);
  } catch (e){
    return { ok:false, error:String(e?.stack ?? e) };
  }
}
