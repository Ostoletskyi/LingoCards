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
  const v = encodeURIComponent(String(window.__LC_BUILD__ ?? ""));
  for (const [path, exportsList] of Object.entries(CONTRACT.modules)){
    try {
      // Cache-bust in debug mode: if the build token exists, include it.
      // This helps catch "I edited the file but the browser still runs the old one".
      const url = `../${path.replace(/^js\//, "js/")}${v ? `?v=${v}` : ""}`;
      const mod = await import(url);
      for (const ex of exportsList){
        assert(ex in mod, `Module ${path} missing export: ${ex}`);
      }
    } catch (e){
      throw new Error(`Module check failed for ${path}: ${e?.message ?? e}`);
    }
  }
}

async function checkI18nSanity(){
  const { default: ru } = await import("../js/i18n/ru.js");
  const { createI18n } = await import("../js/ui/i18n.js");
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
