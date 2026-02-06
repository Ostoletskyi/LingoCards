// js/data/verbBind.js
// Resolver that maps template "bind" keys -> formatted text.
// Supports both legacy binds and FULL preset binds.
// Updated to support normalized verbsLoad format (examples as strings + examples_ru, prefixes as objects).

function isObj(x){ return x && typeof x === "object" && !Array.isArray(x); }
function asStr(x){ return (x === null || x === undefined) ? "" : String(x); }

function normalizeWs(s){
  return asStr(s)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getField(obj, paths){
  for (const p of paths){
    const segs = String(p).split(".");
    let cur = obj;
    let ok = true;
    for (const k of segs){
      if (!cur || typeof cur !== "object" || !(k in cur)){ ok = false; break; }
      cur = cur[k];
    }
    if (ok) return cur;
  }
  return undefined;
}

function splitLinesSmart(x){
  const s = asStr(x).trim();
  if (!s) return [];
  return s.split(/\r?\n/g).map(v => v.trim()).filter(Boolean);
}

function toLinesSafe(val){
  // Accepts string | number | boolean | array | object and returns array of printable lines
  if (val === null || val === undefined) return [];
  if (typeof val === "string"){
    // if multiline string -> split
    if (val.includes("\n")) return splitLinesSmart(val);
    const t = val.trim();
    return t ? [t] : [];
  }
  if (typeof val === "number" || typeof val === "boolean"){
    return [String(val)];
  }
  if (Array.isArray(val)){
    const out = [];
    for (const x of val){
      if (x === null || x === undefined) continue;
      if (typeof x === "string"){
        const t = x.trim();
        if (t) out.push(t);
        continue;
      }
      if (typeof x === "number" || typeof x === "boolean"){
        out.push(String(x));
        continue;
      }
      if (isObj(x)){
        // try common {de,ru} / {word,translation} / {prefix,meaning}
        const de = asStr(getField(x, ["de","word","prefix","p"])).trim();
        const ru = asStr(getField(x, ["ru","translation","meaning","tr"])).trim();
        if (de && ru) out.push(`${de} — ${ru}`);
        else if (de) out.push(de);
        else if (ru) out.push(ru);
        else {
          // last resort: JSON one-liner
          try { out.push(JSON.stringify(x)); } catch { /* ignore */ }
        }
      }
    }
    return out;
  }
  if (isObj(val)){
    // object of strings (like examples)
    const out = [];
    for (const k of Object.keys(val)){
      const v = val[k];
      if (typeof v === "string" && v.trim()) out.push(v.trim());
      else if (typeof v === "number" || typeof v === "boolean") out.push(String(v));
    }
    return out;
  }
  return [];
}

// ---------------- formatters ----------------

function meaningsBlock(v){
  const m1 = Array.isArray(v?.meanings) ? v.meanings : [];
  const m2 = Array.isArray(getField(v, ["translations.ru"])) ? getField(v, ["translations.ru"]) : [];
  const m3 = Array.isArray(v?.translations) ? v.translations : [];
  let arr = (m1.length ? m1 : (m2.length ? m2 : m3))
    .filter(Boolean)
    .map(x => asStr(x).trim())
    .filter(Boolean);

  // Rich answers fallback
  if (!arr.length && hasAnswers(v)){
    arr = richTranslationsLines(v);
  }

  return normalizeWs(arr.join("\n"));
}

function meaningsLine(v){
  const m1 = Array.isArray(v?.meanings) ? v.meanings : [];
  const m2 = Array.isArray(getField(v, ["translations.ru"])) ? getField(v, ["translations.ru"]) : [];
  const m3 = Array.isArray(v?.translations) ? v.translations : [];
  let arr = (m1.length ? m1 : (m2.length ? m2 : m3))
    .filter(Boolean)
    .map(x => asStr(x).trim())
    .filter(Boolean);

  if (!arr.length && hasAnswers(v)){
    arr = richTranslationsLines(v);
  }

  return normalizeWs(arr.join(", "));
}

function formsLine(v){
  const f = isObj(v?.forms) ? v.forms : {};
  const p3   = asStr(getField(f, ["p3","praesens_3","praesens3"])).trim();
  const pret = asStr(getField(f, ["pret","praeteritum","praeteritum3"])).trim();

  const p2  = asStr(getField(f, ["p2","partizip_2","partizip2","perfekt.partizip2"])).trim();
  const aux = asStr(getField(f, ["aux","auxiliary","perfekt.aux"])).trim();
  const full = asStr(getField(f, ["perfekt.full"])).trim();

  const perf = full || ((aux && p2) ? `${aux === "sein" ? "ist" : "hat"} ${p2}` : "");
  let parts = [p3, pret, perf].filter(Boolean);

  // Rich answers fallback
  if (!parts.length && hasAnswers(v)){
    const ap3 = aStr(v,'forms_p3');
    const apre = aStr(v,'forms_prat');
    const aaux = aStr(v,'forms_aux');
    const ap2  = aStr(v,'forms_p2');
    const aperf = (aaux && ap2) ? `${aaux === "sein" ? "ist" : "hat"} ${ap2}` : "";
    parts = [ap3, apre, aperf].filter(Boolean);
  }
  return normalizeWs(parts.join(" / "));
}

function freqInfo(v){
  // returns {label, score, raw}
  const fObj = isObj(v?.freq) ? v.freq : null;
  const label = asStr(fObj?.label).trim();

  let score = 0;

  const s1 = Number(fObj?.score);
  if (Number.isFinite(s1)) score = s1;
  else {
    const s2 = Number(v?.freq ?? v?.frequency ?? v?.freq_score ?? 0);
    if (Number.isFinite(s2)) score = s2;
    else {
      // Exporter may store this as v.freq_raw OR v.raw.freq_raw
      const rawAny = asStr(v?.freq_raw ?? v?.raw?.freq_raw ?? v?.raw?.freqRaw ?? "");
      const m = rawAny.match(/(\d+)/);
      score = m ? Number(m[1]) : 0;
    }
  }

  if ((!score || !Number.isFinite(score)) && hasAnswers(v)){
    const s3 = Number(aStr(v,'freq'));
    if (Number.isFinite(s3)) score = s3;
  }

  const raw = asStr(v?.freq_raw ?? v?.raw?.freq_raw ?? v?.raw?.freqRaw ?? "");
  return { label, score, raw };
}

function freqLine(v){
  // compact label/number for small header
  const { label, score, raw } = freqInfo(v);
  const r = String(raw||'').trim();
  if (r) return r;
  if (label && score) return `${label} = ${score}`;
  if (label) return label;
  if (score) return String(score);
  return "";
}

function freqLabelAndScore(v){
  // e.g. 'TOP = 5'
  const { label, score, raw } = freqInfo(v);
  const r = String(raw||'').trim();
  if (r) return r;
  if (label && score) return `${label} = ${score}`;
  if (label) return label;
  if (score) return String(score);
  return "";
}

// ----------------------
// Rich answers (answers.*) bridge
// ----------------------

function hasAnswers(v){
  return !!(v && isObj(v.answers));
}

function aStr(v, key){
  return hasAnswers(v) ? asStr(v.answers[key]).trim() : "";
}

function richTranslationsLines(v){
  // Uses keys: tr_1_ru, tr_1_ctx ... tr_4_ru, tr_4_ctx
  const lines = [];
  for (let i=1;i<=4;i++){
    const ru = aStr(v, `tr_${i}_ru`);
    const ctx = aStr(v, `tr_${i}_ctx`);
    if (!ru && !ctx) continue;
    if (ru && ctx) lines.push(`${ru} — ${ctx}`);
    else if (ru) lines.push(ru);
    else lines.push(ctx);
  }
  return lines;
}

function richSynonymsLines(v){
  const lines = [];
  for (let i=1;i<=3;i++){
    const de = aStr(v, `syn_${i}_de`);
    const ru = aStr(v, `syn_${i}_ru`);
    if (!de && !ru) continue;
    if (de && ru) lines.push(`${de} — ${ru}`);
    else lines.push(de || ru);
  }
  return lines;
}

function richExamplesLines(v){
  // ex_i_de / ex_i_ru / ex_i_tag (i=1..5)
  const lines = [];
  for (let i=1;i<=5;i++){
    const de = aStr(v, `ex_${i}_de`);
    const ru = aStr(v, `ex_${i}_ru`);
    const tag = aStr(v, `ex_${i}_tag`);
    if (!de && !ru) continue;
    const head = tag ? `[${tag}] ` : "";
    if (de) lines.push(`${head}${de}`);
    if (ru) lines.push(`— ${ru}`);
  }
  return lines;
}

function richRekLines(v){
  const lines = [];
  for (let i=1;i<=5;i++){
    const de = aStr(v, `rek_${i}_de`);
    const ru = aStr(v, `rek_${i}_ru`);
    if (!de && !ru) continue;
    if (de && ru) lines.push(`${de} — ${ru}`);
    else lines.push(de || ru);
  }
  return lines;
}

function infinitiveLine(v){
  const inf = asStr(getField(v, ["inf","lemma.infinitive","infinitive","lemma"])).trim() || aStr(v,'inf');
  return normalizeWs(inf);
}

function synonymsPairsBlock(v){
  // supports strings OR objects OR already-normalized string lines
  const s = Array.isArray(v?.synonyms) ? v.synonyms : [];
  if (!s.length && hasAnswers(v)){
    const fb = richSynLines(v);
    return fb.length ? normalizeWs(fb.join("\n")).trim() : "";
  }
  const lines = [];

  for (const x of s){
    if (!x) continue;
    if (typeof x === "string"){
      const t = x.trim();
      if (t) lines.push(t);
      continue;
    }
    if (isObj(x)){
      const de = asStr(getField(x, ["de","word","w"])).trim();
      const ru = asStr(getField(x, ["ru","translation","tr"])).trim();
      if (de && ru) lines.push(`${de} — ${ru}`);
      else if (de) lines.push(de);
      else if (ru) lines.push(ru);
    }
  }

  return normalizeWs(lines.join("\n"));
}

function synonymsLine(v){
  const s = Array.isArray(v?.synonyms) ? v.synonyms : [];
  const out = [];

  for (const x of s){
    if (!x) continue;
    if (typeof x === "string"){
      const t = x.trim();
      if (t) out.push(t);
      continue;
    }
    if (isObj(x)){
      const de = asStr(getField(x, ["de","word","w"])).trim();
      const ru = asStr(getField(x, ["ru","translation","tr"])).trim();
      if (de && ru) out.push(`${de} — ${ru}`);
      else if (de) out.push(de);
      else if (ru) out.push(ru);
    }
  }

  return normalizeWs(out.slice(0, 3).join(" | "));
}

function prefixesBlock(v){
  // Also support exporter shape: prefixes: { separable:[...], inseparable:[...], notes:"" }
  if (isObj(v?.prefixes) && (Array.isArray(v.prefixes.separable) || Array.isArray(v.prefixes.inseparable) || asStr(v.prefixes.notes).trim())){
    const sep = Array.isArray(v.prefixes.separable) ? v.prefixes.separable.map(x => asStr(x).trim()).filter(Boolean) : [];
    const ins = Array.isArray(v.prefixes.inseparable) ? v.prefixes.inseparable.map(x => asStr(x).trim()).filter(Boolean) : [];
    const notes = asStr(v.prefixes.notes).trim();
    const lines = [];
    if (sep.length) lines.push(`отделяемые: ${sep.join(' ')}`);
    if (ins.length) lines.push(`неотделяемые: ${ins.join(' ')}`);
    if (notes) lines.push(notes);
    return normalizeWs(lines.join("\n"));
  }

  // NEW normalized: prefixes: [{prefix, meaning, examples:[...]}] OR pseudo {prefix:"prefixes", examples:[lines]}
  // legacy: lemma.prefixesSeen: ["auf","ver",...]
  const p1 = Array.isArray(v?.prefixes) ? v.prefixes : [];
  const pSeen = getField(v, ["lemma.prefixesSeen", "prefixesSeen"]);
  const p2 = Array.isArray(pSeen) ? pSeen : [];

  const lines = [];

  for (const p of p1){
    if (!p) continue;

    if (typeof p === "string"){
      const t = p.trim();
      if (t) lines.push(t);
      continue;
    }

    if (isObj(p)){
      // special pseudo object from verbsLoad normalizePrefixes(string)
      const pseudo = asStr(p.prefix).trim() === "prefixes" && Array.isArray(p.examples);
      if (pseudo){
        const exLines = p.examples.map(x => asStr(x).trim()).filter(Boolean);
        for (const ln of exLines) lines.push(ln);
        continue;
      }

      const pre = asStr(getField(p, ["prefix","de","p","word"])).trim();
      const ru  = asStr(getField(p, ["meaning","ru","translation","tr"])).trim();

      if (pre && ru) lines.push(`${pre} — ${ru}`);
      else if (pre) lines.push(pre);
      else if (ru) lines.push(ru);

      // if has examples lines, append indented (safe)
      const ex = Array.isArray(p.examples) ? p.examples : [];
      const ex2 = ex.map(x => asStr(x).trim()).filter(Boolean).slice(0, 2); // не рвём карточку
      for (const e of ex2){
        lines.push(`  · ${e}`);
      }
    }
  }

  if (!lines.length && p2.length){
    lines.push(`приставки: ${p2.map(String).join(", ")}`);
  }

  // Rich answers fallback
  if (!lines.length && hasAnswers(v)){
    const pref = aStr(v,'pref_text');
    const typ  = aStr(v,'pref_type');
    if (pref){
      // typ is usually "sep" / "inse...", keep it subtle
      lines.push(typ ? `${pref} (${typ})` : pref);
    }
  }

  return normalizeWs(lines.join("\n"));
}

function rektionBlock(v){
  // Goal: fill the bottom-right yellow frame (Rektion/управление) predictably.
  // Primary source (rich-json): rek_1_de/rek_1_ru ... rek_5_de/rek_5_ru
  // Secondary sources (legacy): v.rektion / v.valency (string/array/object)

  // Rich answers fallback (rek_1_... etc)
  if (hasAnswers(v)){
    const fb = richRekLines(v);
    if (fb.length) return normalizeWs(fb.join("\n")).trim();
  }

  // Legacy: direct fields
  const direct = getField(v, ["rektion","valency","rek","rections"]);
  if (typeof direct === "string" || typeof direct === "number" || typeof direct === "boolean"){
    return normalizeWs(String(direct));
  }
  if (Array.isArray(direct)){
    const lines = toLinesSafe(direct);
    return normalizeWs(lines.join("\n"));
  }
  if (isObj(direct)){
    const lines = toLinesSafe(direct);
    return normalizeWs(lines.join("\n"));
  }

  return "";
}

function examplesBlock(v){
  // Supports:
  // A) NEW normalized: examples is object of strings {praesens:"Präsens: ...", modal:"Modal (...): ...", ...}
  //    and ru lines in examples_ru / example_ru
  // B) legacy: examples is object {praesens:{de,ru}, modal:{de,ru,modalVerb}, ...}
  // C) examples is array of strings
  const ex = v?.examples;

  // Rich answers fallback (answers.ex_1_... etc)
  if ((!ex || (Array.isArray(ex) && ex.length===0)) && hasAnswers(v)){
    const fb = richExamplesLines(v);
    if (fb.length) return normalizeWs(fb.join("\n")).trim();
  }

  // C) array
  if (Array.isArray(ex)){
    const lines = toLinesSafe(ex);
    return normalizeWs(lines.join("\n"));
  }

  // A/B) object
  if (!isObj(ex)) return "";

  // detect A): all values are strings (or mostly strings)
  const vals = Object.values(ex);
  const mostlyStrings = vals.length && vals.every(x => (typeof x === "string" || x === null || x === undefined));
  if (mostlyStrings){
    const deLines = [];
    const order = ["praesens","modal","praeteritum","perfekt","partizip","impersonal"];
    for (const k of order){
      const s = asStr(ex[k]).trim();
      if (s) deLines.push(s);
    }

    // RU block from examples_ru / example_ru
    const ruLines = [];
    const exRu = isObj(v?.examples_ru) ? v.examples_ru : null;
    if (exRu){
      for (const k of order){
        const s = asStr(exRu[k]).trim();
        if (s) ruLines.push(s);
      }
    }
    const extraRu = asStr(v?.example_ru).trim();
    if (extraRu) ruLines.push(extraRu);

    const out = [];
    if (deLines.length) out.push(...deLines);
    if (ruLines.length){
      // в твоём дизайне RU идёт строками сразу после DE — делаем так же
      // но не смешиваем “кучей”: склеиваем как единый блок
      out.push(...ruLines);
    }
    return normalizeWs(out.join("\n"));
  }

  // B) legacy objects {de,ru}
  const out = [];
  function pushPair(labelDe, obj){
    if (!obj) return;
    const de = asStr(obj.de).trim();
    const ru = asStr(obj.ru).trim();
    if (de) out.push(`${labelDe}: ${de}`);
    if (ru) out.push(ru);
  }

  pushPair("Präsens", ex.praesens);

  if (ex.modal){
    const mv = asStr(ex.modal.modalVerb ?? ex.modal.modal).trim();
    const head = mv ? `Modal (${mv})` : "Modal";
    pushPair(head, ex.modal);
  }

  pushPair("Präteritum", ex.praeteritum);
  pushPair("Perfekt", ex.perfekt);

  return normalizeWs(out.join("\n"));
}

function examplesAndPrefixes(v){
  const ex = examplesBlock(v);
  const pr = prefixesBlock(v);
  if (ex && pr) return normalizeWs(ex + "\n\n" + pr);
  return normalizeWs(ex || pr || "");
}

// ---------------- main resolver ----------------

const BIND_ALIASES = {
  // meanings/translations
  meanings: "meaningsBlock",
  translations: "meaningsBlock",
  translation: "meaningsBlock",
  translationsLine: "meaningsLine",

  // forms
  forms: "formsLine",
  formsLine: "formsLine",

  // frequency
  freq: "freqLine",
  frequency: "freqLine",
  freqLine: "freqLine",
  // ✅ fat header variant
  freqLabelAndScore: "freqLabelAndScore",
  frequencyFull: "freqLabelAndScore",

  // infinitive/header
  inf: "infinitiveLine",
  infinitive: "infinitiveLine",

  // synonyms
  synonyms: "synonymsPairsBlock",
  synonym: "synonymsPairsBlock",
  synonymsPairsBlock: "synonymsPairsBlock",
  synonymsLine: "synonymsLine",

  // prefixes/examples
  prefixes: "prefixesBlock",
  prefix: "prefixesBlock",
  // rektion/valency
  rektion: "rektionBlock",
  valency: "rektionBlock",
  rek: "rektionBlock",
  rection: "rektionBlock",
  rektions: "rektionBlock",
  rektionBlock: "rektionBlock",
  examples: "examplesBlock",
  example: "examplesBlock",
  examplesAndPrefixes: "examplesAndPrefixes",
};

export function resolveVerbBind(v, bind){
  const b0 = asStr(bind).trim();
  if (!b0) return { kind:"text", text:"" };

  const b = BIND_ALIASES[b0] || b0;

  try{
    switch (b){
      case "meaningsBlock":        return { kind:"text", text: meaningsBlock(v) };
      case "meaningsLine":         return { kind:"text", text: meaningsLine(v) };
      case "formsLine":            return { kind:"text", text: formsLine(v) };

      case "freqLine":             return { kind:"text", text: freqLine(v) };
      case "freqLabelAndScore":    return { kind:"text", text: freqLabelAndScore(v) };

      case "infinitiveLine":       return { kind:"text", text: infinitiveLine(v) };

      case "synonymsPairsBlock":   return { kind:"text", text: synonymsPairsBlock(v) };
      case "synonymsLine":         return { kind:"text", text: synonymsLine(v) };

      case "prefixesBlock":        return { kind:"text", text: prefixesBlock(v) };
      case "rektionBlock":         return { kind:"text", text: rektionBlock(v) };
      case "examplesBlock":        return { kind:"text", text: examplesBlock(v) };
      case "examplesAndPrefixes":  return { kind:"text", text: examplesAndPrefixes(v) };

      default: {
        // last resort: primitives, arrays of primitives, or object-of-strings
        const val = getField(v, [b0, b]);

        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean"){
          return { kind:"text", text: String(val) };
        }

        if (Array.isArray(val)){
          const lines = toLinesSafe(val);
          return { kind:"text", text: normalizeWs(lines.join("\n")) };
        }

        if (isObj(val)){
          const lines = toLinesSafe(val);
          return { kind:"text", text: normalizeWs(lines.join("\n")) };
        }

        return { kind:"text", text: "" };
      }
    }
  } catch (e){
    return { kind:"text", text:"" };
  }
}
