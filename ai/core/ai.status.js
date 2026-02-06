// ai/core/ai.status.js
export function statusFromModelsResponse(resp){
  if (!resp) return { level: "unknown", text: "Unknown" };

  if (resp.ok && resp.json && Array.isArray(resp.json.data)){
    return { level: "connected", text: "рџџў Connected" };
  }

  // Typical when LM Studio not running: fetch fails (handled elsewhere) or 404/500.
  if (!resp.ok){
    return { level: "not_running", text: "рџџЎ Not running" };
  }

  return { level: "unknown", text: "Unknown response" };
}