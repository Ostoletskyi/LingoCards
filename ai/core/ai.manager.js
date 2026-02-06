// ai/core/ai.manager.js
import { createAIClient } from "./ai.client.js";
import { statusFromModelsResponse } from "./ai.status.js";

export function createAIManager({ endpoint, timeoutMs = 4000, onLog }){
  const client = createAIClient({ endpoint, timeoutMs });

  function log(msg){ try{ onLog && onLog(msg); }catch(_){} }

  function setEndpoint(ep){ client.setEndpoint(ep); }

  async function safeGetModels(){
    try{
      const resp = await client.getModels();
      return resp;
    }catch(e){
      // fetch throws on network errors / CORS / aborted
      return { ok: false, status: 0, json: null, text: String(e && e.message ? e.message : e) };
    }
  }

  async function testConnection(){
    log("GET /v1/models вЂ¦");
    const resp = await safeGetModels();
    const status = statusFromModelsResponse(resp);

    if (resp.ok && resp.json && Array.isArray(resp.json.data)){
      const models = resp.json.data.map(m => m.id).filter(Boolean);
      log(`OK (${resp.status}). Models: ${models.length}`);
      return { status, models };
    }

    // Practical hints
    if (resp.status === 0){
      log("No response. Is LM Studio Server running on localhost:1234? Also check browser CORS or mixed-content.");
    }else{
      log(`HTTP ${resp.status}. Body: ${String(resp.text).slice(0, 200)}`);
    }
    return { status, models: [] };
  }

  async function listModels(){
    return testConnection();
  }

  return { setEndpoint, testConnection, listModels, log };
}