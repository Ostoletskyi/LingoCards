// js/ui/presetsPanel.js
// Presets panel + bind-profiles for verb cards.
//
// Profiles:
// - Default  : do nothing (user layout)
// - Mini     : auto layout from verb JSON (inf + meanings + formsLine)
// - Compact  : auto layout + examples
// - Full     : auto layout all available fields
//
// Custom presets (saved by user) remain supported.

import { buildBoxesFromVerbSample } from "../data/autoLayoutFromVerb.js";
import { log } from "../utils/log.js";

const PRESETS_KEY = "LC_NEXT_PRESETS_V1";
// Backward compatibility: older builds used different keys.
const LEGACY_PRESET_KEYS = [
  "LC_NEXT_PRESETS",        // very old
  "LC_NEXT_PRESETS_V0",     // old
  "LC_PRESETS_V1",          // alternative name
];
const PRESET_UI_VERSION = 1;

const PROFILE_KEY = "LC_NEXT_BIND_PROFILE_V1";
const PROFILES = ["default", "mini", "compact", "full"];

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") Object.assign(n.style, v);
    // React-like convenience: allow using `className` in attrs.
    else if (k === "className") n.setAttribute("class", String(v));
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, String(v));
  }
  for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}

function safeJson(x) {
  try { return JSON.stringify(x, null, 2); } catch (e) { log.warn("presets stringify failed", { err: String(e) }); return "{}"; }
}

function downloadText(filename, text, mime = "application/json;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 250);
}

function loadPresets() {
  try {
    // 1) current key
    let raw = localStorage.getItem(PRESETS_KEY);

    // 2) try legacy keys (migration)
    if (!raw) {
      for (const k of LEGACY_PRESET_KEYS) {
        const r = localStorage.getItem(k);
        if (r) { raw = r; break; }
      }
    }

    if (!raw) return {};
    const obj = JSON.parse(raw);

    // If it came from a legacy key, migrate to the current one (non-destructive).
    try {
      if (!localStorage.getItem(PRESETS_KEY)) localStorage.setItem(PRESETS_KEY, JSON.stringify(obj));
    } catch (e) { log.warn("presets migrate failed", { err: String(e) }); }

    return (obj && typeof obj === "object") ? obj : {};
  } catch (e) {
    log.warn("presets load failed", { err: String(e) });
    return {};
  }
}

function savePresets(presets) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch (e) { log.warn("presets save failed", { err: String(e) }); }
}

// ---------------------------------------------------------------------------
// Layout-only presets
// ---------------------------------------------------------------------------
// A preset is meant to re-apply a *layout* (boxes positions/sizes + bindings),
// not to replace the content of a card.
//
// Some code paths can attach cached/rendered content fields to boxes
// (e.g. 'text', 'value', 'lines', etc.). If such fields leak into presets,
// applying a preset will overwrite the card's words/examples/translations.
//
// We therefore sanitize box objects aggressively and keep only the
// layout/binding properties.
function sanitizeBoxForPreset(box) {
  if (!box || typeof box !== 'object') return null;

  // Allowed keys: geometry, identity, ordering, binding, and styling.
  var allowed = {
    id:1, kind:1, type:1, role:1, bind:1, bindKey:1, field:1,
    x:1, y:1, w:1, h:1,
    xMm:1, yMm:1, wMm:1, hMm:1,
    z:1, order:1,
    align:1, valign:1,
    fontPt:1, fontSizePt:1, fontFamily:1, fontWeight:1, fontStyle:1,
    lineHeight:1, letterSpacing:1,
    padding:1, paddingMm:1, radius:1,
    border:1, borderW:1, borderWidth:1, stroke:1,
    bg:1, background:1, fill:1, color:1, opacity:1,
    wrap:1, nowrap:1, maxLines:1, minLines:1,
    fit:1, autofit:1, autosize:1,
    locked:1, lock:1, hidden:1,
    group:1, groupId:1,
    notes:1, note:1
  };

  var out = {};
  for (var k in box) {
    if (!Object.prototype.hasOwnProperty.call(box, k)) continue;
    if (allowed[k]) out[k] = box[k];
  }

  // Ensure geometry fields exist (some older boxes use x/y/w/h).
  // We don't coerce, just keep what is present.
  if (!('id' in out) && box.id) out.id = box.id;

  return out;
}

