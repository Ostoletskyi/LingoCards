// js/data/jsonScan.js
// Dataset scanner + "auto bind" prototype.
//
// Problem it addresses:
// - Current cards are template-driven: each box has a `bind` name.
// - If imported JSON uses different field names, binds resolve to empty strings,
//   so blocks look blank even though data exists.
//
// Prototype solution:
// - Detect mismatch automatically.
// - Switch to an "auto" layout that renders data by *paths* (bind="path:...").
//   This avoids hard dependency on exact bind names.
//
// Safety:
// - Only activates when coverage is clearly low.
// - Never deletes presets/templates; it only swaps the current `state.boxes`.

import { resolveVerbBind } from "./verbBind.js";

function asStr(x){
  if (x === null || x === undefined) return "";
  return String(x);
}

function isNonEmptyText(x){
  const s = asStr(x).trim();
  return s.length > 0;
}

function pickSampleVerb(verbs){
  if (!Array.isArray(verbs) || !verbs.length) return null;
  // pick first non-empty object
  for (const v of verbs){
    if (v && typeof v === "object") return v;
  }
  return null;
}

function templateBinds(boxes){
  const out = [];
  for (const b of (boxes || [])){
    const bind = asStr(b?.bind).trim();
    if (bind) out.push(bind);
  }
  // de-dup
  return [...new Set(out)];
}

export function scanVerbDataset(verbs, templateBoxes){
  const sample = pickSampleVerb(verbs);
  const binds = templateBinds(templateBoxes);
  if (!sample || binds.length === 0) {
    return {
      mode: "canon",
      coverage: 1,
      nonEmpty: binds.length,
      total: binds.length,
      reason: "no-sample-or-no-binds",
    };
  }

  let nonEmpty = 0;
  for (const bind of binds){
    try {
      const r = resolveVerbBind(sample, bind);
      if (r?.kind === "freq") {
        if (Number.isFinite(r.value)) nonEmpty++;
      } else if (isNonEmptyText(r?.text)) {
        nonEmpty++;
      }
    } catch {
      // ignore
    }
  }

  const total = binds.length;
  const coverage = total ? nonEmpty / total : 0;

  // Thresholds:
  // - >= 0.55 => likely compatible (canonical)
  // - < 0.55 => likely foreign/draft schema, enable auto mode
  const mode = coverage >= 0.55 ? "canon" : "auto";
  const reason = mode === "auto"
    ? `low-coverage:${nonEmpty}/${total}`
    : `ok-coverage:${nonEmpty}/${total}`;

  return { mode, coverage, nonEmpty, total, reason };
}

function flattenForAuto(obj, opts = {}){
  const {
    maxDepth = 3,
    maxItems = 18,
    ignoreKeys = new Set(["debug", "_debug", "__debug", "meta", "schema", "version"]),
  } = opts;

  const pairs = [];

  function walk(cur, path, depth){
    if (pairs.length >= maxItems) return;
    if (cur === null || cur === undefined) return;

    if (typeof cur === "string" || typeof cur === "number" || typeof cur === "boolean"){
      const s = asStr(cur).trim();
      if (s) pairs.push({ path, label: path, value: s });
      return;
    }

    if (Array.isArray(cur)){
      // show arrays as joined text, but keep path for deeper binding if needed
      const vals = cur
        .map(x => asStr(x).trim())
        .filter(Boolean);
      if (vals.length) pairs.push({ path, label: path, value: vals.join("\n") });
      return;
    }

    if (typeof cur === "object"){
      if (depth >= maxDepth) return;
      const keys = Object.keys(cur);
      for (const k of keys){
        if (pairs.length >= maxItems) return;
        if (!k) continue;
        if (ignoreKeys.has(k)) continue;
        const nextPath = path ? `${path}.${k}` : k;
        walk(cur[k], nextPath, depth + 1);
      }
    }
  }

  walk(obj, "", 0);
  return pairs;
}

export function buildAutoBoxesFromVerb(verb, state){
  const cardW = Number.isFinite(state?.cardWmm) ? state.cardWmm : 90;
  const cardH = Number.isFinite(state?.cardHmm) ? state.cardHmm : 55;
  const margin = 2;

  const items = flattenForAuto(verb);

  const w = Math.max(40, cardW - margin * 2);
  const x = margin;
  let y = margin;

  const boxes = [];
  let i = 0;
  for (const it of items){
    i++;
    const h = 10; // base height; renderCard auto-fit will stretch if needed
    if (y + h > cardH - margin) break;

    boxes.push({
      id: `auto_${i}`,
      title: it.path,
      kind: "text",
      bind: `path:${it.path}`,
      xMm: x,
      yMm: y,
      wMm: w,
      hMm: h,
      fontPt: 12,
      // Important: auto-layout boxes should be manual to avoid template fights.
      geomMode: "manual",
      manualGeom: true,
    });

    y += h + 2;
  }

  // If we somehow got nothing, at least show the whole object JSON.
  if (!boxes.length){
    boxes.push({
      id: "auto_1",
      title: "raw",
      kind: "text",
      bind: "path:",
      xMm: margin,
      yMm: margin,
      wMm: Math.max(40, cardW - margin * 2),
      hMm: Math.max(20, cardH - margin * 2),
      fontPt: 10,
      geomMode: "manual",
      manualGeom: true,
    });
  }

  return boxes;
}

// Convenience helper used by UI import...
export function scanVerbDatasetAndMaybeBuildAutoBoxes({ verbs, templateBoxes, state }){
  const info = scanVerbDataset(verbs, templateBoxes);
  if (info.mode !== "auto"){
    return { mode: "canonical", boxes: templateBoxes, meta: info };
  }
  const v0 = Array.isArray(verbs) && verbs.length ? verbs[0] : null;
  const autoBoxes = buildAutoBoxesFromVerb(v0 || {}, state || {});
  return {
    mode: "auto",
    boxes: autoBoxes,
    meta: info,
  };
}
