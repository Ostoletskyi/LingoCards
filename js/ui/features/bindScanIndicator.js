// js/ui/features/bindScanIndicator.js
// Visual indicator for JSON-scan based binding mode.
// Injected next to the mode indicator ("siren") without touching index.html.

function safeText(s){
  try { return String(s ?? ""); } catch { return ""; }
}

function buildTooltip(scan){
  if (!scan) return "Bind mode: CANON";
  const mode = scan.mode === "auto" ? "AUTO (path)" : "CANON";
  const why = Array.isArray(scan.why) ? scan.why : [];
  const score = Number.isFinite(scan.score) ? scan.score : 0;
  const lines = [`Bind mode: ${mode}`, `Score: ${score}`];
  for (const w of why.slice(0, 8)) lines.push(`- ${safeText(w)}`);
  return lines.join("\n");
}

function applyStyle(el, mode){
  // small pill badge
  el.style.display = "inline-flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.height = "18px";
  el.style.padding = "0 8px";
  el.style.borderRadius = "999px";
  el.style.fontSize = "11px";
  el.style.fontWeight = "700";
  el.style.letterSpacing = "0.2px";
  el.style.userSelect = "none";
  el.style.cursor = "help";
  el.style.marginLeft = "6px";
  el.style.border = "1px solid rgba(255,255,255,0.14)";

  if (mode === "auto"){
    el.style.background = "linear-gradient(90deg, rgba(215,76,255,0.35) 0%, rgba(255,176,66,0.32) 100%)";
    el.style.boxShadow = "0 0 10px rgba(215,76,255,0.18)";
    el.style.color = "#ffe9c9";
  } else {
    el.style.background = "linear-gradient(90deg, rgba(60,200,120,0.28) 0%, rgba(90,160,255,0.20) 100%)";
    el.style.boxShadow = "0 0 10px rgba(60,200,120,0.14)";
    el.style.color = "#e8fff1";
  }
}

export function installBindScanIndicator(ctx){
  const { state } = ctx;

  // Find the siren button container
  const sirenBtn = document.getElementById("lcModeSiren_source") || document.getElementById("lcModeSiren_cards");
  const parent = sirenBtn ? (sirenBtn.parentElement || sirenBtn.closest("div")) : null;
  if (!parent) return;

  let badge = document.getElementById("lcBindScanBadge");
  if (!badge){
    badge = document.createElement("div");
    badge.id = "lcBindScanBadge";
    parent.appendChild(badge);
  }

  function update(){
    const scan = state.bindScan || null;
    const mode = (state.bindMode === "auto") ? "auto" : "canon";
    badge.textContent = (mode === "auto") ? "BIND: AUTO" : "BIND: CANON";
    badge.title = buildTooltip(scan);
    applyStyle(badge, mode);
  }

  // Patch setState so we can react without adding new event buses.
  const origSetState = ctx.setState;
  if (!origSetState || origSetState.__bindScanWrapped) {
    update();
    return;
  }

  function wrappedSetState(patch, opts){
    const res = origSetState.call(ctx, patch, opts);
    if (patch && (Object.prototype.hasOwnProperty.call(patch, "bindMode") || Object.prototype.hasOwnProperty.call(patch, "bindScan"))){
      try { update(); } catch {}
    }
    return res;
  }
  wrappedSetState.__bindScanWrapped = true;
  ctx.setState = wrappedSetState;

  update();
}
