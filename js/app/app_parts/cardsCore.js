// js/app/app_parts/cardsCore.js

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').Box} Box */
/** @typedef {import('./types.js').Card} Card */

import { buildBoxesFromVerbSample } from "../../data/autoLayoutFromVerb.js";
import { DEFAULTS } from "./state.js";
import { deepClone, cloneBoxes } from "./clone.js";

export function makeCardId(){
  return "card_" + Math.random().toString(36).slice(2, 10);
}

/** @param {AppState} state @param {{title?: string}=} opts @returns {Card} */
export function makeCardFromCurrentState(state, { title } = {}){
  return {
    id: makeCardId(),
    title: String(title || "Card"),
    cardWmm: Number.isFinite(state?.cardWmm) ? state.cardWmm : 150,
    cardHmm: Number.isFinite(state?.cardHmm) ? state.cardHmm : 105,
    boxes: forceManualGeomForRightList(deepClone(Array.isArray(state?.boxes) ? state.boxes : [])),
    notesByVerb: deepClone((state?.notesByVerb && typeof state.notesByVerb === "object") ? state.notesByVerb : {}),
    selectedIndex: Number.isFinite(state?.selectedIndex) ? state.selectedIndex : 0,
  };
}

// Create a new *blank* card:
// - keeps the current geometry (boxes positions/sizes/fonts)
// - removes all binds (so it's editable and exportable as independent content)
// - clears per-verb notes
/** @param {AppState} state @param {{title?: string, templateMode?: string}=} opts @returns {Card} */
export function makeBlankCardFromTemplate(state, { title, templateMode } = {}){
  // Draft (RIGHT list) can be created in two modes:
  // 1) "inherit"  — use current right-column card formatting (recommended UX)
  // 2) "canonical" — use canonical FULL template geometry
  const mode = String(templateMode || "inherit").toLowerCase();

  // Choose a source boxes set WITHOUT mutating any existing card.
  let srcBoxes = null;
  if (mode === "inherit"){
    try {
      // Prefer the currently selected card in the right list.
      const idx = Number.isFinite(state?.selectedCardIndex) ? state.selectedCardIndex : 0;
      const c = Array.isArray(state?.cards) ? state.cards[idx] : null;
      if (c && Array.isArray(c.boxes) && c.boxes.length){
        srcBoxes = c.boxes;
      }
    } catch(_){ /* ignore */ }
  }

  if (!Array.isArray(srcBoxes) || !srcBoxes.length){
    // Fallback: canonical FULL template (always fits 150×105)
    try { srcBoxes = buildBoxesFromVerbSample({}, "full-template"); } catch(_){ srcBoxes = null; }
  }
  if (!Array.isArray(srcBoxes) || !srcBoxes.length){
    srcBoxes = Array.isArray(DEFAULTS.boxes) ? DEFAULTS.boxes : [];
  }

  // Create a blank editable copy.
  // IMPORTANT: do NOT pin geometry by default — allow auto-fit-to-text to work.
  // If the user manually resizes/moves a box, the editor will mark it as manual.
  const boxes = deepClone(srcBoxes).map((b) => {
    const bb = (b && typeof b === "object") ? b : {};
    const out = { ...bb };
    delete out.bind;
    out.textMode = "static";
    out.staticText = "";
    out.text = "";
    // opt-in flag for "rubber" auto-fit in CARDS mode
    if (out.autoFitText === undefined) out.autoFitText = true;
    // do not force manual geom here
    if (String(out.geomMode || "") === "manual") delete out.geomMode;
    if (out.geomPinned === true) delete out.geomPinned;
    return out;
  });

  return {
    id: makeCardId(),
    title: String(title || "Card"),
    cardWmm: Number.isFinite(state?.cardWmm) ? state.cardWmm : 150,
    cardHmm: Number.isFinite(state?.cardHmm) ? state.cardHmm : 105,
    boxes,
    notesByVerb: {},
    selectedIndex: 0,
  };
}

// A canonical empty template for the RIGHT list preview (when the list is empty).
/** @param {AppState} state @returns {Box[]} */
export function makeRightPreviewTemplate(state){
  const tmp = makeBlankCardFromTemplate(state, { title: "" });
  return Array.isArray(tmp?.boxes) ? tmp.boxes : [];
}

// In CARDS (right list) mode, geometry is always user-driven.
// We keep this strictly independent from SOURCE (left list) geometry.
// MUTATES boxes in place.
/** @param {Box[]} boxes @returns {Box[]} */
export function forceManualGeomForRightList(boxes){
  const arr = Array.isArray(boxes) ? boxes : [];
  for (const b of arr){
    if (!b || typeof b !== "object") continue;
    // This disables bind auto-fit and marks the box as globally pinned (within the right list).
    b.geomMode = "manual";
    b.geomPinned = true;
  }
  return arr;
}

