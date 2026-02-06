// js/pdf/pdfR.js
// Right-side PDF adapter: exports user-created cards.

import { renderCard } from "../render/renderCard.js";
import { createPdfCore } from "./pdfCore.js";

export function createPdfR(ctx){
  const core = createPdfCore();

  function renderSync(){
    renderCard(core.getCtxAppOrThrow());
  }

  function switchCardSync(ctxApp, i){
    if (typeof ctxApp.cards?.switchTo === "function"){
      ctxApp.cards.switchTo(i);
      return;
    }
    if (typeof ctxApp.setState === "function"){
      ctxApp.setState({ selectedCardIndex: i });
      return;
    }
    ctxApp.state.selectedCardIndex = i;
  }

  function getCardIndex(ctxApp){
    return Number.isFinite(ctxApp.state.selectedCardIndex) ? ctxApp.state.selectedCardIndex : 0;
  }

  function getCardsFromState(st){
    const cards = Array.isArray(st?.data?.cards) ? st.data.cards : (Array.isArray(st?.cards) ? st.cards : []);
    return Array.isArray(cards) ? cards : [];
  }

  return Object.freeze({
    exportCurrent(opts = {}){
      const ctxApp = core.getCtxAppOrThrow();
      const prevMode = ctxApp.state.viewMode;
      const oldIndex = getCardIndex(ctxApp);
      const cards = getCardsFromState(ctx.state);

      if (!cards.length){
        // keep UX predictable: at least export current canvas
        core.ensurePreviewCommittedSync(ctxApp, renderSync);
        core.withPdfModeSync(ctxApp, () => {
          renderSync();
          const page = core.captureCurrentCardAsJpeg({ canvasId: "lcCardCanvas" });
          const pdf = core.buildPdfFromJpegs([page]);
          window.LC_DIAG.lastPdfExportMeta = { kind: "cards-one-empty", pages: 1, ts: Date.now() };
          core.downloadBytesSafe(pdf, opts.fileName || "lingocard_cards_current.pdf");
        });
        return;
      }

      try {
        ctxApp.state.viewMode = "cards";
        core.ensurePreviewCommittedSync(ctxApp, renderSync);

        core.withPdfModeSync(ctxApp, () => {
          const idx = getCardIndex(ctxApp);
          switchCardSync(ctxApp, idx);
          renderSync();
          const page = core.captureCurrentCardAsJpeg({ canvasId: "lcCardCanvas" });
          const pdf = core.buildPdfFromJpegs([page]);
          window.LC_DIAG.lastPdfExportMeta = { kind: "cards-one", pages: 1, ts: Date.now() };
          core.downloadBytesSafe(pdf, opts.fileName || "lingocard_cards_current.pdf");
        });
      } finally {
        ctxApp.state.viewMode = prevMode;
        switchCardSync(ctxApp, oldIndex);
        renderSync();
      }
    },

    exportAll(opts = {}){
      const ctxApp = core.getCtxAppOrThrow();
      const prevMode = ctxApp.state.viewMode;
      const oldIndex = getCardIndex(ctxApp);
      const cards = getCardsFromState(ctx.state);

      if (!cards.length){
        // fallback: one page of current view
        return this.exportCurrent({ fileName: opts.fileName || "lingocard_cards_all.pdf" });
      }

      try {
        ctxApp.state.viewMode = "cards";
        core.ensurePreviewCommittedSync(ctxApp, renderSync);

        core.withPdfModeSync(ctxApp, () => {
          const pages = [];
          for (let i=0; i<cards.length; i++){
            switchCardSync(ctxApp, i);
            renderSync();
            pages.push(core.captureCurrentCardAsJpeg({ canvasId: "lcCardCanvas" }));
          }

          switchCardSync(ctxApp, oldIndex);
          renderSync();

          const pdf = core.buildPdfFromJpegs(pages);
          window.LC_DIAG.lastPdfExportMeta = { kind: "cards-all", pages: pages.length, ts: Date.now() };
          core.downloadBytesSafe(pdf, opts.fileName || "lingocard_cards_all.pdf");
        });
      } finally {
        ctxApp.state.viewMode = prevMode;
        switchCardSync(ctxApp, oldIndex);
        renderSync();
      }
    },
  });
}
