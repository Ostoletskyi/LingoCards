// Entry point.
// Note: index.html imports this file with a cache-busting query param and also
// sets window.__LC_BUILD__.

function showBuildBadge(){
  const build = String(window.__LC_BUILD__ ?? "?");
  const el = document.createElement("div");
  el.id = "lcBuildBadge";
  el.style.cssText = [
    "position:fixed",
    "top:6px",
    "left:6px",
    "z-index:99999",
    "padding:6px 10px",
    "background:#111",
    "border:1px solid #444",
    "color:#fff",
    "border-radius:10px",
    "font:12px/1.2 system-ui,Segoe UI,Arial",
    "opacity:0.92",
    "max-width:45vw",
    "white-space:nowrap",
    "overflow:hidden",
    "text-overflow:ellipsis"
  ].join(";");
  el.title = `Build token: ${build}\nModule URL: ${import.meta.url}`;
  el.textContent = `LC build: ${build}`;
  document.body.appendChild(el);
  console.log("[LC] main.js LOADED ✅", { build, url: import.meta.url, href: location.href });
}

showBuildBadge();

// ---- minimal local logger until real log loads ----
const bootLog = {
  info: (...a)=>console.log("[LC][boot]", ...a),
  warn: (...a)=>console.warn("[LC][boot]", ...a),
  error:(...a)=>console.error("[LC][boot]", ...a),
};

function showRuntimeBanner(title, text){
  let el = document.getElementById("lcRuntimeBanner");
  if (!el){
    el = document.createElement("div");
    el.id = "lcRuntimeBanner";
    el.className = "lc-banner";
    document.body.appendChild(el);
  }
  el.innerHTML = `<b>${title}:</b> ${escapeHtml(text)}`;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}

function installGlobalTraps(log){
  window.onerror = function(message, source, lineno, colno, error){
    log.error("window.onerror", { message, source, lineno, colno, error: String(error?.stack ?? error ?? "") });
    showRuntimeBanner("JS error", String(message));
  };
  window.onunhandledrejection = function(ev){
    log.error("unhandledrejection", { reason: String(ev?.reason?.stack ?? ev?.reason ?? "") });
    showRuntimeBanner("Promise rejected", String(ev?.reason?.message ?? ev?.reason ?? ""));
  };
}

// ---- diagnostic loader that tells which module fails ----
async function importChecked(url){
  try{
    bootLog.info("import", url);
    return await import(url);
  }catch(err){
    bootLog.error("FAILED import", url, err);
    // show first chars of response (super useful when server returns HTML/JSON)
    try{
      const r = await fetch(url, { cache: "no-store" });
      const t = await r.text();
      bootLog.error("Response head for " + url + ":", t.slice(0, 200));
    }catch(e){
      bootLog.error("Also failed to fetch for debug:", url, e);
    }
    throw err;
  }
}

(async function boot(){
  // 1) log.js
  const mLog = await importChecked("./utils/log.js");
  const log = mLog.log || bootLog;

  // 2) traps (now with real logger)
  installGlobalTraps(log);

  // 3) preflight
  const mPf = await importChecked("./preflight.js");
  const pf = await mPf.preflight();

  if (!pf.ok){
    log.warn("App not started due to preflight failure.");
    return;
  }

  // 4) app init
  const mApp = await importChecked("./app/app.js");
  if (!mApp || typeof mApp.initApp !== "function"){
    throw new Error("initApp export not found in ./app/app.js");
  }
  mApp.initApp();
})().catch(err=>{
  bootLog.error("BOOT FAILED (fatal):", err);
  showRuntimeBanner("BOOT FAILED", String(err?.message ?? err ?? ""));
});
