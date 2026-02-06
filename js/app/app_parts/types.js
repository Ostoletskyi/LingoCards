// js/app/app_parts/types.js
// JSDoc-only type contract (micro-schema) for safer refactors and future TS migration.

/**
 * A single layout box on the card canvas.
 * NOTE: Boxes are treated as plain objects; unknown extra fields may exist.
 *
 * @typedef {Object} Box
 * @property {string} id
 * @property {number} xMm
 * @property {number} yMm
 * @property {number} wMm
 * @property {number} hMm
 * @property {number} [fontPt]
 * @property {string} [label]
 * @property {string} [labelKey]
 * @property {Object} [labelParams]
 * @property {string} [bind]
 * @property {string} [type]
 * @property {"bind"|"note"|"static"} [textMode]
 * @property {string} [text]
 * @property {string} [staticText]
 * @property {"left"|"center"|"right"} [align]
 * @property {boolean} [visible]
 * @property {boolean} [geomPinned]
 * @property {"manual"|""} [geomMode]
 * @property {boolean} [manualGeom]
 * @property {boolean} [autoFitText]
 * @property {any} [extra]  // placeholder for unknown fields
 */

/**
 * Per-verb notes mapping.
 * { [verbKey]: { [boxId]: text } }
 *
 * @typedef {Object.<string, Object.<string, string>>} NotesByVerb
 */

/**
 * A standalone created card (RIGHT list).
 *
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} title
 * @property {number} cardWmm
 * @property {number} cardHmm
 * @property {Box[]} boxes
 * @property {NotesByVerb} notesByVerb
 * @property {number} selectedIndex
 */

/**
 * Persisted subset (what we write into localStorage).
 *
 * @typedef {Object} PersistedState
 * @property {string} schemaVersion
 * @property {"cards"|"source"} viewMode
 * @property {boolean} editing
 * @property {boolean} rulersOn
 * @property {boolean} snapOn
 * @property {number} gridStepMm
 * @property {number} cardWmm
 * @property {number} cardHmm
 * @property {Box[]} boxes
 * @property {Box[]|undefined} [sourceBoxes]
 * @property {NotesByVerb} notesByVerb
 * @property {Card[]|undefined} [cards]
 * @property {number} selectedCardIndex
 * @property {Object|undefined} [data]
 * @property {number} selectedIndex
 * @property {"az"|"za"|"added"} verbsSortMode
 * @property {string} searchQuery
 * @property {"inherit"|"canonical"} newCardTemplateMode
 */

/**
 * Full runtime state (includes transient UI/editor fields).
 *
 * @typedef {PersistedState & {
 *   selectedBoxId: (string|null),
 *   selectedIds: string[],
 *   marqueeRect: (null|{xMm:number,yMm:number,wMm:number,hMm:number}),
 *   cards: Card[] | null,
 * }} AppState
 */

/**
 * Options for ctx.setState.
 *
 * @typedef {Object} SetStateOptions
 * @property {boolean} [clearSelection]
 * @property {boolean} [autosave]
 * @property {number} [debounceMs]
 */

/**
 * Minimal app context used across modules.
 * (Not exhaustive — this is a safety harness, not a cage.)
 *
 * @typedef {Object} AppCtx
 * @property {AppState} state
 * @property {(patch:Object, opts?:SetStateOptions)=>void} setState
 * @property {()=>void} requestRender
 * @property {()=>any} getState
 * @property {any} log
 * @property {any} i18n
 * @property {any} shell
 * @property {any} history
 * @property {any} [ui]
 * @property {any} [cards]
 */

// Make this file a proper ESM module.
export {};
