// js/app/app_parts/state.js

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').PersistedState} PersistedState */
/** @typedef {import('./types.js').Box} Box */
/** @typedef {import('./types.js').Card} Card */

import { STATE_SCHEMA_VERSION, CANONICAL_FULL_BOXES } from './constants.js';
import { cloneBoxes } from './clone.js';

export const DOMAIN_KEYS = new Set([
  "schemaVersion",
  "viewMode",
  "cardWmm",
  "cardHmm",
  "boxes",
  "sourceBoxes",
  "notesByVerb",
  "cards",
  "selectedCardIndex",
  "data",
  "selectedIndex",
  "selectedVerbIndex",
  "bindMode",
  "bindScan",
]);

export const PREF_KEYS = new Set([
  "editing",
  "rulersOn",
  "gridStepMm",
  "snapOn",
  "verbsSortMode",
  "searchQuery",
  "newCardTemplateMode",
]);

export const UI_KEYS = new Set([
  "selectedBoxId",
  "selectedIds",
  "marqueeRect",
  "__dragging",
  "exportMode",
  "leftNeedsExport",
]);

export const DEFAULTS = {
  domain: {
    schemaVersion: STATE_SCHEMA_VERSION,
    viewMode: "cards",

    cardWmm: 150,
    cardHmm: 105,

    boxes: cloneBoxes(CANONICAL_FULL_BOXES),

    // Global SOURCE layout snapshot (bind-boxes geometry). Never overwritten by cards.
    sourceBoxes: undefined,

    // ✅ Персональные тексты по глаголам: { [verbId]: { [boxId]: text } }
    notesByVerb: {},

    // --- Cards stack (v2) ---
    cards: null,
    selectedCardIndex: 0,

    // Шаг 1: место для данных
    data: { verbs: [] },
    selectedIndex: 0,

    selectedVerbIndex: 0,

    // Bind scan
    bindMode: "canon",
    bindScan: null,
  },
  prefs: {
    editing: false,
    rulersOn: false,
    gridStepMm: 10,
    snapOn: true,

    // UI: verbs list sorting
    verbsSortMode: "added",

    // UI: global search query
    searchQuery: "",

    // UI: how "New card" should pick its initial formatting in the RIGHT column
    // "inherit" (default) | "canonical"
    newCardTemplateMode: "inherit",
  },
  ui: {
    selectedBoxId: null,
    selectedIds: [],
    marqueeRect: null,
    __dragging: false,
    exportMode: null,
    leftNeedsExport: false,
  },
};

export function createLegacyDefaults(){
  return {
    ...DEFAULTS.domain,
    ...DEFAULTS.prefs,
    ...DEFAULTS.ui,
  };
}

export function normalizeDomain(d){
  const domain = d && typeof d === "object" ? d : {};
  return {
    schemaVersion: (typeof domain?.schemaVersion === "string") ? domain.schemaVersion : "0",
    viewMode: (domain?.viewMode === "source" || domain?.viewMode === "cards") ? domain.viewMode : "cards",
    cardWmm: Number.isFinite(domain?.cardWmm) ? domain.cardWmm : 150,
    cardHmm: Number.isFinite(domain?.cardHmm) ? domain.cardHmm : 105,
    boxes: Array.isArray(domain?.boxes) ? domain.boxes : [],
    sourceBoxes: Array.isArray(domain?.sourceBoxes) ? domain.sourceBoxes : undefined,
    notesByVerb: (domain?.notesByVerb && typeof domain.notesByVerb === "object") ? domain.notesByVerb : {},
    cards: Array.isArray(domain?.cards) ? domain.cards : undefined,
    selectedCardIndex: Number.isFinite(domain?.selectedCardIndex) ? domain.selectedCardIndex : 0,
    data: domain?.data && typeof domain.data === "object" ? domain.data : { verbs: [] },
    selectedIndex: Number.isFinite(domain?.selectedIndex) ? domain.selectedIndex : 0,
    selectedVerbIndex: Number.isFinite(domain?.selectedVerbIndex) ? domain.selectedVerbIndex : 0,
    bindMode: (domain?.bindMode === "auto" || domain?.bindMode === "canon") ? domain.bindMode : "canon",
    bindScan: (domain?.bindScan && typeof domain.bindScan === "object") ? domain.bindScan : null,
  };
}

export function normalizePrefs(p){
  const prefs = p && typeof p === "object" ? p : {};
  return {
    editing: !!prefs?.editing,
    rulersOn: !!prefs?.rulersOn,
    gridStepMm: Number.isFinite(prefs?.gridStepMm) ? prefs.gridStepMm : 10,
    snapOn: (prefs?.snapOn !== undefined) ? !!prefs.snapOn : true,
    verbsSortMode: (prefs?.verbsSortMode === "az" || prefs?.verbsSortMode === "za" || prefs?.verbsSortMode === "added")
      ? prefs.verbsSortMode
      : "added",
    searchQuery: (typeof prefs?.searchQuery === "string") ? prefs.searchQuery : "",
    newCardTemplateMode: (prefs?.newCardTemplateMode === "canonical") ? "canonical" : "inherit",
  };
}

export function normalizeUi(u){
  const ui = u && typeof u === "object" ? u : {};
  return {
    selectedBoxId: ui?.selectedBoxId ?? null,
    selectedIds: Array.isArray(ui?.selectedIds) ? ui.selectedIds : [],
    marqueeRect: ui?.marqueeRect ?? null,
    __dragging: !!ui?.__dragging,
    exportMode: (typeof ui?.exportMode === "string") ? ui.exportMode : null,
    leftNeedsExport: !!ui?.leftNeedsExport,
  };
}

