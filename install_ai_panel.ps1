<#
install_ai_panel.ps1
Creates ai/ module and patches ONE existing file: js/ui/uiShell.js
- Writes UTF-8 without BOM
- Creates backup of patched file
- Idempotent: safe to re-run
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$Path, [string]$Content){
  $dir = Split-Path -Parent $Path
  if ($dir -and !(Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $enc = New-Object System.Text.UTF8Encoding($false) # no BOM
  [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function Read-Utf8([string]$Path){
  # Robust read: try UTF-8 first, fall back to default if needed
  try { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 } catch { return Get-Content -LiteralPath $Path -Raw }
}

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ROOT

if (!(Test-Path -LiteralPath (Join-Path $ROOT "index.html")) -or !(Test-Path -LiteralPath (Join-Path $ROOT "js"))){
  throw "Run this script from the LingoCard project root (where index.html and js/ exist)."
}

# ----------------------------
# 1) Create ai/ file tree
# ----------------------------
Write-Host "Creating ai/ module files..."

Write-Utf8NoBom (Join-Path $ROOT "ai\ai.entry.js") @'
// ai/ai.entry.js
// Single public entry point. Exposes window.AI_PANEL.open()/close().
// No dependencies on the legacy app state; runs in its own DOM sandbox.

import { createPanelController } from "./ai.panel.js";
import defaults from "./config/ai.defaults.json" assert { type: "json" };

let controller = null;

function ensureController(){
  if (controller) return controller;
  controller = createPanelController(defaults);
  return controller;
}

window.AI_PANEL = {
  open(){ ensureController().open(); },
  close(){ if (controller) controller.close(); },
  // Optional: for debugging
  _getState(){ return controller ? controller.getState() : null; }
};
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\ai.panel.js") @'
// ai/ai.panel.js
import { createAIManager } from "./core/ai.manager.js";
import { renderPanel } from "./ui/view.js";
import { bindPanelEvents } from "./ui/events.js";

const LS_KEY = "LC_AI_PANEL_STATE";
const LS_TTL_MS_DEFAULT = 10 * 60 * 1000; // 10 minutes

function now(){ return Date.now(); }

function loadCachedState(ttlMs){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    if (!obj.ts || (now() - obj.ts) > ttlMs){
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return obj.state || null;
  }catch(_){
    return null;
  }
}

function saveCachedState(state){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify({ ts: now(), state }));
  }catch(_){}
}

function ensureStyles(){
  const id = "ai-panel-styles";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = new URL("./ai.styles.css", import.meta.url).href;
  document.head.appendChild(link);
}

function ensureHost(){
  let host = document.getElementById("aiPanelHost");
  if (host) return host;

  host = document.createElement("div");
  host.id = "aiPanelHost";
  host.className = "ai-overlay";
  host.style.display = "none";
  host.innerHTML = `
    <div class="ai-modal" role="dialog" aria-modal="true" aria-labelledby="aiTitle">
      <div class="ai-header">
        <div class="ai-title">
          <div id="aiTitle" class="ai-title-main">🧠 AI Control Panel</div>
          <div id="aiSubtitle" class="ai-title-sub">LM Studio · localhost:1234 · OpenAI-compatible</div>
        </div>
        <button id="aiCloseBtn" class="ai-btn ai-btn-ghost" type="button" aria-label="Close">✕</button>
      </div>
      <div class="ai-body">
        <div id="aiStatusRow" class="ai-status-row"></div>
        <div class="ai-actions" id="aiActions"></div>
        <div class="ai-split">
          <div class="ai-card">
            <div class="ai-card-title">Models</div>
            <div id="aiModels" class="ai-mono ai-box"></div>
          </div>
          <div class="ai-card">
            <div class="ai-card-title">Log</div>
            <div id="aiLog" class="ai-mono ai-box"></div>
          </div>
        </div>
        <div class="ai-footer">
          <div class="ai-kv">
            <div><span class="ai-k">Endpoint:</span> <span id="aiEndpoint" class="ai-mono"></span></div>
            <div><span class="ai-k">Context:</span> <span id="aiContext" class="ai-mono"></span></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host);
  return host;
}

export function createPanelController(defaults){
  ensureStyles();
  const host = ensureHost();

  const ttlMs = Math.max(1000, defaults?.cacheTtlMs ?? LS_TTL_MS_DEFAULT);

  const initial = loadCachedState(ttlMs) || {
    endpoint: defaults?.endpoint || "http://localhost:1234/v1",
    status: { level: "unknown", text: "—" },
    models: [],
    log: [],
    context: defaults?.context || "auto (>= 8k, лучше 16k+)"
  };

  const manager = createAIManager({
    endpoint: initial.endpoint,
    timeoutMs: defaults?.timeoutMs ?? 4000,
    onLog: (line) => {
      state.log = [...state.log, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-250);
      saveCachedState(state);
      render();
    }
  });

  let state = initial;

  function render(){
    renderPanel(host, state);
  }

  function open(){
    host.style.display = "grid";
    render();

    // Bind events once per open (idempotent)
    bindPanelEvents(host, {
      close,
      setEndpoint: (ep) => {
        state.endpoint = ep;
        manager.setEndpoint(ep);
        manager.log(`Endpoint set to ${ep}`);
        saveCachedState(state);
        render();
      },
      checkLMStudio: async () => {
        manager.log("Check LM Studio: in a browser build, disk detection is not available. We'll test the API instead.");
        await testConnection();
      },
      installLMStudio: () => {
        manager.log("Opening LM Studio download page…");
        window.open("https://lmstudio.ai/", "_blank", "noopener,noreferrer");
      },
      downloadModel: () => {
        manager.log("Model download is handled inside LM Studio UI. Open LM Studio → Search → Download.");
        window.open("https://lmstudio.ai/", "_blank", "noopener,noreferrer");
      },
      startServer: () => {
        manager.log("Start AI Server: run LM Studio → 'Start Server' (OpenAI compatible) on port 1234.");
      },
      testConnection,
      refreshModels: async () => {
        await refreshModels();
      }
    });

    // Auto-refresh on open (non-blocking, but we do await to keep state consistent)
    testConnection().catch(() => {});
  }

  function close(){
    host.style.display = "none";
    saveCachedState(state);
  }

  async function testConnection(){
    state.status = { level: "pending", text: "Testing connection…" };
    render();
    const res = await manager.testConnection();
    state.status = res.status;
    state.models = res.models || [];
    saveCachedState(state);
    render();
  }

  async function refreshModels(){
    state.status = { level: "pending", text: "Loading models…" };
    render();
    const res = await manager.listModels();
    state.status = res.status;
    state.models = res.models || [];
    saveCachedState(state);
    render();
  }

  // Close on ESC / click outside
  function onKey(e){ if (e.key === "Escape") close(); }
  function onClick(e){ if (e.target === host) close(); }

  // Ensure listeners attached once
  if (!host.__aiBound){
    host.__aiBound = true;
    document.addEventListener("keydown", onKey);
    host.addEventListener("click", onClick);
  }

  // initial endpoint sync
  manager.setEndpoint(state.endpoint);

  return {
    open, close,
    getState: () => state
  };
}
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\ai.styles.css") @'
/* ai/ai.styles.css */
/* All classes prefixed with ai- to avoid conflicts. */

.ai-overlay{
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 20000;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
}

.ai-modal{
  width: min(980px, calc(100vw - 24px));
  max-height: min(740px, calc(100vh - 24px));
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(10,14,26,0.94);
  color: rgba(255,255,255,0.92);
  box-shadow: 0 22px 70px rgba(0,0,0,0.55);
  display: grid;
  grid-template-rows: auto 1fr;
}

.ai-header{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.12);
}

.ai-title-main{
  font-weight: 900;
  letter-spacing: .3px;
  font-size: 16px;
}

.ai-title-sub{
  font-weight: 700;
  opacity: .75;
  font-size: 12px;
  margin-top: 2px;
}

.ai-body{
  padding: 12px 14px 14px;
  overflow: auto;
}

.ai-status-row{
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.ai-pill{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  font-weight: 800;
  font-size: 12px;
}

.ai-dot{
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.35);
}

.ai-actions{
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.ai-btn{
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.92);
  padding: 8px 10px;
  border-radius: 12px;
  font-weight: 800;
  cursor: pointer;
  user-select: none;
}

.ai-btn:hover{ background: rgba(255,255,255,0.09); }
.ai-btn:active{ transform: translateY(1px); }

.ai-btn-primary{
  border-color: rgba(130,180,255,0.35);
  background: rgba(130,180,255,0.12);
}

.ai-btn-ghost{
  background: transparent;
  border-color: rgba(255,255,255,0.14);
}

.ai-split{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 820px){
  .ai-split{ grid-template-columns: 1fr; }
}

.ai-card{
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  border-radius: 16px;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.ai-card-title{
  font-weight: 900;
  letter-spacing: .2px;
}

.ai-box{
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.20);
  border-radius: 14px;
  padding: 10px;
  min-height: 160px;
  white-space: pre-wrap;
}

.ai-footer{
  margin-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.12);
  padding-top: 10px;
  opacity: .92;
}

.ai-kv{
  display: grid;
  gap: 4px;
  font-size: 12px;
}

.ai-k{ opacity: .7; font-weight: 800; margin-right: 6px; }

.ai-mono{
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
}
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\core\ai.client.js") @'
// ai/core/ai.client.js
export function createAIClient({ endpoint, timeoutMs = 4000 }){
  let base = endpoint.replace(/\/+$/,"");

  function setEndpoint(ep){ base = (ep || "").replace(/\/+$/,""); }

  async function fetchJson(path){
    const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try{
      const res = await fetch(url, { method: "GET", signal: ctrl.signal });
      const text = await res.text();
      let json = null;
      try{ json = JSON.parse(text); }catch(_){}
      return { ok: res.ok, status: res.status, json, text };
    }finally{
      clearTimeout(t);
    }
  }

  return {
    setEndpoint,
    getModels: () => fetchJson("/models")
  };
}
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\core\ai.status.js") @'
// ai/core/ai.status.js
export function statusFromModelsResponse(resp){
  if (!resp) return { level: "unknown", text: "Unknown" };

  if (resp.ok && resp.json && Array.isArray(resp.json.data)){
    return { level: "connected", text: "🟢 Connected" };
  }

  // Typical when LM Studio not running: fetch fails (handled elsewhere) or 404/500.
  if (!resp.ok){
    return { level: "not_running", text: "🟡 Not running" };
  }

  return { level: "unknown", text: "Unknown response" };
}
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\core\ai.manager.js") @'
// ai/core/ai.manager.js
import { createAIClient } from "./ai.client.js";
import { statusFromModelsResponse } from "./ai.status.js";

export function createAIManager({ endpoint, timeoutMs = 4000, onLog }){
  const client = createAIClient({ endpoint, timeoutMs });

  function log(msg){ try{ onLog && onLog(msg); }catch(_){} }

  function setEndpoint(ep){ client.setEndpoint(ep); }

  async function safeGetModels(){
    try{
      const resp = await client.getModels();
      return resp;
    }catch(e){
      // fetch throws on network errors / CORS / aborted
      return { ok: false, status: 0, json: null, text: String(e && e.message ? e.message : e) };
    }
  }

  async function testConnection(){
    log("GET /v1/models …");
    const resp = await safeGetModels();
    const status = statusFromModelsResponse(resp);

    if (resp.ok && resp.json && Array.isArray(resp.json.data)){
      const models = resp.json.data.map(m => m.id).filter(Boolean);
      log(`OK (${resp.status}). Models: ${models.length}`);
      return { status, models };
    }

    // Practical hints
    if (resp.status === 0){
      log("No response. Is LM Studio Server running on localhost:1234? Also check browser CORS or mixed-content.");
    }else{
      log(`HTTP ${resp.status}. Body: ${String(resp.text).slice(0, 200)}`);
    }
    return { status, models: [] };
  }

  async function listModels(){
    return testConnection();
  }

  return { setEndpoint, testConnection, listModels, log };
}
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\core\ai.detect.js") @'
// ai/core/ai.detect.js
// Browser build note:
// Real disk detection is only possible in a desktop shell (Electron/Node) or via a native helper.
// We keep this module as a placeholder to match the project architecture.

export function detectLMStudio(){
  return {
    supported: false,
    found: false,
    pathsTried: [
      "C:\\\\Program Files\\\\LM Studio\\\\",
      "C:\\\\Program Files (x86)\\\\LM Studio\\\\",
      "C:\\\\Users\\\\<USER>\\\\AppData\\\\Local\\\\LM Studio\\\\"
    ],
    hint: "Disk detection is not available in the browser build."
  };
}
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\ui\templates.js") @'
// ai/ui/templates.js
export function statusPill(status){
  const level = status?.level || "unknown";
  const text = status?.text || "—";
  const dotClass = {
    connected: "ai-dot ai-dot-green",
    not_running: "ai-dot ai-dot-yellow",
    not_installed: "ai-dot ai-dot-red",
    pending: "ai-dot ai-dot-gray",
    unknown: "ai-dot ai-dot-gray"
  }[level] || "ai-dot ai-dot-gray";

  // Dot color is set inline to keep CSS minimal and self-contained.
  const dotColor = {
    connected: "rgba(110, 255, 160, 0.85)",
    not_running: "rgba(255, 220, 120, 0.9)",
    not_installed: "rgba(255, 120, 120, 0.9)",
    pending: "rgba(180, 190, 255, 0.85)",
    unknown: "rgba(255,255,255,0.35)"
  }[level] || "rgba(255,255,255,0.35)";

  return `
    <div class="ai-pill" title="${text}">
      <span class="${dotClass}" style="background:${dotColor}"></span>
      <span>${text}</span>
    </div>
  `;
}

export function actionsTemplate(){
  return `
    <button class="ai-btn" id="aiBtnCheck" type="button">Check LM Studio</button>
    <button class="ai-btn" id="aiBtnInstall" type="button">Install LM Studio</button>
    <button class="ai-btn" id="aiBtnDownloadModel" type="button">Download Model</button>
    <button class="ai-btn" id="aiBtnStartServer" type="button">Start AI Server</button>
    <button class="ai-btn ai-btn-primary" id="aiBtnTest" type="button">Test Connection</button>
    <button class="ai-btn" id="aiBtnRefreshModels" type="button">Refresh Models</button>
  `;
}
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\ui\view.js") @'
// ai/ui/view.js
import { statusPill, actionsTemplate } from "./templates.js";

export function renderPanel(host, state){
  if (!host) return;

  const statusRow = host.querySelector("#aiStatusRow");
  const actions = host.querySelector("#aiActions");
  const modelsBox = host.querySelector("#aiModels");
  const logBox = host.querySelector("#aiLog");
  const ep = host.querySelector("#aiEndpoint");
  const ctx = host.querySelector("#aiContext");

  if (statusRow) statusRow.innerHTML = statusPill(state.status);
  if (actions && !actions.__aiRendered){
    actions.__aiRendered = true;
    actions.innerHTML = actionsTemplate();
  }

  if (ep) ep.textContent = state.endpoint || "";
  if (ctx) ctx.textContent = state.context || "auto";

  if (modelsBox){
    if (state.models && state.models.length){
      modelsBox.textContent = state.models.map(m => `• ${m}`).join("\n");
    }else{
      modelsBox.textContent = "—";
    }
  }

  if (logBox){
    const lines = (state.log && state.log.length) ? state.log : ["—"];
    logBox.textContent = lines.join("\n");
    // keep scroll to bottom
    logBox.scrollTop = logBox.scrollHeight;
  }

  // close button title
  const closeBtn = host.querySelector("#aiCloseBtn");
  if (closeBtn) closeBtn.title = "Close (Esc)";
}
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\ui\events.js") @'
// ai/ui/events.js
// Binds UI events. Designed to be safe to call multiple times.

export function bindPanelEvents(host, api){
  if (!host || host.__aiEventsBound) return;
  host.__aiEventsBound = true;

  const byId = (id) => host.querySelector(id);

  const closeBtn = byId("#aiCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", () => api.close());

  // Action buttons
  const map = [
    ["#aiBtnCheck", api.checkLMStudio],
    ["#aiBtnInstall", api.installLMStudio],
    ["#aiBtnDownloadModel", api.downloadModel],
    ["#aiBtnStartServer", api.startServer],
    ["#aiBtnTest", api.testConnection],
    ["#aiBtnRefreshModels", api.refreshModels]
  ];

  for (const [sel, fn] of map){
    const el = byId(sel);
    if (el && typeof fn === "function"){
      el.addEventListener("click", () => fn());
    }
  }
}
'@

Write-Utf8NoBom (Join-Path $ROOT "ai\config\ai.defaults.json") @'
{
  "endpoint": "http://localhost:1234/v1",
  "timeoutMs": 4000,
  "context": "auto (>= 8k, лучше 16k+)",
  "cacheTtlMs": 600000
}
'@

# ----------------------------
# 2) Patch js/ui/uiShell.js (single-file patch)
# ----------------------------
$uiShell = Join-Path $ROOT "js\ui\uiShell.js"
if (!(Test-Path -LiteralPath $uiShell)) { throw "Not found: $uiShell" }

$src = Read-Utf8 $uiShell

$marker = "const langHost = document.createElement(""div"");"
if ($src -notmatch [regex]::Escape($marker)) {
  throw "Patch marker not found in js/ui/uiShell.js. File layout changed."
}

# If already patched, skip.
if ($src -match "lcAiControlBtn") {
  Write-Host "uiShell.js already contains AI Control Panel button. Skipping patch."
} else {
  Write-Host "Patching js/ui/uiShell.js (adds one button + lazy loader)..."

  $insertion = @'

  // --- AI Control Panel (lazy-loaded, isolated module) ---
  const aiBtn = document.createElement("button");
  aiBtn.id = "lcAiControlBtn";
  aiBtn.className = "lc-btn lc-btn-sm";
  aiBtn.textContent = "🧠 AI Control Panel";
  aiBtn.title = "Open AI Control Panel";
  aiBtn.addEventListener("click", async () => {
    try{
      // If module not loaded yet, load it dynamically
      if (!window.AI_PANEL){
        const url = new URL("../../ai/ai.entry.js", import.meta.url).href;
        await import(url);
      }
      window.AI_PANEL?.open?.();
    }catch(e){
      console.error("AI panel load failed:", e);
      alert("AI Control Panel: load failed. Check console.");
    }
  });

  // Place near language controls (top right)
  topRight.appendChild(aiBtn);

'@

  # Insert right after langHost is created and configured, BEFORE appending viewHost/langHost.
  $pattern = [regex]::Escape('langHost.style.gap = "6px";')
$replace = 'langHost.style.gap = "6px";' + "`n" + $insertion
  $patched = [regex]::Replace($src, $pattern, $replace, 1)

  # Backup
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $bak = "$uiShell.bak_$stamp"
  Copy-Item -LiteralPath $uiShell -Destination $bak -Force
  Write-Host "Backup created: $bak"

  Write-Utf8NoBom $uiShell $patched
  Write-Host "Patch applied."
}

Write-Host ""
Write-Host "Done. Start your local server and click: 🧠 AI Control Panel"
Write-Host "Tip: LM Studio must run a server at http://localhost:1234/v1 (OpenAI compatible)."
