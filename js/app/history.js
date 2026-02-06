// js/app/history.js
// Backward-compatible entry point.
//
// NOTE:
//   History (Undo/Redo) is implemented in js/app/undoHistory.js.
//   This file exists only to avoid breaking older imports.

export { createHistoryManager, clampInt } from "./undoHistory.js";
