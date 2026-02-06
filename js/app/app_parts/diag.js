// js/app/app_parts/diag.js

/** @typedef {import('./types.js').AppCtx} AppCtx */

import { loadVerbsFromFile } from "../../data/verbsLoad.js";
import { buildBoxesFromVerbSample } from "../../data/autoLayoutFromVerb.js";
import { APP_VERSION } from "../../version.js";
import { log } from "../../utils/log.js";
import { AUTOSAVE_KEY } from './constants.js';
import { saveAutosaveNow } from './autosave.js';

/** @param {AppCtx} ctx */
export function installDiag(ctx){
  const { state } = ctx;

  window.LC_DIAG = window.LC_DIAG || {};
  window.LC = window.LC_DIAG;
  // Convenience aliases for console debugging
  window.app = window.LC_DIAG; // legacy habit
  window.state = state; // quick peek; do NOT mutate in production

  // state snapshot
  window.LC_DIAG.getState = () => JSON.parse(JSON.stringify(state));
  window.LC_DIAG.history = () => ctx.history?.getDebug?.() || null;

  // ссылка на живой контекст приложения (нужно для тестовых ручек)
  window.LC_DIAG.ctxApp = ctx;

  window.LC_DIAG.lastRenderGeometry = null;
  window.LC_DIAG.lastPdfExportMeta = null;

  window.LC_DIAG.getLogBuffer = () => log.getBuffer?.() || [];
  window.LC_DIAG.getLastErrors = () => log.getErrors?.() || [];

  window.LC_DIAG.meta = {
    app: "LingoCard Editor",
    version: 1,
    builtAt: APP_VERSION?.build ?? new Date().toISOString(),
    tag: APP_VERSION?.tag ?? "dev",
    commit: APP_VERSION?.commit ?? "",
    build: APP_VERSION?.build ?? "local",
    autosaveKey: AUTOSAVE_KEY,
  };

  // Ручка Шага 1: загрузить JSON в state (БЕЗ UI)
  // ВАЖНО: используем ctx.setState, потому что у тебя нет dispatch/actions в этом слое.
  window.LC_DIAG.loadVerbsFile = async (file) => {
    const res = await loadVerbsFromFile(file);
    if (!res.ok){
      log.error("verbs.load failed", { error: res.error });
      return res;
    }

    // 1) кладём verbs
    ctx.setState({
      data: { verbs: res.verbs },
      selectedIndex: 0,
    }, { clearSelection: true });

    // 2) автоген боксов по первому глаголу (один раз после загрузки)
    try {
      const v0 = res.verbs?.[0];
      if (v0){
        const boxes = buildBoxesFromVerbSample(v0);
        ctx.setState({ boxes }, { clearSelection: true });
      }
    } catch (e) {
      log.warn("autoLayoutFromVerb failed", { err: String(e) });
    }

    ctx.requestRender();
    log.info("verbs loaded", { count: res.verbs.length });
    return res;
  };

  window.addEventListener("beforeunload", () => {
    saveAutosaveNow(state);
  });
}
