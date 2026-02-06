// js/diag/smokeTest.js
import { CONTRACT } from "../contract.js";

/**
 * Convert "js/app/app.js" -> "../app/app.js"  (because we are in js/diag/)
 */
function toImportPath(p) {
  const s = String(p || "").replace(/\\/g, "/");
  if (!s.startsWith("js/")) return s;
  return "../" + s.slice(3);
}

function ok(name, details) { return { name, ok: true, details: details || "" }; }
function fail(name, details) { return { name, ok: false, details: details || "" }; }

export async function runSmokeTest() {
  const results = [];
  const startedAt = new Date().toISOString();

  // 1) DOM ids
  const ids = CONTRACT?.dom?.requiredIds || [];
  for (const id of ids) {
    const el = document.getElementById(id);
    results.push(el ? ok(`DOM id #${id}`) : fail(`DOM id #${id}`, "not found"));
  }

  // 1b) Optional UI ids (warn-only)
  const opt = CONTRACT?.dom?.optionalIds || [];
  for (const id of opt){
    const el = document.getElementById(id);
    results.push(el ? ok(`DOM id (opt) #${id}`) : ok(`DOM id (opt) #${id}`, "not found (ok)"));
  }

  // 2) Version file existence (soft)
  // (we only check module import later indirectly; here just basic)
  results.push(ok("Baseline: contract loaded"));

  // 3) Module exports check
  const mods = CONTRACT?.modules || {};
  const moduleEntries = Object.entries(mods);

  for (const [path, exportsList] of moduleEntries) {
    const ip = toImportPath(path);
    try {
      const m = await import(ip);

      // exportsList: ["initApp"] or ["default"] etc.
      for (const ex of exportsList) {
        if (ex === "default") {
          results.push((m && "default" in m) ? ok(`Export default: ${path}`) : fail(`Export default: ${path}`, "missing default export"));
        } else {
          results.push((m && typeof m[ex] !== "undefined") ? ok(`Export ${ex}: ${path}`) : fail(`Export ${ex}: ${path}`, "missing export"));
        }
      }
    } catch (e) {
      results.push(fail(`Import: ${path}`, String(e)));
    }
  }

  // 4) i18n keys (optional)
  const mustKeys = CONTRACT?.ui?.i18nMustHaveKeys || [];
  if (mustKeys.length) {
    // If you expose i18n on window.LC_DIAG later, we can do deeper checks.
    results.push(ok("i18n keys: skipped (no runtime hook)"));
  }

  // 5) Runtime state sanity (notesByVerb)
  try {
    const st = window.LC_DIAG?.getState?.();
    const hist = window.LC_DIAG?.history?.();
    if (st) {
      const nbvOk = !!st.notesByVerb && typeof st.notesByVerb === "object";
      results.push(nbvOk ? ok("State: notesByVerb present") : fail("State: notesByVerb present", "missing notesByVerb"));

      // Manual boxes (no bind) should have textMode so their text is not shared across verbs
      const boxes = Array.isArray(st.boxes) ? st.boxes : [];
      const manual = boxes.filter(b => !b?.bind);
      const missing = manual.filter(b => !b?.textMode);
      if (manual.length) {
        results.push(missing.length === 0
          ? ok("Boxes: textMode set for manual", `count=${manual.length}`)
          : fail("Boxes: textMode set for manual", `missing=${missing.length}`));
      } else {
        results.push(ok("Boxes: textMode set for manual", "skipped (no manual boxes yet)"));
      }
    } else {
      results.push(ok("State: notesByVerb present", "skipped (LC_DIAG.getState unavailable)"));
    }

    // History (optional, but expected)

    // Tooltip element
    const tipEl = document.getElementById("lcTooltip");
    results.push(tipEl ? ok("UI: lcTooltip present") : fail("UI: lcTooltip present", "not found"));
    if (hist) {
      const limitOk = Number(hist?.limit) === 20;
      results.push(limitOk ? ok("History: limit=20") : fail("History: limit=20", `got=${hist?.limit}`));
      const pastOk = Array.isArray(hist?.past);
      results.push(pastOk ? ok("History: past array") : fail("History: past array", "missing"));
    } else {
      results.push(ok("History: available", "skipped (LC_DIAG.history unavailable)"));
    }
  } catch (e) {
    results.push(fail("State: runtime sanity", String(e)));
  }

  const okCount = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;

  return {
    startedAt,
    ok: failCount === 0,
    okCount,
    failCount,
    results,
  };
}
