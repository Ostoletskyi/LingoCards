// js/app/app_parts/clone.js

export function deepClone(obj){
  try {
    if (typeof structuredClone === "function") return structuredClone(obj);
  } catch {}
  return JSON.parse(JSON.stringify(obj));
}

export function cloneBoxes(boxes){
  if (!Array.isArray(boxes)) return [];
  // Shallow-clone each box. (Boxes are plain objects with primitive fields.)
  return boxes.map(b => (b && typeof b === "object") ? { ...b } : b);
}
