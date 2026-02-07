// js/app/app_parts/autosave.js

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').PersistedState} PersistedState */

import { AUTOSAVE_KEY } from './constants.js';
import { log } from '../../utils/log.js';
import { pickPersistedState } from './state.js';
import { syncCurrentToCards } from './cardsCore.js';

/** @returns {PersistedState|null} */
export function loadAutosave(){
  try {
    // NOTE: We intentionally do NOT purge autosave on startup.
    // The application should respect the user's saved state unless they explicitly reset it.
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const st = pickPersistedState(parsed);
    return st;
  } catch (e){
    log.warn("Autosave load failed", { err: String(e) });
    return null;
  }
}

/** @param {AppState} state */
export function saveAutosaveNow(state){
  try {
    // keep cards[] in sync with current card fields before persisting
    // IMPORTANT: never sync "source" preview into created cards.
    try {
      if (state?.viewMode !== "source") syncCurrentToCards(state);
    } catch (e) {
      log.warn("syncCurrentToCards failed", { err: String(e) });
    }
    const data = pickPersistedState(state);
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch (e){
    log.warn("Autosave save failed", { err: String(e) });
  }
}

let _saveTimer = null;
/** @param {AppState} state @param {number=} delayMs */
export function scheduleAutosave(state, delayMs = 250){
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveAutosaveNow(state);
  }, delayMs);
}
