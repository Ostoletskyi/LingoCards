// js/ui/i18n.js

// Lightweight i18n with runtime language switching.
// Backward compatible: createI18n({ dict, log }) still works.

import { log as appLog } from "../utils/log.js";

export function createI18n({ dict, dicts, lang, log } = {}){
  let _dicts = dicts || null;
  let _lang = String(lang || (dicts ? Object.keys(dicts)[0] : "ru"));
  let _dict = dict || (_dicts?.[_lang] || {});

  function t(key, params){
    const raw = _dict?.[key];
    if (raw == null){
      log?.warn?.("i18n missing key", { key, lang: _lang });
      return `⟦${key}⟧`;
    }
    if (!params) return String(raw);
    return String(raw).replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
  }

  function setDict(nextDict){
    _dict = nextDict || {};
  }

  function setLang(nextLang){
    if (!_dicts) {
      // no dicts map provided; nothing to switch
      _lang = String(nextLang || _lang);
      return false;
    }
    const nl = String(nextLang || "");
    const nd = _dicts[nl];
    if (!nd) return false;
    _lang = nl;
    _dict = nd;
    return true;
  }

  function getLang(){ return _lang; }

  return { t, setDict, setLang, getLang };
}

// Back-compat helper used by legacy modules: makeT(dict) -> (key, params) => string
export function makeT(dict, log){
  const api = createI18n({ dict, log });
  return (key, params) => api.t(key, params);
}

// Bind helpers: store i18n keys on DOM nodes so we can update texts on language switch.
export function bindText(el, key, params){
  if (!el) return el;
  el.dataset.i18nKey = key;
  if (params !== undefined) {
    try { el.dataset.i18nParams = JSON.stringify(params); } catch (e) { appLog.warn("i18n params serialize failed", { err: String(e) }); }
  }
  return el;
}

export function bindTip(el, key){
  if (!el) return el;
  el.dataset.tipKey = key;
  return el;
}

export function applyI18n(root, i18n){
  const r = root || document;
  const list = r.querySelectorAll?.("[data-i18n-key]") || [];
  list.forEach(el => {
    const key = el.dataset.i18nKey;
    if (!key) return;
    let params = null;
    const p = el.dataset.i18nParams;
    if (p) {
      try { params = JSON.parse(p); } catch (e) { appLog.warn("i18n params parse failed", { err: String(e) }); }
    }
    el.textContent = i18n.t(key, params || undefined);
  });

  const tips = r.querySelectorAll?.("[data-tip-key]") || [];
  tips.forEach(el => {
    const key = el.dataset.tipKey;
    if (!key) return;
    el.setAttribute("data-tip", i18n.t(key));
  });
}
