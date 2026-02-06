// js/render/roundRect.js
export function pathRoundRect(ctx, x, y, w, h, r){
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function strokeRoundRect(ctx, x, y, w, h, r){
  pathRoundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

export function fillRoundRect(ctx, x, y, w, h, r){
  pathRoundRect(ctx, x, y, w, h, r);
  ctx.fill();
}
