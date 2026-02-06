// js/render/rulersOverlay.js
import { computeCardGeom } from "./geom.js";

let overlay = null;

function pxAlign(v){ return Math.round(v) + 0.5; }

function getHostEl(){
  return document.getElementById("cardHost");
}

function makeCanvas(){
  const c = document.createElement("canvas");
  c.id = "lcRulersCanvas";
  c.style.position = "absolute";
  c.style.left = "0";
  c.style.top = "0";
  c.style.width = "100%";
  c.style.height = "100%";
  c.style.pointerEvents = "none";
  c.style.zIndex = "50";
  return c;
}

function ensureHostPositioning(host){
  const cs = getComputedStyle(host);
  if (cs.position === "static") host.style.position = "relative";
}

function resizeCanvasToHost(canvas, host){
  const r = host.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.floor(r.width));
  const h = Math.max(1, Math.floor(r.height));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, ctx };
}

function draw(ctx2d, w, h, opts){
  const stepMm = opts?.stepMm ?? 10;
  const snapOn = !!opts?.snapOn;
  const mouse = opts?.mouse || { x: null, y: null };

  ctx2d.clearRect(0, 0, w, h);

  // Берём state и считаем честную геометрию карточки
  const state = (window.LC_DIAG?.getState?.() ? window.LC_DIAG.getState() : null);
  const g = computeCardGeom(state, w, h, { padPx: 24 });

  const cardX = g.card.x;
  const cardY = g.card.y;
  const cardW = g.card.w;
  const cardH = g.card.h;

  const pxPerMm = g.pxPerMm;
  const stepPx = stepMm * pxPerMm;
  const halfStepPx = (stepMm / 2) * pxPerMm;

  // --- сетка ---
  ctx2d.save();
  ctx2d.globalAlpha = 0.35;

  ctx2d.beginPath();
  for (let x = cardX; x <= cardX + cardW + 0.0001; x += stepPx){
    ctx2d.moveTo(pxAlign(x), cardY);
    ctx2d.lineTo(pxAlign(x), cardY + cardH);
  }
  for (let y = cardY; y <= cardY + cardH + 0.0001; y += stepPx){
    ctx2d.moveTo(cardX, pxAlign(y));
    ctx2d.lineTo(cardX + cardW, pxAlign(y));
  }
  ctx2d.strokeStyle = "rgba(255,255,255,0.12)";
  ctx2d.lineWidth = 1;
  ctx2d.stroke();

  ctx2d.beginPath();
  for (let x = cardX; x <= cardX + cardW + 0.0001; x += halfStepPx){
    const k = (x - cardX) / stepPx;
    if (Math.abs(k - Math.round(k)) < 1e-6) continue;
    ctx2d.moveTo(pxAlign(x), cardY);
    ctx2d.lineTo(pxAlign(x), cardY + cardH);
  }
  for (let y = cardY; y <= cardY + cardH + 0.0001; y += halfStepPx){
    const k = (y - cardY) / stepPx;
    if (Math.abs(k - Math.round(k)) < 1e-6) continue;
    ctx2d.moveTo(cardX, pxAlign(y));
    ctx2d.lineTo(cardX + cardW, pxAlign(y));
  }
  ctx2d.strokeStyle = "rgba(255,255,255,0.07)";
  ctx2d.lineWidth = 1;
  ctx2d.stroke();

  ctx2d.restore();

  // --- рамка карточки ---
  ctx2d.save();
  ctx2d.strokeStyle = "rgba(255,255,255,0.35)";
  ctx2d.lineWidth = 2;
  ctx2d.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);
  ctx2d.restore();

  // --- линейка с цифрами (мм) ---
  const cardWmm = g.cardWmm;
  const cardHmm = g.cardHmm;

  ctx2d.save();
  ctx2d.font = "11px system-ui, sans-serif";
  ctx2d.fillStyle = "rgba(255,255,255,0.70)";
  ctx2d.strokeStyle = "rgba(255,255,255,0.22)";
  ctx2d.lineWidth = 1;

  // верхняя линейка
  for (let mm = 0; mm <= Math.floor(cardWmm); mm++){
    const x = cardX + mm * pxPerMm;
    const big = (mm % 10 === 0);
    const mid = (mm % 5 === 0);
    const tick = big ? 10 : (mid ? 7 : 4);

    ctx2d.beginPath();
    ctx2d.moveTo(pxAlign(x), cardY);
    ctx2d.lineTo(pxAlign(x), cardY - tick);
    ctx2d.stroke();

    if (big) ctx2d.fillText(String(mm), x + 2, cardY - 14);
  }

  // левая линейка
  for (let mm = 0; mm <= Math.floor(cardHmm); mm++){
    const y = cardY + mm * pxPerMm;
    const big = (mm % 10 === 0);
    const mid = (mm % 5 === 0);
    const tick = big ? 10 : (mid ? 7 : 4);

    ctx2d.beginPath();
    ctx2d.moveTo(cardX, pxAlign(y));
    ctx2d.lineTo(cardX - tick, pxAlign(y));
    ctx2d.stroke();

    if (big) ctx2d.fillText(String(mm), cardX - 22, y - 6);
  }

  ctx2d.restore();

  // --- подпись шага сетки ---
  ctx2d.save();
  ctx2d.font = "12px system-ui, sans-serif";
  ctx2d.fillStyle = "rgba(255,255,255,0.65)";
  ctx2d.fillText(`Grid: ${stepMm}mm`, cardX + 10, cardY - 8);
  ctx2d.restore();

  // --- snap cursor ---
  if (mouse.x != null && mouse.y != null){
    const mx = mouse.x;
    const my = mouse.y;

    const inCard =
      (mx >= cardX && mx <= cardX + cardW &&
       my >= cardY && my <= cardY + cardH);

    if (inCard){
      let sx = mx;
      let sy = my;

      if (snapOn){
        sx = cardX + Math.round((mx - cardX) / stepPx) * stepPx;
        sy = cardY + Math.round((my - cardY) / stepPx) * stepPx;
      }

      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx2d.fillStyle = snapOn ? "rgba(56,189,248,0.9)" : "rgba(255,255,255,0.55)";
      ctx2d.fill();
      ctx2d.restore();

      if (window.LC_DIAG){
        window.LC_DIAG.lastSnap = {
          raw: { x: mx, y: my },
          snapped: { x: sx, y: sy },
          snapOn,
          stepMm,
          ts: Date.now(),
        };
      }
    }
  }

  if (window.LC_DIAG){
    window.LC_DIAG.lastRenderGeometry = {
      overlay: "rulersOverlay",
      host: { w, h },
      card: { x: cardX, y: cardY, w: cardW, h: cardH },
      pxPerMm,
      stepMm,
      ts: Date.now(),
    };
  }
}

