// js/app/app_parts/state.js

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').PersistedState} PersistedState */
/** @typedef {import('./types.js').Box} Box */
/** @typedef {import('./types.js').Card} Card */

import { STATE_SCHEMA_VERSION, CANONICAL_FULL_BOXES } from './constants.js';
import { cloneBoxes } from './clone.js';

export function pickPersistedState(s){
  /** @type {any} */
  const ss = s;
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
    data: ss?.data && typeof ss.data === "object" ? ss.data : undefined,
    selectedIndex: Number.isFinite(ss?.selectedIndex) ? ss.selectedIndex : 0,

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

export const DEFAULTS = {
  schemaVersion: STATE_SCHEMA_VERSION,
  editing: false,
  rulersOn: false,
  gridStepMm: 10,
  snapOn: true,

  cardWmm: 150,
  cardHmm: 105,

  // --- Cards stack (v2) ---
  // In runtime we keep current card fields (cardWmm/cardHmm/boxes/notesByVerb/selectedIndex)
  // and additionally a cards[] array to allow multiple cards.
  cards: null,
  selectedCardIndex: 0,
  // "cards" = показываем созданные карточки; "source" = показываем карточку-источник по глаголу
  viewMode: "cards",

  // New card formatting: inherit from the current right-column card, or use canonical template
  newCardTemplateMode: "inherit",

  boxes: cloneBoxes(CANONICAL_FULL_BOXES),

  // ✅ Персональные тексты по глаголам: { [verbId]: { [boxId]: text } }
  notesByVerb: {},


  selectedBoxId: null, // transient

  // --- Editor multi-select (transient) ---------------------------------
  // Stored in state so renderer/editor can share it, but never persisted to history snapshots.
  selectedIds: [],
  marqueeRect: null, // { xMm, yMm, wMm, hMm } while selecting with a rectangle

  // Шаг 1: место для данных
  data: { verbs: [] },
  selectedIndex: 0,

  // UI: verbs list sorting
  verbsSortMode: "added",

  // UI: global search query
  searchQuery: "",
};

export function getVerbKey(v, fallbackIndex = 0){
  return String(v?.id || v?.infinitive || v?.inf || v?.name || fallbackIndex);
}
