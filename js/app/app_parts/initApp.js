// js/app/app_parts/initApp.js

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').AppCtx} AppCtx */

import { installEditIndicator } from "../../ui/features/editIndicator.js";
import { installModeIndicator } from "../../ui/features/modeIndicator.js";
import { installBindScanIndicator } from "../../ui/features/bindScanIndicator.js";
import { installAiStatusIndicator } from "../../ui/features/bindAiStatusIndicator.js";
import { installPresetsPanel } from "../../ui/presetsPanel.js";
import { rerender } from "../../render/renderCard.js";
import { installAdminPanel } from "../../ui/adminPanel.js";
import { installDeleteBoxHotkey } from "../../ui/features/deleteBox.js";
import { installVersionBadge } from "../../ui/versionBadge.js";
import { APP_VERSION } from "../../version.js";
import { log } from "../../utils/log.js";
import { buildShell } from "../../ui/uiShell.js";
import { initUI } from "../../ui/uiCore.js";
import { createI18n } from "../../ui/i18n.js";
import ru from "../../i18n/ru.js";
import de from "../../i18n/de.js";
import en from "../../i18n/en.js";
import { createHistoryManager, clampInt } from "../history.js";

import { AUTOSAVE_KEY } from "./constants.js";
import { deepClone, cloneBoxes } from "./clone.js";
import { DEFAULTS, pickPersistedState } from "./state.js";
import { migrateState } from "./migrations.js";
import {
  normalizeCardsState,
  applyCardFromCards,
  syncCurrentToCards,
  forceManualGeomForRightList,
} from "./cardsCore.js";
import { loadAutosave, saveAutosaveNow, scheduleAutosave } from "./autosave.js";
import { installDiag } from "./diag.js";

