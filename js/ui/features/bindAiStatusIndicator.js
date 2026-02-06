// js/ui/features/bindAiStatusIndicator.js
// Small indicator near the existing mode "siren" showing LM Studio / AI connectivity.
// Listens to window event 'LC_AI_STATUS' dispatched by ai/ai.entry.js.

function applyStyle(el, connected){
  el.style.display = "inline-flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.height = "18px";
  el.style.padding = "0 8px";
  el.style.borderRadius = "999px";
  el.style.fontSize = "11px";
  el.style.fontWeight = "800";
  el.style.letterSpacing = "0.2px";
  el.style.userSelect = "none";
  el.style.cursor = "help";
  el.style.marginLeft = "6px";
  el.style.border = "1px solid rgba(255,255,255,0.14)";

  if (connected){
    el.style.background = "linear-gradient(90deg, rgba(60,200,120,0.28) 0%, rgba(90,160,255,0.20) 100%)";
    el.style.boxShadow = "0 0 10px rgba(60,200,120,0.14)";
    el.style.color = "#e8fff1";
  } else {
    el.style.background = "linear-gradient(90deg, rgba(255,70,70,0.30) 0%, rgba(255,176,66,0.18) 100%)";
    el.style.boxShadow = "0 0 10px rgba(255,70,70,0.16)";
    el.style.color = "#ffe9e9";
  }
}

export function installAiStatusIndicator(ctx){
  // Find the same siren container used by bindScanIndicator (do not touch index.html)
  const sirenBtn =
    document.getElementById("lcModeSiren_source") ||
    document.getElementById("lcModeSiren") ||
    document.getElementById("lcModeSirenBtn");

  if (!sirenBtn) return;

  let badge = document.getElementById("lcAiStatusBadge");
  if (!badge){
    badge = document.createElement("span");
    badge.id = "lcAiStatusBadge";
    badge.textContent = "AI";
    applyStyle(badge, false);
    sirenBtn.parentElement?.appendChild(badge);
  }

  function update(detail){
    const connected = !!(detail && detail.connected);
    const reason = String(detail && detail.reason || "");
    badge.textContent = connected ? "AI:OK" : "AI:OFF";
    badge.title = connected ? "AI connected (LM Studio)" : ("AI disconnected. " + reason);
    applyStyle(badge, connected);
  }

  window.addEventListener("LC_AI_STATUS", (ev)=> update(ev.detail));

  // initial state from window.LC_AI if present
  try{
    if (window.LC_AI) update({ connected: !!window.LC_AI.connected, reason: window.LC_AI.reason || "" });
  }catch(e){}
}
