// js/ui/versionBadge.js
// Adds Version + Admin + Presets into the shared bottom dock (#lcBottomDock).
// No fixed positioning here: layout is handled by uiShell.js (buildShell).

import { APP_VERSION } from "../version.js";
import { log } from "../utils/log.js";

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

function getVersionText() {
  const tag = APP_VERSION?.tag ?? "dev";
  // Commercial badge: keep it short (version only). Details are in tooltip.
  return String(tag);
}

function pillStyle(isPrimary = false) {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    background: isPrimary ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.88)",
    borderRadius: "12px",
    padding: "3px 6px",
    minWidth: "24px",
    textAlign: "center",
    cursor: "pointer",
    userSelect: "none",
    lineHeight: "1",
    fontSize: "10px",
    whiteSpace: "nowrap",
  };
}

function getDock(ctxOrMounts) {
  // Prefer shell-provided dock (single source of truth)
  const fromShell = ctxOrMounts?.shell?.bottomDock;
  if (fromShell) return fromShell;

  // Fallback to DOM id
  const byId = document.getElementById("lcBottomDock");
  if (byId) return byId;

  // Last resort
  return document.getElementById("statusBar") || document.body;
}

function setActive(btn, on) {
  btn.style.boxShadow = on
    ? "0 0 0 2px rgba(34,197,94,0.55), 0 10px 30px rgba(34,197,94,0.12)"
    : "";
  btn.style.borderColor = on ? "rgba(34,197,94,0.65)" : "rgba(255,255,255,0.14)";
}

function isVisible(id) {
  const e = document.getElementById(id);
  return !!e && e.style.display !== "none";
}

export function installVersionBadge(ctxOrMounts) {
  const dock = getDock(ctxOrMounts);
  if (!dock) return;

  // Remove legacy fixed bar if present
  const old = document.getElementById("lcBottomMiniBar");
  if (old) old.remove();

  // Version badge (not a button)
  let badge = document.getElementById("lcVerDockBadge");
  if (!badge) {
    badge = el("div", {
      id: "lcVerDockBadge",
      style: { ...pillStyle(false), cursor: "default", opacity: "0.9" }
    }, [getVersionText()]);
    dock.appendChild(badge);
  } else {
    badge.textContent = getVersionText();
  }

  // Tooltip / legal line
  badge.setAttribute(
    "title",
    `${APP_VERSION?.app ?? "LingoCard Editor"} • ${APP_VERSION?.tag ?? "dev"}\n© 2026 Oleksii Ostoletskyi. All rights reserved.`
  );

  // Admin button
  let btnAdmin = document.getElementById("lcVerDockAdminBtn");
  if (!btnAdmin) {
    btnAdmin = el("button", {
      id: "lcVerDockAdminBtn",
      type: "button",
      style: pillStyle(true),
    }, ["⚙"]);
    dock.appendChild(btnAdmin);
  }
  btnAdmin.textContent = "⚙";
  btnAdmin.setAttribute("data-tip", "Админка");

  // Presets button
  let btnPresets = document.getElementById("lcVerDockPresetsBtn");
  if (!btnPresets) {
    btnPresets = el("button", {
      id: "lcVerDockPresetsBtn",
      type: "button",
      style: pillStyle(false),
    }, ["🧩"]);
    dock.appendChild(btnPresets);
  }
  btnPresets.textContent = "🧩";
  btnPresets.setAttribute("data-tip", "Пресеты");

  // Idempotent listeners (only once)
  if (!btnAdmin.dataset.bound) {
    btnAdmin.dataset.bound = "1";
    btnAdmin.onclick = () => {
      if (window.LC_ADMIN?.toggle) window.LC_ADMIN.toggle();
      else console.warn("LC_ADMIN not installed yet");
      setTimeout(refreshGlow, 0);
    };
    btnAdmin.onmouseenter = () => { btnAdmin.style.background = "rgba(255,255,255,0.08)"; };
    btnAdmin.onmouseleave = () => { btnAdmin.style.background = "rgba(255,255,255,0.06)"; };
  }

  if (!btnPresets.dataset.bound) {
    btnPresets.dataset.bound = "1";
    btnPresets.onclick = () => {
      if (window.LC_PRESETS?.toggle) window.LC_PRESETS.toggle();
      else console.warn("LC_PRESETS not installed yet (installPresetsPanel?)");
      setTimeout(refreshGlow, 0);
    };
    btnPresets.onmouseenter = () => { btnPresets.style.background = "rgba(255,255,255,0.08)"; };
    btnPresets.onmouseleave = () => { btnPresets.style.background = "rgba(255,255,255,0.04)"; };
  }

  function refreshGlow() {
    setActive(btnAdmin, isVisible("lcAdminPanel"));
    setActive(btnPresets, isVisible("lcPresetsPanel"));
  }

  refreshGlow();

  // Single timer (avoid multiple intervals on hot reload)
  if (!window.__LC_DOCK_GLOW_TIMER) {
    window.__LC_DOCK_GLOW_TIMER = setInterval(() => {
      try { refreshGlow(); } catch (e) { log.warn("dock glow refresh failed", { err: String(e) }); }
    }, 400);
  }
}
