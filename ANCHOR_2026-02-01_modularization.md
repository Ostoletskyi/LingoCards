# LingoCard-next — Anchor 2026-02-01 (AI panel modularization + LM Studio 400 fix)

## What was wrong
- AI Control Panel sometimes showed **HTTP 400** from LM Studio (`/v1/chat/completions`).
- LM Studio error: `response_format.type must be 'json_schema' or 'text'`.
- `ai/ai.entry.js` had grown into a “god-module” (translations + parsing + networking + UI in one file), making debugging painful.

## What I changed
### 1) LM Studio compatibility
- In `ai/ai.entry.js` I switched `response_format.type` from `'json_object'` to `'text'`.
  - This avoids the LM Studio 400 validation error while preserving the existing JSON extraction/parsing logic.
  - The existing fallback “retry without response_format” remains, but should trigger far less (or never).

### 2) File splitting (safe modularization)
- Extracted **i18n** into a dedicated module:
  - `ai/ai.i18n.js` exports: `getLang()`, `t()`, and `AI_I18N`.
- Extracted **network + JSON parsing helpers** into a dedicated module:
  - `ai/ai.net.js` exports: `safeJsonParse()`, `looksTruncated()`, `extractJsonObject()`, `httpGet()`, `httpPostJson()`.
- Updated `ai/ai.entry.js` to import from those two modules.

### 3) Split “history manager” out of app.js
- Extracted Undo/Redo history logic from `js/app/app.js` into:
  - `js/app/history.js` exports: `createHistoryManager()`, `clampInt()`.
- `js/app/app.js` now imports history utilities instead of embedding them.

## Files added
- `ai/ai.i18n.js`
- `ai/ai.net.js`
- `js/app/history.js`
- `ANCHOR_2026-02-01_modularization.md`

## Files modified
- `ai/ai.entry.js`
- `js/app/app.js`

## Smoke notes
- This refactor is intentionally conservative: no behavior changes expected beyond fewer 400 errors from LM Studio.
