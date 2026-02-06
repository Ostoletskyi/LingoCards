// js/render/geom.js
// Единый источник геометрии карточки: мм -> px, позиция карточки в канвасе, margin, grid.
// Важно: pxPerMm подбирается так, чтобы карточка ВЛЕЗЛА в host (WYSIWYG для preview).

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

export const GEOM_DEFAULTS = {
  cardWmm: 150,
  cardHmm: 105,
  marginMm: 2,
  padPx: 24, // внешний отступ внутри host (как было)
};

export function getCardMmFromState(state){
  return {
    cardWmm: Number.isFinite(state?.cardWmm) ? state.cardWmm : GEOM_DEFAULTS.cardWmm,
    cardHmm: Number.isFinite(state?.cardHmm) ? state.cardHmm : GEOM_DEFAULTS.cardHmm,
    marginMm: Number.isFinite(state?.marginMm) ? state.marginMm : GEOM_DEFAULTS.marginMm,
  };
}

export function computeCardGeom(state, hostWpx, hostHpx, opts={}){
  const padPx = Number.isFinite(opts.padPx) ? opts.padPx : GEOM_DEFAULTS.padPx;
  const { cardWmm, cardHmm, marginMm } = getCardMmFromState(state);

  const availW = Math.max(10, hostWpx - padPx * 2);
  const availH = Math.max(10, hostHpx - padPx * 2);

  // подбираем pxPerMm так, чтобы карточка влезла
  const pxPerMm = Math.max(0.1, Math.min(availW / cardWmm, availH / cardHmm));

  const cardWpx = cardWmm * pxPerMm;
  const cardHpx = cardHmm * pxPerMm;

  const cardX = Math.round((hostWpx - cardWpx) / 2);
  const cardY = Math.round((hostHpx - cardHpx) / 2);

  return {
    pxPerMm,
    padPx,
    marginMm,
    cardWmm, cardHmm,
    card: { x: cardX, y: cardY, w: cardWpx, h: cardHpx },
    host: { w: hostWpx, h: hostHpx },
  };
}

export function mmToPx(mm, geom){ return mm * (geom?.pxPerMm ?? 4); }
export function pxToMm(px, geom){ return px / (geom?.pxPerMm ?? 4); }

export function canvasPxToMm(xPx, yPx, geom){
  const g = geom;
  if (!g) return { xMm: xPx / 4, yMm: yPx / 4, inCard: false };

  const xMm = (xPx - g.card.x) / g.pxPerMm;
  const yMm = (yPx - g.card.y) / g.pxPerMm;

  const inCard = (
    xPx >= g.card.x && xPx <= g.card.x + g.card.w &&
    yPx >= g.card.y && yPx <= g.card.y + g.card.h
  );
  return { xMm, yMm, inCard };
}

// Вспомогательное: ограничить блок внутри карточки с учетом marginMm
export function clampBoxToCardMm(box, state){
  const { cardWmm, cardHmm, marginMm } = getCardMmFromState(state);

  const w = Number.isFinite(box.wMm) ? box.wMm : 0;
  const h = Number.isFinite(box.hMm) ? box.hMm : 0;

  const maxX = Math.max(0, cardWmm - w - marginMm);
  const maxY = Math.max(0, cardHmm - h - marginMm);

  box.xMm = clamp(Number.isFinite(box.xMm) ? box.xMm : 0, 0, maxX);
  box.yMm = clamp(Number.isFinite(box.yMm) ? box.yMm : 0, 0, maxY);
}
