// ai/core/ai.client.js
export function createAIClient({ endpoint, timeoutMs = 4000 }){
  let base = endpoint.replace(/\/+$/,"");

  function setEndpoint(ep){ base = (ep || "").replace(/\/+$/,""); }

  async function fetchJson(path){
    const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try{
      const res = await fetch(url, { method: "GET", signal: ctrl.signal });
      const text = await res.text();
      let json = null;
      try{ json = JSON.parse(text); }catch(_){}
      return { ok: res.ok, status: res.status, json, text };
    }finally{
      clearTimeout(t);
    }
  }

  return {
    setEndpoint,
    getModels: () => fetchJson("/models")
  };
}