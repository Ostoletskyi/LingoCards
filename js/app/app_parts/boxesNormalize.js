// js/app/app_parts/boxesNormalize.js

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').Box} Box */

export function coerceNumber(v, fallback){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// MUTATES box objects in place (preserves unknown fields).
/** @param {any[]} boxes @returns {Box[]} */
export function normalizeBoxesArrayInPlace(boxes){
  if (!Array.isArray(boxes)) return [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < boxes.length; i++){
    const b0 = boxes[i];
    if (!b0 || typeof b0 !== "object") continue;

    const b = b0; // patch in place

    // Remove legacy geometry keys (px-based or old schema). They can shadow mm fields
    // in some older helpers/validators and cause NaN/null geometry errors.
    // Keep the state strictly in mm units.
    if ("x" in b) delete b.x;
    if ("y" in b) delete b.y;
    if ("w" in b) delete b.w;
    if ("h" in b) delete b.h;

    // id
    if (typeof b.id !== "string" || !b.id.trim()){
      b.id = "box_" + Date.now().toString(36) + "_" + i;
    } else {
      b.id = b.id.trim();
    }
    // ensure unique id within this array
    if (seen.has(b.id)) b.id = b.id + "_" + i;
    seen.add(b.id);

    // text must ALWAYS be a string (renderer/editor/autofit expect it)
    if (typeof b.text !== "string") b.text = (b.text == null) ? "" : String(b.text);

    // geometry / font
    b.xMm = coerceNumber(b.xMm, 0);
    b.yMm = coerceNumber(b.yMm, 0);
    b.wMm = coerceNumber(b.wMm, 10);
    b.hMm = coerceNumber(b.hMm, 5);
    b.fontPt = coerceNumber(b.fontPt, 12);

    // align
    if (b.align !== "left" && b.align !== "center" && b.align !== "right") b.align = "left";

    // visible (default true)
    if (b.visible === undefined) b.visible = true;

    out.push(b);
  }
  return out;
}

// MUTATES state.boxes/state.sourceBoxes/state.cards[].boxes in place.
/** @param {AppState} state @returns {boolean} */
export function normalizeBoxesEverywhere(state){
  if (!state || typeof state !== "object") return false;
  let changed = false;

  if (Array.isArray(state.boxes)){
    const beforeLen = state.boxes.length;
    state.boxes = normalizeBoxesArrayInPlace(state.boxes);
    if (state.boxes.length !== beforeLen) changed = true;
  } else {
    state.boxes = [];
    changed = true;
  }

  if (Array.isArray(state.sourceBoxes)){
    const beforeLen = state.sourceBoxes.length;
    state.sourceBoxes = normalizeBoxesArrayInPlace(state.sourceBoxes);
    if (state.sourceBoxes.length !== beforeLen) changed = true;
  }

  if (Array.isArray(state.cards)){
    for (const c of state.cards){
      if (!c || typeof c !== "object") continue;
      if (Array.isArray(c.boxes)){
        const beforeLen = c.boxes.length;
        c.boxes = normalizeBoxesArrayInPlace(c.boxes);
        if (c.boxes.length !== beforeLen) changed = true;
      } else {
        c.boxes = [];
        changed = true;
      }
    }
  }

  return changed;
}
