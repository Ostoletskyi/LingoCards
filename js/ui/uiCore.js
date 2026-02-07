// js/ui/uiCore.js

import { featureLangSwitch } from "./features/langSwitch.js";
import { featureEditorBasic } from "./features/editorBasic.js";
import { featureRulersGrid } from "./features/rulersGrid.js";
import { featureEditMode } from "./features/editMode.js";
import { featureCardSize } from "./features/cardSize.js";
import { featureCards } from "./features/cards.js";
import { featureCardsSidebar } from "./features/cardsSidebar.js";

import { featureVerbsListPanel } from "./features/verbsListPanel.js";
import { featurePdfExport } from "./features/pdfExport.js";
import { featureHistory } from "./features/history.js";
import { installDeleteBoxHotkey } from "./features/deleteBox.js";
import { featureHelpGuide } from "./features/helpGuide.js";
import { featureSearch } from "./features/search.js";
import { DEBUG } from "../app/app_parts/constants.js";

export function initUI(ctx){
  const { log } = ctx;

  // Map button ids to top-bar groups (keeps desktop layout tidy)
  const groupById = {
    btnEdit: "edit",
    btnNewBlock: "edit",
    btnDeleteBlock: "edit",

    btnCardSize: "cards",
    btnHistory: "cards",

    btnRulers: "view",
    btnGridStep: "view",
    btnSnap: "view",
  };

  function pickTopGroup(btn){
    const g = btn?.dataset?.group || groupById[btn?.id] || "view";
    return g;
  }

  const api = {
    addTopButton(btn){
      const groupHosts = ctx.shell?.groupHosts || ctx.shell?.topActions?.__lcGroupHosts || ctx.shell?.mountTopBar?.__lcGroupHosts;
      const g = pickTopGroup(btn);

      if (groupHosts && groupHosts[g]) {
        groupHosts[g].appendChild(btn);
      } else {
        // fallback
        ctx.shell.topActions.appendChild(btn);
      }
    },
    setStatus(text){
      ctx.shell.statusText.textContent = text || "";
    },

    // Persistent card badge on the right side of status bar
    setCardBadge(text){
      if (!ctx.shell.cardBadge) return;
      ctx.shell.cardBadge.textContent = text || "";
    },
    setEditBadge(on){
      ctx.shell.editBadge.classList.toggle("on", !!on);
      ctx.shell.editBadge.classList.toggle("off", !on);
      ctx.shell.editBadge.textContent = on
        ? ctx.i18n.t("ui.status.editingOn")
        : ctx.i18n.t("ui.status.editingOff");
    },
    setRulersStatus(on){
      api.setStatus(on ? ctx.i18n.t("ui.status.rulersOn") : ctx.i18n.t("ui.status.rulersOff"));
    },
    setSnapStatus(on){
      api.setStatus(on ? ctx.i18n.t("ui.status.snapOn") : ctx.i18n.t("ui.status.snapOff"));
    },
  };

  ctx.ui = api;

  // IMPORTANT: Features must share the SAME ctx object.
  // Copying via `{...ctx}` breaks cross-feature wiring (e.g. pdfExport installs ctx.pdfL
  // on its own copy, while verbsListPanel sees a different ctx instance → PDF buttons "do nothing").
  const ctxRuntime = ctx;
  ctxRuntime.ui = api;

  const registry = [
    featureLangSwitch(),
    featureEditMode(),
    featureCards(),
    featureCardsSidebar(),
    featureCardSize(),
    featureHistory(),
    featureVerbsListPanel(),  // ✅ Шаг 3
    featureSearch(),          // ✅ Поиск по левому/правому списку
    featureHelpGuide(),
    featureEditorBasic(),
    featureRulersGrid(),
    featurePdfExport(),
    // Delete key removes selected box (and cleans notesByVerb)
    { id: "deleteBoxHotkey", install: (ctx2) => installDeleteBoxHotkey(ctx2) },
  ];

  if (DEBUG){
    window.LC_DIAG = window.LC_DIAG || {};
    window.LC_DIAG.ui = () => ({ hasUI: true, features: registry.map(f => f.id) });
    window.LC_DIAG.uiRegistry = registry.map(f => f?.id || "unknown");
    window.LC_DIAG.smokeUI = runRegistrySmoke(registry);
    window.LC_DIAG.uiRuntime = { installed: [], failed: [] };
  }

  function runRegistrySmoke(registry){
    const rep = {
      ts: Date.now(),
      total: registry.length,
      passed: [],
      failed: [],
    };

    for (const f of registry){
      if (!f || typeof f !== "object"){
        rep.failed.push({ id: "unknown", stage: "shape", err: "feature is not an object" });
        continue;
      }
      if (!f.id || typeof f.id !== "string"){
        rep.failed.push({ id: "unknown", stage: "shape", err: "missing feature.id" });
        continue;
      }
      if (typeof f.install !== "function"){
        rep.failed.push({ id: f.id, stage: "shape", err: "missing feature.install()" });
        continue;
      }
      rep.passed.push(f.id);
    }

    return rep;
  }

  for (const f of registry){
    try {
      // Install into the shared runtime context.
      f.install(ctxRuntime);
      log.info("Feature installed", { id: f.id });

      // ✅ фиксируем успех
      if (DEBUG && window.LC_DIAG?.smokeUI){
        window.LC_DIAG.smokeUI.installed = window.LC_DIAG.smokeUI.installed || [];
        window.LC_DIAG.smokeUI.installed.push(f.id);
		window.LC_DIAG?.uiRuntime?.installed?.push(f.id);
      }
    } catch (e){
      const err = String(e?.stack ?? e);
      log.error("Feature install failed", { id: f.id, err });

      // ✅ фиксируем падение
      if (DEBUG && window.LC_DIAG?.smokeUI){
        window.LC_DIAG.smokeUI.failed = window.LC_DIAG.smokeUI.failed || [];
        window.LC_DIAG.smokeUI.failed.push({ id: f?.id || "unknown", stage: "install", err });
		window.LC_DIAG?.uiRuntime?.failed?.push({ id: f?.id || "unknown", err });
      }
    }
  }
  if (DEBUG && window.LC_DIAG){
    window.LC_DIAG.runSmokeUI = () => {
      const rep = runRegistrySmoke(registry);
      rep.installed = (window.LC_DIAG?.smokeUI?.installed) || [];
      rep.failed = (window.LC_DIAG?.smokeUI?.failed) || rep.failed;
      window.LC_DIAG.smokeUI = rep;
      return rep;
    };
  }


  api.setEditBadge(!!ctx.state?.editing);
}