function sanitizeBoxesForPreset(boxes) {
  if (!Array.isArray(boxes)) return [];
  var cleaned = [];
  for (var i=0;i<boxes.length;i++) {
    var b = sanitizeBoxForPreset(boxes[i]);
    if (b) cleaned.push(b);
  }
  return cleaned;
}

function pickSnapshot(state) {
  return {
    cardWmm: Number.isFinite(state?.cardWmm) ? state.cardWmm : 150,
    cardHmm: Number.isFinite(state?.cardHmm) ? state.cardHmm : 105,
    gridStepMm: Number.isFinite(state?.gridStepMm) ? state.gridStepMm : 10,
    boxes: sanitizeBoxesForPreset(state?.boxes),
  };
}

function normalizeImportedPresets(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.presets && typeof obj.presets === "object") return obj.presets;
  return obj;
}

function sanitizePreset(p) {
  if (!p || typeof p !== "object") return null;
  return {
    cardWmm: Number.isFinite(p.cardWmm) ? p.cardWmm : 150,
    cardHmm: Number.isFinite(p.cardHmm) ? p.cardHmm : 105,
    gridStepMm: Number.isFinite(p.gridStepMm) ? p.gridStepMm : 10,
    boxes: sanitizeBoxesForPreset(Array.isArray(p.boxes) ? p.boxes : []),
  };
}

function getSelectedVerb(ctxApp) {
  const verbs = ctxApp.state?.data?.verbs;
  const i = Number.isFinite(ctxApp.state?.selectedIndex) ? ctxApp.state.selectedIndex : 0;
  if (!Array.isArray(verbs) || !verbs.length) return null;
  return verbs[i] || null;
}

function loadProfile() {
  const p = String(localStorage.getItem(PROFILE_KEY) || "default").toLowerCase();
  return PROFILES.includes(p) ? p : "default";
}

function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, p); } catch (e) { log.warn("profile save failed", { err: String(e) }); }
}

