// js/data/exportPassport.js
// Small "passport" metadata added to exported JSON files.
// Purpose: make imports/merges safer by describing what was exported,
// from which list/scope, and which bind/scan mode was active.

import { APP_VERSION } from "../version.js";

export function makeExportPassport(ctx, extra = {}){
  const st = (ctx && (ctx.getState?.() || ctx.state)) || {};

  const tag = APP_VERSION?.tag ?? "dev";
  const commit = APP_VERSION?.commit ?? "";

  return {
    app: APP_VERSION?.app ?? "LingoCard Editor",
    tag,
    commit,
    build: APP_VERSION?.build ?? "local",
    exportedAt: new Date().toISOString(),

    // What exactly was exported
    kind: extra.kind ?? "",
    scope: extra.scope ?? "",
    schema: extra.schema ?? 1,

    // Current runtime context (helps auto-import routing)
    bindMode: st.bindMode ?? null,     // "canon" | "auto"
    bindScan: st.bindScan ?? null,     // object with scan details or null
    viewMode: st.viewMode ?? null,     // "source" | "cards" ...
  };
}
