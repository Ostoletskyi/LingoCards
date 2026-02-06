// js/pdf/pdfL.js
// Left-side PDF adapter: exports from the verbs/source list.

import { renderCard } from "../render/renderCard.js";
import { createPdfCore } from "./pdfCore.js";

export function createPdfL(ctx){
  const core = createPdfCore();

  function renderSync(){
    renderCard(core.getCtxAppOrThrow());
  }

  function setVerbIndexSync(ctxApp, i){
    if (typeof ctxApp.setState === "function"){
      if ("selectedVerbIndex" in ctxApp.state) ctxApp.setState({ selectedVerbIndex: i });
      else if ("selectedIndex" in ctxApp.state) ctxApp.setState({ selectedIndex: i });
      else ctxApp.state.selectedVerbIndex = i;
    } else {
      if ("selectedVerbIndex" in ctxApp.state) ctxApp.state.selectedVerbIndex = i;
      else if ("selectedIndex" in ctxApp.state) ctxApp.state.selectedIndex = i;
      else ctxApp.state.selectedVerbIndex = i;
    }
  }

  function getVerbIndex(ctxApp){
    if (Number.isFinite(ctxApp.state.selectedVerbIndex)) return ctxApp.state.selectedVerbIndex;
    if (Number.isFinite(ctxApp.state.selectedIndex)) return ctxApp.state.selectedIndex;
    return 0;
  }

  return Object.freeze({
    exportCurrent(opts = {}){
      const ctxApp = core.getCtxAppOrThrow();
      const prevMode = ctxApp.state.viewMode;
      try {
        ctxApp.state.viewMode = "source";
        core.ensurePreviewCommittedSync(ctxApp, renderSync);

        let page = null;
        core.withPdfModeSync(ctxApp, () => {
          renderSync();
          page = core.captureCurrentCardAsJpeg({ canvasId: "lcCardCanvas" });
        });

        const pdf = core.buildPdfFromJpegs([page]);
        window.LC_DIAG.lastPdfExportMeta = { kind: "verbs-one", pages: 1, ts: Date.now() };
        core.downloadBytesSafe(pdf, opts.fileName || "lingocard_verbs_current.pdf");
      } finally {
        ctxApp.state.viewMode = prevMode;
        renderSync();
      }
    },

    exportAll(opts = {}){
      const ctxApp = core.getCtxAppOrThrow();
      const st = ctx?.state || ctxApp.state;
      const verbs = Array.isArray(st?.verbs) ? st.verbs : (Array.isArray(st?.data?.verbs) ? st.data.verbs : []);

      const prevMode = ctxApp.state.viewMode;
      const oldIndex = getVerbIndex(ctxApp);
      const pages = [];

      try {
        ctxApp.state.viewMode = "source";
        core.ensurePreviewCommittedSync(ctxApp, renderSync);

        core.withPdfModeSync(ctxApp, () => {
          if (!verbs.length){
            renderSync();
            pages.push(core.captureCurrentCardAsJpeg({ canvasId: "lcCardCanvas" }));
            return;
          }

          for (let i=0; i<verbs.length; i++){
            setVerbIndexSync(ctxApp, i);
            renderSync();
            pages.push(core.captureCurrentCardAsJpeg({ canvasId: "lcCardCanvas" }));
          }

          setVerbIndexSync(ctxApp, oldIndex);
          renderSync();
        });

        const pdf = core.buildPdfFromJpegs(pages);
        window.LC_DIAG.lastPdfExportMeta = { kind: "verbs-all", pages: pages.length, ts: Date.now() };
        core.downloadBytesSafe(pdf, opts.fileName || "lingocard_verbs_all.pdf");
      } finally {
        ctxApp.state.viewMode = prevMode;
        setVerbIndexSync(ctxApp, oldIndex);
        renderSync();
      }
    },
  });
}
