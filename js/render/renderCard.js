// js/render/renderCard.js
import { resolveVerbBind } from "../data/verbBind.js";
import { getEditing, isEditingText, syncTextEditorOverlay } from "../editor/textEdit.js";
import { strokeRoundRect } from "./roundRect.js";
import { computeCardGeom, mmToPx, pxToMm } from "./geom.js";

let lastCtx = null;
let _lastGeom = null;

// анти-зацикливание: автофит меняет размеры -> ререндер -> ...
let _autoFitGuard = 0;

const BOX_PAD_X = 8;
// Slightly larger vertical padding reduces the chance of text getting clipped
// on some browsers (descenders/antialiasing).
const BOX_PAD_Y = 8;

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function degToRad(d){ return (Number(d) || 0) * Math.PI / 180; }

function rotatePoint(px, py, cx, cy, angRad){
  const s = Math.sin(angRad), c = Math.cos(angRad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

// Font sizes in state are stored as pt.
// In preview we must convert pt -> mm -> px via current geom scale.
// Otherwise on small screens the card shrinks but text keeps the same px size,
// causing massive overlap (“distortion”).
function ptToPx(pt, g){
  const v = Number(pt);
  const safePt = Number.isFinite(v) ? v : 12;
  const mm = safePt * 0.3527777778;
  return mmToPx(mm, g);
}

function ensureCanvas(layer){
  let c = layer.querySelector("canvas#lcCardCanvas");
  if (!c){
    c = document.createElement("canvas");
    c.id = "lcCardCanvas";
    c.style.display = "block";
    c.style.width = "100%";
    c.style.height = "100%";
    c.style.borderRadius = "14px";
    c.style.background = "rgba(255,255,255,0.02)";
    layer.appendChild(c);
  }
  return c;
}

function resizeCanvasToLayer(canvas, layer){
  const r = layer.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.floor(r.width));
  const h = Math.max(1, Math.floor(r.height));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

function splitLines(text){
  return String(text ?? "").replace(/\r\n/g, "\n").split("\n");
}

// Word-wrap helper for canvas text.
// Keeps explicit newlines, wraps by spaces, and breaks very long words by characters.
function wrapLines(ctx, text, maxWidthPx){
  const out = [];
  const paras = splitLines(text);

  function pushLine(s){
    out.push(s);
  }

  function breakLongWord(word){
    // Greedy character wrapping
    let chunk = "";
    for (const ch of word){
      const test = chunk + ch;
      if (chunk && ctx.measureText(test).width > maxWidthPx){
        pushLine(chunk);
        chunk = ch;
      } else {
        chunk = test;
      }
    }
    if (chunk) pushLine(chunk);
  }

  for (let pi = 0; pi < paras.length; pi++){
    const para = String(paras[pi] ?? "");
    // preserve empty lines
    if (!para.trim()){
      pushLine("");
      continue;
    }

    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words){
      if (!line){
        // If even a single word doesn't fit, break it
        if (ctx.measureText(w).width > maxWidthPx){
          breakLongWord(w);
          line = "";
        } else {
          line = w;
        }
        continue;
      }

      const candidate = line + " " + w;
      if (ctx.measureText(candidate).width <= maxWidthPx){
        line = candidate;
      } else {
        pushLine(line);
        // start new line
        if (ctx.measureText(w).width > maxWidthPx){
          breakLongWord(w);
          line = "";
        } else {
          line = w;
        }
      }
    }
    if (line) pushLine(line);
  }

  return out;
}

function measureMultiline(ctx, lines, lineH){
  let maxW = 0;
  for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
  const h = Math.max(1, lines.length) * lineH;
  return { maxWpx: maxW, totalHpx: h };
}

export function getLastCardGeom(){ return _lastGeom; }

function getCurrentVerb(state){
  const verbs = Array.isArray(state?.data?.verbs) ? state.data.verbs : [];
  // Left list historically used `selectedVerbIndex`, while rendering used `selectedIndex`.
  // Keep both working; prefer `selectedIndex` when it is a finite number.
  const rawIdx = Number.isFinite(state?.selectedIndex)
    ? state.selectedIndex
    : (Number.isFinite(state?.selectedVerbIndex) ? state.selectedVerbIndex : 0);
  const idx = Math.max(0, Math.min(rawIdx, Math.max(0, verbs.length-1)));
  return verbs[idx] || null;
}

function getVerbKey(v, fallbackIndex = 0){
  return String(v?.id || v?.infinitive || v?.inf || v?.name || fallbackIndex);
}

function getBindOverride(state, verbKey, boxId){
  const notes = state?.notesByVerb && typeof state.notesByVerb === "object" ? state.notesByVerb : null;
  if (!notes) return undefined;
  if (!verbKey) return undefined;
  const m = notes[verbKey];
  if (!m || typeof m !== "object") return undefined;
  // важный момент: override может быть пустой строкой — это тоже осознанное действие пользователя.
  return (m[boxId] !== undefined) ? String(m[boxId] ?? "") : undefined;
}

function resolveBindTextWithOverride(state, curVerb, bind, boxId){
  const verbKey = getVerbKey(curVerb, state?.selectedIndex);
  const ov = getBindOverride(state, verbKey, boxId);
  if (ov !== undefined) return ov;
  const r = resolveVerbBind(curVerb, bind);
  return (r && r.kind === "text") ? String(r.text || "") : "";
}

// ---- AutoFit helpers ----

function shouldAutoFitBox(b){
  // Iron rule: if a box is verb-bound, it must expand so its resolved text is fully visible.
  // Manual resize/drag should not allow clipping for bind blocks.
  // EXCEPTION: once the user takes manual control over geometry (resize/rotate handles),
  // auto-fit must stop fighting them.
  if (!b?.bind) return false;
  if (b.geomMode === "manual" || b.manualGeom === true || b.geomPinned === true) return false;
  return true;
}

// Auto-fit for editable static boxes ("rubber" outline).
// We enable it only when the box explicitly opts in via autoFitText=true,
// and the user has NOT pinned it manually.
function shouldAutoFitStaticBox(b){
  if (!b || typeof b !== "object") return false;
  if (b.bind) return false;
  if (b.autoFitText !== true) return false;
  if (b.geomMode === "manual" || b.manualGeom === true || b.geomPinned === true) return false;
  // static mode only (either explicit textMode or legacy text fields)
  const tm = String(b.textMode || "").toLowerCase();
  if (tm && tm !== "static") return false;
  return true;
}

/**
 * Автофит под произвольный shown-текст (для bind-блоков)
 */
function autoFitBoxToShownText(ctx2d, g, b, shown){
  const minWmm = 20;
  const minHmm = 8;

  const fontPx = ptToPx(b.fontPt || 14, g);
  // Slightly larger line-height reduces the chance of glyphs getting clipped
  // (different fonts/OS render slightly differently).
  const lineH = Math.ceil(fontPx * 1.32);
  ctx2d.font = `${fontPx}px system-ui, sans-serif`;

  // Width strategy (important for "natural" layouts):
  // 1) First compute the width needed to fit the *explicit* lines (split by \n) WITHOUT auto-wrapping.
  //    This allows the box to grow horizontally (up to card boundary) instead of wrapping words too early.
  // 2) Then compute wrapped lines using the *target* width to get the required height.
  const curWmm = Number.isFinite(b.wMm) ? b.wMm : minWmm;

  const naturalLines = splitLines(String(shown ?? ""));
  const { maxWpx: naturalMaxWpx } = measureMultiline(ctx2d, naturalLines, lineH);

  const wantWpxRaw = naturalMaxWpx + BOX_PAD_X * 2;

  const maxWmm = Math.max(minWmm, (g.cardWmm - (b.xMm || 0) - g.marginMm));
  const maxHmm = Math.max(minHmm, (g.cardHmm - (b.yMm || 0) - g.marginMm));

  // Decide target width (grow + shrink with hysteresis).
  // User expectation: width follows text in both directions.
  // To avoid jitter on tiny edits, we apply a small hysteresis window.
  const wantWmm = clamp(pxToMm(wantWpxRaw, g), minWmm, maxWmm);
  const curW = Number.isFinite(b.wMm) ? b.wMm : wantWmm;
  const hyster = 0.5; // mm
  const finalWmm = (!Number.isFinite(b.wMm))
    ? wantWmm
    : (Math.abs(wantWmm - curW) > hyster ? wantWmm : curW);

  // Now compute height using wrapping at the FINAL width.
  const innerWpx = Math.max(20, mmToPx(finalWmm, g) - BOX_PAD_X * 2);
  const wrapped = wrapLines(ctx2d, shown, innerWpx);
  const { totalHpx } = measureMultiline(ctx2d, wrapped, lineH);
  // +2px safety slack to avoid bottom clipping caused by rounding
  const wantHpx = totalHpx + BOX_PAD_Y * 2 + 2;
  const wantHmm = clamp(pxToMm(wantHpx, g), minHmm, maxHmm);

  const eps = 0.05; // мм
  let changed = false;

  if (!Number.isFinite(b.wMm) || Math.abs((b.wMm || 0) - finalWmm) > eps){
    b.wMm = finalWmm;
    changed = true;
  }
  if (!Number.isFinite(b.hMm) || Math.abs(b.hMm - wantHmm) > eps){
    b.hMm = wantHmm;
    changed = true;
  }
  return changed;
}

// After auto-fitting sizes, boxes can start overlapping (because content grew).
// IMPORTANT UX rule (per project spec): do NOT push other boxes.
// Instead, cap the growing box so it can at most *touch* neighbors.
function capAutoFitOverlaps(g, boxes){
  const gapMm = 0.5; // small breathing room
  const all = Array.isArray(boxes) ? boxes : [];
  const items = all.filter(b => shouldAutoFitBox(b));
  if (items.length < 1) return false;

  let changed = false;
  for (const b of items){
    if (!b) continue;

    const bx = Number.isFinite(b.xMm) ? b.xMm : 0;
    const by = Number.isFinite(b.yMm) ? b.yMm : 0;
    const bw = Number.isFinite(b.wMm) ? b.wMm : 0;
    const bh = Number.isFinite(b.hMm) ? b.hMm : 0;

    let maxW = Math.max(20, g.cardWmm - bx - g.marginMm);
    let maxH = Math.max(8,  g.cardHmm - by - g.marginMm);

    // Nearest neighbor to the RIGHT (overlapping vertically) caps width.
    for (const o of all){
      if (!o || o === b) continue;
      const ox = Number.isFinite(o.xMm) ? o.xMm : 0;
      const oy = Number.isFinite(o.yMm) ? o.yMm : 0;
      const ow = Number.isFinite(o.wMm) ? o.wMm : 0;
      const oh = Number.isFinite(o.hMm) ? o.hMm : 0;

      const vOverlap = (by < oy + oh) && (by + bh > oy);
      if (!vOverlap) continue;

      // o is to the right of b
      if (ox >= bx){
        const cap = (ox - gapMm) - bx;
        if (cap > 0) maxW = Math.min(maxW, cap);
      }

      const hOverlap = (bx < ox + ow) && (bx + bw > ox);
      if (!hOverlap) continue;
      // o is below b
      if (oy >= by){
        const cap = (oy - gapMm) - by;
        if (cap > 0) maxH = Math.min(maxH, cap);
      }
    }

    const newW = clamp(bw, 20, maxW);
    const newH = clamp(bh, 8,  maxH);
    if (Math.abs(newW - bw) > 0.01){ b.wMm = newW; changed = true; }
    if (Math.abs(newH - bh) > 0.01){ b.hMm = newH; changed = true; }
  }
  return changed;
}

// ---- Frequency dots (special renderer) ----

function drawFrequencyDots(ctx, x, y, w, h, value){
  const v = Math.max(0, Math.min(5, Number(value) || 0));

  const fill = (n) => {
    if (n >= 5) return "rgba(34,197,94,0.95)";   // green
    if (n === 4) return "rgba(250,204,21,0.95)"; // yellow
    if (n === 3) return "rgba(239,68,68,0.95)";  // red
    if (n === 2) return "rgba(120,53,15,0.95)";  // brown
    return "rgba(0,0,0,0.90)";                   // black
  };

  const count = 5;

  // User request: make dots noticeably larger.
  // We scale target radius ~2.5× but still keep it inside the box.
  const SCALE = 2.5;
  const baseR = Math.max(2, Math.min(5, Math.floor((h - 2) / 2)));
  let r = Math.floor(baseR * SCALE);
  let gap = Math.floor(4 * SCALE);

  // Fit in height
  r = Math.min(r, Math.floor((h - 2) / 2));

  // Fit in width (shrink proportionally if needed)
  let totalW = count * (r * 2) + (count - 1) * gap;
  if (totalW > w && totalW > 0){
    const k = w / totalW;
    r = Math.max(2, Math.floor(r * k));
    gap = Math.max(2, Math.floor(gap * k));
    totalW = count * (r * 2) + (count - 1) * gap;
  }

  let sx = x + Math.max(0, Math.floor((w - totalW) / 2));
  const cy = y + Math.floor(h / 2);

  // контур “пустых”
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  for (let i=0;i<count;i++){
    ctx.beginPath();
    ctx.arc(sx + r, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    sx += (r * 2 + gap);
  }
  ctx.restore();

  // заполненные
  ctx.save();
  ctx.fillStyle = fill(v);
  sx = x + Math.max(0, Math.floor((w - totalW) / 2));
  for (let i=0;i<v;i++){
    ctx.beginPath();
    ctx.arc(sx + r, cy, r, 0, Math.PI * 2);
    ctx.fill();
    sx += (r * 2 + gap);
  }
  ctx.restore();
}

// ---- Render ----

export function renderCard(ctxApp){
  lastCtx = ctxApp;

  const layer = document.getElementById("lcCardLayer");
  if (!layer) return;

  const canvas = ensureCanvas(layer);
  const { ctx, w, h, dpr } = resizeCanvasToLayer(canvas, layer);

  _lastGeom = computeCardGeom(ctxApp.state, w, h, { padPx: 24 });
  const g = _lastGeom;

  ctx.clearRect(0, 0, w, h);

  const { x: cardX, y: cardY, w: cardW, h: cardH } = g.card;

  const pdfMode = String(ctxApp?.state?.exportMode || "") === "pdf";

  // фон карточки
  ctx.save();
  ctx.fillStyle = pdfMode ? "#ffffff" : "rgba(0,0,0,0.20)";
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.restore();

  // рамка карточки (в PDF — прозрачная)
  if (!pdfMode){
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.lineWidth = 2;
    ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);
    ctx.restore();
  }

  const state = ctxApp.state;
  const sel = state.selectedBoxId;
  const selectedIds = Array.isArray(state.selectedIds) ? state.selectedIds.filter(Boolean) : [];
  // if multi-select is empty, fall back to legacy single-select
  const selSet = new Set(selectedIds.length ? selectedIds : (sel ? [sel] : []));

  const curVerb = getCurrentVerb(state);

  const editingAllowed = !!state.editing;

  // Prefer i18n labelKey (new) with fallback to legacy b.label.
  function boxLabel(b){
    const key = (b && b.labelKey) ? String(b.labelKey).trim() : "";
    if (key){
      try {
        const params = (b && b.labelParams && typeof b.labelParams === "object") ? b.labelParams : undefined;
        return String(ctxApp?.i18n?.t ? ctxApp.i18n.t(key, params) : "") || "";
      } catch {
        return "";
      }
    }
    return (b && b.label && String(b.label).trim()) ? String(b.label) : "";
  }
  const editingOn = editingAllowed && isEditingText();
  const ed = editingOn ? getEditing() : null;

  // --- Автофит bind-блоков (1 раз на кадр) ---
  let anyAutoFit = false;
  let anyAutoFitBind = false;
  // In both SOURCE and CARDS view we still render verb-driven bind blocks.
  // While dragging, disable auto-fit/overlap correction to avoid jitter.
  const canAutoFitNow = (state.viewMode === "source" || state.viewMode === "cards") && curVerb && !state.__dragging;
  if (_autoFitGuard === 0 && canAutoFitNow){
    try {
      _autoFitGuard = 1;
      for (const b of (state.boxes || [])){
        const isBind = shouldAutoFitBox(b);
        const isStatic = shouldAutoFitStaticBox(b);
        if (!isBind && !isStatic) continue;
        if (editingOn && ed && ed.id === b.id) continue;

        // берём текст через resolveVerbBind (+ per-verb overrides из notesByVerb)
        let shown = "";
        if (isBind && b.bind){
          shown = resolveBindTextWithOverride(state, curVerb, b.bind, b.id);
        } else if (isStatic){
          // For draft cards we use staticText/text. notesByVerb overrides are not applied.
          shown = String((b.staticText !== undefined) ? b.staticText : (b.text || ""));
        }
        if (!shown) continue;

        const changed = autoFitBoxToShownText(ctx, g, b, shown);
        if (changed) anyAutoFit = true;
        if (changed && isBind) anyAutoFitBind = true;
      }

      // Blocks may overlap freely. Auto-fit adjusts only the current box size.

      // ✅ Persist auto-fit geometry in SOURCE template so switching verbs doesn't revert sizes.
      // We only persist for bind-boxes that are still in auto-geom mode.
      if (anyAutoFit && state.viewMode === "source" && Array.isArray(state.sourceBoxes)){
        const byId = new Map(state.sourceBoxes.map(b => [String(b?.id || ""), b]));
        for (const b of (state.boxes || [])){
          if (!b || !b.id) continue;
          if (!shouldAutoFitBox(b)) continue;
          const t = byId.get(String(b.id));
          if (!t) continue;
          // copy ONLY geometry that auto-fit touched
          if (Number.isFinite(b.wMm)) t.wMm = b.wMm;
          if (Number.isFinite(b.hMm)) t.hMm = b.hMm;
        }
      }
    } finally {
      _autoFitGuard = 0;
    }
  }

  // если автофит что-то поменял — попросим ещё один ререндер
  if (anyAutoFit){
    try { ctxApp.requestRender?.(); } catch (e) { ctxApp.log?.warn?.("requestRender failed", { err: String(e) }); }
    // Also autosave SOURCE geometry so it survives reloads.
    // (Debounced to avoid spam while typing.)
    if (state.viewMode === "source" && typeof ctxApp.setState === "function"){
      try {
        ctxApp.setState({ boxes: state.boxes, sourceBoxes: state.sourceBoxes }, { autosave: true, debounceMs: 120, history: false });
      } catch (e) { ctxApp.log?.warn?.("autosave sourceBoxes failed", { err: String(e) }); }
    }
  }

  // --- Рисуем блоки ---
  // Железная граница карточки: всё внутри обрезаем по её рамке.
  ctx.save();
  ctx.beginPath();
  ctx.rect(cardX, cardY, cardW, cardH);
  ctx.clip();

  for (const b of (state.boxes || [])){
    const x = cardX + mmToPx(b.xMm, g);
    const y = cardY + mmToPx(b.yMm, g);
    const bw = mmToPx(b.wMm, g);
    const bh = mmToPx(b.hMm, g);

    // Optional rotation (0..±90 deg). Rotation affects visual drawing only.
    const rotRad = degToRad(b.rotDeg || 0);
    const cx = x + bw / 2;
    const cy = y + bh / 2;

    // In rotated mode we draw in the box's local coordinate system
    // centered at (0,0) to keep clipping and text layout simple.
    let bx = x;
    let by = y;
    ctx.save();
    if (Math.abs(rotRad) > 1e-6){
      ctx.translate(cx, cy);
      ctx.rotate(rotRad);
      bx = -bw / 2;
      by = -bh / 2;
    }

    const isSel = selSet.has(b.id);
    const isTextEdit = editingOn && ed && ed.id === b.id;

    const isManual = !b.bind;
    const mode = String(b.textMode || "note");
    const MODE_COL_UNIQUE = "rgba(239,68,68,0.95)";   // red
    const MODE_COL_COMMON = "rgba(250,204,21,0.95)"; // yellow
    const modeStrokeStrong = (mode === "static") ? MODE_COL_COMMON : MODE_COL_UNIQUE;
    const modeStrokeThin   = (mode === "static") ? "rgba(250,204,21,0.55)" : "rgba(239,68,68,0.55)";

    const radius = 10;

    // фон блока (в PDF — прозрачный)
    if (!pdfMode){
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0)"; // transparent: no alpha accumulation
      ctx.beginPath();
      if (typeof ctx.roundRect === "function"){
        ctx.roundRect(bx, by, bw, bh, radius);
        ctx.fill();
      } else {
        ctx.fillRect(bx, by, bw, bh);
      }
      ctx.restore();
    }

    // рамка блока (в PDF — полностью прозрачная)
    if (!pdfMode){
      ctx.save();
      if (isTextEdit){
        ctx.strokeStyle = "rgba(34,197,94,0.95)";
        ctx.lineWidth = 3;
      } else if (isSel){
        // ✅ при выделении: для manual-блоков показываем режим (unique/common) цветом рамки
        ctx.strokeStyle = isManual ? modeStrokeStrong : "rgba(56,189,248,0.95)";
        ctx.lineWidth = 3;
      } else {
        // ✅ невыделенные manual-блоки тоже помечаем цветом режима, чтобы было видно тип
        ctx.strokeStyle = isManual ? modeStrokeThin : "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
      }
      strokeRoundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, radius);
      ctx.restore();
    }

    // определяем показанное
    let shown = "";
    let placeholder = false;

    const wantsFreq = (b.type === "frequencyDots") || (b.bind === "freq") || (b.bind === "frequency");

    if (isTextEdit){
      const v = String(ed.value ?? "");
      if (v.length === 0){ placeholder = true; shown = ""; }
      else shown = v;
    } else {
      // Text mode:
      // - "bind"  => resolve from verb via b.bind
      // - "note"  => per-verb note
      // - "static"=> fixed text
      // IMPORTANT: if a box has bind, but textMode != "bind", we treat it as an override (editable)
      const mode = String(b.textMode || (b.bind ? "bind" : "note"));

      if (b.bind && mode === "bind"){
        // bind + overrides: пользователь мог поправить текст для конкретного глагола,
        // и этот override хранится в notesByVerb[verbKey][boxId].
        shown = resolveBindTextWithOverride(state, curVerb, b.bind, b.id);
        // freq — отдельная отрисовка ниже
      } else {
        // ✅ MANUAL/OVERRIDE blocks: text stored as static OR note (per verb)

        let txt = "";
        if (mode === "static"){
          txt = String(b.staticText ?? b.text ?? "").trim();
        } else {
          const verbKey = getVerbKey(curVerb, state.selectedIndex);
          const notes = state.notesByVerb && typeof state.notesByVerb === "object" ? state.notesByVerb : {};
          txt = String((notes[verbKey] && notes[verbKey][b.id] !== undefined) ? notes[verbKey][b.id] : "").trim();
        }

        shown = txt ? txt : boxLabel(b);
      }
    }

    if (!isTextEdit && !shown && !wantsFreq){
      // placeholder only when there is actually no text in the chosen mode
      const mode = String(b.textMode || (b.bind ? "bind" : "note"));
      if (b.bind && mode === "bind"){
        // in bind mode we do NOT show placeholder (binds resolve to "" legitimately)
      } else if (mode === "static"){
        if (String(b.staticText ?? b.text ?? "").trim() === "") placeholder = true;
      } else {
        const verbKey = getVerbKey(curVerb, state.selectedIndex);
        const notes = state.notesByVerb && typeof state.notesByVerb === "object" ? state.notesByVerb : {};
        const v = (notes[verbKey] && notes[verbKey][b.id] !== undefined) ? notes[verbKey][b.id] : "";
        if (String(v ?? "").trim() === "") placeholder = true;
      }
    }

    const fontPx = ptToPx(b.fontPt || 14, g);
    const lineH = Math.ceil(fontPx * 1.32);

    // clip внутри блока
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function"){
      // Slightly larger clip rect to avoid cutting off bottom glyph pixels
      // (descenders can be clipped depending on OS/browser rounding).
      ctx.roundRect(bx + 1, by + 0.5, Math.max(0, bw - 2), Math.max(0, bh - 0.5), Math.max(2, radius - 2));
    } else {
      ctx.rect(bx + 1, by + 0.5, Math.max(0, bw - 2), Math.max(0, bh - 0.5));
    }
    ctx.clip();

    // контент
    if (!isTextEdit){
      if (wantsFreq){
        const r = resolveVerbBind(curVerb, b.bind || "freq");
        const val = (r && r.kind === "freq")
          ? r.value
          : Number(curVerb?.freq ?? curVerb?.frequency ?? 0);
        drawFrequencyDots(
          ctx,
          bx + BOX_PAD_X,
          by + 2,
          Math.max(0, bw - BOX_PAD_X * 2),
          Math.max(0, bh - 4),
          val
        );
      } else {
        ctx.save();
        ctx.font = `${fontPx}px system-ui, sans-serif`;
        ctx.textBaseline = "top";

        let ty = by + BOX_PAD_Y;

        if (placeholder){
          // Placeholders are useful on-screen, but they MUST NOT appear in exported PDF.
          if (!pdfMode){
            ctx.fillStyle = "rgba(255,255,255,0.40)";
            // placeholder title
            for (const ln of wrapLines(ctx, "Введите текст", Math.max(0, bw - BOX_PAD_X * 2))){
              ctx.fillText(ln, x + BOX_PAD_X, ty);
              ty += lineH;
            }

            const smallPx = Math.max(10, Math.floor(fontPx * 0.75));
            ctx.font = `${smallPx}px system-ui, sans-serif`;
            ctx.fillStyle = "rgba(255,255,255,0.28)";
            // placeholder helper
            let hy = ty;
            const help = "Ctrl+Enter — новая строка • Enter — сохранить";
            const helpLH = Math.max(10, Math.floor(smallPx * 1.25));
            for (const ln of wrapLines(ctx, help, Math.max(0, bw - BOX_PAD_X * 2))){
              ctx.fillText(ln, bx + BOX_PAD_X, hy);
              hy += helpLH;
            }
          }
        } else {
          const lines = wrapLines(ctx, shown, Math.max(0, bw - BOX_PAD_X * 2));
          ctx.fillStyle = pdfMode ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.80)";
          for (const ln of lines){
            ctx.fillText(ln, bx + BOX_PAD_X, ty);
            ty += lineH;
          }
        }
        ctx.restore();
      }
    }

    // каретка
    if (isTextEdit){
      const blinkOn = (Math.floor(Date.now() / 500) % 2) === 0;
      if (blinkOn){
        ctx.save();
        ctx.font = `${fontPx}px system-ui, sans-serif`;

        const v = String(ed.value ?? "");
        const lines = splitLines(v);
        const lastLineIndex = Math.max(0, lines.length - 1);
        const lastLine = lines[lastLineIndex] || "";
        const tw = ctx.measureText(lastLine).width;

        const cx = bx + BOX_PAD_X + tw + 2;
        const cyTop = by + BOX_PAD_Y + lastLineIndex * lineH;

        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + 0.5, cyTop);
        ctx.lineTo(cx + 0.5, cyTop + lineH);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore(); // clip

    // restore rotation transform
    ctx.restore();
  }

  // --- Editor overlays (preview only, never in PDF) ----------------------
  if (!pdfMode && state.editing){
    // 1) group bounding box
    if (selSet.size > 1){
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const b of (state.boxes || [])){
        if (!b || !selSet.has(b.id)) continue;
        minX = Math.min(minX, b.xMm);
        minY = Math.min(minY, b.yMm);
        maxX = Math.max(maxX, b.xMm + b.wMm);
        maxY = Math.max(maxY, b.yMm + b.hMm);
      }
      if (minX !== Infinity){
        const x = cardX + mmToPx(minX, g);
        const y = cardY + mmToPx(minY, g);
        const w2 = mmToPx(maxX - minX, g);
        const h2 = mmToPx(maxY - minY, g);

        ctx.save();
        ctx.strokeStyle = "rgba(56,189,248,0.85)";
        ctx.lineWidth = 2;
        // slight padding so it doesn't glue to inner outlines
        strokeRoundRect(ctx, x - 3 + 0.5, y - 3 + 0.5, w2 + 6 - 1, h2 + 6 - 1, 12);
        ctx.restore();
      }
    }

    // 2) marquee rectangle
    const mr = state.marqueeRect;
    if (mr && Number.isFinite(mr.xMm) && Number.isFinite(mr.yMm)){
      const x = cardX + mmToPx(mr.xMm, g);
      const y = cardY + mmToPx(mr.yMm, g);
      const w2 = mmToPx(mr.wMm || 0, g);
      const h2 = mmToPx(mr.hMm || 0, g);

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      if (ctx.setLineDash) ctx.setLineDash([6, 4]);
      ctx.strokeRect(x + 0.5, y + 0.5, w2, h2);
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.restore();
    }

    // 3) Geometry controls (cyan knobs) for single selection
    if (selSet.size === 1){
      const onlyId = selSet.values().next().value;
      const b = (state.boxes || []).find(x => x && x.id === onlyId);
      if (b){
        const x = cardX + mmToPx(b.xMm, g);
        const y = cardY + mmToPx(b.yMm, g);
        const bw = mmToPx(b.wMm, g);
        const bh = mmToPx(b.hMm, g);
        const cx = x + bw / 2;
        const cy = y + bh / 2;
        const rot = degToRad(b.rotDeg || 0);
        const r = 7;

        const pW = rotatePoint(cx + bw/2, cy, cx, cy, rot);          // width (mid-right)
        const pH = rotatePoint(cx, cy + bh/2, cx, cy, rot);          // height (mid-bottom)
        const pR = rotatePoint(cx + bw/2, cy - bh/2, cx, cy, rot);   // rotate (top-right)

        function knob(px, py, title){
          const pinned = (b && (b.geomPinned === true || b.geomGlobal === true));
          const fill = pinned ? "rgba(244,114,182,0.95)" : "rgba(56,189,248,0.95)";
          const shadow = pinned ? "rgba(244,114,182,0.85)" : "rgba(56,189,248,0.85)";
          ctx.save();
          ctx.shadowColor = shadow;
          ctx.shadowBlur = 10;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        knob(pW.x, pW.y);
        knob(pH.x, pH.y);
        knob(pR.x, pR.y);
      }
    }
  }

  if (window.LC_DIAG){
    window.LC_DIAG.lastRenderGeometry = {
      dpr,
      pxPerMm: g.pxPerMm,
      // legacy/debug
      card: g.card,
      cardMm: { w: g.cardWmm, h: g.cardHmm },
      // ✅ PDF export expects these exact fields (see js/pdf/pdfCore.js)
      // ВАЖНО: crop делается в координатах canvas (device pixels)
      cardRectPx: { x: g.card.x * dpr, y: g.card.y * dpr, w: g.card.w * dpr, h: g.card.h * dpr },
      cardSizeMm: { wMm: g.cardWmm, hMm: g.cardHmm },
      marginMm: g.marginMm,
      ts: Date.now(),
    };
  }

  ctx.restore();

  syncTextEditorOverlay(ctxApp);
}

