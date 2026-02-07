// js/ui/features/langSwitch.js

import { applyI18n, bindTip } from "../i18n.js";

function makeLangBtn(code, label){
  const b = document.createElement("button");
  b.type = "button";
  b.className = "lc-lang-btn";
  b.textContent = label;
  b.dataset.lang = code;
  return b;
}

export function featureLangSwitch(){
  return {
    id: "langSwitch",
    install(ctx){
      const { i18n, state, ui } = ctx;
      if (!ctx.shell?.langHost) return;

      const host = ctx.shell.langHost;
      host.innerHTML = "";

      const bRU = makeLangBtn("ru", "RU");
      const bDE = makeLangBtn("de", "DE");
      const bEN = makeLangBtn("en", "EN");

      // tooltips (in current language)
      bRU.dataset.tipKey = "ui.tip.langRu";
      bDE.dataset.tipKey = "ui.tip.langDe";
      bEN.dataset.tipKey = "ui.tip.langEn";
      applyI18n(document, i18n);

      function sync(){
        const cur = i18n.getLang?.() || "ru";
        bRU.setAttribute("aria-pressed", cur === "ru" ? "true" : "false");
        bDE.setAttribute("aria-pressed", cur === "de" ? "true" : "false");
        bEN.setAttribute("aria-pressed", cur === "en" ? "true" : "false");
      }

      function setLang(next){
        if (!i18n.setLang?.(next)) return;
        try { localStorage.setItem("lc_lang", next); } catch (e) { ctx.log?.warn?.("lc_lang save failed", { err: String(e) }); }
        try { document.documentElement.lang = next; } catch (e) { ctx.log?.warn?.("document.lang set failed", { err: String(e) }); }

        // update texts & tooltips everywhere
        applyI18n(document, i18n);

        // update dynamic badge texts
        ui?.setEditBadge?.(!!state.editing);
        if (state.rulersOn != null) ui?.setRulersStatus?.(!!state.rulersOn);
        if (state.snapOn != null) ui?.setSnapStatus?.(!!state.snapOn);

        ctx.requestRender?.();
        sync();
      }

      bRU.onclick = () => setLang("ru");
      bDE.onclick = () => setLang("de");
      bEN.onclick = () => setLang("en");

      host.appendChild(bRU);
      host.appendChild(bDE);
      host.appendChild(bEN);

      sync();
    }
  };
}
