import { CONTRACT } from "./contract.js";
import { log } from "./utils/log.js";

function banner(text){
  let el = document.getElementById("lcPreflightBanner");
  if (!el){
    el = document.createElement("div");
    el.id = "lcPreflightBanner";
    el.className = "lc-banner";
    document.body.appendChild(el);
  }
  el.innerHTML = `<b>Preflight failed:</b> ${text}`;
}

function assert(cond, msg){
  if (!cond) throw new Error(msg);
}

async function checkDom(){
  const miss = [];
  for (const id of CONTRACT.dom.requiredIds){
    if (!document.getElementById(id)) miss.push(id);
  }
  assert(miss.length === 0, `Missing DOM ids: ${miss.join(", ")}`);
}

async function checkExports(){
  const v = String(window.__LC_BUILD__ ?? "");
  for (const [path, exportsList] of Object.entries(CONTRACT.modules)){
    // Contract paths are project-root relative like "js/app/app.js".
    // preflight.js lives in "/js/", so we must resolve to "/js/..." => "./" + (path without leading "js/").
    const rel = "./" + String(path).replace(/^js\//, ""); // ✅ (was "../" => broke into "/app/...")
    const u = new URL(rel, import.meta.url);
    if (v) u.searchParams.set("v", encodeURIComponent(v));
    u.searchParams.set("__pf__", String(Date.now())); // avoid module cache during preflight
    const url = u.toString();

    try{
      const mod = await import(url);
      for (const ex of exportsList){
        assert(ex in mod, `Module ${path} missing export: ${ex}`);
      }
    }catch(e){
      // If the server returned HTML/JSON instead of JS, show the first chars.
      let head = "";
      try{
        const r = await fetch(url, { cache: "no-store" });
        const t = await r.text();
        head = t.slice(0, 200).replace(/\s+/g, " ").trim();
      }catch(_){
        head = "(could not fetch response head)";
      }
      throw new Error(`Module check failed for ${path}: ${e?.message ?? e} | url=${url} | head=${head}`);
    }
  }
}

async function checkI18nSanity(){
  // preflight.js is in /js/, so use "./" to stay inside /js/ and avoid fragile "../js" paths
  const { default: ru } = await import("./i18n/ru.js");
  const { createI18n } = await import("./ui/i18n.js");
  const i18n = createI18n({ dict: ru, log });

  for (const k of (CONTRACT.ui?.i18nMustHaveKeys ?? [])){
    const v = i18n.t(k);
    assert(typeof v === "string" && !v.startsWith("⟦"), `i18n missing required key: ${k}`);
  }
}

async function checkFeaturesSanity(){
  // Тут мы не требуем реестр, но требуем, что модули фич реально импортируются.
  // (editMode уже проверяется в modules). Это место оставляем для будущего:
  // когда появится feature registry — проверим ids реально установленных фич.
  const req = CONTRACT.ui?.requiredFeatureIds ?? [];
  assert(req.includes("editMode"), "Contract must include editMode in requiredFeatureIds");
}

export async function preflight(){
  try {
    log.info("Preflight: start", { build: String(window.__LC_BUILD__ ?? "?") });
    await checkDom();
    await checkExports();
    await checkI18nSanity();
    await checkFeaturesSanity();
    log.info("Preflight: OK");
    return { ok: true };
  } catch (e){
    const msg = e?.message ?? String(e);
    log.error("Preflight: FAIL", { msg });
    banner(msg);
    return { ok: false, error: msg };
  }
}