export function getCardCanvas(){
  return document.getElementById("lcCardCanvas");
}

export function rerender(){
  if (lastCtx) renderCard(lastCtx);
}

/**
 * ✅ СОВМЕСТИМОСТЬ: оставляем старый экспорт doesTextFit(ctx2d, b)
 */
export function doesTextFit(ctx2d, b){
  if (!ctx2d || !b) return true;
  const g = _lastGeom;
  if (!g) return true;

  const fontPx = ptToPx(b.fontPt || 14, g);
  const lineH = Math.ceil(fontPx * 1.32);
  ctx2d.font = `${fontPx}px system-ui, sans-serif`;

  const lines = splitLines(String(b.text ?? ""));
  const { maxWpx, totalHpx } = measureMultiline(ctx2d, lines, lineH);

  const bwPx = mmToPx(b.wMm, g);
  const bhPx = mmToPx(b.hMm, g);

  const availW = Math.max(0, bwPx - BOX_PAD_X * 2);
  const availH = Math.max(0, bhPx - BOX_PAD_Y * 2);

  return (maxWpx <= availW) && (totalHpx <= availH);
}

/**
 * ✅ СОВМЕСТИМОСТЬ: оставляем старый экспорт autoFitBoxToText(ctxApp, boxId)
 * (работает по b.text, как раньше)
 */