function pillBtnStyle(active = false) {
  return {
    border: "1px solid rgba(255,255,255,0.18)",
    background: active ? "rgba(56,189,248,0.22)" : "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    borderRadius: "10px",
    padding: "8px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export function installPresetsPanel(ctxApp) {
  if (window.LC_PRESETS?.__installed) return window.LC_PRESETS;

  // hidden input for import
  const fileInput = el("input", {
    type: "file",
    accept: ".json,application/json",
    style: { display: "none" }
  });
  document.body.appendChild(fileInput);

  const panel = el("div", {
    id: "lcPresetsPanel",
    style: {
      position: "fixed",
      left: "50%",
      bottom: "54px",
      transform: "translateX(-50%)",
      width: "520px",
      maxWidth: "calc(100vw - 20px)",
      background: "rgba(20,20,20,0.92)",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "14px",
      boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
      zIndex: "9999",
      display: "none",
      overflow: "hidden",
      backdropFilter: "blur(8px)",
      color: "rgba(255,255,255,0.9)",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
    }
  });

  const header = el("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 12px",
      borderBottom: "1px solid rgba(255,255,255,0.10)",
    }
  });

  const title = el("div", { style: { fontWeight: "600" } }, ["Presets"]);
  const closeBtn = el("button", {
    type: "button",
    style: {
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.9)",
      borderRadius: "10px",
      padding: "6px 10px",
      cursor: "pointer",
    },
    onclick: () => api.hide(),
  }, ["Close"]);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = el("div", { style: { padding: "10px 12px" } });

  // --- Profiles row ---
  let currentProfile = loadProfile();

  const profRow = el("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" } });

  const profLabel = el("div", { style: { opacity: "0.8", marginRight: "6px" } }, ["Profile:"]);

  const btnDefault = el("button", { type: "button" }, ["Default"]);
  const btnMini = el("button", { type: "button" }, ["Mini"]);
  const btnCompact = el("button", { type: "button" }, ["Compact"]);
  const btnFull = el("button", { type: "button" }, ["Full"]);

  function refreshProfileButtons() {
    btnDefault.style = "";
    btnMini.style = "";
    btnCompact.style = "";
    btnFull.style = "";
    Object.assign(btnDefault.style, pillBtnStyle(currentProfile === "default"));
    Object.assign(btnMini.style, pillBtnStyle(currentProfile === "mini"));
    Object.assign(btnCompact.style, pillBtnStyle(currentProfile === "compact"));
    Object.assign(btnFull.style, pillBtnStyle(currentProfile === "full"));
  }

  function applyProfileNow(profile) {
    currentProfile = profile;
    saveProfile(profile);
    refreshProfileButtons();

    // If profile is not default -> rebuild boxes from current verb right now
    if (profile !== "default") {
      const v = getSelectedVerb(ctxApp);
      if (v) {
        const boxes = buildBoxesFromVerbSample(v, profile);
        ctxApp.setState({ boxes }, { clearSelection: true, debounceMs: 30 });
        ctxApp.ui?.setStatus?.(`Profile applied: ${profile}`);
      } else {
        ctxApp.ui?.setStatus?.(`Profile set: ${profile} (no verbs loaded yet)`);
      }
    } else {
      ctxApp.ui?.setStatus?.("Profile: default (user layout, no auto rebuild)");
    }
  }

  btnDefault.onclick = () => applyProfileNow("default");
  btnMini.onclick = () => applyProfileNow("mini");
  btnCompact.onclick = () => applyProfileNow("compact");
  btnFull.onclick = () => applyProfileNow("full");

  profRow.appendChild(profLabel);
  profRow.appendChild(btnDefault);
  profRow.appendChild(btnMini);
  profRow.appendChild(btnCompact);
  profRow.appendChild(btnFull);

  refreshProfileButtons();

  // Auto-apply the last active profile.
  // Contract: "default" means "keep user's manual layout";
  // any other profile means "rebuild layout from current verb".
  // Users expect the last chosen profile to be active without extra clicks.
  setTimeout(() => {
    try {
      if (currentProfile && currentProfile !== "default") {
        applyProfileNow(currentProfile);
      }
    } catch (e) { log.warn("applyProfileNow failed", { err: String(e) }); }
  }, 0);

  // --- Custom presets UI (save/import/export/list) ---
  const row1 = el("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px" } });

  const nameInput = el("input", {
    type: "text",
    placeholder: "preset name (e.g. my_default_layout)",
    style: {
      flex: "1",
      padding: "8px 10px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.9)",
      outline: "none",
    }
  });

  const btnSave = el("button", {
    type: "button",
    className: "lc-btn lc-btn-action",
    onclick: () => {
      const name = (nameInput.value || "").trim();
      if (!name) return;
      presets[name] = pickSnapshot(ctxApp.state);
      savePresets(presets);
      renderList();
      ctxApp.ui?.setStatus?.(`Preset saved: ${name}`);
    }
  }, ["Save current"]);

  const btnResetAutosave = el("button", {
    type: "button",
    id: "btnResetAutosave",
    className: "lc-btn lc-btn-danger",
    "data-tip": "Очистить автосохранение (последнее состояние) — перезагрузите страницу",
    onclick: () => {
      try {
        const key = window.LC_DIAG?.meta?.autosaveKey || "LC_NEXT_STATE_V1";
        localStorage.removeItem(key);
        ctxApp.ui?.setStatus?.("Autosave cleared. Reload page to reset.");
      } catch (e) { log.warn("autosave clear failed", { err: String(e) }); }
    }
  }, ["Clear autosave"]);

  // Cache reset helpers (requested):
  // - "Reset state" clears autosave/state, but keeps presets.
  // - "Reset all" clears *everything* LingoCard stored in localStorage.
  const btnResetState = el("button", {
    type: "button",
    id: "btnResetState",
    className: "lc-btn lc-btn-warn",
    "data-tip": "Сбросить текущее состояние карточек, не удаляя шаблоны",
    onclick: () => {
      try {
        const autosaveKey = window.LC_DIAG?.meta?.autosaveKey || "LC_NEXT_STATE_V1";
        const keys = Object.keys(localStorage);
        for (const k of keys){
          const kk = String(k);
          if (kk === autosaveKey) localStorage.removeItem(kk);
          if (kk.startsWith("LC_NEXT_STATE_")) localStorage.removeItem(kk);
          if (kk === "LC_NEXT_STATE_V1" || kk === "LC_NEXT_STATE_V2") localStorage.removeItem(kk);
        }
        ctxApp.ui?.setStatus?.("State cache cleared (presets kept). Reloading...");
        setTimeout(() => location.reload(), 150);
      } catch(e){
        ctxApp.ui?.setStatus?.("Failed to clear state cache.");
      }
    }
  }, ["Reset state"]);

  const btnResetAll = el("button", {
    type: "button",
    id: "btnResetAll",
    className: "lc-btn lc-btn-danger",
    "data-tip": "Удаляет состояние и шаблоны (необратимо)",
    onclick: () => {
      const ok = confirm("This will delete ALL LingoCard saved data (including presets). Continue?");
      if (!ok) return;
      try {
        const keys = Object.keys(localStorage);
        for (const k of keys){
          const kk = String(k);
          if (kk.startsWith("LC_NEXT_")) localStorage.removeItem(kk);
          if (kk === "LC_lang") localStorage.removeItem(kk);
        }
        ctxApp.ui?.setStatus?.("All local data cleared. Reloading...");
        setTimeout(() => location.reload(), 150);
      } catch(e){
        ctxApp.ui?.setStatus?.("Failed to clear all data.");
      }
    }
  }, ["Reset all"]);

  row1.appendChild(nameInput);
  row1.appendChild(btnSave);
  row1.appendChild(btnResetAutosave);

  const row2 = el("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px" } });

  const btnImport = el("button", {
    type: "button",
    className: "lc-btn lc-btn-import",
    onclick: () => fileInput.click(),
  }, ["Import presets (.json)"]);

  const btnExportAll = el("button", {
    type: "button",
    className: "lc-btn lc-btn-export",
    onclick: () => {
      const meta = window.LC_DIAG?.meta || {};
      const payload = {
        kind: "lingocard-presets",
        version: PRESET_UI_VERSION,
        exportedAt: new Date().toISOString(),
        appTag: meta.tag || "dev",
        commit: meta.commit || "",
        presets,
      };
      const fn = `lingocard_presets_${(meta.tag || "dev").replace(/[^\w.-]+/g, "_")}.json`;
      downloadText(fn, safeJson(payload));
      ctxApp.ui?.setStatus?.(`Exported presets: ${Object.keys(presets).length}`);
    }
  }, ["Export all"]);

  row2.appendChild(btnImport);
  row2.appendChild(btnExportAll);

  const row3 = el("div", {
    style: {
      display: "flex",
      gap: "10px",
      alignItems: "center",
      flexWrap: "wrap",
      justifyContent: "flex-start",
    }
  });
  row3.appendChild(btnResetState);
  row3.appendChild(btnResetAll);

  const list = el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      maxHeight: "240px",
      overflow: "auto",
      padding: "8px",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
    }
  });

  body.appendChild(profRow);
  body.appendChild(row1);
  body.appendChild(row2);
  body.appendChild(row3);
  body.appendChild(list);

  panel.appendChild(header);
  panel.appendChild(body);
  document.body.appendChild(panel);

  let presets = loadPresets();

  function applyPreset(name) {
    const p = presets[name];
    if (!p) return;

    // applying custom preset implicitly means: go Default profile
    applyProfileNow("default");

    const keepData = ctxApp.state?.data;
    const keepIndex = Number.isFinite(ctxApp.state?.selectedIndex) ? ctxApp.state.selectedIndex : 0;

    ctxApp.setState({
      cardWmm: p.cardWmm,
      cardHmm: p.cardHmm,
      gridStepMm: p.gridStepMm,
      boxes: Array.isArray(p.boxes) ? p.boxes : [],
      data: keepData,
      selectedIndex: keepIndex,
    }, { clearSelection: true, debounceMs: 30 });

    ctxApp.ui?.setStatus?.(`Preset applied: ${name}`);
  }

  function deletePreset(name) {
    delete presets[name];
    savePresets(presets);
    renderList();
    ctxApp.ui?.setStatus?.(`Preset deleted: ${name}`);
  }

  function exportOne(name) {
    const p = presets[name];
    if (!p) return;
    const meta = window.LC_DIAG?.meta || {};
    const payload = {
      kind: "lingocard-presets",
      version: PRESET_UI_VERSION,
      exportedAt: new Date().toISOString(),
      appTag: meta.tag || "dev",
      commit: meta.commit || "",
      presets: { [name]: p },
    };
    const fn = `preset_${name.replace(/[^\w.-]+/g, "_")}.json`;
    downloadText(fn, safeJson(payload));
    ctxApp.ui?.setStatus?.(`Exported preset: ${name}`);
  }

  function renderList() {
    list.innerHTML = "";
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
    if (!names.length) {
      list.appendChild(el("div", { style: { opacity: "0.75", padding: "8px" } }, ["No custom presets yet. Save current layout or import."]));
      return;
    }

    for (const name of names) {
      const row = el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } });
      const label = el("div", { style: { flex: "1", opacity: "0.92" } }, [name]);

      const btnApply = el("button", {
        type: "button",
        style: {
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.9)",
          borderRadius: "10px",
          padding: "6px 10px",
          cursor: "pointer",
        },
        onclick: () => applyPreset(name),
      }, ["Apply"]);

      const btnExport = el("button", {
        type: "button",
        style: {
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.9)",
          borderRadius: "10px",
          padding: "6px 10px",
          cursor: "pointer",
        },
        onclick: () => exportOne(name),
      }, ["Export"]);

      const btnDel = el("button", {
        type: "button",
        style: {
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.9)",
          borderRadius: "10px",
          padding: "6px 10px",
          cursor: "pointer",
        },
        onclick: () => deletePreset(name),
      }, ["Delete"]);

      row.appendChild(label);
      row.appendChild(btnApply);
      row.appendChild(btnExport);
      row.appendChild(btnDel);
      list.appendChild(row);
    }
  }

  async function importFromFile(file) {
    if (!file) return;
    let parsed = null;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch (e) {
      log.warn("presets import failed", { err: String(e) });
      ctxApp.ui?.setStatus?.("Import failed: invalid JSON");
      return;
    }

    const incoming = normalizeImportedPresets(parsed);
    if (!incoming || typeof incoming !== "object") {
      ctxApp.ui?.setStatus?.("Import failed: no presets object");
      return;
    }

    let added = 0;
    let updated = 0;

    for (const [name, p] of Object.entries(incoming)) {
      const clean = sanitizePreset(p);
      if (!clean) continue;
      if (presets[name]) updated++;
      else added++;
      presets[name] = clean;
    }

    savePresets(presets);
    renderList();
    ctxApp.ui?.setStatus?.(`Imported presets: +${added}, updated: ${updated}`);
  }

  fileInput.addEventListener("change", async () => {
    try {
      const f = fileInput.files && fileInput.files[0];
      await importFromFile(f);
    } finally {
      fileInput.value = "";
    }
  });

  renderList();

  const api = {
    __installed: true,

    // Called by verbsListPanel when selected verb changes
    onVerbChanged() {
      if (currentProfile === "default") return;
      const v = getSelectedVerb(ctxApp);
      if (!v) return;
      const boxes = buildBoxesFromVerbSample(v, currentProfile);
      ctxApp.setState({ boxes }, { clearSelection: true, debounceMs: 30 });
    },

    show() {
      presets = loadPresets();
      renderList();
      currentProfile = loadProfile();
      refreshProfileButtons();
      panel.style.display = "block";
    },
    hide() { panel.style.display = "none"; },
    toggle() {
      (panel.style.display === "none" || !panel.style.display) ? api.show() : api.hide();
    },
  };

  window.LC_PRESETS = api;
  return api;
}