export function initApp(){
  // 1) state (restore)
  const saved = loadAutosave();
  /** @type {AppState} */
  const state = {
    ...DEFAULTS,
    ...(saved || {}),
    selectedBoxId: null, // transient always reset
    selectedIds: [],     // transient always reset
    marqueeRect: null,   // transient always reset
  };

  // UI preference: New card template mode can be toggled in the right panel.
  // We keep a separate localStorage key so this preference survives even if autosave is reset.
  try {
    const m = localStorage.getItem("LC_NEW_CARD_TEMPLATE_MODE");
    if (m === "canonical" || m === "inherit") state.newCardTemplateMode = m;
  } catch {}

  // --- Cards stack: normalize + apply selected card to current fields
  normalizeCardsState(state);
  applyCardFromCards(state);

  // --- State migrations + normalization (single pipeline)
  const mig = migrateState(state);

  // keep card snapshot updated after migrations (never sync SOURCE preview into created cards)
  try { if (state?.viewMode !== "source") syncCurrentToCards(state); } catch {}

  // Persist immediately if we changed the schema (prevents repeated migration work)
  try { if (mig.changed) saveAutosaveNow(state); } catch {}

  // 2) i18n (RU/DE/EN)
  const dicts = { ru, de, en };
  let lang = "ru";
  try { lang = localStorage.getItem("lc_lang") || lang; } catch {}
  if (!dicts[lang]) lang = "ru";
  try { document.documentElement.lang = lang; } catch {}
  const i18n = createI18n({ dicts, lang, log });

  // 3) mounts
  const mounts = {
    topBar: document.getElementById("topBar"),
    leftPanel: document.getElementById("leftPanel"),
    cardHost: document.getElementById("cardHost"),
    rightPanel: document.getElementById("rightPanel"),
    statusBar: document.getElementById("statusBar"),
  };

  // 4) shell builds DOM
  const shell = buildShell(mounts, i18n);
  // Responsive preview: rerender when host sizes change (desktop/tablet/mobile)
  // Canvas size depends on cardHost, so without this the preview can stay "stuck" after window resize.
  try {
    const ro = new ResizeObserver(() => requestRender());
    if (mounts.cardHost) ro.observe(mounts.cardHost);
    if (mounts.leftPanel) ro.observe(mounts.leftPanel);
    if (mounts.rightPanel) ro.observe(mounts.rightPanel);
    if (mounts.topBar) ro.observe(mounts.topBar);
    if (mounts.rightPanel) ro.observe(mounts.rightPanel);
    window.addEventListener("resize", () => requestRender(), { passive: true });
  } catch (e){
    window.addEventListener("resize", () => requestRender(), { passive: true });
  }


   // 5) ctx (единственный “контекст приложения”)
  let _rafRender = 0;
  function requestRender(){
    if (_rafRender) return;
    _rafRender = requestAnimationFrame(() => {
      _rafRender = 0;
      try { rerender(); } catch {}
    });
  }

  const ctx = {
    log,
    i18n,
    state,
    shell,

    requestRender,

    getState(){
      // Returns a deep-cloned snapshot of the persisted part of the state.
      try { return deepClone(pickPersistedState(state)); } catch { return {}; }
    },

    setState(patch, opts){
      if (!patch || typeof patch !== "object") return;
      Object.assign(state, patch);

      // Keep a dedicated SOURCE layout snapshot that is never overwritten by cards.
      // In source mode, layout (geometry) is global across all verbs.
      if (patch && patch.boxes && state.viewMode === "source"){
        try { state.sourceBoxes = cloneBoxes(state.boxes); } catch {}
      }

      if (opts?.clearSelection) state.selectedBoxId = null;

      const autosave = (opts?.autosave !== false);
      if (autosave){
        const d = Number.isFinite(opts?.debounceMs) ? opts.debounceMs : 250;
        scheduleAutosave(state, d);
      }

      // Перерисуем, если патч влияет на превью
      if (patch) requestRender();
    },
  };

  // Cards API for UI features
  ctx.cards = {
    // Empty right list is a valid state.
    getCount: () => Array.isArray(state.cards) ? state.cards.length : 0,
    getIndex: () => Number.isFinite(state.selectedCardIndex) ? state.selectedCardIndex : 0,
    getTitle: () => {
      const i = Number.isFinite(state.selectedCardIndex) ? state.selectedCardIndex : 0;
      return state.cards?.[i]?.title || `Card ${i+1}`;
    },
    sync: () => syncCurrentToCards(state),
    switchTo: (index) => {
      normalizeCardsState(state);
      const i = Math.max(0, Math.min(index, state.cards.length - 1));
      // Persist current card BEFORE switching away (but never sync SOURCE preview into cards).
      try {
        if (state.viewMode !== "source") syncCurrentToCards(state);
      } catch {}

      const prevIdx = Number.isFinite(state.selectedCardIndex) ? state.selectedCardIndex : 0;
      if (i === prevIdx) return;

      // Apply target card snapshot deterministically (avoid transient state mutations).
      const target = state.cards[i];
      if (!target) return;

      const nextPatch = {
        viewMode: "cards",
        selectedBoxId: null,
        selectedIds: [],
        marqueeRect: null,
        selectedCardIndex: i,
        cardWmm: Number.isFinite(target.cardWmm) ? target.cardWmm : 150,
        cardHmm: Number.isFinite(target.cardHmm) ? target.cardHmm : 105,
        boxes: forceManualGeomForRightList(deepClone(Array.isArray(target.boxes) ? target.boxes : [])),
        notesByVerb: deepClone((target.notesByVerb && typeof target.notesByVerb === "object") ? target.notesByVerb : {}),
        selectedIndex: Number.isFinite(target.selectedIndex) ? target.selectedIndex : 0,
      };

      // update live state first (so other subsystems see consistent values)
      Object.assign(state, nextPatch);

      // commit state (triggers render + autosave)
      ctx.setState(nextPatch, { clearSelection: true });

      // keep card snapshot in sync with what we just applied
      try { syncCurrentToCards(state); } catch {}

      // card switch shouldn't carry undo stack between cards
      ctx.history?.reset?.();

      // Debug hook (helps diagnose rare selection issues)
      try { ctx.log?.info?.("cards.switch", { from: prevIdx, to: i, len: state.cards.length }); } catch {}
    },
    // Switch preview to SOURCE (verb-driven) without overwriting created cards
    switchToSource: (verbIndex) => {
      normalizeCardsState(state);
      // save current created card before leaving cards-mode
      if (state.viewMode !== "source") {
        try { syncCurrentToCards(state); } catch {}
      }
      const verbs = state?.data?.verbs || [];
      const vIdx = clampInt(verbIndex, 0, Math.max(0, verbs.length - 1));
      state.selectedIndex = vIdx;
      state.viewMode = "source";
      // IMPORTANT:
      // - Source mode must use bind-boxes layout (so verb switching updates content).
      // - Geometry is GLOBAL across all verbs, but it is NOT the same as "cards" layout.
      //   We keep a dedicated snapshot: state.sourceBoxes.

      // Ensure sourceBoxes exists.
      // IMPORTANT: do NOT fallback to current boxes (those could be "cards" static boxes).
      // If sourceBoxes is missing, we always create a bind-layout template, so verb switching
      // updates all fields (not only frequency dots).
      const isBindLike = (boxes) => {
        if (!Array.isArray(boxes) || boxes.length === 0) return false;
        // If at least one non-frequency box has a bind, we consider it OK
        return boxes.some(b => {
          const bt = String(b?.type || "");
          const isFreq = bt === "frequencyDots" || b?.id === "freq" || b?.id === "freqCorner";
          return !isFreq && !!String(b?.bind || "").trim();
        });
      };

      // If we already have sourceBoxes but they look like a STATIC snapshot (no binds),
      // migrate them to bind-layout while PRESERVING user's geometry.
      const needsMigrate = Array.isArray(state.sourceBoxes) && state.sourceBoxes.length && !isBindLike(state.sourceBoxes);

      if (!Array.isArray(state.sourceBoxes) || !state.sourceBoxes.length || needsMigrate){
        const sample = verbs[vIdx] || verbs[0] || {};
        let templ = [];
        try { templ = cloneBoxes(buildBoxesFromVerbSample(sample)); } catch {}
        if (!Array.isArray(templ) || !templ.length){
          try { templ = cloneBoxes(buildBoxesFromVerbSample({})); } catch {}
        }

        if (needsMigrate){
          const old = Array.isArray(state.sourceBoxes) ? state.sourceBoxes : [];
          // copy geometry/font from old boxes by id
          for (const t of templ){
            const o = old.find(x => x && x.id === t.id);
            if (o){
              if (Number.isFinite(o.xMm)) t.xMm = o.xMm;
              if (Number.isFinite(o.yMm)) t.yMm = o.yMm;
              if (Number.isFinite(o.wMm)) t.wMm = o.wMm;
              if (Number.isFinite(o.hMm)) t.hMm = o.hMm;
              if (Number.isFinite(o.fontPt)) t.fontPt = o.fontPt;
            }
          }
        }

        state.sourceBoxes = templ;
        if (!Array.isArray(state.sourceBoxes) || !state.sourceBoxes.length){
          try { state.sourceBoxes = cloneBoxes(buildBoxesFromVerbSample({})); } catch {}
        }

      // ✅ Bind boxes should be auto-sized by default.
      // Some older templates mistakenly marked them as geomMode:"manual" which disables auto-fit.
      // We treat bind boxes as AUTO unless the user explicitly pinned geometry.
      for (const b of (Array.isArray(state.sourceBoxes) ? state.sourceBoxes : [])){
        if (!b || typeof b !== "object") continue;
        if (!String(b.bind || "").trim()) continue;
        if (b.geomPinned === true || b.manualGeom === true) continue;
        if (String(b.geomMode || "") === "manual"){
          delete b.geomMode;
        }
      }
      }

      // Apply source layout snapshot to current preview
      state.boxes = cloneBoxes(state.sourceBoxes);

      // HARD RULE (LEFT list / SOURCE): any box that has `bind` must render from JSON.
      // If some older/mixed data mutated boxes into manual/override mode,
      // we still keep geometry, but force textMode back to "bind".
      for (const b of (Array.isArray(state.boxes) ? state.boxes : [])){
        if (!b || typeof b !== "object") continue;
        if (String(b.bind || "").trim()){
          b.textMode = "bind";
          // Same normalization for the active clone
          if (b.geomPinned !== true && b.manualGeom !== true && String(b.geomMode || "") === "manual"){
            delete b.geomMode;
          }
          // Clear misleading manual text fields that can shadow bind text in some older states.
          // (Renderer currently prefers bind, but keep state clean anyway.)
          if (b.staticText !== undefined) delete b.staticText;
          if (b.text !== undefined) delete b.text;
        }
      }
      state.selectedBoxId = null;
      state.selectedIds = [];
      state.marqueeRect = null;
      ctx.setState({
        viewMode: state.viewMode,
        selectedIndex: state.selectedIndex,
        boxes: state.boxes,
        selectedBoxId: null,
        selectedIds: [],
        marqueeRect: null,
      }, { clearSelection: true });
      ctx.requestRender();
    },
    addNew: ({ cloneCurrent = false } = {}) => {
      normalizeCardsState(state);
      if (state.viewMode !== "source") syncCurrentToCards(state);
      const n = state.cards.length + 1;
      const base = cloneCurrent
        ? makeCardFromCurrentState(state, { title: `Card ${n}` })
        : makeBlankCardFromTemplate(state, { title: `Card ${n}`, templateMode: state.newCardTemplateMode });
      state.cards.push(base);
      state.selectedCardIndex = state.cards.length - 1;
      state.viewMode = "cards";
      applyCardFromCards(state);
      ctx.setState({
        viewMode: state.viewMode,
        selectedCardIndex: state.selectedCardIndex,
        cardWmm: state.cardWmm,
        cardHmm: state.cardHmm,
        boxes: state.boxes,
        notesByVerb: state.notesByVerb,
        selectedIndex: state.selectedIndex,
      }, { clearSelection: true });
      // Keep right list in sync immediately (some UI parts don't hook requestRender reliably).
      try { ctx.ui?.refreshCardsList?.(); } catch {}
      try { if (state.viewMode !== "source") syncCurrentToCards(state); } catch {}
      ctx.history?.reset?.();
      ctx.log.info("cards.new", { index: state.selectedCardIndex, count: state.cards.length });
    },

    // Clear the RIGHT list completely.
    // UX rule: after "Очистить список" the list must be empty immediately (no "one big card" ghost),
    // and the preview should show a neutral blank template (canonical Full, manual geometry).
    clearAll: () => {
      normalizeCardsState(state);
      // do not sync anything back into source; this is a draft list operation
      state.cards = [];
      state.selectedCardIndex = 0;
      state.viewMode = "cards";
      state.boxes = makeRightPreviewTemplate(state);

      ctx.setState({
        cards: [],
        viewMode: "cards",
        selectedCardIndex: 0,
        boxes: state.boxes,
        selectedBoxId: null,
        selectedIds: [],
        marqueeRect: null,
      }, { clearSelection: true, autosave: true, debounceMs: 120 });

      try { ctx.ui?.refreshCardsList?.(); } catch {}
      ctx.history?.reset?.();
      ctx.requestRender();
      ctx.log.info("cards.clearAll");
    },
    deleteCurrent: () => {
      normalizeCardsState(state);
      const cards = Array.isArray(state.cards) ? state.cards : [];
      if (!cards.length) return;

      // If we are leaving cards-mode, do not sync SOURCE into cards.
      if (state.viewMode !== "source") {
        try { syncCurrentToCards(state); } catch {}
      }

      const cur = clampInt(state.selectedCardIndex, 0, cards.length - 1);
      cards.splice(cur, 1);

      if (!cards.length){
        // allow empty list
        state.selectedCardIndex = 0;
        state.viewMode = "cards";
        state.boxes = makeRightPreviewTemplate(state);
        ctx.setState({
          cards: [],
          selectedCardIndex: 0,
          viewMode: "cards",
          boxes: state.boxes,
          selectedBoxId: null,
          selectedIds: [],
          marqueeRect: null,
        }, { clearSelection: true, autosave: true, debounceMs: 120 });
        ctx.history?.reset?.();
        return;
      }

      const next = Math.max(0, Math.min(cur, cards.length - 1));
      state.selectedCardIndex = next;
      state.viewMode = "cards";
      applyCardFromCards(state);

      ctx.setState({
        cards: state.cards,
        viewMode: state.viewMode,
        selectedCardIndex: state.selectedCardIndex,
        cardWmm: state.cardWmm,
        cardHmm: state.cardHmm,
        boxes: state.boxes,
        notesByVerb: state.notesByVerb,
        selectedIndex: state.selectedIndex,
        selectedBoxId: null,
        selectedIds: [],
        marqueeRect: null,
      }, { clearSelection: true });

      try { syncCurrentToCards(state); } catch {}
      ctx.history?.reset?.();
      ctx.log.info("cards.delete", { index: state.selectedCardIndex, count: state.cards.length });
    }
  };

  // Undo/Redo history (max 20)
  ctx.history = createHistoryManager(ctx, { limit: 20 });

  // 6) diag — после ctx (иначе нет доступа к ctx)
  installDiag(ctx);

  // 7) version badge / admin panel — ставим по одному разу

  installVersionBadge(mounts);
  installAdminPanel(ctx, mounts);
  installPresetsPanel(ctx);
  installEditIndicator(ctx);
  installModeIndicator(ctx);
  installBindScanIndicator(ctx);
  installAiStatusIndicator(ctx);

  // 8) UI init (ONCE)
  initUI(ctx);

  // 9) hotkeys
  installDeleteBoxHotkey(ctx);

  // 10) save initial
  scheduleAutosave(state, 10);

  // 11) Debug handle (opt-in, safe): allows inspecting state from DevTools.
  //    Example:  LC.state().boxes.map(b => ({id:b.id, bind:b.bind, textMode:b.textMode}))
  try{
    const g = (typeof window !== 'undefined') ? window : null;
    if (g){
      g.LC = g.LC || {};
      g.LC.state = () => ctx.getState();
      g.LC.setState = (patch, opts) => ctx.setState(patch, opts);
      g.LC.ctx = ctx;
    }
  }catch(e){}

  log.info("initApp: OK", { state: pickPersistedState(state) });
}
