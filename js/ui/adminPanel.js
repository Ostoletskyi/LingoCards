// js/ui/adminPanel.js
import { runSmokeTest } from "../diag/smokeTest.js";

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") Object.assign(n.style, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, String(v));
  }
  for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
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

function safeJson(x) {
  try { return JSON.stringify(x, null, 2); } catch { return "{}"; }
}

function getAutosaveKey() {
  return window.LC_DIAG?.meta?.autosaveKey || "LC_NEXT_STATE_V1";
}

// ---------- Dock integration (NO fixed dock creation here) ----------

function getDock(ctxApp){
  // Preferred: dock from shell
  const fromShell = ctxApp?.shell?.bottomDock;
  if (fromShell) return fromShell;

  // Fallback: existing DOM dock
  const byId = document.getElementById("lcBottomDock");
  if (byId) return byId;

  // Last resort: status bar
  return document.getElementById("statusBar") || document.body;
}

function ensureAdminDockButton(ctxApp, api){
  // Если versionBadge уже создал кнопку — НЕ ДУБЛИРУЕМ
  const vb = document.getElementById("lcVerDockAdminBtn");
  if (vb) {
    // Просто гарантируем корректный обработчик
    vb.onclick = () => api.toggle();
    return vb;
  }

  const dock = getDock(ctxApp);

  let btn = document.getElementById("lcAdminDockBtn");
  if (!btn){
    btn = document.createElement("button");
    btn.id = "lcAdminDockBtn";
    btn.type = "button";
    btn.textContent = "Admin";

    // Минимальный стиль “в тон”, без навязывания фикс-позиционирования
    Object.assign(btn.style, {
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.88)",
      borderRadius: "999px",
      padding: "6px 10px",
      cursor: "pointer",
      userSelect: "none",
      lineHeight: "1",
      fontSize: "clamp(11px, 1.2vw, 13px)",
      whiteSpace: "nowrap",
    });

    dock.appendChild(btn);
  }

  btn.onclick = () => api.toggle();
  return btn;
}

// ------------------------------------------------------------------

