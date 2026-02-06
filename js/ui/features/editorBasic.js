import {
  renderCard,
  getCardCanvas,
  autoFitBoxToText,
  doesTextFit,
  getLastCardGeom,
} from "../../render/renderCard.js";

import {
  canvasPxToMm,
  clampBoxToCardMm,
} from "../../render/geom.js";

import {
  startTextEdit,
  handleKeydown,
  isEditingText,
  getEditing,
  commitTextEdit,
} from "../../editor/textEdit.js";

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function degToRad(d){ return (Number(d) || 0) * Math.PI / 180; }

function rotatePointPx(px, py, cx, cy, angRad){
  const s = Math.sin(angRad), c = Math.cos(angRad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

function toLocalMm(xMm, yMm, cxMm, cyMm, angRad){
  // inverse rotate around center
  const dx = xMm - cxMm;
  const dy = yMm - cyMm;
  const s = Math.sin(-angRad), c = Math.cos(-angRad);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function snapMm(vMm, stepMm){
  return Math.round(vMm / stepMm) * stepMm;
}

function rectsOverlap(a, b){
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}


function rangesOverlap(a1,a2,b1,b2){
  return a1 < b2 && a2 > b1;
}

// After a drag we can resolve overlaps in a predictable way:
// - during drag we ALLOW passing through other blocks (better UX)
// - on drop we gently push blocks down (within card bounds) to avoid intersections
function resolveOverlapsAfterDrag(state, geom){
  const boxes = Array.isArray(state?.boxes) ? state.boxes : [];
  if (boxes.length < 2) return false;
  const gap = 2; // mm

  // stable order: top-to-bottom, left-to-right
  const items = boxes.slice().sort((a,b) => (a.yMm - b.yMm) || (a.xMm - b.xMm));
  const placed = [];
  let changed = false;

  const cardW = Number.isFinite(geom?.cardWmm) ? geom.cardWmm : state.cardWmm;
  const cardH = Number.isFinite(geom?.cardHmm) ? geom.cardHmm : state.cardHmm;
  const margin = Number.isFinite(geom?.marginMm) ? geom.marginMm : 2;

  for (const b of items){
    if (!b) continue;
    const bw = Number.isFinite(b.wMm) ? b.wMm : 0;
    const bh = Number.isFinite(b.hMm) ? b.hMm : 0;

    // Find the lowest "blocking" bottom among already placed boxes that overlap in X.
    let needY = Number.isFinite(b.yMm) ? b.yMm : 0;
    const bx1 = Number.isFinite(b.xMm) ? b.xMm : 0;
    const bx2 = bx1 + bw;
    for (const p of placed){
      const px1 = Number.isFinite(p.xMm) ? p.xMm : 0;
      const px2 = px1 + (Number.isFinite(p.wMm) ? p.wMm : 0);
      if (!rangesOverlap(bx1, bx2, px1, px2)) continue;
      const pb = (Number.isFinite(p.yMm) ? p.yMm : 0) + (Number.isFinite(p.hMm) ? p.hMm : 0) + gap;
      if (needY < pb) needY = pb;
    }

    // Clamp to card bounds
    const maxY = Math.max(margin, (cardH - margin) - bh);
    const clamped = clamp(needY, margin, maxY);
    if (Math.abs((b.yMm || 0) - clamped) > 1e-6){
      b.yMm = clamped;
      changed = true;
    }

    // Ensure still inside card on X (safety)
    if (Number.isFinite(cardW)){
      const maxX = Math.max(margin, (cardW - margin) - bw);
      const cx = clamp(Number.isFinite(b.xMm) ? b.xMm : margin, margin, maxX);
      if (Math.abs((b.xMm || 0) - cx) > 1e-6){
        b.xMm = cx;
        changed = true;
      }
    }

    placed.push(b);
  }

  return changed;
}

// During font-size auto-fit (wheel), we must NOT move other boxes.
// Instead, cap the resized box so it can at most touch neighbors.
function capBoxToNeighbors(state, box, geom){
  const b = box;
  if (!b) return;
  const boxes = Array.isArray(state?.boxes) ? state.boxes : [];
  const gap = 0.5; // mm

  const cardW = Number.isFinite(geom?.cardWmm) ? geom.cardWmm : state.cardWmm;
  const cardH = Number.isFinite(geom?.cardHmm) ? geom.cardHmm : state.cardHmm;
  const margin = Number.isFinite(geom?.marginMm) ? geom.marginMm : 2;

  const bx = Number.isFinite(b.xMm) ? b.xMm : 0;
  const by = Number.isFinite(b.yMm) ? b.yMm : 0;
  const bw = Number.isFinite(b.wMm) ? b.wMm : 0;
  const bh = Number.isFinite(b.hMm) ? b.hMm : 0;

  let maxW = Math.max(20, (cardW - bx - margin));
  let maxH = Math.max(8,  (cardH - by - margin));

  for (const o of boxes){
    if (!o || o === b) continue;
    const ox = Number.isFinite(o.xMm) ? o.xMm : 0;
    const oy = Number.isFinite(o.yMm) ? o.yMm : 0;
    const ow = Number.isFinite(o.wMm) ? o.wMm : 0;
    const oh = Number.isFinite(o.hMm) ? o.hMm : 0;

    const vOverlap = rangesOverlap(by, by + bh, oy, oy + oh);
    if (vOverlap && ox >= bx){
      const capW = (ox - gap) - bx;
      if (capW > 0) maxW = Math.min(maxW, capW);
    }

    const hOverlap = rangesOverlap(bx, bx + bw, ox, ox + ow);
    if (hOverlap && oy >= by){
      const capH = (oy - gap) - by;
      if (capH > 0) maxH = Math.min(maxH, capH);
    }
  }

  b.wMm = clamp(bw, 20, maxW);
  b.hMm = clamp(bh, 8,  maxH);
}

function normRectMm(a, b){
  const x = Math.min(a.xMm, b.xMm);
  const y = Math.min(a.yMm, b.yMm);
  const w = Math.abs(a.xMm - b.xMm);
  const h = Math.abs(a.yMm - b.yMm);
  return { xMm: x, yMm: y, wMm: w, hMm: h };
}

function hitTestBox(state, mxPx, myPx){
  const g = getLastCardGeom();
  if (!g) return null;
  const { xMm, yMm } = canvasPxToMm(mxPx, myPx, g);

  const boxes = state.boxes || [];
  for (let i = boxes.length - 1; i >= 0; i--){
    const b = boxes[i];
    if (!b) continue;
    if (xMm >= b.xMm && xMm <= b.xMm + b.wMm &&
        yMm >= b.yMm && yMm <= b.yMm + b.hMm){
      return { id: b.id, xMm, yMm };
    }
  }
  return null;
}

function ensureSelectionState(state){
  if (!Array.isArray(state.selectedIds)) state.selectedIds = [];
  if (state.marqueeRect && typeof state.marqueeRect !== "object") state.marqueeRect = null;
}

function uniq(arr){
  const out = [];
  const seen = new Set();
  for (const x of (arr || [])){
    const k = String(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function setSelection(ctx, ids, primaryId){
  const { state, setState } = ctx;
  ensureSelectionState(state);
  const next = uniq(ids);
  const primary = (primaryId !== undefined)
    ? primaryId
    : (next.length ? next[next.length - 1] : null);
  setState({
    selectedIds: next,
    selectedBoxId: primary,
  });
}

function toggleSelect(ctx, id){
  const { state } = ctx;
  ensureSelectionState(state);
  const cur = Array.isArray(state.selectedIds) ? state.selectedIds.slice() : [];
  const idx = cur.indexOf(id);
  if (idx >= 0) cur.splice(idx, 1);
  else cur.push(id);
  setSelection(ctx, cur, id);
}

function getSelectedIds(state){
  ensureSelectionState(state);
  const ids = Array.isArray(state.selectedIds) ? state.selectedIds.filter(Boolean) : [];
  if (ids.length) return ids;
  return state.selectedBoxId ? [state.selectedBoxId] : [];
}

function getGroupBoundsMm(state, ids){
  const boxes = Array.isArray(state.boxes) ? state.boxes : [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const id of ids){
    const b = boxes.find(x => x.id === id);
    if (!b) continue;
    any = true;
    minX = Math.min(minX, b.xMm);
    minY = Math.min(minY, b.yMm);
    maxX = Math.max(maxX, b.xMm + b.wMm);
    maxY = Math.max(maxY, b.yMm + b.hMm);
  }
  if (!any) return null;
  return { minX, minY, maxX, maxY };
}

export function featureEditorBasic(){
  return {
    id: "editorBasic",
    install(ctx){
      const { log, state, setState } = ctx;
      ensureSelectionState(state);

      renderCard(ctx);

      // blinking caret: перерисовываем пока идёт ввод текста
      const blinkTimer = setInterval(() => {
        if (state.editing && isEditingText()) renderCard(ctx);
      }, 250);

      const host = document.getElementById("cardHost");
      const ro = new ResizeObserver(() => renderCard(ctx));
      ro.observe(host);

      let dragging = null;
      let rafPending = false;

      // Render batching: during drag we may get many pointermove events.
      // We render at most once per animation frame to keep motion smooth.
      function requestRender(){
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          renderCard(ctx);
        });
      }

      function capturePointer(ev){
        if (!host || !host.setPointerCapture) return;
        if (ev && ev.pointerId !== undefined){
          try { host.setPointerCapture(ev.pointerId); } catch(_){}
        }
      }

      function releasePointer(ev){
        if (!host || !host.releasePointerCapture) return;
        if (ev && ev.pointerId !== undefined){
          try { host.releasePointerCapture(ev.pointerId); } catch(_){}
        }
      }

      function getMousePx(ev){
        const canvas = getCardCanvas();
        if (!canvas) return null;
        const r = canvas.getBoundingClientRect();
        return { x: ev.clientX - r.left, y: ev.clientY - r.top };
      }

      function onDown(ev){
        // only primary button
        if (ev.button !== undefined && ev.button !== 0) return;
        if (!state.editing) return;
        ensureSelectionState(state);

        // во время ввода не двигаем, но позволяем кликнуть в пустое место, чтобы закрыть ввод через dblclick
        if (isEditingText()) return;

        const m = getMousePx(ev);
        if (!m) return;

        // --- Geometry controls (cyan knobs): resize/rotate for single selection
        // Only in edit mode, only when exactly one box is selected.
        {
          const ids = getSelectedIds(state);
          if (ids.length === 1){
            const id = ids[0];
            const b = (state.boxes || []).find(x => x && x.id === id);
            const g = getLastCardGeom();
            if (b && g && g.card){
              const cardX = g.card.x;
              const cardY = g.card.y;
              const pxPerMm = g.pxPerMm || 1;

              const x = cardX + (Number(b.xMm) || 0) * pxPerMm;
              const y = cardY + (Number(b.yMm) || 0) * pxPerMm;
              const bw = (Number(b.wMm) || 0) * pxPerMm;
              const bh = (Number(b.hMm) || 0) * pxPerMm;
              const cx = x + bw / 2;
              const cy = y + bh / 2;

              const rot = degToRad(b.rotDeg || 0);
              const r = 9; // hit radius

              const pW = rotatePointPx(cx + bw/2, cy, cx, cy, rot);        // width knob
              const pH = rotatePointPx(cx, cy + bh/2, cx, cy, rot);        // height knob
              const pR = rotatePointPx(cx + bw/2, cy - bh/2, cx, cy, rot); // rotate knob

              const dist = (p) => Math.hypot((m.x - p.x), (m.y - p.y));
              let kind = null;
              if (dist(pW) <= r) kind = "resizeW";
              else if (dist(pH) <= r) kind = "resizeH";
              else if (dist(pR) <= r) kind = "rotate";

              if (kind){
                // Mark geometry as GLOBAL (pink knobs) after any interaction with geometry handles.
                // Even a simple click (no movement) should pin geometry globally for the active list.
                try { b.geomPinned = true; b.geomMode = "manual"; } catch(_){}
                try {
                  setState({ boxes: state.boxes }, { autosave: true, debounceMs: 80, history: false });
                } catch(_){}

                // start handle drag
                const { xMm, yMm } = canvasPxToMm(m.x, m.y, g);
                const cxMm = (Number(b.xMm) || 0) + (Number(b.wMm) || 0) / 2;
                const cyMm = (Number(b.yMm) || 0) + (Number(b.hMm) || 0) / 2;

                dragging = {
                  type: kind,
                  id,
                  start: { wMm: b.wMm, hMm: b.hMm, rotDeg: b.rotDeg || 0 },
                  startRect: { xMm: b.xMm, yMm: b.yMm, wMm: b.wMm, hMm: b.hMm },
                  centerMm: { xMm: cxMm, yMm: cyMm },
                  startMouseMm: { xMm, yMm },
                  pointerId: ev.pointerId,
                  moved: false,
                };

                ctx.history?.begin?.(kind === "rotate" ? "Rotate" : "Resize");
                setState({ __dragging: true });
                capturePointer(ev);
                requestRender();
                ev.preventDefault();
                return;
              }
            }
          }
        }

        const hit = hitTestBox(state, m.x, m.y);

        // --- Click on empty => marquee selection
        if (!hit){
          if (!ev.shiftKey){
            setSelection(ctx, [], null);
          }

          const g = getLastCardGeom();
          if (!g) return;
          const p0 = canvasPxToMm(m.x, m.y, g);

          dragging = {
            type: "marquee",
            shift: !!ev.shiftKey,
            startMm: { xMm: p0.xMm, yMm: p0.yMm },
            curMm: { xMm: p0.xMm, yMm: p0.yMm },
            baseSelected: getSelectedIds(state),
            pointerId: ev.pointerId,
          };

          capturePointer(ev);

          setState({ marqueeRect: { xMm: p0.xMm, yMm: p0.yMm, wMm: 0, hMm: 0 } });
          requestRender();
          ev.preventDefault();
          return;
        }

        // --- Shift+click toggles selection
        if (ev.shiftKey){
          toggleSelect(ctx, hit.id);
          setState({ marqueeRect: null });
          requestRender();
          ev.preventDefault();
          return;
        }

        // --- Normal click: select only this box (unless already in multi-select)
        const curSel = getSelectedIds(state);
        const hitIsInSel = curSel.includes(hit.id);
        if (!hitIsInSel){
          setSelection(ctx, [hit.id], hit.id);
        } else {
          // keep selection but ensure primary
          setState({ selectedBoxId: hit.id });
        }
        setState({ marqueeRect: null });
        requestRender();

        // start drag (single or group)
        const ids = getSelectedIds(state);
        if (!ids.length) return;



        const boxes = Array.isArray(state.boxes) ? state.boxes : [];

        const startBoxes = {};
        for (const id of ids){
          const b = boxes.find(x => x.id === id);
          if (!b) continue;
          // фиксируем стартовую геометрию, чтобы clamp не "сам себя" ужимал во время drag
          startBoxes[id] = { xMm: b.xMm, yMm: b.yMm, wMm: b.wMm, hMm: b.hMm };
        }

        // ВАЖНО: bounds считаем ОДИН раз по стартовым позициям.
        // Иначе, если считать bounds по уже сдвинутым state.boxes на каждом mousemove,
        // maxDx/maxDy будут уменьшаться и drag будет дёргаться/останавливаться.
        let startBounds = null;
        {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          let any = false;
          for (const id of Object.keys(startBoxes)){
            const s = startBoxes[id];
            if (!s) continue;
            const w = Number.isFinite(s.wMm) ? s.wMm : 0;
            const h = Number.isFinite(s.hMm) ? s.hMm : 0;
            any = true;
            minX = Math.min(minX, Number.isFinite(s.xMm) ? s.xMm : 0);
            minY = Math.min(minY, Number.isFinite(s.yMm) ? s.yMm : 0);
            maxX = Math.max(maxX, (Number.isFinite(s.xMm) ? s.xMm : 0) + w);
            maxY = Math.max(maxY, (Number.isFinite(s.yMm) ? s.yMm : 0) + h);
          }
          if (any) startBounds = { minX, minY, maxX, maxY };
        }

        dragging = {
          type: "move",
          ids: Object.keys(startBoxes),
          startMouseMm: { xMm: hit.xMm, yMm: hit.yMm },
          startBoxes,
          startBounds,
          moved: false,
          pointerId: ev.pointerId,
        };

        // ✅ один шаг истории: взял -> двинул -> отпустил
        ctx.history?.begin?.("Move");

        // Let renderer know we're in a live drag. This prevents "helpful" layout
        // corrections (auto-fit / no-overlap push) from fighting the pointer.
        setState({ __dragging: true });

        // Pointer capture keeps drag stable even if the cursor leaves the canvas/host.
        capturePointer(ev);

        log.info("editor: drag start", { ids: dragging.ids });
        ev.preventDefault();
      }

      function onMove(ev){
        if (!dragging) return;
        if (dragging.pointerId !== undefined && ev.pointerId !== dragging.pointerId) return;
        const m = getMousePx(ev);
        if (!m) return;

        const g = getLastCardGeom();
        if (!g) return;
        const { xMm: mxMm, yMm: myMm } = canvasPxToMm(m.x, m.y, g);

        if (dragging.type === "marquee"){
          dragging.curMm = { xMm: mxMm, yMm: myMm };
          const r = normRectMm(dragging.startMm, dragging.curMm);
          setState({ marqueeRect: r });
          requestRender();
          return;
        }

        // --- Resize/Rotate handles
        if (dragging.type === "resizeW" || dragging.type === "resizeH" || dragging.type === "rotate"){
          const boxes = Array.isArray(state.boxes) ? state.boxes : [];
          const b = boxes.find(x => x && x.id === dragging.id);
          if (!b) return;

          // once user touched a handle, geometry becomes globally pinned (pink knobs)
          if (b.geomPinned !== true) b.geomPinned = true;
          if (b.geomMode !== "manual") b.geomMode = "manual";

          const cxMm = dragging.centerMm?.xMm ?? ((Number(b.xMm) || 0) + (Number(b.wMm) || 0) / 2);
          const cyMm = dragging.centerMm?.yMm ?? ((Number(b.yMm) || 0) + (Number(b.hMm) || 0) / 2);

          const minW = 20;
          const minH = 8;

          if (dragging.type === "rotate"){
            const startAng = Math.atan2((dragging.startMouseMm.yMm - cyMm), (dragging.startMouseMm.xMm - cxMm));
            const curAng = Math.atan2((myMm - cyMm), (mxMm - cxMm));
            let nextDeg = (Number(dragging.start.rotDeg) || 0) + (curAng - startAng) * 180 / Math.PI;
            // clamp rotation to [-90..90] for predictable layout
            nextDeg = clamp(nextDeg, -90, 90);
            if (Math.abs((Number(b.rotDeg) || 0) - nextDeg) > 1e-6){
              b.rotDeg = nextDeg;
              dragging.moved = true;
            }
          } else {
            // Photoshop-like resize:
            // - resizeW handle scales ONLY to the right, anchoring the LEFT edge
            // - resizeH handle scales ONLY downward, anchoring the TOP edge
            // Works for rotated boxes too by shifting the center along the rotated axis.
            const rotRad = degToRad(dragging.start?.rotDeg ?? b.rotDeg ?? 0);
            const cos = Math.cos(rotRad), sin = Math.sin(rotRad);
            const axisX = { x: cos, y: sin };      // local +X in world mm
            const axisY = { x: -sin, y: cos };     // local +Y in world mm
            const dot = (ax, ay, bx, by) => ax * bx + ay * by;

            const w0 = Number.isFinite(dragging.startRect?.wMm) ? dragging.startRect.wMm : (Number(b.wMm) || 0);
            const h0 = Number.isFinite(dragging.startRect?.hMm) ? dragging.startRect.hMm : (Number(b.hMm) || 0);
            const halfW0 = w0 / 2;
            const halfH0 = h0 / 2;

            if (dragging.type === "resizeW"){
              // Anchor: left edge stays fixed in world space.
              const leftX = cxMm - axisX.x * halfW0;
              const leftY = cyMm - axisX.y * halfW0;
              let t = dot((mxMm - leftX), (myMm - leftY), axisX.x, axisX.y); // distance along +X from left edge
              if (!Number.isFinite(t)) t = w0;
              const nextW = Math.max(minW, t);
              const nextCx = leftX + axisX.x * (nextW / 2);
              const nextCy = leftY + axisX.y * (nextW / 2);

              const nextX = nextCx - nextW / 2;
              const nextY = nextCy - (Number(b.hMm) || h0) / 2;

              if (Math.abs((Number(b.wMm) || 0) - nextW) > 1e-6 || Math.abs((Number(b.xMm) || 0) - nextX) > 1e-6 || Math.abs((Number(b.yMm) || 0) - nextY) > 1e-6){
                b.wMm = nextW;
                b.xMm = nextX;
                b.yMm = nextY;
                dragging.moved = true;
              }
            } else if (dragging.type === "resizeH"){
              // Anchor: top edge stays fixed in world space.
              const topX = cxMm - axisY.x * halfH0;
              const topY = cyMm - axisY.y * halfH0;
              let t = dot((mxMm - topX), (myMm - topY), axisY.x, axisY.y); // distance along +Y from top edge
              if (!Number.isFinite(t)) t = h0;
              const nextH = Math.max(minH, t);
              const nextCx = topX + axisY.x * (nextH / 2);
              const nextCy = topY + axisY.y * (nextH / 2);

              const nextX = nextCx - (Number(b.wMm) || w0) / 2;
              const nextY = nextCy - nextH / 2;

              if (Math.abs((Number(b.hMm) || 0) - nextH) > 1e-6 || Math.abs((Number(b.xMm) || 0) - nextX) > 1e-6 || Math.abs((Number(b.yMm) || 0) - nextY) > 1e-6){
                b.hMm = nextH;
                b.xMm = nextX;
                b.yMm = nextY;
                dragging.moved = true;
              }
            }
          }

          // Stay inside card. Note: clamp is axis-aligned; fine for 0..90° rotations.
          clampBoxToCardMm(b, state);

          // Blocks may overlap freely. No neighbor capping.

          requestRender();
          return;
        }

        if (dragging.type !== "move") return;

        let dx = mxMm - dragging.startMouseMm.xMm;
        let dy = myMm - dragging.startMouseMm.yMm;

        // snap
        if (state.snapOn){
          dx = snapMm(dx, state.gridStepMm);
          dy = snapMm(dy, state.gridStepMm);
        }

        // clamp movement as a group to stay inside card bounds (with margin)
        // Используем стартовые bounds (см. onDown), иначе drag будет "резиновым".
        const margin = Number.isFinite(g.marginMm) ? g.marginMm : 2;
        const bounds = dragging.startBounds;
        if (bounds){
          const cardW = Number.isFinite(g.cardWmm) ? g.cardWmm : state.cardWmm;
          const cardH = Number.isFinite(g.cardHmm) ? g.cardHmm : state.cardHmm;
          const minDx = margin - bounds.minX;
          const maxDx = (cardW - margin) - bounds.maxX;
          const minDy = margin - bounds.minY;
          const maxDy = (cardH - margin) - bounds.maxY;
          dx = clamp(dx, minDx, maxDx);
          dy = clamp(dy, minDy, maxDy);
        }

        // UX: allow blocks to pass through each other while dragging.
        // We resolve overlaps on drop (see onUp) so drag doesn't feel "blocked".

        const boxes = Array.isArray(state.boxes) ? state.boxes : [];

        for (const id of dragging.ids){
          const b = boxes.find(x => x.id === id);
          const s = dragging.startBoxes[id];
          if (!b || !s) continue;
          b.xMm = s.xMm + dx;
          b.yMm = s.yMm + dy;
          clampBoxToCardMm(b, state);
        }

        if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001) dragging.moved = true;

        requestRender();
      }

      function finalizeMarquee(){
        if (!dragging || dragging.type !== "marquee") return;
        const r = state.marqueeRect;
        const boxes = Array.isArray(state.boxes) ? state.boxes : [];

        let hitIds = [];
        if (r && Number.isFinite(r.wMm) && Number.isFinite(r.hMm)){
          const rr = { x: r.xMm, y: r.yMm, w: r.wMm, h: r.hMm };
          hitIds = boxes
            .filter(b => b && rectsOverlap(rr, { x: b.xMm, y: b.yMm, w: b.wMm, h: b.hMm }))
            .map(b => b.id);
        }

        const next = dragging.shift
          ? uniq([...(dragging.baseSelected || []), ...hitIds])
          : uniq(hitIds);

        setSelection(ctx, next, next.length ? next[next.length - 1] : null);
        setState({ marqueeRect: null });
        setState({ __dragging: false });
        dragging = null;
        requestRender();
      }

      function onUp(ev){
        if (!dragging) return;
        if (dragging.pointerId !== undefined && ev?.pointerId !== undefined && ev.pointerId !== dragging.pointerId) return;

        const pid = dragging.pointerId;
        // Release capture early (marquee selection may clear `dragging` inside finalizeMarquee).
        releasePointer(ev || { pointerId: pid });

        if (dragging.type === "marquee"){
          finalizeMarquee();
          return;
        }

        if (dragging.type === "resizeW" || dragging.type === "resizeH" || dragging.type === "rotate"){
          if (dragging.moved){
            try { ctx.history?.end?.(); } catch(_){ }
          } else {
            try { ctx.history?.cancel?.(); } catch(_){ }
          }

          // Persist resize/rotate geometry with autosave.
          try {
            const boxes = Array.isArray(state.boxes) ? state.boxes : [];
            const b = boxes.find(x => x && x.id === dragging.id);

            // Apply geometry (x/y/w/h/rot/font + geomPinned) by id into target boxes.
            const applyGeomById = (targetBoxes, geomById) => {
              const arr = Array.isArray(targetBoxes) ? targetBoxes : [];
              for (const bb of arr){
                if (!bb || !bb.id) continue;
                if (bb.geomMode === "local" || bb.localGeom === true || bb.local === true) continue;
                const g0 = geomById.get(String(bb.id));
                if (!g0) continue;
                if (Number.isFinite(g0.xMm)) bb.xMm = g0.xMm;
                if (Number.isFinite(g0.yMm)) bb.yMm = g0.yMm;
                if (Number.isFinite(g0.wMm)) bb.wMm = g0.wMm;
                if (Number.isFinite(g0.hMm)) bb.hMm = g0.hMm;
                if (Number.isFinite(g0.rotDeg)) bb.rotDeg = g0.rotDeg;
                if (Number.isFinite(g0.fontPt)) bb.fontPt = g0.fontPt;
                if (g0.geomPinned === true) bb.geomPinned = true;
                if (g0.geomMode) bb.geomMode = g0.geomMode;
              }
            };

            if (b && (b.geomPinned === true || b.geomGlobal === true)){
              // Resize/rotate must be GLOBAL for the active list.
              const geomById = new Map([[String(b.id), b]]);

              if (ctx.state?.viewMode !== "source"){
                // CARDS (right list) mode: propagate to ALL created cards ONLY.
                // Left (SOURCE) layout must remain independent.
                try { ctx.cards?.sync?.(); } catch(_){ }
                const cards = Array.isArray(ctx.state.cards) ? ctx.state.cards : [];
                for (const c of cards){ applyGeomById(c?.boxes, geomById); }
                setState({ boxes: state.boxes, cards }, { autosave: true, debounceMs: 120, history: false });
              } else {
                // SOURCE (left list) mode: persist into sourceBoxes ONLY.
                const sourceBoxes = Array.isArray(ctx.state.sourceBoxes) ? ctx.state.sourceBoxes : [];
                applyGeomById(sourceBoxes, geomById);
                setState({ boxes: state.boxes, sourceBoxes }, { autosave: true, debounceMs: 120, history: false });
              }
            } else {
              // Fallback: still autosave current boxes (local geometry).
              setState({ boxes: state.boxes }, { autosave: true, debounceMs: 120, history: false });
            }
          } catch(_){
            try { setState({ boxes: state.boxes }, { autosave: true, debounceMs: 120, history: false }); } catch(_){}
          }

          setState({ __dragging: false });
          dragging = null;
          requestRender();
          return;
        }

        if (dragging.type === "move"){
          log.info("editor: drag end", { ids: dragging.ids, moved: dragging.moved });

          if (dragging.moved){
            // After letting the user pass through blocks during drag,
            // gently resolve final overlaps on drop.
            /* overlap resolution disabled: blocks may overlap freely */
ctx.history?.end?.();
            // Persist moved geometry.
            // Geometry is GLOBAL by default (applies to all verbs and all created cards).
            // If later we add a "local geometry" toggle, we can skip those boxes.
            try {
              // Apply geometry (x/y/w/h/font) from the current boxes to another boxes array by id.
              const applyGeomById = (targetBoxes, geomById) => {
                const arr = Array.isArray(targetBoxes) ? targetBoxes : [];
                for (const bb of arr){
                  if (!bb || !bb.id) continue;
                  // future-proof: allow per-target local geometry
                  if (bb.geomMode === "local" || bb.localGeom === true || bb.local === true) continue;
                  const g = geomById.get(String(bb.id));
                  if (!g) continue;
                  bb.xMm = g.xMm; bb.yMm = g.yMm; bb.wMm = g.wMm; bb.hMm = g.hMm;
                  if (Number.isFinite(g.fontPt)) bb.fontPt = g.fontPt;
                  if (g.geomMode) bb.geomMode = g.geomMode;
                  if (g.geomPinned === true) bb.geomPinned = true;
                }
              };

              if (ctx.state?.viewMode !== "source"){
                // CARDS (right list) mode: keep text per card, geometry shared INSIDE the right list only.
                // 1) sync current card texts into cards[]
                try { ctx.cards?.sync?.(); } catch(_){ }

                // 2) propagate geometry of each box to ALL cards so switching doesn't reset.
                const cards = Array.isArray(ctx.state.cards) ? ctx.state.cards : [];
                const curBoxes = Array.isArray(state.boxes) ? state.boxes : [];

                const geomById = new Map(curBoxes.map(b => [String(b.id), b]));

                // Propagate geometry to ALL created cards (so switching cards doesn't reset).
                for (const c of cards){
                  applyGeomById(c?.boxes, geomById);
                }

                // Left (SOURCE) layout must remain independent.
                setState({ boxes: state.boxes, cards }, { autosave: true, debounceMs: 150, history: false });
              } else {
                // SOURCE (left list) mode: geometry is global across verbs (within the left list only).
                const curBoxes = Array.isArray(state.boxes) ? state.boxes : [];
                const geomById = new Map(curBoxes.map(b => [String(b.id), b]));

                // Persist into sourceBoxes snapshot so verb switching doesn't reset.
                const sourceBoxes = Array.isArray(ctx.state.sourceBoxes) ? ctx.state.sourceBoxes : [];
                applyGeomById(sourceBoxes, geomById);
                setState({ boxes: state.boxes, sourceBoxes }, { autosave: true, debounceMs: 150, history: false });
              }
            } catch {
              setState({ boxes: state.boxes }, { autosave: true, debounceMs: 150, history: false });
            }
          } else {
            ctx.history?.cancel?.();
          }
          setState({ __dragging: false });
          dragging = null;
          return;
        }
        dragging = null;
      }

      function onDblClick(ev){
        if (!state.editing) return;

        // ✅ если уже идёт ввод текста — dblclick закрывает ввод (с сохранением)
        if (isEditingText()){
          commitTextEdit(ctx);
          requestRender();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }

        const m = getMousePx(ev);
        if (!m) return;
        const hit = hitTestBox(state, m.x, m.y);
        if (!hit) return;

        setSelection(ctx, [hit.id], hit.id);
        startTextEdit(ctx, hit.id);

        requestRender();
        ev.preventDefault();
        ev.stopPropagation();
      }

      function onKey(ev){
        if (!state.editing) return;

        const used = handleKeydown(ctx, ev);
        if (used){
          requestRender();
          const ed = getEditing();
          if (window.LC_DIAG) window.LC_DIAG.textEdit = ed;
        }
      }

      function onWheel(ev){
        if (!state.editing) return;
        if (ev.ctrlKey) return;        // не ломаем зум браузера
        if (isEditingText()) return;   // во время ввода текста — нельзя

        const ids = getSelectedIds(state);
        if (!ids.length) return;

        const delta = ev.deltaY < 0 ? +1 : -1;
        const boxes = Array.isArray(state.boxes) ? state.boxes : [];

        const canvas = getCardCanvas();
        const ctx2d = canvas ? canvas.getContext("2d") : null;

        // подготовим изменения
        const before = new Map();
        for (const id of ids){
          const b = boxes.find(x => x.id === id);
          if (!b) continue;
          const cur = Number.isFinite(b.fontPt) ? b.fontPt : 14;
          before.set(id, cur);
        }

        if (!before.size) return;

        // ✅ один шаг истории на изменение шрифта (группой)
        ctx.history?.begin?.("Font");

        let anyApplied = false;
        let okAll = true;
        for (const [id, cur] of before.entries()){
          const b = boxes.find(x => x.id === id);
          if (!b) continue;
          const next = clamp(cur + delta, 6, 240);
          if (next === cur) continue;
          b.fontPt = next;
          autoFitBoxToText(ctx, b.id);
          clampBoxToCardMm(b, state);
          // Blocks may overlap freely; no neighbor capping.
          anyApplied = true;

          if (ctx2d && !doesTextFit(ctx2d, b)){
            okAll = false;
            break;
          }
        }

        if (!anyApplied || !okAll){
          // откат
          for (const [id, cur] of before.entries()){
            const b = boxes.find(x => x.id === id);
            if (!b) continue;
            b.fontPt = cur;
            autoFitBoxToText(ctx, b.id);
            clampBoxToCardMm(b, state);
          }
          ctx.history?.cancel?.();
          requestRender();
          ev.preventDefault();
          return;
        }

        setState({ boxes: state.boxes });
        ctx.history?.end?.();
        requestRender();
        ev.preventDefault();
      }

      // Use Pointer Events + capture for stable dragging (no "drops" after a few cm).
      host.addEventListener("pointerdown", onDown);
      host.addEventListener("dblclick", onDblClick);
      host.addEventListener("wheel", onWheel, { passive: false });

      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerup", onUp);
      host.addEventListener("pointercancel", onUp);

      // Safety: if pointer capture is lost for any reason, finalize drag.
      host.addEventListener("lostpointercapture", () => {
        if (!dragging) return;
        onUp({ pointerId: dragging.pointerId });
      });
      window.addEventListener("keydown", onKey);

      window.addEventListener("beforeunload", () => clearInterval(blinkTimer));

      if (window.LC_DIAG){
        window.LC_DIAG.editor = () => ({
          installed: true,
          editing: !!state.editing,
          textEditing: isEditingText(),
          selectedBoxId: state.selectedBoxId ?? null,
          selectedIds: Array.isArray(state.selectedIds) ? state.selectedIds.slice() : [],
          marqueeRect: state.marqueeRect ?? null,
        });
      }

      log.info("editorBasic installed");
    },
  };
}