export function autoFitBoxToText(ctxApp, boxId){
  const state = ctxApp?.state;
  const b = (state?.boxes || []).find(x => x.id === boxId);
  if (!b) return;

  // If the user has taken manual control over geometry, do not auto-resize.
  if (b.geomMode === "manual" || b.manualGeom === true || b.geomPinned === true) return;

  const g = _lastGeom;
  if (!g) return;

  const canvas = document.getElementById("lcCardCanvas");
  if (!canvas) return;

  const ctx2d = canvas.getContext("2d");

  const text = String(b.text ?? "");
  autoFitBoxToShownText(ctx2d, g, b, text);
}

/**
 * ✅ Новая версия: автофит под произвольный текст, не трогая b.text
 * Нужна для textMode="note" (текст хранится в notesByVerb).
 */
export function autoFitBoxToShown(ctxApp, boxId, shown){
  const state = ctxApp?.state;
  const b = (state?.boxes || []).find(x => x.id === boxId);
  if (!b) return;

  // If the user has taken manual control over geometry, do not auto-resize.
  if (b.geomMode === "manual" || b.manualGeom === true || b.geomPinned === true) return;

  const g = _lastGeom;
  if (!g) return;

  const canvas = document.getElementById("lcCardCanvas");
  if (!canvas) return;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return;

  autoFitBoxToShownText(ctx2d, g, b, String(shown ?? ""));
}
