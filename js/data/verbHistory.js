// js/data/verbHistory.js
// Persistent history of verbs that have been imported into the system.
// Goal: help avoid duplicates across sessions and after list clears.
//
// Storage format (LS):
// { version:1, verbs: { "<normInf>": { count, firstSeen, lastSeen, sampleInf } } }

const LS_KEY = "LC_VERB_HISTORY_V1";

function now(){ return Date.now(); }

export function normInfinitive(v){
  const inf =
    (v && typeof v === "object")
      ? (v.infinitive ?? v.inf ?? v.Inf ?? v.lemma ?? v.base ?? v.infinitiv ?? "")
      : String(v || "");
  return String(inf || "").trim().toLowerCase();
}

function safeParse(raw){
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function loadVerbHistory(){
  const raw = safeParse(localStorage.getItem(LS_KEY));
  if (!raw || typeof raw !== "object") return { version:1, verbs:{} };
  if (!raw.verbs || typeof raw.verbs !== "object") return { version:1, verbs:{} };
  return { version:1, verbs: raw.verbs };
}

export function saveVerbHistory(hist){
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(hist || { version:1, verbs:{} }));
    return true;
  } catch {
    return false;
  }
}

export function clearVerbHistory(){
  try { localStorage.removeItem(LS_KEY); } catch {}
}

export function addVerbsToHistory(verbs){
  const hist = loadVerbHistory();
  const map = hist.verbs || (hist.verbs = {});
  const t = now();

  let addedNew = 0;
  let touched = 0;

  const arr = Array.isArray(verbs) ? verbs : [];
  for (const v of arr){
    const k = normInfinitive(v);
    if (!k) continue;

    const entry = map[k];
    if (!entry){
      map[k] = { count: 1, firstSeen: t, lastSeen: t, sampleInf: String(v?.infinitive ?? v?.inf ?? v?.Inf ?? v?.lemma ?? v?.base ?? k) };
      addedNew++;
      touched++;
      continue;
    }
    entry.count = (Number(entry.count) || 0) + 1;
    entry.lastSeen = t;
    touched++;
  }

  saveVerbHistory(hist);
  return { addedNew, touched, totalKnown: Object.keys(map).length };
}

export function findHistoryMatches(verbs){
  const hist = loadVerbHistory();
  const map = hist.verbs || {};
  const matches = [];

  const arr = Array.isArray(verbs) ? verbs : [];
  for (const v of arr){
    const k = normInfinitive(v);
    if (!k) continue;
    if (map[k]) matches.push(k);
  }

  // unique
  return Array.from(new Set(matches));
}

export function getHistoryList(){
  const hist = loadVerbHistory();
  const map = hist.verbs || {};
  const out = Object.entries(map).map(([k, e]) => ({
    key: k,
    inf: e?.sampleInf || k,
    count: Number(e?.count) || 0,
    firstSeen: Number(e?.firstSeen) || 0,
    lastSeen: Number(e?.lastSeen) || 0,
  }));

  out.sort((a,b) => (b.lastSeen - a.lastSeen) || (b.count - a.count) || a.inf.localeCompare(b.inf));
  return out;
}