export function splitLegacyState(raw){
  if (raw && typeof raw === "object" && raw.domain && raw.prefs && raw.ui){
    return {
      domain: raw.domain,
      prefs: raw.prefs,
      ui: raw.ui,
    };
  }

  const domain = {};
  const prefs = {};
  const ui = {};

  if (raw && typeof raw === "object"){
    for (const [key, value] of Object.entries(raw)){
      if (DOMAIN_KEYS.has(key)) domain[key] = value;
      else if (PREF_KEYS.has(key)) prefs[key] = value;
      else if (UI_KEYS.has(key)) ui[key] = value;
    }
  }

  return { domain, prefs, ui };
}

export function normalizeLegacyState(s){
  const ss = s && typeof s === "object" ? s : {};
  return {
    schemaVersion: (typeof ss?.schemaVersion === "string") ? ss.schemaVersion : "0",
    viewMode: (ss?.viewMode === "source" || ss?.viewMode === "cards") ? ss.viewMode : "cards",
    editing: !!ss?.editing,
    rulersOn: !!ss?.rulersOn,
    snapOn: (ss?.snapOn !== undefined) ? !!ss.snapOn : true,

    gridStepMm: Number.isFinite(ss?.gridStepMm) ? ss.gridStepMm : 10,

    cardWmm: Number.isFinite(ss?.cardWmm) ? ss.cardWmm : 150,
    cardHmm: Number.isFinite(ss?.cardHmm) ? ss.cardHmm : 105,

    boxes: Array.isArray(ss?.boxes) ? ss.boxes : [],

    // Global SOURCE layout snapshot (bind-boxes geometry). Never overwritten by cards.
    sourceBoxes: Array.isArray(ss?.sourceBoxes) ? ss.sourceBoxes : undefined,

    // ✅ Персональные тексты по глаголам (boxId -> text)
    notesByVerb: (ss?.notesByVerb && typeof ss.notesByVerb === "object") ? ss.notesByVerb : {},

    // --- Cards stack (v2) ---
    // cards: [{ id,title, cardWmm, cardHmm, boxes, notesByVerb, selectedIndex }]
    cards: Array.isArray(ss?.cards) ? ss.cards : undefined,
    selectedCardIndex: Number.isFinite(ss?.selectedCardIndex) ? ss.selectedCardIndex : 0,

    // Шаг 1: глаголы храним прямо в state (минимально, без UI)
    data: ss?.data && typeof ss.data === "object" ? ss.data : { verbs: [] },
    selectedIndex: Number.isFinite(ss?.selectedIndex) ? ss.selectedIndex : 0,
    selectedVerbIndex: Number.isFinite(ss?.selectedVerbIndex) ? ss.selectedVerbIndex : 0,

    bindMode: (ss?.bindMode === "auto" || ss?.bindMode === "canon") ? ss.bindMode : "canon",
    bindScan: (ss?.bindScan && typeof ss.bindScan === "object") ? ss.bindScan : null,

    // UI: verbs list sorting (left list)
    verbsSortMode: (ss?.verbsSortMode === "az" || ss?.verbsSortMode === "za" || ss?.verbsSortMode === "added")
      ? ss.verbsSortMode
      : "added",

    // UI: global search query (left+right lists)
    searchQuery: (typeof ss?.searchQuery === "string") ? ss.searchQuery : "",

    // UI: how "New card" should pick its initial formatting in the RIGHT column
    // "inherit" (default) | "canonical"
    newCardTemplateMode: (ss?.newCardTemplateMode === "canonical") ? "canonical" : "inherit",
  };
}

export function flattenState(state){
  if (!state || typeof state !== "object") return {};
  if (!state.domain || !state.prefs || !state.ui) return { ...state };
  return {
    ...state.domain,
    ...state.prefs,
    ...state.ui,
  };
}

export function createStateFromPersisted(raw){
  const split = splitLegacyState(raw);
  return {
    domain: { ...DEFAULTS.domain, ...normalizeDomain(split.domain) },
    prefs: { ...DEFAULTS.prefs, ...normalizePrefs(split.prefs) },
    ui: { ...DEFAULTS.ui, ...normalizeUi({}) },
  };
}

export function bootstrapLegacyState(raw){
  const base = createLegacyDefaults();
  const persisted = normalizeLegacyState(flattenState(splitLegacyState(raw)));
  return {
    ...base,
    ...persisted,
    selectedBoxId: null,
    selectedIds: [],
    marqueeRect: null,
  };
}

export function legacyPatchToStructured(patch){
  if (!patch || typeof patch !== "object") return { domain: {}, prefs: {}, ui: {} };
  if (patch.domain || patch.prefs || patch.ui){
    return {
      domain: patch.domain || {},
      prefs: patch.prefs || {},
      ui: patch.ui || {},
    };
  }
  const domain = {};
  const prefs = {};
  const ui = {};
  for (const [key, value] of Object.entries(patch)){
    if (DOMAIN_KEYS.has(key)) domain[key] = value;
    else if (PREF_KEYS.has(key)) prefs[key] = value;
    else if (UI_KEYS.has(key)) ui[key] = value;
    else domain[key] = value;
  }
  return { domain, prefs, ui };
}

export function assignLegacyKey(state, key, value){
  if (!state || typeof state !== "object") return;
  if (DOMAIN_KEYS.has(key)) state.domain[key] = value;
  else if (PREF_KEYS.has(key)) state.prefs[key] = value;
  else if (UI_KEYS.has(key)) state.ui[key] = value;
  else state.domain[key] = value;
}

export function pickPersistedState(s){
  const split = splitLegacyState(s);
  return {
    domain: normalizeDomain(split.domain),
    prefs: normalizePrefs(split.prefs),
  };
}

export function getVerbKey(v, fallbackIndex = 0){
  return String(v?.id || v?.infinitive || v?.inf || v?.name || fallbackIndex);
}
