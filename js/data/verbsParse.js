// js/data/verbsParse.js
export function extractVerbsFromJsonText(jsonText){
  let data;
  try {
    data = JSON.parse(String(jsonText ?? ""));
  } catch (e){
    return { ok:false, verbs:[], error: "JSON parse error: " + String(e?.message ?? e) };
  }

  // Поддерживаем варианты:
  // 1) [ {...}, {...} ]
  // 2) { verbs: [ ... ] }
  // 3) { data: { verbs: [ ... ] } }
  let verbs = null;

  if (Array.isArray(data)) verbs = data;
  else if (Array.isArray(data?.verbs)) verbs = data.verbs;
  else if (Array.isArray(data?.data?.verbs)) verbs = data.data.verbs;

  if (!Array.isArray(verbs)){
    return { ok:false, verbs:[], error: "No verbs array found. Expected [..] or {verbs:[..]} or {data:{verbs:[..]}}" };
  }

  verbs = verbs.filter(v => v && typeof v === "object");
  return { ok:true, verbs, error:"" };
}
