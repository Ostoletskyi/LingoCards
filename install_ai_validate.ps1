# install_ai_validate.ps1
# Adds "Validate Card JSON" capability to AI Control Panel (no extra hooks in main app).
# Safe: writes/overwrites ai/ai.entry.js and ai/config/ai.defaults.json (UTF-8 no BOM).
# Creates backups of existing files.

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$Path, [string]$Content){
  $dir = Split-Path -Parent $Path
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Backup-IfExists([string]$Path, [string]$Tag){
  if (Test-Path $Path){
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $bak = "$Path.bak_$Tag`_$stamp"
    Copy-Item -LiteralPath $Path -Destination $bak -Force
    Write-Host "Backup: $bak"
  }
}

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ROOT

# ----- files -----
$aiEntry = Join-Path $ROOT "ai\ai.entry.js"
$aiCfg   = Join-Path $ROOT "ai\config\ai.defaults.json"
$aiCss   = Join-Path $ROOT "ai\ai.styles.css"

Backup-IfExists $aiEntry "validate"
Backup-IfExists $aiCfg   "validate"
Backup-IfExists $aiCss   "validate"

# ----- ai.defaults.json (merge minimal, overwrite if missing/invalid) -----
$cfgObj = $null
try {
  if (Test-Path $aiCfg){
    $raw = Get-Content -LiteralPath $aiCfg -Raw
    $cfgObj = $raw | ConvertFrom-Json
  }
} catch { $cfgObj = $null }

if (-not $cfgObj) { $cfgObj = [pscustomobject]@{} }
if (-not $cfgObj.endpoint) { $cfgObj | Add-Member -NotePropertyName endpoint -NotePropertyValue "http://localhost:1234/v1" -Force }
if (-not $cfgObj.timeoutMs) { $cfgObj | Add-Member -NotePropertyName timeoutMs -NotePropertyValue 8000 -Force }
if (-not $cfgObj.cacheTtlMs) { $cfgObj | Add-Member -NotePropertyName cacheTtlMs -NotePropertyValue 600000 -Force }

# new: validation config
if (-not $cfgObj.validate) {
  $cfgObj | Add-Member -NotePropertyName validate -NotePropertyValue ([pscustomobject]@{
    requireBoxes = @("inf","tr","forms")
    minInfChars = 2
  }) -Force
}

$cfgJson = ($cfgObj | ConvertTo-Json -Depth 10)
Write-Utf8NoBom $aiCfg $cfgJson

# ----- ai.styles.css (ensure panel has result area styles) -----
$css = @"
.ai-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99990;display:flex;align-items:center;justify-content:center;padding:24px;}
.ai-panel{width:min(980px,calc(100vw - 48px));height:min(720px,calc(100vh - 48px));background:#0f172a;border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.55);color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden}
.ai-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,0))}
.ai-title{font-weight:700;font-size:14px;letter-spacing:.3px}
.ai-close{appearance:none;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#e5e7eb;border-radius:10px;padding:6px 10px;cursor:pointer}
.ai-close:hover{background:rgba(255,255,255,.10)}
.ai-body{padding:14px 16px;display:flex;flex-direction:column;gap:12px;overflow:auto}
.ai-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ai-label{opacity:.85;font-size:12px;min-width:78px}
.ai-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);border-radius:999px;padding:4px 10px;font-size:12px}
.ai-pill.ok{border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.10)}
.ai-pill.warn{border-color:rgba(234,179,8,.35);background:rgba(234,179,8,.10)}
.ai-pill.bad{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.10)}
.ai-input{flex:1;min-width:280px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.20);color:#e5e7eb;border-radius:10px;padding:8px 10px;font-size:13px}
.ai-btn{appearance:none;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#e5e7eb;border-radius:10px;padding:8px 10px;font-size:13px;cursor:pointer}
.ai-btn:hover{background:rgba(255,255,255,.10)}
.ai-btn.primary{border-color:rgba(99,102,241,.55);background:rgba(99,102,241,.18)}
.ai-btn.primary:hover{background:rgba(99,102,241,.24)}
.ai-box{border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.16);border-radius:12px;padding:10px}
.ai-box h4{margin:0 0 8px 0;font-size:12px;opacity:.9;font-weight:700}
.ai-pre{max-height:240px;overflow:auto;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.35;white-space:pre}
.ai-small{font-size:12px;opacity:.85}
.ai-split{display:grid;grid-template-columns:1fr;gap:12px}
@media (min-width: 900px){.ai-split{grid-template-columns:1fr 1fr}}
.ai-kv{display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center}
.ai-check{display:flex;gap:8px;align-items:center;font-size:12px;opacity:.9}
.ai-result-ok{color:#86efac}
.ai-result-bad{color:#fca5a5}
"@
Write-Utf8NoBom $aiCss $css

# ----- ai.entry.js (classic script, no modules) -----
$entry = @"
(function(){
  'use strict';

  var DEFAULTS = { endpoint: 'http://localhost:1234/v1', timeoutMs: 8000, cacheTtlMs: 600000, validate: { requireBoxes:['inf','tr','forms'], minInfChars:2 } };
  var LS_KEY = 'LC_AI_PANEL_CACHE_V1';
  var state = { endpoint: DEFAULTS.endpoint, modelsJson: '', log: [], validateResult: null, validatePayloadMode: false };

  function now(){ return Date.now(); }
  function pad2(n){ return (n<10?'0':'')+n; }
  function ts(){
    var d = new Date();
    return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds());
  }
  function pushLog(msg){
    state.log.push('['+ts()+'] ' + msg);
    if (state.log.length > 200) state.log.shift();
  }
  function safeJsonParse(s){
    try{ return JSON.parse(s); }catch(e){ return null; }
  }

  function loadDefaults(){
    // try load ai/config/ai.defaults.json (optional)
    return fetch('/ai/config/ai.defaults.json?ts='+now(), { cache: 'no-store' })
      .then(function(r){ return r.ok ? r.text() : ''; })
      .then(function(txt){
        var obj = safeJsonParse(txt);
        if (obj && typeof obj === 'object'){
          DEFAULTS.endpoint = (typeof obj.endpoint === 'string' && obj.endpoint) ? obj.endpoint : DEFAULTS.endpoint;
          DEFAULTS.timeoutMs = (Number.isFinite(obj.timeoutMs) ? obj.timeoutMs : DEFAULTS.timeoutMs);
          DEFAULTS.cacheTtlMs = (Number.isFinite(obj.cacheTtlMs) ? obj.cacheTtlMs : DEFAULTS.cacheTtlMs);
          if (obj.validate && typeof obj.validate === 'object'){
            DEFAULTS.validate = obj.validate;
          }
        }
      }).catch(function(){});
  }

  function loadCache(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return;
      if (obj.exp && now() > obj.exp) { localStorage.removeItem(LS_KEY); return; }
      if (obj.state && typeof obj.state === 'object'){
        state.endpoint = (typeof obj.state.endpoint === 'string' && obj.state.endpoint) ? obj.state.endpoint : state.endpoint;
        state.modelsJson = (typeof obj.state.modelsJson === 'string') ? obj.state.modelsJson : '';
        state.log = Array.isArray(obj.state.log) ? obj.state.log.slice(-200) : [];
      }
    }catch(e){}
  }
  function saveCache(){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify({ exp: now() + (DEFAULTS.cacheTtlMs||600000), state: {
        endpoint: state.endpoint,
        modelsJson: state.modelsJson,
        log: state.log
      }}));
    }catch(e){}
  }

  function httpGet(url){
    var ctrl = new AbortController();
    var t = setTimeout(function(){ ctrl.abort(); }, DEFAULTS.timeoutMs || 8000);
    return fetch(url, { method:'GET', signal: ctrl.signal })
      .finally(function(){ clearTimeout(t); });
  }

  function setStatusClass(el, kind){
    el.classList.remove('ok','warn','bad');
    if (kind) el.classList.add(kind);
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>'"]/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  // ---- app card getter (no hooks required) ----
  function getCtxApp(){
    return (window.LC_DIAG && window.LC_DIAG.ctxApp) ? window.LC_DIAG.ctxApp : null;
  }
  function getRuntimeState(){
    try{
      if (window.LC_DIAG && typeof window.LC_DIAG.getState === 'function'){
        return window.LC_DIAG.getState();
      }
    }catch(e){}
    var ctx = getCtxApp();
    return ctx && ctx.state ? ctx.state : null;
  }

  function boxById(boxes, id){
    if (!Array.isArray(boxes)) return null;
    for (var i=0;i<boxes.length;i++){
      var b = boxes[i];
      if (b && b.id === id) return b;
    }
    return null;
  }

  function validateCurrentCard(){
    var st = getRuntimeState();
    var res = { ok:true, errors:[], warnings:[], meta:{} };

    if (!st || typeof st !== 'object'){
      res.ok = false;
      res.errors.push('Не найдено состояние приложения (window.LC_DIAG.getState()).');
      return res;
    }

    var cardW = Number.isFinite(st.cardWmm) ? st.cardWmm : 150;
    var cardH = Number.isFinite(st.cardHmm) ? st.cardHmm : 105;
    res.meta.card = { widthMm: cardW, heightMm: cardH };

    var boxes = Array.isArray(st.boxes) ? st.boxes : [];
    res.meta.boxesCount = boxes.length;

    if (!boxes.length){
      res.ok = false;
      res.errors.push('boxes[] пустой. Карточка не содержит блоков.');
      return res;
    }

    var req = (DEFAULTS.validate && Array.isArray(DEFAULTS.validate.requireBoxes)) ? DEFAULTS.validate.requireBoxes : ['inf','tr','forms'];
    for (var r=0;r<req.length;r++){
      var id = req[r];
      var b = boxById(boxes, id);
      if (!b){
        res.ok = false;
        res.errors.push('Отсутствует обязательный блок: '+id);
        continue;
      }
      var txt = String(b.text||'').trim();
      if (id === 'inf'){
        var minChars = (DEFAULTS.validate && Number.isFinite(DEFAULTS.validate.minInfChars)) ? DEFAULTS.validate.minInfChars : 2;
        if (txt.length < minChars){
          res.ok = false;
          res.errors.push('Infinitiv (inf) пустой или слишком короткий.');
        }
      }
      if (id === 'tr'){
        if (!txt){
          res.ok = false;
          res.errors.push('Перевод/значения (tr) пустые.');
        } else {
          // warn if only one long line without separators
          if (txt.length > 80 && txt.indexOf('\\n') === -1 && txt.indexOf(';') === -1 && txt.indexOf(',') === -1){
            res.warnings.push('tr выглядит как одна длинная строка. Обычно лучше несколько значений (через перенос/;).');
          }
        }
      }
      if (id === 'forms'){
        if (!txt){
          res.warnings.push('forms пустой. Для "канона" лучше заполнить 3 формы: p3/pret/p2.');
        } else {
          var parts = txt.split('/').map(function(x){ return x.trim(); }).filter(Boolean);
          if (parts.length < 2){
            res.warnings.push('forms выглядит неполным. Ожидается минимум p3/pret (лучше p3/pret/p2).');
          }
        }
      }
    }

    // geometry checks (commercial-grade sanity)
    for (var i=0;i<boxes.length;i++){
      var b0 = boxes[i];
      if (!b0 || typeof b0 !== 'object') continue;
      var x = Number(b0.xMm), y = Number(b0.yMm), w = Number(b0.wMm), h = Number(b0.hMm);
      if (![x,y,w,h].every(Number.isFinite)){
        res.warnings.push('Блок '+(b0.id||('#'+i))+' имеет нечисловую геометрию (xMm/yMm/wMm/hMm).');
        continue;
      }
      if (w <= 0 || h <= 0){
        res.ok = false;
        res.errors.push('Блок '+(b0.id||('#'+i))+' имеет нулевой/отрицательный размер.');
      }
      if (x < 0 || y < 0 || x + w > cardW + 0.001 || y + h > cardH + 0.001){
        res.ok = false;
        res.errors.push('Блок '+(b0.id||('#'+i))+' выходит за границы карточки.');
      }
    }

    // optional: validate export payload (cards-right)
    if (state.validatePayloadMode){
      var cards = Array.isArray(st.cardsRight) ? st.cardsRight : (Array.isArray(st.cards) ? st.cards : []);
      var payload = { version:1, kind:'cards-right', card:{ widthMm:cardW, heightMm:cardH }, cards: cards, verbs: [] };
      // derive verbs (like export)
      for (var c=0;c<cards.length;c++){
        var card = cards[c];
        var infB = boxById(card && card.boxes, 'inf');
        var inf = String(infB && infB.text || '').trim();
        if (!inf) continue;
        var trB = boxById(card.boxes, 'tr');
        var formsB = boxById(card.boxes, 'forms');
        var trLine = String(trB && trB.text || '');
        var formsLine = String(formsB && formsB.text || '');
        payload.verbs.push({ inf: inf, meanings: trLine.split(/\\n|;|,|•/g).map(function(t){return t.trim();}).filter(Boolean), forms: {} });
        var parts2 = formsLine.split('/').map(function(p){return p.trim();}).filter(Boolean);
        payload.verbs[payload.verbs.length-1].forms = { p3: parts2[0]||'', pret: parts2[1]||'', p2: parts2[2]||'', aux: '' };
      }
      res.meta.payload = { cardsCount: cards.length, verbsCount: payload.verbs.length };

      if (!Array.isArray(payload.cards)) { res.ok=false; res.errors.push('payload.cards не массив.'); }
      if (!Array.isArray(payload.verbs)) { res.ok=false; res.errors.push('payload.verbs не массив.'); }
      if (!payload.cards.length) res.warnings.push('payload.cards пустой (в правом списке нет черновиков).');
    }

    return res;
  }

  // ---- UI ----
  var overlay = null;

  function render(){
    if (!overlay) return;
    var elStatus = overlay.querySelector('[data-ai-status]');
    var elEndpoint = overlay.querySelector('[data-ai-endpoint]');
    var elModels = overlay.querySelector('[data-ai-models]');
    var elLog = overlay.querySelector('[data-ai-log]');
    var elVal = overlay.querySelector('[data-ai-validate]');
    var elValMeta = overlay.querySelector('[data-ai-validate-meta]');
    var elValMode = overlay.querySelector('[data-ai-valmode]');

    if (elEndpoint) elEndpoint.value = state.endpoint || DEFAULTS.endpoint;
    if (elModels) elModels.textContent = state.modelsJson || '';
    if (elLog) elLog.textContent = (state.log || []).join('\\n');

    if (elValMode) elValMode.checked = !!state.validatePayloadMode;

    if (elVal){
      if (!state.validateResult){
        elVal.innerHTML = '<span class="ai-small">Пока не запускали проверку.</span>';
        if (elValMeta) elValMeta.textContent = '';
      } else {
        var r = state.validateResult;
        var head = r.ok
          ? '<div class="ai-result-ok"><b>OK</b> — ошибок не найдено.</div>'
          : '<div class="ai-result-bad"><b>FAIL</b> — есть ошибки, карточка неканонична.</div>';

        var eList = (r.errors||[]).map(function(x){ return '• ' + x; }).join('\\n');
        var wList = (r.warnings||[]).map(function(x){ return '• ' + x; }).join('\\n');

        var block = head + '<pre class="ai-pre">' + escapeHtml(
          (eList ? ('Ошибки:\\n'+eList+'\\n\\n') : '') +
          (wList ? ('Предупреждения:\\n'+wList) : '')
        ) + '</pre>';
        elVal.innerHTML = block;

        if (elValMeta){
          elValMeta.textContent = JSON.stringify(r.meta || {}, null, 2);
        }
      }
    }

    if (elStatus){
      var txt = (state.modelsJson && state.modelsJson.trim()) ? 'Connected' : 'Not tested';
      elStatus.textContent = txt;
      setStatusClass(elStatus, (txt==='Connected') ? 'ok' : '');
    }
  }

  function buildOverlay(){
    overlay = document.createElement('div');
    overlay.className = 'ai-overlay';
    overlay.innerHTML =
      '<div class="ai-panel" role="dialog" aria-modal="true">' +
        '<div class="ai-header">' +
          '<div class="ai-title">pµ§ AI Control Panel</div>' +
          '<button class="ai-close" data-ai-close>Close</button>' +
        '</div>' +
        '<div class="ai-body">' +

          '<div class="ai-row">' +
            '<div class="ai-label">Status:</div>' +
            '<div class="ai-pill" data-ai-status>Not tested</div>' +
          '</div>' +

          '<div class="ai-kv">' +
            '<div class="ai-label">Endpoint:</div>' +
            '<input class="ai-input" data-ai-endpoint value="'+escapeHtml(state.endpoint||DEFAULTS.endpoint)+'" />' +
          '</div>' +

          '<div class="ai-row">' +
            '<button class="ai-btn primary" data-ai-test>Test Connection</button>' +
            '<button class="ai-btn" data-ai-clearlog>Clear Log</button>' +
          '</div>' +

          '<div class="ai-split">' +
            '<div class="ai-box">' +
              '<h4>Models (/v1/models):</h4>' +
              '<pre class="ai-pre" data-ai-models></pre>' +
            '</div>' +
            '<div class="ai-box">' +
              '<h4>Validate:</h4>' +
              '<div class="ai-row">' +
                '<button class="ai-btn primary" data-ai-validate-btn>Validate Card JSON</button>' +
                '<label class="ai-check"><input type="checkbox" data-ai-valmode /> validate export payload (cards-right)</label>' +
              '</div>' +
              '<div class="ai-box" style="margin-top:10px">' +
                '<div data-ai-validate></div>' +
              '</div>' +
              '<div class="ai-box" style="margin-top:10px">' +
                '<h4>Meta:</h4>' +
                '<pre class="ai-pre" data-ai-validate-meta></pre>' +
              '</div>' +
              '<div class="ai-small">Источник данных: window.LC_DIAG.getState() / window.LC_DIAG.ctxApp.state</div>' +
            '</div>' +
          '</div>' +

          '<div class="ai-box">' +
            '<h4>Log:</h4>' +
            '<pre class="ai-pre" data-ai-log></pre>' +
          '</div>' +

        '</div>' +
      '</div>';

    overlay.addEventListener('click', function(e){
      if (e.target === overlay) close();
    });

    overlay.querySelector('[data-ai-close]').onclick = close;

    overlay.querySelector('[data-ai-test]').onclick = function(){
      var ep = overlay.querySelector('[data-ai-endpoint]').value.trim();
      state.endpoint = ep || DEFAULTS.endpoint;
      pushLog('Testing: ' + state.endpoint + '/models');
      render();
      httpGet(state.endpoint.replace(/\/+$/,'') + '/models')
        .then(function(r){
          if (!r.ok) throw new Error('HTTP '+r.status);
          return r.text();
        })
        .then(function(txt){
          state.modelsJson = txt;
          pushLog('OK: received models list');
          saveCache();
          render();
        })
        .catch(function(err){
          state.modelsJson = '';
          pushLog('ERROR: ' + (err && err.message ? err.message : String(err)));
          saveCache();
          render();
        });
    };

    overlay.querySelector('[data-ai-clearlog]').onclick = function(){
      state.log = [];
      saveCache();
      render();
    };

    overlay.querySelector('[data-ai-validate-btn]').onclick = function(){
      state.validatePayloadMode = !!overlay.querySelector('[data-ai-valmode]').checked;
      pushLog('Validate: current card JSON (mode='+(state.validatePayloadMode?'payload':'card')+')');
      state.validateResult = validateCurrentCard();
      if (state.validateResult.ok) pushLog('Validate: OK');
      else pushLog('Validate: FAIL ('+(state.validateResult.errors||[]).length+' errors)');
      saveCache();
      render();
    };

    overlay.querySelector('[data-ai-valmode]').onchange = function(){
      state.validatePayloadMode = !!this.checked;
      saveCache();
    };

    return overlay;
  }

  function open(){
    if (overlay) return;
    loadCache();
    buildOverlay();
    document.body.appendChild(overlay);
    render();
  }
  function close(){
    if (!overlay) return;
    try{ overlay.remove(); }catch(e){}
    overlay = null;
  }

  // boot
  function ensureCss(){
    if (document.querySelector('link[data-ai-css]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/ai/ai.styles.css?ts='+now();
    l.dataset.aiCss = '1';
    document.head.appendChild(l);
  }

  loadDefaults().finally(function(){
    ensureCss();
    window.AI_PANEL = window.AI_PANEL || {};
    window.AI_PANEL.open = open;
    window.AI_PANEL.close = close;
  });

})();
"@
Write-Utf8NoBom $aiEntry $entry

Write-Host "Done. Hard-reload the app (Ctrl+F5), open 🧠 AI Control Panel, click Validate Card JSON."
