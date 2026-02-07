// js/app/app_parts/migrations.js

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').Box} Box */
/** @typedef {import('./types.js').Card} Card */
/** @typedef {import('./types.js').NotesByVerb} NotesByVerb */

import { STATE_SCHEMA_VERSION, CANONICAL_FULL_BOXES } from './constants.js';
import { normalizeBoxesEverywhere } from './boxesNormalize.js';
import { cloneBoxes, deepClone } from './clone.js';
import { getVerbKey } from './state.js';
import { log } from '../../utils/log.js';

// MUTATES state in place.
/** @param {AppState} state @returns {{ state: AppState, changed: boolean }} */
export function migrateState(state){
  if (!state || typeof state !== "object") return { state, changed:false };

  if (typeof state.schemaVersion !== "string") state.schemaVersion = "0";
  let changed = false;

  // Always normalize for safety (doesn't change schemaVersion)
  try { if (normalizeBoxesEverywhere(state)) changed = true; } catch (e) { log.warn("normalizeBoxesEverywhere failed", { err: String(e) }); changed = true; }
  try { if (migrateRektionIds(state)) changed = true; } catch (e) { log.warn("migrateRektionIds failed", { err: String(e) }); changed = true; }

  if (state.schemaVersion === "0" || state.schemaVersion === "" || state.schemaVersion == null){
    // Legacy saves: ensure bind boxes, label keys, notesByVerb mapping.
    try { ensureBoundBoxes(state); changed = true; } catch (e) { log.warn("ensureBoundBoxes failed", { err: String(e) }); }
    try { ensureLabelKeysEverywhere(state); changed = true; } catch (e) { log.warn("ensureLabelKeysEverywhere failed", { err: String(e) }); }
    try { if (migrateNotesAndTextModes(state)) changed = true; } catch (e) { log.warn("migrateNotesAndTextModes failed", { err: String(e) }); }
    try { if (normalizeBoxesEverywhere(state)) changed = true; } catch (e) { log.warn("normalizeBoxesEverywhere failed", { err: String(e) }); }
    state.schemaVersion = STATE_SCHEMA_VERSION;
    changed = true;
  } else if (state.schemaVersion !== STATE_SCHEMA_VERSION){
    // Future-proof: normalize and bump to current schema for now.
    state.schemaVersion = STATE_SCHEMA_VERSION;
    changed = true;
  }

  return { state, changed };
}



