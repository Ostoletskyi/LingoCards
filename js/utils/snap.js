export function snapMm(vMm, stepMm){
  if (!Number.isFinite(vMm) || !Number.isFinite(stepMm) || stepMm <= 0) return vMm;
  return Math.round(vMm / stepMm) * stepMm;
}

export function snapPointMm(xMm, yMm, stepMm){
  return {
    xMm: snapMm(xMm, stepMm),
    yMm: snapMm(yMm, stepMm),
  };
}
