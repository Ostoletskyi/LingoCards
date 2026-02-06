// js/data/verbsLoad.js

function normalizeVerb(v){
  if (!v || typeof v !== "object") return null;

  const inf = String(v.inf ?? v.infinitive ?? v.Inf ?? v.lemma ?? "").trim();
  if (!inf) return null;

  const formsIn = v.forms || {};
  const forms = {
    p3: String(formsIn.p3 ?? formsIn.praesens_3 ?? "").trim(),
    pret: String(formsIn.pret ?? formsIn.praeteritum ?? "").trim(),
    p2: String(formsIn.p2 ?? formsIn.partizip_2 ?? "").trim(),
    aux: String(formsIn.aux ?? formsIn.auxiliary ?? "").trim(),
  };

  const freq = Number(v.freq ?? v.frequency ?? 0);
  const meanings = Array.isArray(v.meanings) ? v.meanings : (Array.isArray(v.translations) ? v.translations : []);

  const prefixes = Array.isArray(v.prefixes) ? v.prefixes.map(p => {
    if (!p || typeof p !== "object") return null;
    return {
      ...p,
      examples: Array.isArray(p.examples) ? p.examples.map(String) : (p.examples ? [String(p.examples)] : []),
      examples_ru: Array.isArray(p.examples_ru) ? p.examples_ru.map(String) : (p.examples_ru ? [String(p.examples_ru)] : []),
    };
  }).filter(Boolean) : [];

  return {
    inf,
    forms,
    freq: Number.isFinite(freq) ? freq : 0,
    meanings: Array.isArray(meanings) ? meanings.map(String) : [],

    rektion: Array.isArray(v.rektion) ? v.rektion.map(String) : [],
    examples: (v.examples && typeof v.examples === "object") ? v.examples : {},

    // ВАЖНО: не ломаем твой формат synonyms: [{word, translation}, ...]
    synonyms: Array.isArray(v.synonyms) ? v.synonyms : [],

    rektion_usage: (v.rektion_usage && typeof v.rektion_usage === "object") ? v.rektion_usage : {},

    // ✅ RU-поля для стратегий A/B/C
    example_ru: String(v.example_ru ?? "").trim(),
    examples_ru: (v.examples_ru && typeof v.examples_ru === "object") ? v.examples_ru : null,

    // ✅ приставки + RU
    prefixes,
  };
}

function parseJsonText(text){
  try { return JSON.parse(text); }
  catch (e){ return { __error: String(e) }; }
}

// ✅ ВАЖНО: именно named export!
export async function loadVerbsFromFile(file){
  try{
    const text = await file.text();
    const raw = parseJsonText(text);
    if (raw && raw.__error) return { ok:false, error:`JSON parse error: ${raw.__error}` };

    const arr = Array.isArray(raw)
      ? raw
      : (Array.isArray(raw?.verbs) ? raw.verbs : []);

    if (!Array.isArray(arr) || !arr.length){
      return { ok:false, error:"No verbs[] found in JSON" };
    }

    const verbs = arr.map(normalizeVerb).filter(Boolean);
    if (!verbs.length) return { ok:false, error:"No valid verbs after normalize()" };

    return { ok:true, verbs };
  } catch (e){
    return { ok:false, error:String(e?.stack ?? e) };
  }
}