// Миграция: если у бокса нет textMode, считаем так:
// - bind-боксы = "bind"
// - прочие = "note" (текст хранится уникально для каждого глагола)
// Также: если раньше текст хранился в b.text, переносим его в notesByVerb для текущего глагола.
export function migrateNotesAndTextModes(state){
  state.notesByVerb = (state.notesByVerb && typeof state.notesByVerb === "object") ? state.notesByVerb : {};

  const verbs = Array.isArray(state?.data?.verbs) ? state.data.verbs : [];
  const idx = Number.isFinite(state?.selectedIndex) ? state.selectedIndex : 0;
  const curVerb = verbs[idx] || null;
  const verbKey = getVerbKey(curVerb, idx);

  let changed = false;

  const src = Array.isArray(state.boxes) ? state.boxes : [];
  const cleaned = [];

  for (const b of src){
    if (!b) { changed = true; continue; }
    if (typeof b !== "object") { changed = true; continue; } // <-- ключевой фикс
    cleaned.push(b);

    if (!b.textMode){
      b.textMode = b.bind ? "bind" : "note";
      changed = true;
    }

    if (b.textMode === "note"){
      const old = String(b.text ?? "").trim();
      if (old){
        state.notesByVerb[verbKey] = state.notesByVerb[verbKey] || {};
        if (!state.notesByVerb[verbKey][b.id]){
          state.notesByVerb[verbKey][b.id] = old;
        }
        b.text = "";
        changed = true;
      }
    }

    if (b.textMode === "static" && b.staticText === undefined && (b.text ?? "") !== ""){
      b.staticText = String(b.text ?? "");
      changed = true;
    }
  }

  if (cleaned.length !== src.length){
    state.boxes = cleaned;
    changed = true;
  }

  return changed;
}
export function ensureBoundBoxes(state){
  const boxes = Array.isArray(state.boxes) ? state.boxes.filter(b => b && typeof b === "object") : [];
if (boxes.length !== (Array.isArray(state.boxes) ? state.boxes.length : 0)) state.boxes = boxes;

  // Проверяем наличие нужных bind-блоков
  const hasInf   = boxes.some(b => b?.bind === "inf"   || b?.id === "inf");
  const hasTr    = boxes.some(b => b?.bind === "tr"    || b?.id === "tr");
  const hasForms = boxes.some(b => b?.bind === "forms" || b?.id === "forms");

  if (hasInf && hasTr && hasForms) return;

  const system = [];
  if (!hasInf) system.push({ id:"inf", xMm:10, yMm:12, wMm:130, hMm:14, text:"", fontPt:26, label:"Infinitiv", bind:"inf" });
  if (!hasTr) system.push({ id:"tr", xMm:10, yMm:26, wMm:130, hMm:10, text:"", fontPt:12, label:"Übersetzung", bind:"tr" });
  if (!hasForms) system.push({ id:"forms", xMm:10, yMm:38, wMm:130, hMm:10, text:"", fontPt:14, label:"Formen", bind:"forms" });

  // добавляем в начало, чтобы были “сверху” в списке
  state.boxes = [...system, ...boxes];

function ensureCanonicalBoxes(state){
  if (!state || typeof state !== 'object') return false;
  var changed = false;
  function mergeInto(key){
    var arr = state[key];
    if (!Array.isArray(arr) || arr.length === 0){
      state[key] = cloneBoxes(CANONICAL_FULL_BOXES);
      return true;
    }
    // drop any junk entries
    var cleaned = arr.filter(function(b){ return b && typeof b === 'object'; });
    if (cleaned.length !== arr.length){ state[key] = cleaned; arr = cleaned; changed = true; }
    var have = Object.create(null);
    arr.forEach(function(b){ if (b && b.id) have[String(b.id)] = true; });
    CANONICAL_FULL_BOXES.forEach(function(cb){
      var id = cb && cb.id ? String(cb.id) : '';
      if (!id) return;
      if (!have[id]){
        arr.push(JSON.parse(JSON.stringify(cb)));
        have[id] = true;
        changed = true;
      }
    });
    // normalize binds / behavior for known canonical ids
    arr.forEach(function(b){
      if (!b || typeof b !== 'object') return;
      var id = b.id ? String(b.id) : '';
      if (id === 'tr' && (b.bind === 'tr' || !b.bind)){ b.bind = 'translationsLine'; changed = true; }
      if (id === 'forms' && (b.bind === 'forms' || !b.bind)){ b.bind = 'formsLine'; changed = true; }
      if (id === 'syn' && (b.bind === 'syn' || !b.bind)){ b.bind = 'synonymsPairsBlock'; changed = true; }
      if (id === 'examples' && (b.bind === 'examples' || !b.bind)){ b.bind = 'examplesBlock'; changed = true; }
      if (id === 'rek' && (b.bind === 'rek' || !b.bind)){ b.bind = 'rektionBlock'; changed = true; }
      if (id === 'rek'){
        if (b.textMode !== 'bind'){ b.textMode = 'bind'; changed = true; }
        if (!b.labelKey) { b.labelKey = 'box.rektion'; changed = true; }
      }
      if (id === 'pref' && (b.bind === 'pref' || !b.bind)){ b.bind = 'prefixesBlock'; changed = true; }
      if (id === 'freqCorner'){
        if (!b.bind) { b.bind = 'freq'; changed = true; }
        if (!b.type) { b.type = 'frequencyDots'; changed = true; }
        if (!b.textMode) { b.textMode = 'bind'; changed = true; }
      }
      // legacy split examples: keep but hide to avoid confusion
      if (id === 'exPr' || id === 'exPt' || id === 'exPf'){
        if (b.visible !== false){ b.visible = false; changed = true; }
      }
    });
    return changed;
  }
  var c1 = mergeInto('boxes');
  var c2 = mergeInto('sourceBoxes');
  return changed || c1 || c2;
}

}