function setRulersOverlayOptsFromState(state){
  if (!overlay || !state) return;
  if (Number.isFinite(state.gridStepMm)) overlay.opts.stepMm = state.gridStepMm;
  overlay.opts.snapOn = (state.snapOn !== undefined) ? !!state.snapOn : true;

  // cardWmm/Hmm — можно хранить, но отрисовка всё равно через computeCardGeom(state,...)
  overlay.opts.cardWmm = Number.isFinite(state.cardWmm) ? state.cardWmm : 150;
  overlay.opts.cardHmm = Number.isFinite(state.cardHmm) ? state.cardHmm : 105;
}

export function installRulersOverlay(ctx){
  const host = getHostEl();
  if (!host){
    ctx?.log?.error?.("rulersOverlay: cardHost not found");
    return;
  }
  ensureHostPositioning(host);

  // если уже стоит — обновим и перерисуем
  if (overlay?.host === host && overlay?.canvas?.isConnected){
    setRulersOverlayOptsFromState(ctx?.state);
    updateRulersOverlay();
    return;
  }

  uninstallRulersOverlay();

  const canvas = makeCanvas();
  host.appendChild(canvas);

  const ro = new ResizeObserver(() => updateRulersOverlay());
  ro.observe(host);

  const onResize = () => updateRulersOverlay();
  window.addEventListener("resize", onResize);

  overlay = {
    ctxRef: ctx,
    host,
    canvas,
    ro,
    onResize,
    onMove: null,
    onLeave: null,
    opts: { pxPerMm: 4, stepMm: 10, snapOn: true, cardWmm: 150, cardHmm: 105 },
    mouse: { x: null, y: null },
  };

  const onMove = (ev) => {
    if (!overlay) return;
    const rect = host.getBoundingClientRect();
    overlay.mouse.x = ev.clientX - rect.left;
    overlay.mouse.y = ev.clientY - rect.top;
    updateRulersOverlay();
  };

  const onLeave = () => {
    if (!overlay) return;
    overlay.mouse.x = null;
    overlay.mouse.y = null;
    updateRulersOverlay();
  };

  overlay.onMove = onMove;
  overlay.onLeave = onLeave;

  host.addEventListener("mousemove", onMove);
  host.addEventListener("mouseleave", onLeave);

  setRulersOverlayOptsFromState(ctx?.state);
  updateRulersOverlay();
  ctx?.log?.info?.("rulersOverlay installed");
}

export function uninstallRulersOverlay(){
  if (!overlay) return;
  try {
    overlay.ro?.disconnect?.();
    window.removeEventListener("resize", overlay.onResize);

    overlay.host?.removeEventListener?.("mousemove", overlay.onMove);
    overlay.host?.removeEventListener?.("mouseleave", overlay.onLeave);

    overlay.canvas?.remove?.();
  } finally {
    overlay = null;
  }
}

export function setRulersOverlayOpts(partial){
  if (!overlay || !partial) return;
  if (partial.stepMm != null) overlay.opts.stepMm = partial.stepMm;
  if (partial.snapOn != null) overlay.opts.snapOn = !!partial.snapOn;
}

export function updateRulersOverlay(){
  if (!overlay) return;
  const host = overlay.host;
  const canvas = overlay.canvas;
  if (!host || !canvas || !canvas.isConnected) return;

  const { w, h, ctx } = resizeCanvasToHost(canvas, host);
  draw(ctx, w, h, { ...overlay.opts, mouse: overlay.mouse });
}