// MUTATES state in place.
/** @param {AppState} state */
export function normalizeCardsState(state){
  // Migration path: very old saves had no cards[] at all (single-card fields only).
  // IMPORTANT: an *empty* cards[] is a valid state (user can clear the right list).
  // Never auto-create Card 1 when cards[] exists but is empty, otherwise "New card"
  // after "Clear list" creates TWO cards.
  if (!Array.isArray(state.cards)){
    const c0 = makeCardFromCurrentState(state, { title: "Card 1" });
    state.cards = [c0];
    state.selectedCardIndex = 0;
  }

  // Clamp index even when list is empty.
  if (!Number.isFinite(state.selectedCardIndex) || state.selectedCardIndex < 0) state.selectedCardIndex = 0;
  if (Array.isArray(state.cards) && state.cards.length){
    if (state.selectedCardIndex >= state.cards.length) state.selectedCardIndex = state.cards.length - 1;
  } else {
    state.selectedCardIndex = 0;
  }
}

function ensureLabelKeysInBoxes(boxes){
  if (!Array.isArray(boxes)) return;
  for (const b of boxes){
    if (!b || typeof b !== "object") continue;
    if (b.labelKey) continue;
    const id = String(b.id || "").trim();
    const label = String(b.label || "").trim();

    // Prefer mapping by canonical ids
    const byId = {
      inf: "box.inf",
      tr: "box.tr",
      forms: "box.forms",
      rektion: "box.rektion",
      syn: "box.syn",
      examples: "box.examples",
      pref: "box.prefix",
      top: "box.top"
    };
    if (byId[id]){
      b.labelKey = byId[id];
      continue;
    }

    // Label-based migrations (legacy layouts)
    if (/^\s*Beispiel\s*\(?(Pr\u00e4sens|Pr\u00e4teritum|Perfekt)\)?\s*$/i.test(label)){
      const m = label.match(/(Pr\u00e4sens|Pr\u00e4teritum|Perfekt)/i);
      if (m){
        const t = m[1].toLowerCase();
        if (t.indexOf("pr\u00e4sens")>=0) b.labelKey = "box.ex_praesens";
        else if (t.indexOf("pr\u00e4ter")>=0) b.labelKey = "box.ex_praeteritum";
        else if (t.indexOf("perf")>=0) b.labelKey = "box.ex_perfekt";
      }
      continue;
    }
    if (/^\s*Beispiel\s+Pr\u00e4sens\s*$/i.test(label)) { b.labelKey = "box.ex_praesens"; continue; }
    if (/^\s*Beispiel\s+Pr\u00e4teritum\s*$/i.test(label)) { b.labelKey = "box.ex_praeteritum"; continue; }
    if (/^\s*Beispiel\s+Perfekt\s*$/i.test(label)) { b.labelKey = "box.ex_perfekt"; continue; }
    if (/^\s*Pr\u00e4fixe\s*\/\s*Partikel\s*$/i.test(label)) { b.labelKey = "box.prefix"; continue; }
    if (/^\s*\u0422\u041e\u041f\s*$/.test(label) || /^\s*TOP\s*$/i.test(label)) { b.labelKey = "box.top"; continue; }

    // Custom blocks: recognize common patterns and preserve the number.
    let mm = label.match(/^\s*\u0411\u043b\u043e\u043a\s*\u2116\s*(\d+)\s*$/i);
    if (!mm) mm = label.match(/^\s*Block\s*(?:Nr\.?|#)\s*(\d+)\s*$/i);
    if (mm){
      b.labelKey = "box.customBlock";
      b.labelParams = { n: Number(mm[1]) };
      continue;
    }
  }
}

function ensureLabelKeysEverywhere(state){
  try { ensureLabelKeysInBoxes(state?.boxes); } catch {}
  try {
    if (Array.isArray(state?.cards)){
      for (const c of state.cards) ensureLabelKeysInBoxes(c?.boxes);
    }
  } catch {}
}

// MUTATES state.cards[selected].* (snapshot sync).
/** @param {AppState} state */
export function syncCurrentToCards(state){
  if (!Array.isArray(state.cards) || !state.cards.length) return;
  const idx = Number.isFinite(state.selectedCardIndex) ? state.selectedCardIndex : 0;
  const c = state.cards[idx];
  if (!c) return;
  c.cardWmm = Number.isFinite(state?.cardWmm) ? state.cardWmm : c.cardWmm;
  c.cardHmm = Number.isFinite(state?.cardHmm) ? state.cardHmm : c.cardHmm;
  c.boxes = deepClone(Array.isArray(state?.boxes) ? state.boxes : []);
  c.notesByVerb = deepClone((state?.notesByVerb && typeof state.notesByVerb === "object") ? state.notesByVerb : {});
  c.selectedIndex = Number.isFinite(state?.selectedIndex) ? state.selectedIndex : (c.selectedIndex || 0);
}

// MUTATES state current-card fields from selected card snapshot.
/** @param {AppState} state */
export function applyCardFromCards(state){
  normalizeCardsState(state);
  const idx = Number.isFinite(state.selectedCardIndex) ? state.selectedCardIndex : 0;
  const c = state.cards[idx];
  if (!c) return;
  state.cardWmm = Number.isFinite(c.cardWmm) ? c.cardWmm : 150;
  state.cardHmm = Number.isFinite(c.cardHmm) ? c.cardHmm : 105;
  state.boxes = deepClone(Array.isArray(c.boxes) ? c.boxes : []);
  state.notesByVerb = deepClone((c.notesByVerb && typeof c.notesByVerb === "object") ? c.notesByVerb : {});
  state.selectedIndex = Number.isFinite(c.selectedIndex) ? c.selectedIndex : 0;
