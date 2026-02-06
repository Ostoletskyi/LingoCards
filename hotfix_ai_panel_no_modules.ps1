param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

$ROOT = (Resolve-Path ".").Path
$ui = Join-Path $ROOT "js\ui\uiShell.js"
if (!(Test-Path $ui)) { throw "Not found: $ui" }

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$bak = "$ui.bak_hotfix_$stamp"
Copy-Item -LiteralPath $ui -Destination $bak -Force
Write-Host "Backup: $bak"

$src = Get-Content -LiteralPath $ui -Raw

# Replace previous ES-module dynamic import() block for ai/ai.entry.js with script-tag loader.
$src2 = [regex]::Replace(
  $src,
  'import\(\s*["''](?:\.\.\/)*ai\/ai\.entry\.js["'']\s*\)\s*\.then\([\s\S]*?\)\s*\.catch\([\s\S]*?\)\s*;?',
@'
(function(){
  function loadAiPanelScript(cb){
    if (window.AI_PANEL) return cb && cb();
    if (window.__AI_PANEL_LOADING__) return;
    window.__AI_PANEL_LOADING__ = true;

    var s = document.createElement('script');
    s.src = 'ai/ai.entry.js';
    s.async = true;
    s.onload = function(){ window.__AI_PANEL_LOADING__ = false; cb && cb(); };
    s.onerror = function(){ window.__AI_PANEL_LOADING__ = false; alert('AI Control Panel: load failed. Check console.'); };
    document.head.appendChild(s);
  }

  loadAiPanelScript(function(){
    try { window.AI_PANEL && window.AI_PANEL.open(); } catch(e){ console.error(e); }
  });
})();
'@,
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

if ($src2 -eq $src) {
  Write-Host "Note: import() block not found (maybe already changed). No loader replacement applied."
} else {
  $src = $src2
  Write-Host "Replaced loader block (import -> script tag)."
}

Write-Utf8NoBom -Path $ui -Content $src
Write-Host "Patched: $ui"

# Overwrite ai files with classic-script version
$aiDir = Join-Path $ROOT "ai"
$cfgDir = Join-Path $aiDir "config"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null

Write-Utf8NoBom -Path (Join-Path $aiDir "ai.entry.js") -Content @"
/* LingoCard AI Control Panel (classic script, no ES modules)
   Attaches window.AI_PANEL with open/close/testConnection.
   Designed to work in non-module environments. */
(function () {
  'use strict';

  var DEFAULTS = {
    endpoint: 'http://localhost:1234/v1',
    timeoutMs: 8000,
    cacheKey: 'LC_AI_PANEL_STATE_V1',
    cacheTtlMs: 600000
  };

  function nowMs() { return Date.now(); }

  function loadDefaults() {
    try {
      return fetch('ai/config/ai.defaults.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : DEFAULTS; })
        .catch(function () { return DEFAULTS; });
    } catch (e) {
      return Promise.resolve(DEFAULTS);
    }
  }

  function ensureCss() {
    var id = 'ai-panel-styles';
    if (document.getElementById(id)) return;
    var link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'ai/ai.styles.css';
    document.head.appendChild(link);
  }

  function loadState(cfg) {
    try {
      var raw = localStorage.getItem(cfg.cacheKey);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj._ts) return null;
      if ((nowMs() - obj._ts) > cfg.cacheTtlMs) {
        localStorage.removeItem(cfg.cacheKey);
        return null;
      }
      return obj;
    } catch (e) { return null; }
  }

  function saveState(cfg, st) {
    try {
      var obj = Object.assign({}, st, { _ts: nowMs() });
      localStorage.setItem(cfg.cacheKey, JSON.stringify(obj));
    } catch (e) {}
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function formatJson(o) {
    try { return JSON.stringify(o, null, 2); } catch (e) { return String(o); }
  }

  function createModal() {
    var overlay = el('div', 'ai-overlay');
    overlay.style.display = 'none';

    var panel = el('div', 'ai-panel');
    var header = el('div', 'ai-header');

    var title = el('div', 'ai-title', '🧠 AI Control Panel');
    var closeBtn = el('button', 'ai-btn ai-btn-secondary', 'Close');
    closeBtn.type = 'button';

    header.appendChild(title);
    header.appendChild(closeBtn);

    var body = el('div', 'ai-body');

    var statusRow = el('div', 'ai-row');
    var statusLabel = el('div', 'ai-label', 'Status:');
    var statusValue = el('div', 'ai-status ai-status-warn', 'Not checked');
    statusRow.appendChild(statusLabel);
    statusRow.appendChild(statusValue);

    var endpointRow = el('div', 'ai-row');
    var endpointLabel = el('div', 'ai-label', 'Endpoint:');
    var endpointInput = el('input', 'ai-input');
    endpointInput.type = 'text';
    endpointInput.spellcheck = false;
    endpointInput.value = DEFAULTS.endpoint;
    endpointRow.appendChild(endpointLabel);
    endpointRow.appendChild(endpointInput);

    var btnRow = el('div', 'ai-row ai-row-buttons');
    var testBtn = el('button', 'ai-btn ai-btn-primary', 'Test Connection');
    testBtn.type = 'button';
    var clearBtn = el('button', 'ai-btn ai-btn-secondary', 'Clear Log');
    clearBtn.type = 'button';
    btnRow.appendChild(testBtn);
    btnRow.appendChild(clearBtn);

    var modelsBox = el('pre', 'ai-pre');
    modelsBox.textContent = '';

    var logBox = el('pre', 'ai-pre ai-pre-log');
    logBox.textContent = '';

    body.appendChild(statusRow);
    body.appendChild(endpointRow);
    body.appendChild(btnRow);
    body.appendChild(el('div', 'ai-subtitle', 'Models (/v1/models):'));
    body.appendChild(modelsBox);
    body.appendChild(el('div', 'ai-subtitle', 'Log:'));
    body.appendChild(logBox);

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);

    document.body.appendChild(overlay);

    function setStatus(kind, text) {
      statusValue.className = 'ai-status ' + (kind === 'ok' ? 'ai-status-ok' : kind === 'bad' ? 'ai-status-bad' : 'ai-status-warn');
      statusValue.textContent = text;
    }

    function log(line) {
      var t = new Date().toLocaleTimeString();
      logBox.textContent += '[' + t + '] ' + line + '\n';
      logBox.scrollTop = logBox.scrollHeight;
    }

    function open() { overlay.style.display = 'flex'; }
    function close() { overlay.style.display = 'none'; }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    return { overlay: overlay, open: open, close: close, setStatus: setStatus, log: log,
             endpointInput: endpointInput, modelsBox: modelsBox, logBox: logBox,
             testBtn: testBtn, clearBtn: clearBtn };
  }

  function httpGetJson(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var ctrl = null;
      var timer = null;

      try {
        ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        if (ctrl) {
          timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs);
        }
      } catch (e) { ctrl = null; }

      fetch(url, { method: 'GET', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          if (timer) clearTimeout(timer);
          if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t); });
          return r.json();
        })
        .then(resolve)
        .catch(function (err) {
          if (timer) clearTimeout(timer);
          reject(err);
        });
    });
  }

  function boot() {
    ensureCss();

    loadDefaults().then(function (cfg) {
      var modal = createModal();
      var state = loadState(cfg) || { endpoint: cfg.endpoint, log: '' };

      if (state.endpoint) modal.endpointInput.value = state.endpoint;
      if (state.log) modal.logBox.textContent = state.log;

      function persist() {
        saveState(cfg, { endpoint: modal.endpointInput.value.trim(), log: modal.logBox.textContent });
      }

      modal.endpointInput.addEventListener('change', persist);
      modal.clearBtn.addEventListener('click', function () { modal.logBox.textContent = ''; persist(); });

      modal.testBtn.addEventListener('click', function () {
        var ep = modal.endpointInput.value.trim().replace(/\/+$/, '');
        persist();
        modal.log('Testing: ' + ep + '/models');
        modal.setStatus('warn', 'Checking...');
        modal.modelsBox.textContent = '';

        httpGetJson(ep + '/models', cfg.timeoutMs)
          .then(function (data) {
            modal.setStatus('ok', 'Connected');
            modal.modelsBox.textContent = formatJson(data);
            modal.log('OK: received models list');
            persist();
          })
          .catch(function (err) {
            modal.setStatus('bad', 'Not connected');
            modal.modelsBox.textContent = '';
            modal.log('ERROR: ' + (err && err.message ? err.message : String(err)));
            persist();
          });
      });

      window.AI_PANEL = { open: modal.open, close: modal.close, version: 'hotfix-no-modules-1' };
    });
  }

  if (!window.AI_PANEL) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
