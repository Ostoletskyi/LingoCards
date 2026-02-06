// ai/ai.net.js
// Network + parsing helpers for AI Control Panel (ES module).

export function safeJsonParse(s){
  try{ return JSON.parse(s); }catch(e){ return null; }
}

export function looksTruncated(text){
  if (!text) return true;
  var s = String(text).trim();
  // если не заканчивается на закрывающую скобку — почти наверняка обрезало
  if (!(s.endsWith('}') || s.endsWith('}]') || s.endsWith('}}'))) return true;
  return false;
}

export function extractJsonObject(text){
  if (!text) return null;
  var s = String(text);
  var a = s.indexOf('{');
  var b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  var cut = s.slice(a, b+1);
  return safeJsonParse(cut);
}

export async function httpGet(url, timeoutMs){
  var controller = new AbortController();
  var t = setTimeout(function(){ try{controller.abort();}catch(e){} }, timeoutMs || 8000);
  try{
    var res = await fetch(url, { method:'GET', signal: controller.signal });
    var text = await res.text();
    return { ok: res.ok, status: res.status, text: text };
  } finally {
    clearTimeout(t);
  }
}

export async function httpPostJson(url, payload, timeoutMs){
  var controller = new AbortController();
  var t = setTimeout(function(){ try{controller.abort();}catch(e){} }, timeoutMs || 8000);
  try{
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    var text = await res.text();
    return { ok: res.ok, status: res.status, text: text };
  } finally {
    clearTimeout(t);
  }
}