// Migration: keep Rektion block stable and predictable.
// Reality check:
// - Older saves used box id "rek" (often static/note).
// - Some intermediate refactors created "rektion" id/bind and it caused "sticky" frames.
// Decision:
// - Canonical id is "rek".
// - Canonical bind is "rektionBlock" (verbBind builds text from rek_1..rek_5).
// - Per-verb override lives in notesByVerb[verbKey].rek.
export function migrateRektionIds(state){
  if (!state || typeof state !== "object") return false;

  const verbs = Array.isArray(state?.data?.verbs) ? state.data.verbs : [];
  const idx = Number.isFinite(state?.selectedIndex) ? state.selectedIndex : 0;
  const curVerb = verbs[idx] || null;
  const verbKey = getVerbKey(curVerb, idx);

  let changed = false;

  // notesByVerb: unify rektion -> rek (DO NOT delete rek if it already exists)
  if (state.notesByVerb && typeof state.notesByVerb === "object"){
    for (const k of Object.keys(state.notesByVerb)){
      const m = state.notesByVerb[k];
      if (!m || typeof m !== "object") continue;
      if (m.rektion !== undefined && (m.rek === undefined || String(m.rek||"").trim()==="")){
        m.rek = String(m.rektion ?? "");
        delete m.rektion;
        changed = true;
      } else if (m.rektion !== undefined){
        // keep the map clean
        delete m.rektion;
        changed = true;
      }
    }
  }

  // Patch only canonical templates (state.boxes + state.sourceBoxes).
  // Draft cards (state.cards[].boxes) must remain editable/static.
  function patchArray(arr){
    if (!Array.isArray(arr)) return;

    // If both exist, we keep "rek" and drop "rektion" to avoid duplicate frames.
    const hasRek = arr.some(b => b && typeof b === "object" && String(b.id||"") === "rek");

    for (let i = arr.length - 1; i >= 0; i--){
      const b = arr[i];
      if (!b || typeof b !== "object") continue;

      const id = String(b.id || "");

      if (id === "rektion"){
        if (hasRek){
          arr.splice(i, 1);
          changed = true;
          continue;
        }
        b.id = "rek";
        changed = true;
      }

      if (String(b.id || "") === "rek"){
        // Ensure it updates on verb switch.
        if (!b.bind || String(b.bind) !== "rektionBlock"){ b.bind = "rektionBlock"; changed = true; }
        if (b.textMode !== "bind"){ b.textMode = "bind"; changed = true; }

        // If legacy static text exists, treat it as per-verb note for current verb, then clear.
        const legacyTxt = String(b.staticText ?? b.text ?? "").trim();
        if (legacyTxt){
          state.notesByVerb = (state.notesByVerb && typeof state.notesByVerb === "object") ? state.notesByVerb : {};
          state.notesByVerb[verbKey] = (state.notesByVerb[verbKey] && typeof state.notesByVerb[verbKey] === "object") ? state.notesByVerb[verbKey] : {};
          if (state.notesByVerb[verbKey].rek === undefined || String(state.notesByVerb[verbKey].rek||"").trim()===""){
            state.notesByVerb[verbKey].rek = legacyTxt;
          }
          b.staticText = "";
          b.text = "";
          changed = true;
        } else {
          // Avoid sticky leftovers
          if (typeof b.staticText === "string" && b.staticText !== ""){ b.staticText = ""; changed = true; }
          if (typeof b.text === "string" && b.text !== ""){ b.text = ""; changed = true; }
        }
      }
    }
  }

  patchArray(state.boxes);
  patchArray(state.sourceBoxes);

  return changed;
}

// ---- Cards stack (multiple cards) ----------------------------------------

function makeCardId(){
  return "card_" + Math.random().toString(36).slice(2, 10);
}

function makeCardFromCurrentState(state, { title } = {}){
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
function makeBlankCardFromTemplate(state, { title, templateMode } = {}){
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
    srcBoxes = Array.isArray(DEFAULTS.domain?.boxes) ? DEFAULTS.domain.boxes : [];
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
function makeRightPreviewTemplate(state){
  const tmp = makeBlankCardFromTemplate(state, { title: "" });
  return Array.isArray(tmp?.boxes) ? tmp.boxes : [];
}

// In CARDS (right list) mode, geometry is always user-driven.
// We keep this strictly independent from SOURCE (left list) geometry.
function forceManualGeomForRightList(boxes){
  const arr = Array.isArray(boxes) ? boxes : [];
  for (const b of arr){
    if (!b || typeof b !== "object") continue;
    // This disables bind auto-fit and marks the box as globally pinned (within the right list).
    b.geomMode = "manual";
    b.geomPinned = true;
  }
  return arr;
}

function normalizeCardsState(state){
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

export function ensureLabelKeysInBoxes(boxes){
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

export function ensureLabelKeysEverywhere(state){
  try { ensureLabelKeysInBoxes(state?.boxes); } catch (e) { log.warn("ensureLabelKeysInBoxes failed", { err: String(e) }); }
  try {
    if (Array.isArray(state?.cards)){
      for (const c of state.cards) ensureLabelKeysInBoxes(c?.boxes);
    }
  } catch (e) { log.warn("ensureLabelKeysEverywhere failed", { err: String(e) }); }
}