export function installAdminPanel(ctxApp, mounts) {
  // Single instance
  if (window.LC_ADMIN?.__installed) return window.LC_ADMIN;

  // Удалим старый “самодельный” док, если он был создан старой версией
  // (чтобы дубли гарантированно ушли)
  const legacyDock = document.getElementById("lcBottomDock");
  // ВАЖНО: удаляем только если он выглядит как legacy (fixed + backdropFilter)
  // и при этом shell-док отсутствует.
  if (!ctxApp?.shell?.bottomDock && legacyDock?.style?.position === "fixed") {
    // можно оставить, но лучше убрать мусор, если он реально legacy
    // legacyDock.remove();
    // ⚠️ я не удаляю автоматически, чтобы не снести твой новый док, если он тоже с id lcBottomDock.
    // Поэтому просто ничего не создаём тут.
  }

  const panel = el("div", {
    id: "lcAdminPanel",
    style: {
      position: "fixed",
      top: "10px",
      right: "10px",
      width: "420px",
      maxWidth: "calc(100vw - 20px)",
      height: "calc(100vh - 20px)",
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

  const title = el("div", { style: { fontWeight: "600" } }, ["LingoCard Admin"]);
  const closeBtn = el("button", {
    style: {
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.9)",
      borderRadius: "10px",
      padding: "6px 10px",
      cursor: "pointer",
    },
    onclick: () => api.hide(),
    type: "button"
  }, ["Close"]);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = el("div", {
    style: { padding: "10px 12px", height: "calc(100% - 54px)", overflow: "auto" }
  });

  const section = (name) => el("div", { style: { marginBottom: "12px" } }, [
    el("div", { style: { opacity: "0.85", fontWeight: "600", marginBottom: "6px" } }, [name]),
  ]);

  // --- Version ---
  const sVer = section("Version");
  const verBox = el("pre", {
    style: {
      margin: "0",
      padding: "10px",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.10)",
      whiteSpace: "pre-wrap",
      overflow: "auto",
    }
  }, ["(no APP_VERSION yet)"]);
  sVer.appendChild(verBox);

  // --- Smoke test ---
  const sSmoke = section("Smoke test");
  const smokeBtn = el("button", {
    style: {
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.9)",
      borderRadius: "10px",
      padding: "8px 10px",
      cursor: "pointer",
      marginRight: "8px",
    },
    type: "button",
    onclick: async () => {
      smokeBtn.disabled = true;
      smokeBtn.textContent = "Running...";
      try {
        let rep = await runSmokeTest();
        rep = augmentSmokeWithUI(rep);
        renderSmoke(rep);
      } finally {
        smokeBtn.disabled = false;
        smokeBtn.textContent = "Run smoke test";
      }
    }
  }, ["Run smoke test"]);

  const smokeOut = el("div", {
    style: {
      marginTop: "10px",
      padding: "10px",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.10)",
      maxHeight: "260px",
      overflow: "auto",
      whiteSpace: "pre-wrap"
    }
  }, ["(not run yet)"]);

  function augmentSmokeWithUI(rep){
    const out = {
      ...rep,
      results: Array.isArray(rep.results) ? rep.results.slice() : [],
      okCount: rep.okCount || 0,
      failCount: rep.failCount || 0,
    };

    const reg = (() => {
      try {
        const u = window.LC_DIAG?.ui?.();
        const ids = u?.features;
        return Array.isArray(ids) ? ids : [];
      } catch {
        return [];
      }
    })();

    const runtime = window.LC_DIAG?.uiRuntime || { installed: [], failed: [] };
    const installed = Array.isArray(runtime.installed) ? runtime.installed : [];
    const failed = Array.isArray(runtime.failed) ? runtime.failed : [];

    {
      const ok = reg.length > 0;
      out.results.push({
        ok,
        name: "UI registry: features list",
        details: ok ? `count=${reg.length}` : "missing/empty (LC_DIAG.ui().features)",
      });
      ok ? out.okCount++ : out.failCount++;
    }

    {
      const ok = failed.length === 0;
      const details = ok
        ? `installed=${installed.length}`
        : `failed=${failed.length}: ` + failed.map(x => x.id).join(", ");
      out.results.push({ ok, name: "UI runtime: feature install", details });
      ok ? out.okCount++ : out.failCount++;
    }

    {
      const missing = reg.filter(id => !installed.includes(id));
      const ok = missing.length === 0;
      const details = ok ? "all registry features installed" : `missing: ${missing.join(", ")}`;
      out.results.push({ ok, name: "UI runtime: registry coverage", details });
      ok ? out.okCount++ : out.failCount++;
    }

    return out;
  }

  function renderSmoke(rep) {
    const lines = [];
    lines.push(`OK: ${rep.okCount}, FAIL: ${rep.failCount}`);
    lines.push(`startedAt: ${rep.startedAt}`);
    lines.push("");
    for (const r of rep.results) {
      lines.push(`${r.ok ? "✅" : "❌"} ${r.name}${r.details ? " — " + r.details : ""}`);
    }
    smokeOut.textContent = lines.join("\n");
  }

  sSmoke.appendChild(smokeBtn);
  sSmoke.appendChild(smokeOut);

  // --- Diagnostics ---
  const sDiag = section("Diagnostics");
  const diagBtn = el("button", {
    style: {
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.9)",
      borderRadius: "10px",
      padding: "8px 10px",
      cursor: "pointer",
      marginRight: "8px",
    },
    type: "button",
    onclick: () => refreshDiag()
  }, ["Refresh"]);

  const diagOut = el("pre", {
    style: {
      margin: "10px 0 0 0",
      padding: "10px",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.10)",
      whiteSpace: "pre-wrap",
      maxHeight: "200px",
      overflow: "auto",
    }
  }, ["(empty)"]);

  function refreshDiag() {
    const meta = window.LC_DIAG?.meta || {};
    const errors = window.LC_DIAG?.getLastErrors?.() || [];
    diagOut.textContent = safeJson({
      meta,
      lastErrors: errors.slice(-20),
    });
  }

  sDiag.appendChild(diagBtn);
  sDiag.appendChild(diagOut);

  // --- Backup ---
  const sBackup = section("Backup (state)");
  const btnAutosave = el("button", {
    style: {
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.9)",
      borderRadius: "10px",
      padding: "8px 10px",
      cursor: "pointer",
      marginRight: "8px",
    },
    type: "button",
    onclick: () => {
      const key = getAutosaveKey();
      const raw = localStorage.getItem(key) || "";
      const meta = window.LC_DIAG?.meta || {};
      const filename = `snapshot_autosave_${meta.tag || "dev"}_${(meta.commit || "").slice(0,8) || "local"}.json`;
      downloadText(filename, raw || "{}");
    }
  }, ["Download autosave.json"]);

  const btnPack = el("button", {
    style: {
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.9)",
      borderRadius: "10px",
      padding: "8px 10px",
      cursor: "pointer",
    },
    type: "button",
    onclick: () => {
      const meta = window.LC_DIAG?.meta || {};
      const key = getAutosaveKey();
      const pack = {
        meta,
        autosaveKey: key,
        autosave: (() => {
          try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
        })(),
        diag: {
          lastRenderGeometry: window.LC_DIAG?.lastRenderGeometry || null,
          lastPdfExportMeta: window.LC_DIAG?.lastPdfExportMeta || null,
          logBuffer: window.LC_DIAG?.getLogBuffer?.() || [],
          lastErrors: window.LC_DIAG?.getLastErrors?.() || [],
        },
      };
      const filename = `diag_pack_${meta.tag || "dev"}_${(meta.commit || "").slice(0,8) || "local"}.json`;
      downloadText(filename, safeJson(pack));
    }
  }, ["Download diag-pack.json"]);

  sBackup.appendChild(btnAutosave);
  sBackup.appendChild(btnPack);

  body.appendChild(sVer);
  body.appendChild(sSmoke);
  body.appendChild(sDiag);
  body.appendChild(sBackup);

  panel.appendChild(header);
  panel.appendChild(body);
  document.body.appendChild(panel);

  const api = {
    __installed: true,
    show() {
      panel.style.display = "block";
      verBox.textContent = safeJson(window.APP_VERSION || window.LC_DIAG?.meta || {});
      refreshDiag();
    },
    hide() { panel.style.display = "none"; },
    toggle() { (panel.style.display === "none" || !panel.style.display) ? api.show() : api.hide(); },
  };

  window.LC_ADMIN = api;

  // ✅ Вставляем кнопку только если её ещё нет в доке
  ensureAdminDockButton(ctxApp, api);

  return api;
}
