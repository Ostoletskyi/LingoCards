// js/app/app_parts/stateStore.js

import { DOMAIN_KEYS, PREF_KEYS, UI_KEYS, legacyPatchToStructured, assignLegacyKey } from "./state.js";

function isObject(value){
  return value && typeof value === "object";
}

function buildLegacyProxy(getState, onSet, { log, allowUnknown = false } = {}){
  const knownKeys = new Set(["domain", "prefs", "ui"]);
  for (const k of DOMAIN_KEYS) knownKeys.add(k);
  for (const k of PREF_KEYS) knownKeys.add(k);
  for (const k of UI_KEYS) knownKeys.add(k);

  return new Proxy({}, {
    get(_target, prop){
      if (typeof prop === "symbol") return undefined;
      const key = String(prop);
      const state = getState();
      if (!state || typeof state !== "object") return undefined;
      if (key === "domain" || key === "prefs" || key === "ui") return state[key];
      if (DOMAIN_KEYS.has(key)) return state.domain?.[key];
      if (PREF_KEYS.has(key)) return state.prefs?.[key];
      if (UI_KEYS.has(key)) return state.ui?.[key];
      return allowUnknown ? state.domain?.[key] : undefined;
    },
    set(_target, prop, value){
      if (typeof prop === "symbol") return true;
      const key = String(prop);
      if (!knownKeys.has(key) && !allowUnknown) return true;
      try {
        onSet?.(key, value);
      } catch (e){
        log?.warn?.("state.set failed", { key, err: String(e) });
      }
      return true;
    },
    has(_target, prop){
      if (typeof prop === "symbol") return false;
      const key = String(prop);
      const state = getState();
      if (!state || typeof state !== "object") return false;
      if (knownKeys.has(key)) return true;
      return allowUnknown && key in (state.domain || {});
    },
    ownKeys(){
      return Array.from(knownKeys.values());
    },
    getOwnPropertyDescriptor(){
      return { enumerable: true, configurable: true };
    },
  });
}

export function createStateStore(initialState, { log } = {}){
  let state = initialState;
  const listeners = new Set();

  function notify(){
    for (const fn of listeners){
      try { fn(state); } catch (e){ log?.warn?.("state.subscribe failed", { err: String(e) }); }
    }
  }

  function applyPatch(current, patch){
    if (!isObject(patch)) return current;
    const structured = legacyPatchToStructured(patch);
    const next = {
      domain: Object.assign({}, current.domain, structured.domain || {}),
      prefs: Object.assign({}, current.prefs, structured.prefs || {}),
      ui: Object.assign({}, current.ui, structured.ui || {}),
    };
    return next;
  }

  function commit(type, payload = {}){
    const before = state;
    let next = before;

    if (typeof payload?.mutate === "function"){
      const mutableView = buildLegacyProxy(
        () => next,
        (key, value) => assignLegacyKey(next, key, value),
        { log, allowUnknown: true }
      );
      payload.mutate(mutableView);
      next = { ...next };
    }

    if (payload?.patch){
      next = applyPatch(next, payload.patch);
    }

    if (next !== before){
      state = next;
      log?.info?.("state.commit", { type, keys: Object.keys(payload?.patch || {}) });
      notify();
    }
  }

  function getState(){
    return state;
  }

  function subscribe(listener){
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, commit, subscribe, _buildLegacyProxy: (onSet) => buildLegacyProxy(getState, onSet, { log, allowUnknown: true }) };
}

export function createLegacyStateView(store, { log } = {}){
  return store._buildLegacyProxy((key, value) => {
    store.commit("legacy.set", { patch: { [key]: value } });
    log?.warn?.("legacy state mutation redirected", { key });
  });
}
