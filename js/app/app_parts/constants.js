// js/app/app_parts/constants.js

// Autosave key (user prefers stable "cookie-like" behavior across sessions)
// IMPORTANT: do not auto-purge previous state on startup.
export const AUTOSAVE_KEY = "LC_NEXT_STATE_V1";
export const AUTOSAVE_OLD_KEYS = [];

// ---- State schema / migrations ------------------------------------------
export const STATE_SCHEMA_VERSION = "2026-02-01";

export const DEBUG = (() => {
  if (typeof window === "undefined") return false;
  if (window.__LC_DEBUG__ !== undefined) return !!window.__LC_DEBUG__;
  return /[?&]debug=1/.test(String(window.location?.search || ""));
})();

export const CANONICAL_FULL_BOXES = [
  {
    "id": "freqCorner",
    "xMm": 2,
    "yMm": 2,
    "wMm": 26,
    "hMm": 8,
    "fontPt": 10,
    "label": "Freq",
    "bind": "freq",
    "type": "frequencyDots",
    "textMode": "bind"
  },
  {
    "id": "inf",
    "xMm": 2,
    "yMm": 12,
    "wMm": 62,
    "hMm": 16.960947503201023,
    "fontPt": 28,
    "label": "Infinitiv",
    "bind": "inf",
    "textMode": "bind",
    "geomPinned": true,
    "geomMode": "manual"
  },
  {
    "id": "tr",
    "xMm": 0.4761724533100846,
    "yMm": 29.460947503201023,
    "wMm": 147.52382754668992,
    "hMm": 10.104353393085791,
    "fontPt": 13,
    "label": "Übersetzungen",
    "bind": "translationsLine",
    "textMode": "bind",
    "geomPinned": true,
    "geomMode": "manual"
  },
  {
    "id": "forms",
    "xMm": 2,
    "yMm": 40.065300896286814,
    "wMm": 42.8204922059434,
    "hMm": 8.066581306017925,
    "fontPt": 12,
    "label": "Formen",
    "bind": "formsLine",
    "textMode": "bind"
  },
  {
    "id": "syn",
    "xMm": 64.5,
    "yMm": 2,
    "wMm": 55.323040873079385,
    "hMm": 19.359795134443022,
    "fontPt": 12,
    "label": "Synonyme",
    "bind": "synonymsPairsBlock",
    "textMode": "bind"
  },
  {
    "id": "examples",
    "xMm": 2,
    "yMm": 55,
    "wMm": 47.07012337698063,
    "hMm": 25.947503201024325,
    "fontPt": 10,
    "label": "Beispiele",
    "bind": "examplesBlock",
    "textMode": "bind"
  },
  {
    "id": "pref",
    "xMm": 71.54116872086568,
    "yMm": 55.05313700384123,
    "wMm": 40.02910911960577,
    "hMm": 15.326504481434059,
    "fontPt": 9,
    "label": "Präfixe / Partikel",
    "bind": "prefixesBlock",
    "textMode": "bind"
  }
];