"@

Write-Utf8NoBom -Path (Join-Path $aiDir "ai.styles.css") -Content @"
.ai-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
.ai-panel{width:min(860px,92vw);max-height:86vh;overflow:hidden;background:#111827;color:#e5e7eb;border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
.ai-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.10)}
.ai-title{font-weight:700}
.ai-body{padding:14px;display:flex;flex-direction:column;gap:10px}
.ai-row{display:flex;align-items:center;gap:10px}
.ai-row-buttons{gap:8px}
.ai-label{width:90px;opacity:.85}
.ai-input{flex:1;background:#0b1220;border:1px solid rgba(255,255,255,.14);color:#e5e7eb;border-radius:10px;padding:8px 10px;outline:none}
.ai-input:focus{border-color:rgba(255,255,255,.28)}
.ai-btn{border:1px solid rgba(255,255,255,.16);background:#0b1220;color:#e5e7eb;border-radius:10px;padding:8px 10px;cursor:pointer}
.ai-btn:hover{border-color:rgba(255,255,255,.28)}
.ai-btn-primary{background:#1f2937}
.ai-btn-secondary{background:#0b1220}
.ai-status{padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);font-size:12px}
.ai-status-ok{background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.30)}
.ai-status-warn{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.30)}
.ai-status-bad{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.30)}
.ai-subtitle{margin-top:6px;font-size:12px;opacity:.8}
.ai-pre{background:#0b1220;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;white-space:pre-wrap;overflow:auto;max-height:26vh}
.ai-pre-log{max-height:18vh}

"@

Write-Utf8NoBom -Path (Join-Path $cfgDir "ai.defaults.json") -Content @"
{
  ""endpoint"": ""http://localhost:1234/v1"",
  ""timeoutMs"": 8000,
  ""cacheKey"": ""LC_AI_PANEL_STATE_V1"",
  ""cacheTtlMs"": 600000
}
"@

Write-Host "Done. Hard-reload the app (Ctrl+F5) and click 🧠 AI Control Panel."
