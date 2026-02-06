// js/contract.js
// CONTRACT v1.0 – commercial stable
export const CONTRACT = {
  // --- DOM ---------------------------------------------------------------
  dom: {
    requiredIds: ["appRoot", "topBar", "leftPanel", "cardHost", "rightPanel", "statusBar"],

    // если у тебя есть слой карточки/канвас — добавь сюда:
    // + динамические элементы, которые создаются UI (не требуем в requiredIds,
    //   потому что preflight запускается до initUI)
    optionalIds: [
      // title / author popover
      "lcTitle",
      "lcTitleMain",
      "lcTitleSub",
      "lcAuthorPopover",

      // search
      "btnSearch",
      "lcSearchPopover",

      "lcCardLayer",
      "lcCardCanvas",
      // dock / badges
      "lcBottomDock",
      "lcCardBadge",
      "lcVerDockBadge",
      "lcBindScanBadge",
      "lcVerDockAdminBtn",
      "lcVerDockPresetsBtn",
      // panels
      "lcAdminPanel",
      "lcPresetsPanel",
      "lcTooltip",
      "lcHistoryPanel",

      // help
      "lcHelpBtn",

      // cards sidebar
      "btnExportCards",
    "btnExportCardsLeft",
      // verbs list panel actions
      "btnAppendVerbs",
      "btnSortVerbs",
      "btnPdfCardsCurrent",
      "btnPdfCardsAll",

      // presets reset
      "btnResetAutosave",
      "btnResetState",
      "btnResetAll",

      // right panel convenience
      "btnNewCardRight",
    ],
  },

  // --- Data contract (card JSON) ----------------------------------------
  data: {
    // Canonical single-card format (used for export/import and ChatGPT prompts).
    // Notes:
    // - "title" is the primary name shown in both lists.
    // - cards may also include deprecated title aliases (name, cardTitle, meta.title).
    // - blocks[].text is always a string; empty string is allowed.
    cardSchema: {
      required: ["version", "lang", "title", "blocks"],
      optional: ["id", "meta"],
      titleAliasesDeprecated: ["name", "cardTitle", "meta.title", "meta.name"],
      blocks: {
        required: ["type", "text"],
        optional: ["id", "bind", "x", "y", "w", "h", "rot", "style"],
      },
      example: {
        version: "1.0",
        lang: "de-ru",
        title: "Gehen",
        blocks: [
          { type: "word", text: "gehen" },
          { type: "translation", text: "идти" },
          { type: "form", text: "ist gegangen" },
          { type: "example", text: "Ich gehe nach Hause." },
        ],
      },
    },
  },

  // --- Modules & required exports ----------------------------------------
  modules: {
    "js/app/app.js": ["initApp"],

    // diagnostics
    "js/diag/smokeTest.js": ["runSmokeTest"],

    "js/ui/uiShell.js": ["buildShell"],
    "js/ui/uiCore.js": ["initUI"],
    // UI features
    "js/ui/features/cards.js": ["featureCards"],
    "js/ui/features/cardsSidebar.js": ["featureCardsSidebar"],
    "js/ui/i18n.js": ["createI18n"],

    // dock / panels
    "js/ui/versionBadge.js": ["installVersionBadge"],
    "js/ui/features/bindScanIndicator.js": ["installBindScanIndicator"],
    "js/ui/adminPanel.js": ["installAdminPanel"],
    "js/ui/presetsPanel.js": ["installPresetsPanel"],

    "js/ui/features/editMode.js": ["featureEditMode"],
    "js/ui/features/cardSize.js": ["featureCardSize"],
    "js/ui/features/verbsLoadButton.js": ["featureVerbsLoadButton"],
    "js/ui/features/verbsListPanel.js": ["featureVerbsListPanel"],
    "js/ui/features/rulersGrid.js": ["featureRulersGrid"],
    "js/ui/features/editorBasic.js": ["featureEditorBasic"],
    "js/ui/features/pdfExport.js": ["featurePdfExport"],
    "js/ui/features/helpGuide.js": ["featureHelpGuide"],
    "js/ui/features/search.js": ["featureSearch"],

    // PDF split adapters (left/right) + core
    "js/pdf/pdfCore.js": [
      "createPdfCore",
      "buildPdfFromJpegs",
      "downloadBytesSafe",
      "ensurePreviewCommittedSync",
      "withPdfModeSync",
      "captureCurrentCardAsJpeg",
      "getCtxAppOrThrow",
      "getCardCropMetaOrThrow",
    ],
    "js/pdf/pdfL.js": ["createPdfL"],
    "js/pdf/pdfR.js": ["createPdfR"],
    "js/ui/features/history.js": ["featureHistory"],
    "js/ui/features/deleteBox.js": ["installDeleteBoxHotkey"],

    "js/render/renderCard.js": [
      "renderCard",
      "getCardCanvas",
      "rerender",
      // editorBasic.js relies on these
      "autoFitBoxToText",
      "autoFitBoxToShown",
      "doesTextFit",
      "getLastCardGeom",
    ],

    "js/render/rulersOverlay.js": ["installRulersOverlay", "uninstallRulersOverlay", "updateRulersOverlay"],

    // export metadata (used by JSON export buttons)
    "js/data/exportPassport.js": ["makeExportPassport"],

    "js/editor/textEdit.js": [
      "isEditingText",
      "startTextEdit",
      "commitTextEdit",
      "cancelTextEdit",
      "handleKeydown",
      "getEditing",
      // КЛЮЧЕВОЕ: sync overlay должен быть экспортирован и вызываться из renderCard()
      "syncTextEditorOverlay",
    ],

    // версия — single source of truth
    "js/version.js": ["APP_VERSION", "formatVersionLine"],

    "js/utils/log.js": ["log"],
    "js/i18n/ru.js": ["default"],
  },

  // --- UI contract --------------------------------------------------------
  ui: {
    // feature ids (uiCore.js registry)
    requiredFeatureIds: [
      "cards",
      "cardsSidebar",
      "editMode",
      "cardSize",
      "verbsLoadButton",
      "verbsListPanel",
      "helpGuide",
      "editorBasic",
      "rulersGrid",
      "pdfExport",
      "history",
      "deleteBoxHotkey",
    ],
    i18nMustHaveKeys: [
      "app.title",
      "ui.btn.editToggle",
      "ui.btn.newCard",
      "ui.right.title",
      "ui.btn.exportCards",
      "ui.btn.pdfCardsCurrent",
      "ui.btn.pdfCardsAll",
      "ui.tip.exportCards",
      "ui.tip.pdfCardsCurrent",
      "ui.tip.pdfCardsAll",
      "ui.status.noCards",
      "ui.tip.newCard",
      "ui.tip.prevCard",
      "ui.tip.nextCard",
      "ui.status.card",
    ],
  },

  // --- Version / badge contract ------------------------------------------
  versioning: {
    // Правый верхний бейдж. Если id другой — поменяй.
    badgeElementId: "lcVerDockBadge",

    // что обязано быть в APP_VERSION
    requiredFields: ["app", "tag", "build", "commit"],
  },

  // --- Text editing contract (самое важное) ------------------------------
  textEditing: {
    mode: "textarea-overlay",

    // ожидаемое поведение клавиш (Word-style)
    keyRules: [
      "Arrows/Home/End move caret inside text",
      "Backspace/Delete remove by selection or one char (not wipe-all)",
      "Ctrl/Cmd + C/V/X/A works",
      "Enter makes newline",
      "Ctrl/Cmd+Enter commits edit",
      "Escape cancels edit",
    ],

    // инвариант: когда textarea активна — canvas НЕ должен рисовать текст этого блока
    // иначе получаются “двойной текст / монолит / артефакты”
    renderInvariant: "if textarea active for box => canvas draws only frame, not text glyphs",
  },

  // --- Smoke test policy --------------------------------------------------
  smoke: {
    // что игнорировать при сравнении filemap vs actual
    ignorePathPrefixes: ["_backups/", "_restore/", "_release/"],
    ignoreGlobs: ["*.zip", "*.log", ".__*", "__filemap_current.tmp"],

    // минимальный набор “обязательных файлов”, если хочешь жёстче:
    mustExist: [
      "index.html",
      "js/version.js",
      "js/app/app.js",
      "js/render/renderCard.js",
      "js/editor/textEdit.js",
      "js/diag/smokeTest.js",
    ],

    // строгий ручной смоук (делаем после каждого этапа)
    manualChecklist: [
      "Load verbs JSON (btnLoadVerbs)",
      "Switch verb in list (verbsListPanel)",
      "Toggle rulers/grid (btnRulers)",
      "Toggle editing (btnEdit)",
      "Create new block (btnNewBlock) and type text", 
      "Create new card (btnNewCard) => card counter increases",
      "Switch cards (btnPrevCard/btnNextCard) => content swaps",
      "Edit a bound box => becomes manual override (textEdit)",
      "Switch verb => same box, different text (notesByVerb)",
      "Reload page => per-verb text persisted (autosave)",
      "PDF current (btnPdfCurrent)",
      "PDF all (btnPdfAll)",
      "Cards PDF current (btnPdfCardsCurrent)",
      "Cards PDF all (btnPdfCardsAll)",
      "Cards Export list JSON (btnExportCards)",
      "Undo/Redo via hotkeys (Ctrl+Z / Ctrl+Y)",
      "History panel (История) => click item to rollback",
      "Reset (btnReset)",
      "Delete selected box with Delete key (and notes cleanup)",
      "Admin: Run smoke test (⚙)",
      "Presets: switch preset (🧩) => layout changes, data stays bound",
    ],
  },
};
