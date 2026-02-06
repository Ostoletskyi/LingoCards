import { getLang, t } from './ai.i18n.js';
import { safeJsonParse, looksTruncated, extractJsonObject, httpGet, httpPostJson } from './ai.net.js';
import { attachGhostAutocomplete, loadInfinitivesFromUrl } from './ai.verbs.autocomplete.js';

(function(){
  'use strict';


  // =========================
  // Mini i18n for AI panel (ru/de/en)
  // Uses app setting: localStorage 'lc_lang'
  // =========================
  
  const LM_BLINK_INTERVAL_MS = 700;
  


  var DEFAULTS = {
    endpoint: 'http://localhost:1234/v1',
    timeoutMs: 8000,
    cacheTtlMs: 600000,
    validate: { requireBoxes: ['inf','tr','forms'], minInfChars: 2 }
  };

  var LS_KEY = 'LC_AI_PANEL_CACHE_V1';
  // NOTE: we intentionally avoid background polling ("ping") of LM Studio.
  // Query LM Studio only when the user actually needs it
  // (Generate / explicit "Проверить соединение"). This prevents log spam
  // in LM Studio and keeps UI calm.
  var pingTimer = 0; // legacy (kept to avoid risky refactor), but not used.
  var state = {
    endpoint: DEFAULTS.endpoint,
    modelsJson: '',
    log: [],
    validateResult: null,
    validatePayloadMode: false,
    validateSource: 'left',
    genInfText: '',
    genBusy: false,
    lastGenIdx: null,
    lastGenList: null,

    aiReport: null,
    aiReportRaw: '',
    aiReportAt: 0,
    pendingPatchBoxes: null,
    pendingPatchMeta: null,
    fixBusy: false,
    desiredOpen: false,
    pingEnabled: false,
    lmAlert: { visible:false, reason:'', lastShown:0 },
    connected: false,
    // Connection UI state
    connTested: false,
    connBlink: false,
    _connBlinkPhase: false,
    _connBlinkTimer: 0,
    _pingFails: 0,

    // Optional online verification (Wiktionary) + request timer
    onlineVerify: false,
    genTimerMs: 0,
    genTimerRunning: false,
    _genTimerInt: 0,
    _genTimerStart: 0,

    // Batch import (verbs from file)
    batch: {
      running: false,
      stopped: false,
      queue: [],
      total: 0,
      done: 0,
      err: 0,
      current: ''
    }
  };

  // ---- Infinitive autocomplete (AI Generator input) -----------------------
  // Loads a static infinitives list and provides ghost completion.
  // Accept keys: Tab / ArrowRight. Enter remains bound to "Generate".
  var genInfVerbs = null;
  var genInfVerbsLoading = null;
  var genInfAc = null;

  function loadGenInfVerbsOnce(){
    if (genInfVerbs) return Promise.resolve(genInfVerbs);
    if (genInfVerbsLoading) return genInfVerbsLoading;

    // Absolute path keeps it stable regardless of current page nesting.
    // Cache-bust to avoid stale lists during local dev.
    var url = '/ai/data/verbs_infinitive.txt?ts=' + Date.now();
    genInfVerbsLoading = loadInfinitivesFromUrl(url)
      .then(function(list){
        genInfVerbs = Array.isArray(list) ? list : [];
        return genInfVerbs;
      })
      .catch(function(err){
        genInfVerbs = [];
        genInfVerbsLoading = null;
        var msg = (err && err.message) ? err.message : String(err);
        pushLog('Autocomplete verbs list load failed: ' + msg);
        return genInfVerbs;
      });
    return genInfVerbsLoading;
  }

  function initGenInfAutocomplete(){
    try{
      if (!overlay) return;
      var el = overlay.querySelector('[data-ai-geninf]');
      if (!el) return;
      // Avoid double attach.
      if (genInfAc) return;

      loadGenInfVerbsOnce().then(function(list){
        if (!overlay) return;
        if (!el || !el.isConnected) return;
        if (genInfAc) return;
        if (!Array.isArray(list) || !list.length) return;

        genInfAc = attachGhostAutocomplete({
          input: el,
          verbs: list,
          acceptKeys: ['Tab','ArrowRight'],
          log: function(m){ pushLog(m); if (overlay) render(); }
        });
      });
    }catch(e){
      // Do not break the panel if autocomplete fails.
      try{ pushLog('Autocomplete init error: ' + (e && e.message ? e.message : String(e))); }catch(_e){}
    }
  }

  

function showLmStudioNotRunningAlert(reason){
  state.lmAlert.visible = true;
  state.lmAlert.reason = reason || "";
  state.lmAlert.lastShown = now();
  emitAiStatus();
}

function hideLmStudioAlert(){
  state.lmAlert.visible = false;
  state.lmAlert.reason = "";
  emitAiStatus();
}

function now(){ return Date.now(); }

// Small DOM helper (kept local to avoid reliance on globals)
function q(root, sel){
  return (root && sel) ? root.querySelector(sel) : null;
}

  // --- Request timer -------------------------------------------------
  function stopGenTimer(){
    if (state._genTimerInt){ clearInterval(state._genTimerInt); state._genTimerInt = 0; }
    if (state.genTimerRunning && state._genTimerStart){
      state.genTimerMs = Math.max(0, now() - state._genTimerStart);
    }
    state.genTimerRunning = false;
    state._genTimerStart = 0;
  }

  function startGenTimer(){
    stopGenTimer();
    state.genTimerMs = 0;
    state.genTimerRunning = true;
    state._genTimerStart = now();
    // For the progress porthole indicator
    state._genPortholeCycleMs = 30000; // 30s
    // update label without heavy rerenders
    state._genTimerInt = setInterval(function(){
      if (!state.genTimerRunning) return;
      var el = overlay ? q(overlay, '[data-ai-timer]') : null;
      var elHand = overlay ? q(overlay, '[data-ai-sw-hand]') : null;
      var elBulb = overlay ? q(overlay, '[data-ai-fix] .ai-porthole') : null;
      if (el){
        var ms = Math.max(0, now() - state._genTimerStart);
        el.textContent = (ms/1000).toFixed(1) + 's';
      }
      if (elHand){
        // 0s => 12 o'clock; 30s => 6 o'clock.
        var msH = Math.max(0, now() - state._genTimerStart);
        var sec = (msH/1000) % 60;
        var deg = (sec/60) * 360;
        elHand.style.transform = 'translate(-50%, -100%) rotate(' + deg.toFixed(2) + 'deg)';
      }
      if (elBulb){
        var ms2 = Math.max(0, now() - state._genTimerStart);
        applyPortholeColor(elBulb, ms2, state._genPortholeCycleMs || 30000);
      }
    }, 120);
  }

  function _lerp(a,b,t){ return a + (b-a)*t; }
  function _clamp01(t){ return t<0?0:(t>1?1:t); }
  function _hexToRgb(h){
    h = String(h||'').replace('#','');
    if (h.length===3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h,16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }
  function _rgbToCss(rgb, a){
    if (a==null) return 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
  }
  function _mix(c1, c2, t){
    t = _clamp01(t);
    return {
      r: Math.round(_lerp(c1.r, c2.r, t)),
      g: Math.round(_lerp(c1.g, c2.g, t)),
      b: Math.round(_lerp(c1.b, c2.b, t))
    };
  }
  function _colorStop(t){
    // 0..1 => red -> orange -> yellow -> green
    var cR = _hexToRgb('#ef4444');
    var cO = _hexToRgb('#f97316');
    var cY = _hexToRgb('#eab308');
    var cG = _hexToRgb('#22c55e');
    if (t <= 0.33) return _mix(cR, cO, t/0.33);
    if (t <= 0.66) return _mix(cO, cY, (t-0.33)/0.33);
    return _mix(cY, cG, (t-0.66)/0.34);
  }
  function applyPortholeColor(elPorthole, elapsedMs, cycleMs){
    try{
      var t = (cycleMs && cycleMs>0) ? ((elapsedMs % cycleMs) / cycleMs) : 0;
      var c = _colorStop(t);
      elPorthole.style.backgroundColor = _rgbToCss(c, 0.22);
      elPorthole.style.borderColor = _rgbToCss(c, 0.85);
      elPorthole.style.boxShadow = 'inset 0 0 0 3px rgba(0,0,0,.35), 0 0 10px ' + _rgbToCss(c, 0.35) + ', 0 0 0 3px rgba(255,255,255,.10)';
    }catch(e){}
  }
  function setPortholeSolid(elPorthole, hex){
    try{
      var c = _hexToRgb(hex);
      elPorthole.style.backgroundColor = _rgbToCss(c, 0.22);
      elPorthole.style.borderColor = _rgbToCss(c, 0.85);
      elPorthole.style.boxShadow = 'inset 0 0 0 3px rgba(0,0,0,.35), 0 0 10px ' + _rgbToCss(c, 0.35) + ', 0 0 0 3px rgba(255,255,255,.10)';
    }catch(e){}
  }
  function pad2(n){ return (n<10?'0':'')+n; }
  function ts(){
    var d = new Date();
    return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds());
  }
  function pushLog(msg){
    state.log.push('['+ts()+'] ' + msg);
    if (state.log.length > 200) state.log.shift();
  }

  function uiToast(msg, kind){
    try{
      if (window.LC_UI && typeof window.LC_UI.toast === "function") {
        window.LC_UI.toast(String(msg||""), kind||"info");
        return;
      }
    }catch(_e){}
    // Fallback: write to panel log
    pushLog(String(msg||""));
  }



function stopPing(){
  if (pingTimer){ clearInterval(pingTimer); pingTimer = 0; }
}
function startPing(){
  // Background polling intentionally disabled.
  // Keep this function as a no-op to avoid accidental re-introduction.
  stopPing();
}

// ---- connection indicator (blinking when NOT connected) -------------------
function stopConnBlink(){
  if (state._connBlinkTimer){
    try{ clearInterval(state._connBlinkTimer); }catch(e){}
    state._connBlinkTimer = 0;
  }
  state.connBlink = false;
  state._connBlinkPhase = false;
}

function startConnBlink(){
  // Blink only when the panel is open and we have already tested connection.
  
  if (!state.desiredOpen) return;
  if (!state.connTested) return;
  if (state.connected) { stopConnBlink(); return; }
  state.connBlink = true;
  if (state._connBlinkTimer) return;
  state._connBlinkTimer = setInterval(function(){
    if (!state.desiredOpen || state.connected){
      stopConnBlink();
      if (overlay) render();
      return;
    }
    state._connBlinkPhase = !state._connBlinkPhase;
    if (overlay) render();
  }, LM_BLINK_INTERVAL_MS);
}

function testLmStudioConnection(opts){

  opts = opts || {};
  var silent = !!opts.silent;
  var ep = String(state.endpoint || DEFAULTS.endpoint).trim();
  state.endpoint = ep || DEFAULTS.endpoint;
  state.connTested = true;
  if (!silent) pushLog('Testing: ' + state.endpoint + '/models');
  if (overlay) render();

  // Use network timeout (not blink interval!)
  var url = state.endpoint.replace(/\/+$/,'') + '/models';
  var timeoutMs = state.timeoutMs || DEFAULTS.timeoutMs;
  return httpGet(url, timeoutMs)
    .then(function(r){
      if (!r.ok) throw new Error('HTTP '+r.status);
      return r.text;
      })
    .then(function(txt){
      state.modelsJson = txt;
      state.connected = true;
      stopConnBlink();
      hideLmStudioAlert();
      emitAiStatus();
      if (!silent) pushLog('OK: received models list');
      saveCache();
      if (overlay) render();
      return true;
    })
    .catch(function(err){
      state.modelsJson = '';
      state.connected = false;
      emitAiStatus();
      var msg = (err && err.message) ? err.message : String(err);
      if (!silent) pushLog('ERROR: ' + msg);
      showLmStudioNotRunningAlert(msg);
      startConnBlink();
      saveCache();
      if (overlay) render();
      return false;
    });
}

// ---- optional online verify (Wiktionary) ---------------------------------
function testWiktionaryAvailability(){
  // Works only with internet access. We use the official MediaWiki API.
  // origin=* enables CORS.
  var url = 'https://de.wiktionary.org/w/api.php?action=query&titles=gehen&format=json&origin=*';
  return httpGet(url, 4000).then(function(r){
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.text;
  }).then(function(txt){
    // very light sanity check
    if (txt && txt.indexOf('"query"') !== -1) return true;
    return true;
  });
}

// ---- UX guard: ensure RIGHT card is active before generation --------------
function ensureRightCardActive(){
  try{
    var ctx = getCtxApp();
    if (!ctx) return false;
    // Prefer official Cards API.
    if (ctx.cards && typeof ctx.cards.getCount === 'function'){
      var n = ctx.cards.getCount();
      if (n <= 0){
        if (typeof ctx.cards.addNew === 'function'){
          ctx.cards.addNew({ cloneCurrent:false });
          return true;
        }
      }
      var i = (typeof ctx.cards.getIndex === 'function') ? ctx.cards.getIndex() : 0;
      if (typeof ctx.cards.switchTo === 'function'){
        ctx.cards.switchTo(Math.max(0, Math.min(i, Math.max(0, n-1))));
        return true;
      }
    }

    // Fallback: force viewMode to cards.
    var st = ctx.getState ? ctx.getState() : ctx.state;
    if (!st) return false;
    var patch = { viewMode: 'cards' };
    if (typeof ctx.setState === 'function') ctx.setState(patch, { clearSelection:true });
    return true;
  }catch(e){
    return false;
  }
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
        state.validatePayloadMode = !!obj.state.validatePayloadMode;
        state.onlineVerify = !!obj.state.onlineVerify;
      }
    }catch(e){}
  }

  function saveCache(){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify({
        exp: now() + (DEFAULTS.cacheTtlMs || 600000),
        state: {
          endpoint: state.endpoint,
          modelsJson: state.modelsJson,
          log: state.log,
          validatePayloadMode: !!state.validatePayloadMode,
          onlineVerify: !!state.onlineVerify
        }
      }));
    }catch(e){}
  }




  function deepClone(x){
    try{ return JSON.parse(JSON.stringify(x)); }catch(e){ return null; }
  }

  
  // ===== Stage 6 hotfix: robust assistant text extraction (content vs reasoning) =====
  function _lcAiExtractAssistantText(resp){
    try{
      if (!resp || !resp.choices || !resp.choices.length) return '';
      var m = resp.choices[0].message || {};
      // Standard OpenAI-compatible field
      if (typeof m.content === 'string' && m.content.trim()) return m.content;
      // Some local models (e.g., "gpt-oss-20b") put the actual text into "reasoning"
      if (typeof m.reasoning === 'string' && m.reasoning.trim()) return m.reasoning;
      // Fallbacks
      if (typeof resp.choices[0].text === 'string' && resp.choices[0].text.trim()) return resp.choices[0].text;
      return '';
    }catch(e){
      return '';
    }
  }

function extractFirstJsonObject(text){
    if (!text) return null;
    var s = String(text);
    var a = s.indexOf('{');
    var b = s.lastIndexOf('}');
    if (a < 0 || b < 0 || b <= a) return null;
    var sub = s.slice(a, b+1);
    try{ return JSON.parse(sub); }catch(e){ return null; }
  }

  function getModelIdFromModels(){
    try{
      var o = JSON.parse(state.modelsJson || '{}');
      if (o && Array.isArray(o.data) && o.data.length && o.data[0].id) return String(o.data[0].id);
    }catch(e){}
    return '';
  }

  function validateBoxesOnly(boxes){
    var res = { ok:true, errors:[], warnings:[], meta:{ boxesCount: (boxes && boxes.length) || 0 } };
    if (!Array.isArray(boxes) || !boxes.length){
      res.ok = false;
      res.errors.push('Empty boxes.');
      return res;
    }
    var req = (DEFAULTS.validate && Array.isArray(DEFAULTS.validate.requireBoxes))
      ? DEFAULTS.validate.requireBoxes
      : ['inf','tr','forms'];

    for (var r=0;r<req.length;r++){
      var id = req[r];
      var b = boxById(boxes, id);
      if (!b){
        res.ok = false;
        res.errors.push('Missing required block: ' + id);
        continue;
      }
      if (id === 'inf'){
        var tInf = getBoxText(b);
        if (!tInf || tInf.replace(/\s+/g,'').length < (DEFAULTS.validate.minInfChars||2)){
          res.ok = false;
          res.errors.push('Infinitive too short in block inf.');
        }
      }
      if (id === 'tr'){
        var tTr = getBoxText(b);
        if (!tTr || !tTr.replace(/\s+/g,'')){
          res.ok = false;
          res.errors.push('Translation empty in block tr.');
        }
      }
    }
    return res;
  }

  function getActiveCardRefLive(sourceMode){
    var ctx = getCtxApp();
    if (!ctx || !ctx.state) return null;
    var st = ctx.state;
    var mode = (sourceMode || 'left').toLowerCase();

    if (mode === 'right'){
      var idxR = Number.isFinite(st.activeRightIndex) ? st.activeRightIndex
               : (Number.isFinite(st.selectedRightIndex) ? st.selectedRightIndex : null);
      if (idxR !== null && Array.isArray(st.cardsRight) && st.cardsRight[idxR]){
        return { list:'right', idx: idxR, card: st.cardsRight[idxR], ctx: ctx };
      }
      return null;
    }

    var idxC = Number.isFinite(st.activeCardIndex) ? st.activeCardIndex
             : (Number.isFinite(st.selectedCardIndex) ? st.selectedCardIndex : null);
    if (idxC !== null && Array.isArray(st.cards) && st.cards[idxC]){
      return { list:'left', idx: idxC, card: st.cards[idxC], ctx: ctx };
    }
    return null;
  }

  function applyBoxesToActiveCard(newBoxes, sourceMode){
    var ref = getActiveCardRefLive(sourceMode);
    if (!ref || !ref.ctx || typeof ref.ctx.setState !== 'function') return false;

    var ctx = ref.ctx;
    var st = ctx.state;
    var boxes = deepClone(newBoxes) || newBoxes;

    if (ref.list === 'right'){
      var next = (st.cardsRight || []).slice();
      var c = Object.assign({}, next[ref.idx] || {});
      c.boxes = boxes;
      next[ref.idx] = c;

      var patch = { cardsRight: next };
      if (Number.isFinite(st.activeRightIndex) && st.activeRightIndex === ref.idx){
        patch.activeCard = Object.assign({}, st.activeCard || {}, { boxes: boxes });
        patch.boxes = boxes;
      }
      ctx.setState(patch);
      return true;
    } else {
      var nextL = (st.cards || []).slice();
      var c2 = Object.assign({}, nextL[ref.idx] || {});
      c2.boxes = boxes;
      nextL[ref.idx] = c2;

      var patch2 = { cards: nextL };
      if (Number.isFinite(st.activeCardIndex) && st.activeCardIndex === ref.idx){
        patch2.activeCard = Object.assign({}, st.activeCard || {}, { boxes: boxes });
        patch2.boxes = boxes;
      }
      ctx.setState(patch2);
      return true;
    }


  }
  // ---- helpers: verb history + active card ----
  function extractInfFromBoxes(boxes){
    if (!Array.isArray(boxes)) return '';
    for (var i=0;i<boxes.length;i++){
      var b = boxes[i] || {};
      var id = (b.id || b.key || b.name || '').toString().toLowerCase();
      if (id === 'inf' || id === 'infinitiv' || id === 'infinitive'){
        return String(getBoxText(b) || '').trim();
      }
    }
    // fallback: first box text
    return String((boxes[0] ? (getBoxText(boxes[0]) || '') : '')).trim();
  }
function normInf(v){
  v = String(v||'').trim().toLowerCase();
  // normalize german ß, umlauts optional; keep simple
  v = v.replace(/\s+/g,' ').trim();
  return v;
}

  function _lcAiMsgText(msg){
    // Some LM Studio / local models may return content in `reasoning` instead of `content`.
    if (!msg) return '';
    var c = msg.content;
    // content can be string or something else; normalize
    if (typeof c === 'string' && c.trim()) return c;
    // fallback: "reasoning" field (some models)
    var r = msg.reasoning;
    if (typeof r === 'string' && r.trim()) return r;
    // fallback: if content is array (rare), join text parts
    if (Array.isArray(c)) {
      try{
        var out = '';
        for (var i=0;i<c.length;i++){
          var part=c[i];
          if (typeof part === 'string') out += part;
          else if (part && typeof part.text === 'string') out += part.text;
        }
        if (out.trim()) return out;
      }catch(e){}
    }
    return '';
  }


function updateVerbHistoryOne(inf){
  try{
    var key = "LC_VERB_HISTORY_V1";
    var h = null;
    try{ h = JSON.parse(localStorage.getItem(key) || 'null'); }catch(e){ h = null; }
    if (!h || typeof h !== 'object') h = { version:1, verbs:{} };
    if (!h.verbs || typeof h.verbs !== 'object') h.verbs = {};
    var n = normInf(inf);
    if (!n) return;
    var nowTs = Date.now();
    var it = h.verbs[n];
    if (!it){
      it = { count:0, firstSeen: nowTs, lastSeen: nowTs, sampleInf: inf };
    }
    it.count = (it.count||0) + 1;
    it.lastSeen = nowTs;
    if (!it.firstSeen) it.firstSeen = nowTs;
    if (!it.sampleInf) it.sampleInf = inf;
    h.verbs[n] = it;
    localStorage.setItem(key, JSON.stringify(h));
  }catch(e){}
}

function addCardToList(boxes, target, title){
  var ref = getActiveCardRefLive(target === 'left' ? 'left' : 'right'); // only to get ctx
  var ctx = (ref && ref.ctx) ? ref.ctx : getCtxApp();
  if (!ctx || typeof ctx.setState !== 'function') return null;
  var st = ctx.state;
  var c = { boxes: deepClone(boxes) || boxes };
  // Card title/name is shown in the sidebar list. Use infinitive by default.
  var t0 = String(title || extractInfFromBoxes(c.boxes) || '').trim();
  if (t0){
    c.title = t0;
    c.name = t0;
    c.cardTitle = t0;
    c.meta = c.meta || {};
    if (!c.meta.title) c.meta.title = t0;
    if (!c.meta.name) c.meta.name = t0;
  }

  if (target === 'left'){
    var nextL = (st.cards || []).slice();
    nextL.push(c);
    var idxL = nextL.length - 1;
    ctx.setState({ 
      cards: nextL,
      activeCardIndex: idxL,
      selectedCardIndex: idxL,
      activeCard: Object.assign({}, st.activeCard || {}, { boxes: c.boxes }),
      boxes: c.boxes
    });
    return { list:'left', idx: idxL };
  } else {
    // IMPORTANT: current LingoCard build uses state.cards for the draft/right list
    // (see ui/features/cardsSidebar.js). Keep legacy cardsRight as a fallback only.

    // Do NOT rely on ctx.cards.addNew() here. Some builds replace the list
    // or reuse slots. We want strict append semantics: each generation adds
    // a new draft card.
    st = ctx.getState ? ctx.getState() : ctx.state;

    var useCards = Array.isArray(st.cards);
    var useLegacyRight = (!useCards) && Array.isArray(st.cardsRight);

    if (useLegacyRight){
      // Legacy branch (older builds)
      var nextLegacy = (st.cardsRight || []).slice();
      nextLegacy.push(c);
      var idxLegacy = nextLegacy.length - 1;
      ctx.setState({
        cardsRight: nextLegacy,
        activeRightIndex: idxLegacy,
        selectedRightIndex: idxLegacy,
        activeCard: Object.assign({}, st.activeCard || {}, { boxes: c.boxes }),
        boxes: c.boxes
      }, { autosave:true, history:true });
      return { list:'right', idx: idxLegacy };
    }

    // Current branch: state.cards is the right/draft list.
    var next = (st.cards || []).slice();
    next.push(c);
    var idx = next.length - 1;

    ctx.setState({
      viewMode: 'cards',
      cards: next,
      selectedCardIndex: idx,
      activeCard: Object.assign({}, st.activeCard || {}, { boxes: c.boxes }),
      boxes: c.boxes
    }, { autosave:true, history:true });

    // Force re-render so the sidebar updates even while the AI panel modal is open.
    if (typeof ctx.requestRender === 'function') ctx.requestRender();

    return { list:'right', idx: idx };
  }
}

function moveActiveDraftToLeft(){
  var refR = getActiveCardRefLive('right');
  if (!refR || !refR.ctx || typeof refR.ctx.setState !== 'function') return false;
  var ctx = refR.ctx;
  var st = ctx.state;
  var box = (refR.card && Array.isArray(refR.card.boxes)) ? refR.card.boxes : [];
  if (!box.length) return false;

  var nextR = (st.cardsRight || []).slice();
  nextR.splice(refR.idx, 1);

  var nextL = (st.cards || []).slice();
  var c = Object.assign({}, refR.card || {});
  c.boxes = deepClone(box) || box;
  nextL.push(c);
  var idxL = nextL.length - 1;

  // update history
  var inf = extractInfFromBoxes(c.boxes);
  if (inf) updateVerbHistoryOne(inf);

  // adjust right indices
  var newActiveR = (nextR.length ? Math.min(refR.idx, nextR.length-1) : null);
  var patch = {
    cardsRight: nextR,
    cards: nextL,
    activeCardIndex: idxL,
    selectedCardIndex: idxL,
    activeCard: Object.assign({}, st.activeCard || {}, { boxes: c.boxes }),
    boxes: c.boxes
  };
  if (newActiveR === null){
    patch.activeRightIndex = null;
    patch.selectedRightIndex = null;
  }else{
    patch.activeRightIndex = newActiveR;
    patch.selectedRightIndex = newActiveR;
  }
  ctx.setState(patch);
  return true;
}

async function aiChatJson(systemPrompt, userPrompt){
  var endpoint = String(state.endpoint || '').trim();
  if (!endpoint) throw new Error('no_endpoint');
  if (endpoint.indexOf('/v1') === -1) endpoint = endpoint.replace(/\/+$/,'') + '/v1';
  var url = endpoint.replace(/\/+$/,'') + '/chat/completions';

  // pick model id from modelsJson if possible
  var modelId = '';
  try{
    var mj = JSON.parse(state.modelsJson || 'null');
    if (mj && Array.isArray(mj.data) && mj.data[0] && mj.data[0].id) modelId = String(mj.data[0].id);
  }catch(e){}
  if (!modelId) modelId = 'gpt-oss-20b'; // harmless fallback; LM Studio may ignore

  var body = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2
  };

  var res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('http_'+res.status);
  var js = await res.json();
  var content = (((js||{}).choices||[])[0]||{}).message?.content || '';
  if (!content) throw new Error('empty');
  // strip code fences if any
  content = String(content).trim();
  if (content.startsWith('```')){
    content = content.replace(/^```[a-zA-Z0-9]*\s*/,'').replace(/```\s*$/,'').trim();
  }
  return content;
}

// Like aiChatJson but returns raw text + some meta, without parsing.
async function aiChatText(systemPrompt, userPrompt){
  var endpoint = String(state.endpoint || '').trim();
  if (!endpoint) throw new Error('no_endpoint');
  if (endpoint.indexOf('/v1') === -1) endpoint = endpoint.replace(/\/+$/,'') + '/v1';
  var url = endpoint.replace(/\/+$/,'') + '/chat/completions';

  var modelId = '';
  try{
    var mj = JSON.parse(state.modelsJson || 'null');
    if (mj && Array.isArray(mj.data) && mj.data[0] && mj.data[0].id) modelId = String(mj.data[0].id);
  }catch(e){}
  if (!modelId) modelId = 'gpt-oss-20b';

  // IMPORTANT:
  // Some OpenAI-compatible backends (incl. LM Studio, depending on model) may
  // reject `response_format` with HTTP 400. We try with it first (best quality),
  // then transparently retry without it.
  // Also, some local models may return empty `content` and put text into
  // `reasoning`. We capture both.

  function buildBody(useResponseFormat){
    var b = {
      model: String(modelId || ''),
      messages: [
        { role: 'system', content: String(systemPrompt || '') },
        { role: 'user', content: String(userPrompt || '') }
      ],
      temperature: 0.1,
      max_tokens: 1800
    };
    if (useResponseFormat) b.response_format = { type: 'text' };
    return b;
  }

  async function doRequest(useResponseFormat){
    var body = buildBody(useResponseFormat);
    var res = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });

    // NOTE: Always read as text first so we can log server error bodies.
    var txt = '';
    try { txt = await res.text(); } catch(e){ txt = ''; }

    if (!res.ok){
      var err = new Error('http_'+res.status);
      err.status = res.status;
      err.body = txt;
      throw err;
    }

    var js = null;
    try { js = JSON.parse(txt || '{}'); } catch(e){
      var err2 = new Error('bad_json_response');
      err2.body = txt;
      throw err2;
    }

    var choice0 = (((js||{}).choices||[])[0]||{});
    var msg = choice0.message || {};
    var content = (msg && (msg.content||'')) || '';
    var reasoning = (msg && (msg.reasoning||'')) || '';
    var finish = choice0.finish_reason || '';
    var text = String((content || reasoning) || '');
    return { ok: !!text, text: text, model: modelId, finish_reason: String(finish||''), raw: js };
  }

  try{
    return await doRequest(true);
  }catch(e){
    // If backend doesn't support response_format -> retry without it.
    if ((e && e.status === 400) || (String(e && e.message || '').indexOf('http_400') === 0)){
      pushLog('WARN: /chat/completions rejected request (HTTP 400). Retrying without response_format.');
      if (e && e.body) pushLog('WARN: server said: ' + String(e.body).slice(0, 300));
      try {
        return await doRequest(false);
      } catch(e2){
        if (e2 && e2.body) pushLog('ERROR: server said: ' + String(e2.body).slice(0, 500));
        pushLog('ERROR: chat completion failed after retry: ' + String((e2 && e2.message) || e2));
        return { ok:false, text:'', model:String(modelId||''), finish_reason:'', raw:null, error:String((e2 && e2.message) || e2), status:(e2 && e2.status) || 0 };
      }
    }
    if (e && e.body) pushLog('ERROR: server said: ' + String(e.body).slice(0, 500));
    pushLog('ERROR: chat completion failed: ' + String((e && e.message) || e));
    return { ok:false, text:'', model:String(modelId||''), finish_reason:'', raw:null, error:String((e && e.message) || e), status:(e && e.status) || 0 };
  }
}

// --- Optional online verification via Wiktionary ---------------------
function stripTags(html){
  return String(html||'')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/\s+/g,' ')
    .trim();
}

async function wiktionaryFetchGermanVerbForms(inf){
  // Uses MediaWiki API with CORS enabled via origin=*
  // We parse HTML table very lightly; if anything fails, return null.
  try{
    var url = 'https://de.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=text&origin=*&page=' + encodeURIComponent(inf);
    var res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    var js = await res.json();
    var html = (js && js.parse && js.parse.text) ? String(js.parse.text) : '';
    if (!html) return null;

    function pick(label){
      // match <th>LABEL</th><td>VALUE</td>
      var re = new RegExp(label + '\\s*</th>\\s*<td[^>]*>(.*?)</td', 'i');
      var m = html.match(re);
      if (!m) return '';
      return stripTags(m[1]);
    }

    // Common labels in German verb inflection tables
    var p3 = pick('Präsens\\s*er\\s*,\\s*sie\\s*,\\s*es') || pick('Präsens\\s*er') || '';
    var prat = pick('Präteritum\\s*ich') || pick('Präteritum') || '';
    var p2 = pick('Partizip II') || '';
    var aux = pick('Hilfsverb') || '';

    // Normalize (take first token if multiple forms separated by commas/"oder")
    function firstToken(s){
      s = String(s||'').trim();
      if (!s) return '';
      s = s.split(/,|;| oder /i)[0];
      s = s.replace(/\s+/g,' ').trim();
      return s;
    }

    var out = {
      forms_p3: firstToken(p3),
      forms_prat: firstToken(prat),
      forms_p2: firstToken(p2),
      forms_aux: firstToken(aux)
    };

    // If page exists but doesn't have expected table, return null.
    if (!out.forms_p2 && !out.forms_prat && !out.forms_p3) return null;
    return out;
  }catch(e){
    return null;
  }
}

function applyWiktionaryFormsToAnswers(inf, answers, w){
  if (!w) return { answers: answers, warnings: [] };
  var warn = [];
  function neq(a,b){
    a = String(a||'').trim(); b = String(b||'').trim();
    if (!a || !b) return false;
    return a.toLowerCase() !== b.toLowerCase();
  }

  var a = Object.assign({}, answers);
  if (w.forms_p2 && neq(a.forms_p2, w.forms_p2)){
    warn.push('Wiktionary: forms_p2 исправлено: "' + a.forms_p2 + '" → "' + w.forms_p2 + '"');
    a.forms_p2 = w.forms_p2;
  }
  if (w.forms_prat && neq(a.forms_prat, w.forms_prat)){
    warn.push('Wiktionary: forms_prat исправлено: "' + a.forms_prat + '" → "' + w.forms_prat + '"');
    a.forms_prat = w.forms_prat;
  }
  if (w.forms_p3 && neq(a.forms_p3, w.forms_p3)){
    warn.push('Wiktionary: forms_p3 исправлено: "' + a.forms_p3 + '" → "' + w.forms_p3 + '"');
    a.forms_p3 = w.forms_p3;
  }
  if (w.forms_aux){
    var norm = String(w.forms_aux).toLowerCase();
    if (norm.indexOf('sein') !== -1) norm = 'ist';
    else if (norm.indexOf('haben') !== -1) norm = 'hat';
    if (norm && norm !== a.forms_aux){
      warn.push('Wiktionary: forms_aux исправлено: "' + a.forms_aux + '" → "' + norm + '"');
      a.forms_aux = norm;
    }
  }

  return { answers: a, warnings: warn };
}

async function generateCardFromInf(inf){
  // New approach (Contract V1): questionnaire -> strict answers -> compose boxes.
  // We keep legacy fallback if contract module isn't available.
  inf = String(inf||'').trim();
  if (!inf) return { ok:false, err:'inf is empty' };

  var C = (window.LC_AI_CONTRACT || null);
  if (!C){
    var sPrompt = "You are an assistant that generates LingoCard card content. Output ONLY valid JSON. No markdown. No explanations. Put the JSON in the main response (content). Do not use a separate reasoning section. The JSON must contain a top-level field \"boxes\": an array of box objects. Each box must include at least: {id:string, text:string}. Required ids: \"inf\", \"tr\", \"forms\".";
    var uPrompt = "Generate a German verb card for infinitive: " + inf + ". Provide Russian translation(s) in 'tr'. Provide basic forms in 'forms'.";
    return await aiChatJson(sPrompt, uPrompt);
  }

  var sys = C.buildAiSystemPromptV1();
  var attempt = 0;
  var lastRaw = '';
  var lastParsed = null;
  var lastCheck = null;
  // Local models can occasionally:
  // - hit max_tokens and truncate JSON
  // - put output into the "reasoning" field (content may be empty)
  // We allow 3 tries: initial + up to 2 repair passes.
  var maxTries = 3;

  while(attempt < maxTries){
    attempt++;

    var userPrompt = (attempt === 1)
      ? C.buildAiUserPromptV1(inf)
      : C.buildRepairPromptV1(inf, (lastCheck ? lastCheck.errors : []), (lastRaw||''));

    var r = await aiChatText(sys, userPrompt);
    lastRaw = (r && r.text != null) ? String(r.text) : '';

    // If the model explicitly says it was cut short, treat as truncation.
    if (r && r.finish_reason === 'length'){
      lastCheck = { ok:false, errors:["Ответ обрезан (finish_reason=length) (попытка " + attempt + ")."] };
      userPrompt = C.buildRepairPromptV1(inf, lastRaw || '', 'finish_reason=length');
      continue;
    }

    var cleaned = C.sanitizeModelTextToJson(lastRaw);
    // Quick truncation heuristic: avoids trying to JSON.parse obviously cut text.
    if (looksTruncated(cleaned)){
      lastCheck = { ok:false, errors:["Ответ похож на обрезанный JSON (попытка " + attempt + ")."] };
      userPrompt = C.buildRepairPromptV1(inf, cleaned || lastRaw || '', 'truncated_json');
      continue;
    }

    lastParsed = C.parseContractAnswerJson(cleaned);
    if (!lastParsed){
      lastCheck = { ok:false, errors:["Не удалось разобрать ответ модели как JSON (попытка " + attempt + ")."] };
      userPrompt = C.buildRepairPromptV1(inf, cleaned || lastRaw || '', 'json_parse_failed');
      continue;
    }
    lastCheck = C.validateContractAnswers(lastParsed);
    if (lastCheck && lastCheck.ok){
      // Optional: verify key verb forms via Wiktionary (best-effort)
      if (state.onlineVerify){
        var wf = await wiktionaryFetchGermanVerbForms(inf);
        if (wf){
          var patched = applyWiktionaryFormsToAnswers(inf, lastCheck.answers, wf);
          lastCheck.answers = patched.answers;
          lastCheck.warnings = (lastCheck.warnings || []).concat(patched.warnings || []);
        } else {
          lastCheck.warnings = (lastCheck.warnings || []).concat(['Wiktionary: не удалось получить данные (нет таблицы или сеть недоступна).']);
        }
      }
      // Compose LingoCard boxes from answers
      var boxes = buildBoxesFromContractAnswers(lastCheck.answers);
      return { ok:true, json:{ boxes: boxes, meta:{ contract: (C.getAiContractV1 && C.getAiContractV1().version) || 'LC_AI_CONTRACT_V1' } }, raw:lastRaw, contract:lastCheck };
    }

    // Validation failed – try repair (if we still have attempts left)
    if (lastCheck && lastCheck.errors && lastCheck.errors.length){
      userPrompt = C.buildRepairPromptV1(inf, cleaned || lastRaw || '', 'validation_failed: ' + lastCheck.errors.join('; '));
    } else {
      userPrompt = C.buildRepairPromptV1(inf, cleaned || lastRaw || '', 'validation_failed');
    }
  }

  return { ok:false, err:'contract_generation_failed', raw:lastRaw, contract:lastCheck };
}

function deepClone(obj){
  try{ return JSON.parse(JSON.stringify(obj)); }catch(e){ return obj; }
}

function getCanonicalTemplateBoxes(){
  try{
    var ctx = getCtxApp();
    var st = ctx && ctx.state ? ctx.state : null;
    if (!st) return null;
    // Prefer current editor boxes if present
    if (Array.isArray(st.boxes) && st.boxes.length) return st.boxes;
    // Fallback: first card boxes
    if (Array.isArray(st.cards) && st.cards[0] && Array.isArray(st.cards[0].boxes)) return st.cards[0].boxes;
  }catch(e){}
  return null;
}

function buildBoxesFromContractAnswers(ans){
  ans = ans || {};
  var tmpl = getCanonicalTemplateBoxes();
  var boxes = tmpl ? deepClone(tmpl) : [];

  // If template has an 'examples' box but no dedicated 'rek' box,
  // split the examples box into two: rek (top) + examples (bottom).
  try{
    var hasRek = false;
    var exIdx = -1;
    for (var bi=0; bi<boxes.length; bi++){
      if (boxes[bi] && boxes[bi].id === 'rek') hasRek = true;
      if (boxes[bi] && boxes[bi].id === 'examples') exIdx = bi;
    }
    if (!hasRek && exIdx >= 0 && boxes[exIdx]){
      var exb = boxes[exIdx];
      var rekH = 10; // mm (works with our 150x105 layout)
      var gap = 1;
      // Create rek box at the top of examples area
      boxes.splice(exIdx, 0, {
        id: 'rek',
        x: exb.x,
        y: exb.y,
        w: exb.w,
        h: rekH,
        text: ''
      });
      // Move examples down and shrink it
      exb.y = (exb.y + rekH + gap);
      exb.h = Math.max(8, (exb.h - rekH - gap));
    }
  }catch(e){}

  function setBoxText(id, text){
    if (!Array.isArray(boxes)) boxes = [];
    for (var i=0;i<boxes.length;i++){
      if (boxes[i] && boxes[i].id === id){
        // IMPORTANT: template boxes often have bind="..." and textMode defaults to "bind".
        // For AI-generated draft cards we must force the box to show our generated text.
        // We do this by switching the box to static mode and filling staticText.
        boxes[i].textMode = 'static';
        boxes[i].staticText = String(text||'');
        boxes[i].text = String(text||''); // keep legacy field for older renderers
        return;
      }
    }
    // If template doesn't have this box, add minimal box (won't render nicely, but keeps data)
    boxes.push({ id:id, textMode:'static', staticText:String(text||''), text:String(text||'') });
  }

  // inf
  setBoxText('inf', ((ans.inf||'').trim()));

  // prefix (V2): pref_type + pref_text
  // The model sometimes lies (e.g. ableiten -> pref_type:"none"), so we apply
  // a deterministic fallback based on inf + forms.
  function normWord(s){
    return String(s||'')
      .toLowerCase()
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
      .replace(/[^a-z\u00e4\u00f6\u00fc\u00df-]+/g, '')
      .trim();
  }

  // Common prefix/particle sets.
  // NOTE: This doesn't need to be perfect; it must be correct for the common cases and NEVER empty.
  var INSEP = ['be','emp','ent','er','ge','miss','ver','zer'];
  var AMB   = ['durch','ueber','über','um','unter','wider','wieder'];
  // Include frequent separable particles (single-token). Multi-token (e.g., "auseinander") is handled by inf-start check below.
  var SEP   = ['ab','an','auf','aus','bei','ein','fest','her','hin','los','mit','nach','vor','weg','weiter','zurueck','zurück','zusammen','zu','dazu','daran','darauf','darin','darunter','darueber','darüber','dazwischen','hinaus','hinein','hinunter','hinauf','heraus','herein','herunter','herauf'];

  function startsWithPrefix(infNorm, pref){
    // infNorm is lowercase, may contain umlauts. pref is lowercase.
    if (!pref) return false;
    if (infNorm.indexOf(pref) !== 0) return false;
    // Require at least 2 more chars after prefix to avoid matching whole word (rare, but safer).
    return (infNorm.length > pref.length + 1);
  }

  function lastTokenOfForm(formStr){
    var s = String(formStr||'').trim();
    if (!s) return '';
    // Examples: "er leitet ab" / "wir leiten aus".
    var parts = s.split(/\s+/);
    return normWord(parts[parts.length-1]);
  }

  function detectPrefix(ans){
    var inf = normWord(ans.inf||'');
    var p3  = String(ans.forms_p3||'');
    var pr  = String(ans.forms_prat||'');
    var p2  = normWord(ans.forms_p2||'');

    // 1) Strongest evidence: separable particle as last token in p3/pr.
    var t3 = lastTokenOfForm(p3);
    var tr = lastTokenOfForm(pr);
    function isSepTok(t){
      if (!t) return false;
      for (var i=0;i<SEP.length;i++){
        if (t === normWord(SEP[i])) return true;
      }
      // Ambiguous can be separable if it appears at the end.
      for (var j=0;j<AMB.length;j++){
        if (t === normWord(AMB[j])) return true;
      }
      return false;
    }
    var endTok = isSepTok(t3) ? t3 : (isSepTok(tr) ? tr : '');
    if (endTok){
      return { type:'sep', text:(endTok + '-') };
    }

    // 2) Inseparable by known prefixes.
    for (var k=0;k<INSEP.length;k++){
      var ip = normWord(INSEP[k]);
      if (startsWithPrefix(inf, ip)) return { type:'insep', text:(ip + '-') };
    }

    // 3) Ambiguous prefixes.
    for (var a=0;a<AMB.length;a++){
      var ap = normWord(AMB[a]);
      if (startsWithPrefix(inf, ap)) return { type:'amb', text:(ap + '-') };
    }

    // 4) Separable by inf-start as a fallback (covers multi-token like "auseinander" etc.
    //    This is weaker than (1), so we only use it if we have a known separable start.
    for (var s=0;s<SEP.length;s++){
      var sp = normWord(SEP[s]);
      if (startsWithPrefix(inf, sp)){
        // Extra hint: if Partizip II starts with the same prefix, it's very likely correct.
        if (!p2 || p2.indexOf(sp) === 0) return { type:'sep', text:(sp + '-') };
        return { type:'sep', text:(sp + '-') };
      }
    }

    return { type:'none', text:'' };
  }

  // Use AI fields when they look sane; otherwise fall back.
  var pt = (ans.pref_type||'').trim();
  var px = (ans.pref_text||'').trim();
  var det = detectPrefix(ans);

  // Normalize model variants (some models use "separable"/"inseparable").
  var ptNorm = String(pt||'').toLowerCase();
  if (ptNorm === 'separable') ptNorm = 'sep';
  if (ptNorm === 'inseparable') ptNorm = 'insep';
  if (ptNorm === 'none' || ptNorm === 'null' || ptNorm === 'no') ptNorm = 'none';

  // Decide final prefix.
  var finalType = ptNorm;
  var finalText = px;
  var aiLooksEmpty = (!finalText || !finalType || finalType === 'none');
  var aiContradicts = (finalType === 'none' && det.type !== 'none');
  if (aiLooksEmpty || aiContradicts){
    finalType = det.type;
    finalText = det.text;
  }

  // Render as a single human-friendly line in RU (as requested).
  var prefLines = [];
  if (!finalType || finalType === 'none' || !finalText){
    prefLines.push('без приставки');
  } else {
    var ruType = (finalType === 'sep')
      ? 'отделяемая'
      : (finalType === 'insep'
        ? 'неотделяемая'
        : (finalType === 'amb'
          ? 'возможно отделяемая / неотделяемая (зависит от смысла)'
          : finalType));
    // Keep prefix with trailing hyphen.
    var showPx = String(finalText||'').trim();
    if (showPx && showPx[showPx.length-1] !== '-') showPx += '-';
    prefLines.push('приставка ' + showPx + ' — ' + ruType);
  }
  // If template already has pref, always set (including empty to clear placeholders).
  // If template doesn't have pref, add it only when we actually have prefixes.
  var hasPrefBox = false;
  for (var pi=0; pi<boxes.length; pi++){
    if (boxes[pi] && boxes[pi].id === 'pref'){ hasPrefBox = true; break; }
  }
  if (hasPrefBox) setBoxText('pref', prefLines.join('\n'));
  else if (prefLines.length) setBoxText('pref', prefLines.join('\n'));

  // translations
  var trLines = [];
  for (var k=1;k<=4;k++){
    var ru = (ans['tr_'+k+'_ru']||'').trim();
    if (!ru) continue;
    var ctx = (ans['tr_'+k+'_ctx']||'').trim();
    if (ctx && ctx[0] === '(' && ctx[ctx.length-1] === ')') ctx = ctx.slice(1, -1).trim();
    trLines.push(ctx ? (ru + ' (' + ctx + ')') : ru);
  }
    // Compact variants: single line separated by commas (saves vertical space)
    setBoxText('tr', trLines.join(', '));

  // forms
  var p3 = (ans.forms_p3||'').trim();
  var pr = (ans.forms_prat||'').trim();
  var p2 = (ans.forms_p2||'').trim();
  var auxW = (ans.forms_aux||'').trim();
  var formsText = '';
  if (p3 || pr || p2){
    var last = (auxW && p2) ? (auxW + ' ' + p2) : p2;
    formsText = [p3, pr, last].filter(Boolean).join(' / ');
  }
  setBoxText('forms', formsText);

  // synonyms + freq
  var synLines = [];
  for (var s=1;s<=3;s++){
    var de = (ans['syn_'+s+'_de']||'').trim();
    var ru2 = (ans['syn_'+s+'_ru']||'').trim();
    if (!de && !ru2) continue;
    if (de && ru2) synLines.push(de + ' — ' + ru2);
    else synLines.push(de || ru2);
  }
  setBoxText('syn', synLines.join('\n'));

  // examples (without rection)
  var tagMap = {
    praesens: 'Präsens',
    modal: 'Modal',
    perfekt: 'Perfekt',
    praeteritum: 'Präteritum',
    passiv_impersonal: 'Passiv (unpers.)'
  };
  var exLines = [];
  for (var e=1;e<=5;e++){
    var deEx = (ans['ex_'+e+'_de']||'').trim();
    var ruEx = (ans['ex_'+e+'_ru']||'').trim();
    var tag = (ans['ex_'+e+'_tag']||'').trim();
    if (!deEx && !ruEx) continue;
    var lbl = tagMap[tag] || tag;
    if (lbl) exLines.push('[' + lbl + '] ' + deEx);
    else exLines.push(deEx);
    if (ruEx) exLines.push('— ' + ruEx);
    exLines.push('');
  }

  setBoxText('examples', exLines.join('\n').trim());

  // rection box (separate)
  var rekLines = [];
  for (var r=1;r<=5;r++){
    var rde = (ans['rek_'+r+'_de']||'').trim();
    var rru = (ans['rek_'+r+'_ru']||'').trim();
    if (!rde && !rru) continue;
    rekLines.push(rru ? (rde + ' — ' + rru) : rde);
  }
  setBoxText('rek', rekLines.join('\n'));

  return boxes;
}

function humanizeContractCheck(check){
  if (!check) return '';
  var lines = [];
  lines.push('Contract: ' + (check.version || 'LC_AI_CONTRACT_V1'));
  lines.push('Result: ' + (check.ok ? 'OK' : 'FAIL'));
  if (check.errors && check.errors.length){
    lines.push('');
    lines.push('Errors:');
    for (var i=0;i<check.errors.length;i++) lines.push('- ' + check.errors[i]);
  }
  if (check.warnings && check.warnings.length){
    lines.push('');
    lines.push('Warnings:');
    for (var j=0;j<check.warnings.length;j++) lines.push('- ' + check.warnings[j]);
  }
  return lines.join('\n');
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

  // ---- runtime state ----
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

  // ---- text extractor (IMPORTANT) ----
  function getBoxText(b){
    if (!b || typeof b !== 'object') return '';

    // 1) direct text
    if (typeof b.text === 'string' && b.text.trim()){
      return b.text.trim();
    }


    // 1b) staticText (used by LingoCard templates)
    if (typeof b.staticText === 'string' && b.staticText.trim()){
      return b.staticText.trim();
    }
    // 2) lines[] (string or {text})
    if (Array.isArray(b.lines)){
      var s = b.lines.map(function(l){
        if (typeof l === 'string') return l;
        if (l && typeof l.text === 'string') return l.text;
        return '';
      }).join('\n').trim();
      if (s) return s;
    }

    // 3) value/content
    if (typeof b.value === 'string' && b.value.trim()) return b.value.trim();
    if (typeof b.content === 'string' && b.content.trim()) return b.content.trim();

    return '';
  }

  // ---- choose active card boxes ----
  
function pickActiveCardBoxes(st, sourceMode){
    if (!st || typeof st !== 'object') return { source: 'none', boxes: [] };

    var mode = (sourceMode || 'auto').toLowerCase();

    function pickLeft(){
      var idxC = Number.isFinite(st.activeCardIndex) ? st.activeCardIndex
               : (Number.isFinite(st.selectedCardIndex) ? st.selectedCardIndex : null);

      if (idxC !== null && Array.isArray(st.cards) && st.cards[idxC] &&
          Array.isArray(st.cards[idxC].boxes) && st.cards[idxC].boxes.length){
        return { source: 'st.cards['+idxC+'].boxes', boxes: st.cards[idxC].boxes };
      }
      return null;
    }

    function pickRight(){
      var idxR = Number.isFinite(st.activeRightIndex) ? st.activeRightIndex
               : (Number.isFinite(st.selectedRightIndex) ? st.selectedRightIndex : null);

      if (idxR !== null && Array.isArray(st.cardsRight) && st.cardsRight[idxR] &&
          Array.isArray(st.cardsRight[idxR].boxes) && st.cardsRight[idxR].boxes.length){
        return { source: 'st.cardsRight['+idxR+'].boxes', boxes: st.cardsRight[idxR].boxes };
      }
      return null;
    }

    // Active card boxes (if editor exposes it)
    var active = (st.activeCard && Array.isArray(st.activeCard.boxes) && st.activeCard.boxes.length)
      ? { source: 'st.activeCard.boxes', boxes: st.activeCard.boxes }
      : null;

    // Explicit mode
    if (mode === 'left'){
      return pickLeft() || active || pickRight() || (Array.isArray(st.boxes)&&st.boxes.length ? {source:'st.boxes', boxes:st.boxes} : {source:'none', boxes:[]});
    }
    if (mode === 'right'){
      return pickRight() || active || pickLeft() || (Array.isArray(st.boxes)&&st.boxes.length ? {source:'st.boxes', boxes:st.boxes} : {source:'none', boxes:[]});
    }

    // Auto: prefer active, then LEFT (canonical), then right, then fallback
    return active || pickLeft() || pickRight() || (Array.isArray(st.boxes)&&st.boxes.length ? {source:'st.boxes', boxes:st.boxes} : {source:'none', boxes:[]});
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

    var pick = pickActiveCardBoxes(st, state.validateSource || 'left');
    var boxes = pick.boxes;

    res.meta.boxesSource = pick.source;
    res.meta.boxesCount = boxes.length;

    if (!boxes.length){
      res.ok = false;
      res.errors.push('Не удалось найти boxes для активной карточки (source=' + pick.source + ').');
      return res;
    }

    // required blocks checks
    var req = (DEFAULTS.validate && Array.isArray(DEFAULTS.validate.requireBoxes))
      ? DEFAULTS.validate.requireBoxes
      : ['inf','tr','forms'];

    for (var r=0;r<req.length;r++){
      var id = req[r];
      var b = boxById(boxes, id);
      if (!b){
        res.ok = false;
        res.errors.push('Отсутствует обязательный блок: ' + id);
        continue;
      }
      var txt = getBoxText(b);

      if (id === 'inf'){
        var minChars = (DEFAULTS.validate && Number.isFinite(DEFAULTS.validate.minInfChars))
          ? DEFAULTS.validate.minInfChars
          : 2;
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
          // warn if looks like one long line (no separators)
          if (txt.length > 80 && txt.indexOf('\n') === -1 && txt.indexOf(';') === -1 && txt.indexOf(',') === -1){
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

    // geometry sanity
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

    // optional: export payload validation (cards-right)
    if (state.validatePayloadMode){
      var cards = Array.isArray(st.cardsRight) ? st.cardsRight : (Array.isArray(st.cards) ? st.cards : []);
      var payload = { version:1, kind:'cards-right', card:{ widthMm:cardW, heightMm:cardH }, cards: cards, verbs: [] };

      for (var c=0;c<cards.length;c++){
        var card = cards[c];
        if (!card || !Array.isArray(card.boxes)) continue;

        var infB = boxById(card.boxes, 'inf');
        var inf = getBoxText(infB);
        if (!inf) continue;

        var trB = boxById(card.boxes, 'tr');
        var formsB = boxById(card.boxes, 'forms');

        var trLine = getBoxText(trB);
        var formsLine = getBoxText(formsB);

        payload.verbs.push({
          inf: inf,
          meanings: trLine.split(/\n|;|,|\u2022/g).map(function(t){return t.trim();}).filter(Boolean),
          forms: {}
        });

        var parts2 = formsLine.split('/').map(function(p){return p.trim();}).filter(Boolean);
        payload.verbs[payload.verbs.length-1].forms = {
          p3: parts2[0] || '',
          pret: parts2[1] || '',
          p2: parts2[2] || '',
          aux: ''
        };
      }

      res.meta.payload = { cardsCount: cards.length, verbsCount: payload.verbs.length };

      // Debug: include full payload snapshot for inspection.
      if (state.validatePayloadMode){
        try{
          res.meta.payloadBytes = JSON.stringify(payload).length;
        }catch(e){ res.meta.payloadBytes = null; }
        res.meta.payloadJson = payload;
      }

      if (!Array.isArray(payload.cards)) { res.ok=false; res.errors.push('payload.cards не массив.'); }
      if (!Array.isArray(payload.verbs)) { res.ok=false; res.errors.push('payload.verbs не массив.'); }
      if (!payload.cards.length) res.warnings.push('payload.cards пустой (в правом списке нет черновиков).');
    }

    return res;
  }

  
  function parseModelsIds(txt){
    try{
      var mj = JSON.parse(txt || 'null');
      var arr = mj && mj.data;
      if (!Array.isArray(arr)) return [];
      return arr.map(function(x){ return (x && (x.id || x.object || '')) || ''; }).filter(Boolean);
    }catch(e){
      return [];
    }
  }

  function formatMetaHuman(meta){
    try{
      meta = meta || {};
      var lines = [];
      if (meta.card && (meta.card.widthMm || meta.card.heightMm)){
        lines.push('Card: ' + (meta.card.widthMm||'?') + '×' + (meta.card.heightMm||'?') + ' mm');
      }
      if (meta.boxesSource) lines.push('Boxes source: ' + meta.boxesSource);
      if (typeof meta.boxesCount === 'number') lines.push('Boxes: ' + meta.boxesCount);
      if (meta.payload && (meta.payload.cardsCount!=null || meta.payload.verbsCount!=null)){
        lines.push('Payload: cards=' + (meta.payload.cardsCount||0) + ', verbs=' + (meta.payload.verbsCount||0));
      }
      if (meta.payloadBytes!=null) lines.push('Payload bytes: ' + meta.payloadBytes);
      if (!lines.length) return '—';
      return lines.join('\n');
    }catch(e){
      return '—';
    }
  }

// ---- UI ----
  var overlay = null;

  function render(){
    if (!overlay) return;
    var elStatus = overlay.querySelector('[data-ai-status]');
    var elStatusWrap = overlay.querySelector('[data-ai-status-wrap]');
    var elEndpoint = overlay.querySelector('[data-ai-endpoint]');
    var elModels = overlay.querySelector('[data-ai-models]');
    var elLog = overlay.querySelector('[data-ai-log]');
    var elVal = overlay.querySelector('[data-ai-validate]');
    var elValMeta = overlay.querySelector('[data-ai-validate-meta]');
    var elValMode = overlay.querySelector('[data-ai-valmode]');
    var elValSourceBtn = overlay.querySelector('[data-ai-valtoggle]');
    var elApply = overlay.querySelector('[data-ai-apply]');
    var elFix = overlay.querySelector('[data-ai-fix]');
    var elReport = overlay.querySelector('[data-ai-report]');
    var elReportRaw = overlay.querySelector('[data-ai-report-raw]');
    var elGenInf = overlay.querySelector('[data-ai-geninf]');
    var elGenBtn = overlay.querySelector('[data-ai-generate]');
    var elMoveLeft = overlay.querySelector('[data-ai-moveleft]');
    var elActiveCard = overlay.querySelector('[data-ai-activecard]');

    if (elEndpoint) elEndpoint.value = state.endpoint || DEFAULTS.endpoint;
    if (elModels){
      var ids = parseModelsIds(state.modelsJson);
      elModels.textContent = ids.length ? ids.map(function(x){return '• '+x;}).join('\n') : '—';
    }
    if (elLog) elLog.textContent = (state.log || []).join('\n');
    if (elValMode) elValMode.checked = !!state.validatePayloadMode;
    if (elValSourceBtn){
      var src = (state.validateSource === 'right') ? 'right' : 'left';
      elValSourceBtn.setAttribute('data-src', src);
      elValSourceBtn.classList.toggle('is-left', src==='left');
      elValSourceBtn.classList.toggle('is-right', src==='right');
      elValSourceBtn.textContent = (src==='left') ? t('sourceLeftShort') : t('sourceRightShort');
    }
    // Active card indicator + enable/disable actions
    var activeRef = null;
    try{ activeRef = getActiveCardRefLive(state.validateSource || 'left'); }catch(e){ activeRef = null; }
    var activeInf = '';
    if (activeRef && activeRef.card && Array.isArray(activeRef.card.boxes)){
      activeInf = extractInfFromBoxes(activeRef.card.boxes);
    }
    if (elActiveCard){
      elActiveCard.textContent = t('activeCard') + ' ' + (activeInf ? activeInf : t('noActiveCard'));
    }
    if (elGenInf){
      if (document.activeElement !== elGenInf) elGenInf.value = state.genInfText || '';
    }
    var hasActive = !!(activeRef && activeRef.card);
    // Fix/Apply need an active card or a pending patch target
    var canAct = hasActive;
    if (elFix){
      elFix.disabled = !canAct || state.fixBusy;
      if (!canAct) elFix.title = t('needSelectCard');
    }
    if (elApply){
      elApply.disabled = !canAct;
      if (!canAct) elApply.title = t('needSelectCard');
    }
    if (elMoveLeft){
      // enable only when active draft exists
      var canMove = !!(activeRef && activeRef.list==='right');
      elMoveLeft.disabled = !canMove;
    }
    if (elGenBtn){
      elGenBtn.disabled = !!state.genBusy;
    }

if (elVal){
      if (!state.validateResult){
        elVal.innerHTML = '<span class="ai-small">'+escapeHtml(t('valNotRun'))+'</span>';
        if (elValMeta) elValMeta.textContent = '';
      } else {
        var r = state.validateResult;
        var BUL = '\u2022 ';
        var DASH = '\u2014';

        var head = r.ok
          ? '<div class="ai-result-ok"><b>OK</b> '+DASH+' '+escapeHtml(t('okHead'))+'</div>'
          : '<div class="ai-result-bad"><b>FAIL</b> '+DASH+' '+escapeHtml(t('failHead'))+'</div>';

        var eList = (r.errors || []).map(function(x){ return BUL + x; }).join('\n');
        var wList = (r.warnings || []).map(function(x){ return BUL + x; }).join('\n');

        var debugPayload = '';
        if (r && r.meta && r.meta.payloadJson){
          try{
            debugPayload = '\n\n' + t('payloadDebug') + '\n' + JSON.stringify(r.meta.payloadJson, null, 2);
            // prevent UI freeze on huge payloads
            if (debugPayload.length > 12000){
              debugPayload = debugPayload.slice(0, 12000) + "\n... (truncated)";
            }
          }catch(e){ /* ignore */ }
        }

        var block = head + '<pre class="ai-pre">' + escapeHtml(
          (eList ? (t('errors')+'\n' + eList + '\n\n') : '') +
          (wList ? (t('warnings')+'\n' + wList) : '') +
          debugPayload
        ) + '</pre>';

        elVal.innerHTML = block;

        if (elValMeta){
          elValMeta.textContent = formatMetaHuman(r.meta || {});
        }
      }
    }
    // AI Report
    if (elReport || elReportRaw){
      if (state.fixBusy){
        if (elReport) elReport.textContent = t('reportWorking');
        if (elReportRaw) elReportRaw.textContent = '';
      } else if (!state.aiReport && !state.aiReportRaw){
        if (elReport) elReport.textContent = t('reportEmpty');
        if (elReportRaw) elReportRaw.textContent = '';
      } else {
        var rep = state.aiReport || {};
        var lines = [];
        if (state.aiReportAt){
          try{
            var d = new Date(state.aiReportAt);
            lines.push(t('reportLast')+' ' + d.toLocaleString());
          }catch(e){}
        }
        if (rep.summary) lines.push(t('reportSummary')+' ' + rep.summary);
        if (Array.isArray(rep.actions) && rep.actions.length){
          lines.push(t('reportActions'));
          for (var i=0;i<rep.actions.length;i++) lines.push(' - ' + rep.actions[i]);
        }
        if (Array.isArray(rep.warnings) && rep.warnings.length){
          lines.push(t('reportWarnings'));
          for (var j=0;j<rep.warnings.length;j++) lines.push(' - ' + rep.warnings[j]);
        }

        // remaining issues after fix (if any)
        if (state.pendingPatchMeta && state.pendingPatchMeta.validate){
          var vr = state.pendingPatchMeta.validate;
          if (vr && vr.errors && vr.errors.length){
            lines.push(t('reportRemaining')+' ' + vr.errors.length);
            for (var k=0;k<vr.errors.length;k++) lines.push(' - ' + vr.errors[k]);
          } else {
            lines.push(t('fixDoneOk'));
          }
        }

        if (elReport) elReport.textContent = lines.join('\n');
        if (elReportRaw) elReportRaw.textContent = state.aiReportRaw || '';
      }
    }




    // Porthole indicator:
    // - default red when idle
    // - cycles red->orange->yellow->green during request (30s loop)
    // - turns solid green briefly when the verb is added to the right list
    if (elFix){
      elFix.classList.add('ai-bulb-fail'); // default (red)
      elFix.classList.toggle('ai-bulb-busy', !!state.fixBusy);
      var elP = q(elFix, '.ai-porthole');
      var n = now();
      if (elP){
        if (state._portholeFlashUntil && state._portholeFlashUntil > n){
          setPortholeSolid(elP, '#22c55e');
        } else if (!state.genTimerRunning){
          setPortholeSolid(elP, '#ef4444');
        }
      }
      // Keep Fix as a tool, but clarify that the porthole is also a timing indicator
      elFix.title = t('fix') + ' • ' + 'indicator: request time / result';
    }
    if (elStatus){
      var txt = '';
      if (state.connected){
        txt = t('connected');
        elStatus.textContent = txt;
        elStatus.title = '';
        if (elStatusWrap) elStatusWrap.setAttribute('data-tooltip','');
        setStatusClass(elStatus, 'ok');
      } else if (state.connTested){
        txt = t('not_connected');
        elStatus.textContent = txt;
        // аварийная мигалка: красный / оранжевый
        setStatusClass(elStatus, state.connBlink ? (state._connBlinkPhase ? 'warn' : 'bad') : 'bad');
        elStatus.title = t('not_connected_tip');
        if (elStatusWrap) elStatusWrap.setAttribute('data-tooltip', t('not_connected_tip'));
        // ensure blink timer is running
        startConnBlink();
      } else {
        txt = t('not_tested');
        elStatus.textContent = txt;
        elStatus.title = '';
        if (elStatusWrap) elStatusWrap.setAttribute('data-tooltip','');
        setStatusClass(elStatus, '');
      }
    }

    // Online verify toggle
    // NOTE: 'panel' variable may not exist in this scope. Always query inside the overlay.
    var elOnline = q(overlay, '[data-ai-online]');
    if (elOnline){
      elOnline.checked = !!state.onlineVerify;
    }

    // Timer label
    var elTimer = q(overlay, '[data-ai-timer]');
    if (elTimer){
      var ms = state.genTimerMs || 0;
      if (state.genTimerRunning && state._genTimerStart){
        ms = Math.max(0, now() - state._genTimerStart);
      }
      elTimer.textContent = (ms/1000).toFixed(1) + 's';
    }

    // Batch import UI
    var bp = q(overlay, '[data-ai-batch-pill]');
    if (bp){
      var b = state.batch || {};
      var show = !!(b.total && (b.running || b.done || b.err));
      bp.hidden = !show;
      if (show){
        bp.textContent = String((b.done||0) + '/' + (b.total||0));
      }
    }

    var elBatch = q(overlay, '[data-ai-batch]');
    var elStop = q(overlay, '[data-ai-batch-stop]');
    if (elBatch){
      var bb = state.batch || {};
      var txt = t('importIdle');
      if (bb.total && bb.running){
        txt = t('importRunning', { done: bb.done||0, total: bb.total||0, verb: bb.current||'' });
      } else if (bb.total && bb.stopped){
        txt = t('importStopped', { done: bb.done||0, total: bb.total||0 });
      } else if (bb.total && !bb.running && !bb.stopped){
        txt = t('importDone', { done: bb.done||0, total: bb.total||0, err: bb.err||0 });
      }
      elBatch.textContent = txt;
      if (elStop){
        elStop.hidden = !bb.running;
      }
    }
  }

  function buildOverlay(){
    overlay = document.createElement('div');
    overlay.className = 'ai-overlay';

    // 🧠 (U+1F9E0)
    var TITLE = t("title");

    overlay.innerHTML =
      '<div class="ai-panel" role="dialog" aria-modal="true">' +
        '<div class="ai-header">' +
          '<div class="ai-title">'+TITLE+
            '<span class="ai-title-ep">'+t("endpoint")+'</span>' +
            '<input class="ai-input ai-endpoint ai-endpoint-mini" data-ai-endpoint value="'+escapeHtml(state.endpoint||DEFAULTS.endpoint)+'" />' +
          '</div>' +
          '<div class="ai-header-right">' +
            '<div class="ai-tooltip-wrap" data-ai-status-wrap data-tooltip=""><button class="ai-btn ai-btn-mini ai-status-btn" data-ai-status type="button">' + t("not_tested") + '</button></div>' +
            '<button class="ai-btn ai-btn-mini" data-ai-test type="button">' + t("test") + '</button>' +
            '<button class="ai-btn ai-debug-toggle ai-btn-mini" data-ai-debug type="button" title="' + t("debugTip") + '">' + t("debug") + '</button>' +
            '<button class="ai-close ai-close-mini" data-ai-close type="button">' + t("close") + '</button>' +
          '</div>' +
        '</div>' +
'<div class="ai-body">' +
          lmAlertHtml() +

          '<div class="ai-top">' +
            '<div class="ai-row ai-ep-row">' +
              '<div class="ai-label">' + t("genInf") + '</div>' +
              '<button class="ai-btn primary ai-gen-btn" data-ai-generate title="' + t("genTip") + '" type="button">' + t("gen") + '</button>' +
              '<input class="ai-input ai-geninf ai-highlight" data-ai-geninf placeholder="'+escapeHtml(t("genPlaceholder"))+'" value="" />' +
              '<button class="ai-btn" data-ai-import type="button" title="'+escapeHtml(t("importTip"))+'">' + t("importBtn") + '</button>' +
              '<input class="ai-hidden-file" data-ai-import-file type="file" accept=".txt,text/plain" />' +
              '<label class="ai-small ai-check" title="'+escapeHtml(t('onlineVerifyHint'))+'">' +
                '<input type="checkbox" data-ai-online /> ' +
                '<span>'+escapeHtml(t('onlineVerifyLabel'))+'</span>' +
              '</label>' +
              '<span class="ai-stopwatch" aria-hidden="true" title="Время запроса">' +
                '<span class="ai-stopwatch-dial" aria-hidden="true">' +
                  '<span class="ai-stopwatch-hand" data-ai-sw-hand aria-hidden="true"></span>' +
                '</span>' +
              '</span>' +
              '<span class="ai-small ai-timer" data-ai-timer title="Время одного запроса">0.0s</span>' +
              '<span class="ai-small ai-pill-mini" data-ai-batch-pill title="'+escapeHtml(t("importBoxTitle"))+'" hidden>0/0</span>' +
              '<span class="ai-small" style="min-width:84px;">' + escapeHtml(t('listLabel')) + '</span>' +
              '<span class="ai-pill ai-pill-right" aria-label="right list">' + escapeHtml(t('rightResultLabel')) + '</span>' +
              '<button class="ai-bulb ai-bulb-fail ai-porthole-btn" data-ai-fix aria-label="' + t("fix") + '" title="Индикатор времени / результат"><span class="ai-porthole" aria-hidden="true"></span></button>' +
            '</div>' +
'</div>' +

            '<div class="ai-small" data-ai-activecard></div>' +
          '</div>' +

          '<div class="ai-split">' +
            '<div class="ai-box">' +
              '<h4>' + t("validate") + '</h4>' +
              '<div data-ai-validate></div>' +
            '</div>' +
            '<div class="ai-box">' +
              '<h4>' + t("report") + '</h4>' +
              '<div class="ai-small" data-ai-report></div>' +
            '</div>' +
          '</div>' +

          '<div class="ai-box" data-ai-batch-box>' +
            '<div class="ai-row" style="justify-content:space-between; align-items:center;">' +
              '<h4 style="margin:0">' + t("importBoxTitle") + '</h4>' +
              '<button class="ai-btn ai-btn-mini" data-ai-batch-stop type="button" hidden>' + t("importStop") + '</button>' +
            '</div>' +
            '<div class="ai-small" data-ai-batch></div>' +
          '</div>' +

          '<div class="ai-debug" data-ai-debug-panel hidden>' +
            '<div class="ai-box" style="margin-top:10px">' +
              '<div class="ai-row" style="justify-content:space-between; align-items:center;">' +
                '<label class="ai-check" title="' + t("valModeTip") + '"><input type="checkbox" data-ai-valmode /> ' + t("valModeLabelShort") + '</label>' +
                '<button class="ai-btn" data-ai-clearlog>' + t("clearLog") + '</button>' +
              '</div>' +
	              '<h4 style="margin-top:10px">Raw report:</h4>' +
              '<pre class="ai-pre ai-pre-raw" data-ai-report-raw></pre>' +
              '<h4 style="margin-top:10px">Log:</h4>' +
              '<pre class="ai-pre ai-pre-log" data-ai-log></pre>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</div>';

    overlay.addEventListener('click', function(e){
  // Do not close on backdrop click; keep panel persistent.
  e.stopPropagation();
});
var bClose = overlay.querySelector('[data-ai-close]');
if (bClose) bClose.onclick = close;

// Debug toggle (show/hide technical details)
var dbgBtn = overlay.querySelector('[data-ai-debug]');
var dbgPanel = overlay.querySelector('[data-ai-debug-panel]');
function getDbg(){
  try{ return localStorage.getItem('LC_AI_DEBUG') === '1'; }catch(e){ return false; }
}
function setDbg(v){
  try{ localStorage.setItem('LC_AI_DEBUG', v ? '1' : '0'); }catch(e){}
}
function renderDbg(){
  if (!dbgPanel) return;
  var on = getDbg();
  dbgPanel.hidden = !on;
  if (dbgBtn) dbgBtn.classList.toggle('on', on);
}
if (dbgBtn){
  dbgBtn.onclick = function(){
    setDbg(!getDbg());
    renderDbg();
  };
}
renderDbg();

// Alert actions (smart LM Studio notice)
var bRetry = overlay.querySelector('[data-ai-alert-retry]');
if (bRetry) bRetry.onclick = function(){ 
  // trigger same test
  var t = overlay.querySelector('[data-ai-test]');
  if (t) t.click();
};
var bHide = overlay.querySelector('[data-ai-alert-hide]');
if (bHide) bHide.onclick = function(){
  hideLmStudioAlert();
          emitAiStatus();
  render();
};


    var bTest = overlay.querySelector('[data-ai-test]');
    if (bTest) bTest.onclick = function(){
      var ep = overlay.querySelector('[data-ai-endpoint]').value.trim();
      state.endpoint = ep || DEFAULTS.endpoint;
      testLmStudioConnection({ silent:false });
    };

    var bClear = overlay.querySelector('[data-ai-clearlog]');
    if (bClear) bClear.onclick = function(){
      state.log = [];
      saveCache();
      render();
    };

    var bVal = overlay.querySelector('[data-ai-validate-btn]');
    if (bVal) bVal.onclick = function(){
      state.validatePayloadMode = !!overlay.querySelector('[data-ai-valmode]').checked;
      pushLog('Validate: current card JSON (mode=' + (state.validatePayloadMode ? 'payload' : 'card') + ')');
      state.validateResult = validateCurrentCard();
      if (state.validateResult.ok) pushLog('Validate: OK');
      else pushLog('Validate: FAIL (' + (state.validateResult.errors||[]).length + ' errors)');
      saveCache();
      render();
    };

    // Apply (Variant B): allow applying even if FAIL, but warn first.
    var bApply = overlay.querySelector('[data-ai-apply]');
    if (bApply) bApply.onclick = function(){
      if (!state.validateResult){
        pushLog('Apply: no validation result');
        return;
      }
      if (!state.validateResult.ok){
        var ok = confirm(t('applyWarn'));
        if (!ok) return;
      }

      if (state.pendingPatchBoxes && Array.isArray(state.pendingPatchBoxes)){
        var applied = applyBoxesToActiveCard(state.pendingPatchBoxes, state.validateSource || 'left');
        if (!applied){
          pushLog('Apply: failed to apply patch to active card');
          uiToast('Apply failed: cannot access active card.', "warn");
          return;
        }
        pushLog('Apply: patched boxes applied to active card');
        // clear pending patch after applying
        state.pendingPatchBoxes = null;
        state.pendingPatchMeta = null;

        // re-run validation on live state
        try{
          state.validateResult = validateCurrentCard();
        }catch(e){
          pushLog('Apply: validation error after apply');
        }
        saveCache();
        render();
        return;
      }

      // No pending patch (legacy placeholder)
      pushLog('Apply: accepted (no pending patch)');
      saveCache();
      render();
    };

    // Fix button (bulb): run AI patch pipeline (Iteration 1)
    var bFix = overlay.querySelector('[data-ai-fix]');
    if (bFix) bFix.onclick = function(){
      if (state.fixBusy) return;

      if (!state.validateResult){
        pushLog('Fix: no validation result');
        uiToast(t('fixNeedValidate'), "warn");
        return;
      }
      if (state.validateResult.ok){
        pushLog('Fix: nothing to fix (OK)');
        uiToast(t('fixNoIssues'), "warn");
        return;
      }

      var ref = getActiveCardRefLive(state.validateSource || 'left');
      if (!ref || !ref.card){
        pushLog('Fix: cannot access active card (live state)');
        uiToast('Fix: cannot access active card.', "warn");
        return;
      }
      var boxesLive = (ref.card && Array.isArray(ref.card.boxes)) ? ref.card.boxes : [];
      if (!boxesLive.length){
        pushLog('Fix: active card has no boxes');
        uiToast('Fix: active card has no boxes.', "warn");
        return;
      }

      var ep = (state.endpoint || DEFAULTS.endpoint || '').replace(/\/+$/,'');
      var url = ep + '/chat/completions';
      var modelId = getModelIdFromModels() || 'local-model';

      var issues = (state.validateResult && state.validateResult.errors) ? state.validateResult.errors.slice(0, 25) : [];

      var sys =
  "You are a deterministic JSON patch generator for LingoCard German verb cards.\n" +
  "Rules:\n" +
  "- Output ONLY valid JSON (no markdown, no comments).\n" +
  "- Put the JSON in the main response (content). Do not include separate reasoning text.\n" +
  "- Do NOT invent new fields.\n" +
  "- Preserve existing structure; change only what is needed to fix the reported issues.\n" +
  "- If unsure, keep content as-is and report a warning.\n";

      var user = "Fix the card based on validation issues.\n"
        + "Return a single JSON object with keys:\n"
        + "  patchedBoxes: <array of boxes>\n"
        + "  report: { summary: string, actions: string[], warnings: string[] }\n"
        + "\n"
        + "Validation issues (errors):\n"
        + JSON.stringify(issues, null, 2) + "\n\n"
        + "Current boxes JSON:\n"
        + JSON.stringify(boxesLive, null, 2);

      state.fixBusy = true;
      state.aiReport = { summary: t('reportWorking'), actions: [], warnings: [] };
      state.aiReportRaw = '';
      state.pendingPatchBoxes = null;
      state.pendingPatchMeta = null;
      state.aiReportAt = Date.now();
      render();

      httpPostJson(url, {
        model: modelId,
        temperature: 0.2,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ]
      }, 20000).then(function(resp){
        if (!resp || !resp.ok){
          throw new Error('HTTP ' + (resp ? resp.status : ''));
        }
        return resp.json();
      }).then(function(data){
        var raw = '';
        try{ raw = _lcAiExtractAssistantText(data); }catch(e){}
        state.aiReportRaw = raw;

        var obj = extractFirstJsonObject(raw);
        if (!obj){
          state.aiReport = { summary: t('fixParseFail'), actions: [], warnings: [] };
          state.pendingPatchMeta = { validate: { ok:false, errors:[t('fixParseFail')], warnings:[], meta:{} } };
          return;
        }

        var patched = (obj.patchedBoxes && Array.isArray(obj.patchedBoxes)) ? obj.patchedBoxes
          : (obj.card && Array.isArray(obj.card.boxes)) ? obj.card.boxes
          : (obj.boxes && Array.isArray(obj.boxes)) ? obj.boxes
          : null;

        if (!patched){
          state.aiReport = { summary: t('fixParseFail'), actions: [], warnings: ['patchedBoxes missing'] };
          state.pendingPatchMeta = { validate: { ok:false, errors:[t('fixParseFail')], warnings:['patchedBoxes missing'], meta:{} } };
          return;
        }

        var rep = (obj.report && typeof obj.report === 'object') ? obj.report : {};
        state.aiReport = {
          summary: String(rep.summary || 'Fix done'),
          actions: Array.isArray(rep.actions) ? rep.actions : [],
          warnings: Array.isArray(rep.warnings) ? rep.warnings : []
        };

        state.pendingPatchBoxes = patched;
        var v2 = validateBoxesOnly(patched);
        state.pendingPatchMeta = { validate: v2 };
        if (v2.ok){
          // Auto-apply (user asked to make "Validate JSON" + "Apply" automatic).
          var applied2 = applyBoxesToActiveCard(patched, state.validateSource || 'left');
          if (applied2){
            state.pendingPatchBoxes = null;
            state.pendingPatchMeta = null;
            try{ state.validateResult = validateCurrentCard(); }catch(e){}
            pushLog('Fix: applied automatically (validation OK)');
            state.aiReport = state.aiReport || { summary:'', actions:[], warnings:[] };
            state.aiReport.actions = (state.aiReport.actions||[]).concat(['Applied automatically']);
          } else {
            pushLog('Fix: auto-apply failed (no access to active card)');
          }
        } else {
          pushLog('Fix: done (issues remain: ' + (v2.errors||[]).length + ')');
        }
      }).catch(function(err){
        pushLog('Fix error: ' + (err && err.message ? err.message : String(err)));
        state.aiReport = { summary: t('fixNetFail'), actions: [], warnings: [String(err && err.message ? err.message : err)] };
        state.pendingPatchMeta = { validate: { ok:false, errors:[t('fixNetFail')], warnings:[], meta:{} } };
      }).finally(function(){
        state.fixBusy = false;
        state.aiReportAt = Date.now();
        saveCache();
        render();
      });
    };

    overlay.querySelector('[data-ai-valmode]').onchange = function(){
      state.validatePayloadMode = !!this.checked;
      // auto-run validation so user immediately sees export payload
      try{ state.validateResult = validateCurrentCard(); }catch(e){}
      saveCache();
      render();
    };

    // Optional online verification (Wiktionary)
    var cbOnline = overlay.querySelector('[data-ai-online]');
    if (cbOnline){
      // keep visual state in sync
      cbOnline.checked = !!state.onlineVerify;
      cbOnline.onchange = async function(){
        var want = !!this.checked;
        if (!want){
          state.onlineVerify = false;
          saveCache();
          render();
          return;
        }

        // quick connectivity check (avoids silent "0/8" forever)
        try{
          var ok = await testWiktionaryAvailability();
          if (!ok) throw new Error('not ok');
          state.onlineVerify = true;
          pushLog('Online verify: Wiktionary reachable.');
        }catch(e){
          state.onlineVerify = false;
          this.checked = false;
          pushLog('Online verify: Wiktionary unavailable (no internet / blocked by policy). Disabled.');
        }
        saveCache();
        render();
      };
    }

    if (overlay.querySelector('[data-ai-valtoggle]')){
      var btn = overlay.querySelector('[data-ai-valtoggle]');
      btn.onclick = function(){
        state.validateSource = (state.validateSource === 'left') ? 'right' : 'left';
        saveCache();
        render();
      };
    }


// Generator: input + Generate button
var elGenInf = overlay.querySelector('[data-ai-geninf]');
if (elGenInf){
  elGenInf.oninput = function(){
    state.genInfText = String(this.value||'');
    saveCache();
  };
  elGenInf.onkeydown = function(ev){
    if (ev && ev.key === 'Enter'){
      var b = overlay.querySelector('[data-ai-generate]');
      if (b) b.click();
    }
  };
}

// =========================
// Batch import (verbs from .txt)
// =========================
// Parse user input for infinitives.
// Supports:
//  - comma/semicolon/newline separated lists:  gehen, kommen; bleiben
//  - whitespace separated lists: gehen kommen bleiben
//  - quoted multiword infinitives: "Rad fahren" "spazieren gehen"
function parseInfInputList(txt){
  var s = String(txt || '').trim();
  if (!s) return [];

  // Quick path: no obvious separators -> single item
  if (!/[\s,;\n\r\t]/.test(s)) return [s];

  var out = [];
  var seen = Object.create(null);
  var cur = '';
  var inQuote = false;
  var qChar = '';

  function pushCur(){
    var v = String(cur || '').trim();
    cur = '';
    if (!v) return;
    v = v.replace(/\s+/g, ' ');
    var key = v.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(v);
  }

  for (var i=0;i<s.length;i++){
    var ch = s.charAt(i);

    if (inQuote){
      if (ch === qChar){
        inQuote = false;
        qChar = '';
        continue;
      }
      cur += ch;
      continue;
    }

    if (ch === '"' || ch === '\''){ // open quote
      inQuote = true;
      qChar = ch;
      continue;
    }

    // Hard separators
    if (ch === ',' || ch === ';' || ch === '\n' || ch === '\r' || ch === '\t'){
      pushCur();
      continue;
    }

    // Whitespace separator (space) splits items too.
    // Multiword verbs should be quoted.
    if (ch === ' '){
      // collapse consecutive spaces into a single separator
      pushCur();
      while (i+1 < s.length && s.charAt(i+1) === ' ') i++;
      continue;
    }

    cur += ch;
  }
  pushCur();

  return out;
}

// =========================
// RU/EN input -> DE infinitive resolver
// =========================
function hasCyrillic(s){
  return /[\u0400-\u04FF]/.test(String(s||''));
}

function normalizeInfCandidate(s){
  s = String(s||'').trim();
  if (!s) return '';
  // strip surrounding quotes
  s = s.replace(/^\s*['\"]+/, '').replace(/['\"]+\s*$/, '');
  // drop trailing punctuation
  s = s.replace(/[\.,;:!\?]+\s*$/,'').trim();
  // collapse spaces
  s = s.replace(/\s+/g,' ');
  return s;
}

var _genInfSetLower = null;
function ensureGenInfSet(list){
  try{
    if (_genInfSetLower && _genInfSetLower._size && _genInfSetLower._srcLen === (list||[]).length) return;
  }catch(e){}
  var set = Object.create(null);
  var n = 0;
  (list||[]).forEach(function(v){
    var k = String(v||'').trim().toLowerCase();
    if (!k) return;
    if (!set[k]){ set[k] = 1; n++; }
  });
  set._size = n;
  set._srcLen = (list||[]).length;
  _genInfSetLower = set;
}

function looksLikeEnglishWord(s){
  s = String(s||'').trim();
  if (!s) return false;
  // If it has German-only letters, treat as DE.
  if (/[äöüßÄÖÜ]/.test(s)) return false;
  // Allow spaces/hyphen ("take off" / "log in" / "back-up")
  return /^[A-Za-z][A-Za-z\s\-]*$/.test(s);
}

async function translateToGermanInfinitive(input){
  var q = normalizeInfCandidate(input);
  if (!q) return '';
  var sys = "You are a German lexicon tool. Return ONLY the German infinitive (dictionary form) that best matches the meaning of the input verb. If unsure, return an empty string. No quotes. No punctuation. No extra words.";
  var usr = "Input verb (may be Russian or English): " + q + "\nReturn ONLY the German infinitive.";
  var txt = '';
  try{
    txt = await aiChatJson(sys, usr);
  }catch(e){
    pushLog('Translate failed: ' + String((e && e.message) || e));
    return '';
  }
  txt = normalizeInfCandidate(txt);
  // keep at most 3 tokens (allows: "Rad fahren")
  var parts = txt.split(/\s+/g).filter(Boolean);
  if (parts.length > 3) parts = parts.slice(0,3);
  txt = parts.join(' ');
  return txt;
}

async function resolveInfinitiveToken(token){
  var raw = normalizeInfCandidate(token);
  if (!raw) return '';

  // If Russian -> translate
  if (hasCyrillic(raw)){
    var de1 = await translateToGermanInfinitive(raw);
    return de1 || raw;
  }

  // If English-like and not found in DE list -> translate
  if (looksLikeEnglishWord(raw)){
    try{
      var list = await loadGenInfVerbsOnce();
      ensureGenInfSet(list);
      var key = raw.toLowerCase();
      if (_genInfSetLower && _genInfSetLower[key]) return raw;
    }catch(e){}
    var de2 = await translateToGermanInfinitive(raw);
    return de2 || raw;
  }

  return raw;
}

async function resolveInfList(list){
  var out = [];
  var seen = Object.create(null);
  for (var i=0;i<(list||[]).length;i++){
    var tok = String(list[i]||'').trim();
    if (!tok) continue;
    // Small UI hint in batch mode
    state.batch.current = tok;
    render();
    var de = await resolveInfinitiveToken(tok);
    de = normalizeInfCandidate(de);
    if (!de) continue;
    var k = de.toLowerCase();
    if (seen[k]) continue;
    seen[k] = 1;
    out.push(de);
  }
  return out;
}

function parseVerbsFromText(txt){
  var s = String(txt || '');
  // Allow commas (primary), plus newlines/semicolons as soft separators
  var parts = s.split(/[,;\n\r]+/g);
  var out = [];
  var seen = Object.create(null);
  for (var i=0;i<parts.length;i++){
    var v = String(parts[i] || '').trim();
    if (!v) continue;
    // Normalize multiple spaces
    v = v.replace(/\s+/g, ' ');
    // Simple de-dup (case-insensitive)
    var key = v.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(v);
  }
  return out;
}

function batchStop(){
  state.batch.stopped = true;
  state.batch.running = false;
  state.batch.current = '';
  render();
  saveCache();
}

function batchStart(list){
  state.batch.queue = Array.isArray(list) ? list.slice(0) : [];
  state.batch.total = state.batch.queue.length;
  state.batch.done = 0;
  state.batch.err = 0;
  state.batch.current = '';
  state.batch.running = !!state.batch.total;
  state.batch.stopped = false;
  render();
  saveCache();
  if (!state.batch.running) return;
  batchNext();
}

function batchNext(){
  if (!state.batch.running || state.batch.stopped) return;
  if (!state.batch.queue.length){
    state.batch.running = false;
    state.batch.current = '';
    render();
    saveCache();
    return;
  }
  var inf = String(state.batch.queue.shift() || '').trim();
  if (!inf){
    batchNext();
    return;
  }
  state.batch.current = inf;
  render();

  // Reuse the same generation logic as the button, but auto-continue.
  doGenerate(inf, { fromBatch:true })
    .then(function(ok){
      if (!ok) state.batch.err += 1;
      state.batch.done += 1;
      render();
      saveCache();
      // Small breath to keep UI responsive
      setTimeout(batchNext, 50);
    })
    .catch(function(){
      state.batch.err += 1;
      state.batch.done += 1;
      render();
      saveCache();
      setTimeout(batchNext, 50);
    });
}

// Unified generator logic (manual + batch)
function doGenerate(inf, opts){
  opts = opts || {};
  if (state.genBusy) return Promise.resolve(false);

  inf = String(inf || '').trim();
  if (inf.length < (DEFAULTS.validate && DEFAULTS.validate.minInfChars || 2)){
    if (!opts.fromBatch) uiToast(t('genTooShort'), "warn");
    return Promise.resolve(false);
  }

  // Critical: if SOURCE (left) is active, adding a new draft card can fail in rare states.
  ensureRightCardActive();

  var ep = String(state.endpoint || (overlay.querySelector('[data-ai-endpoint]') ? overlay.querySelector('[data-ai-endpoint]').value : '') || DEFAULTS.endpoint).trim();
  state.endpoint = ep || DEFAULTS.endpoint;

  state.genBusy = true;
  startGenTimer();
  state.aiReport = { summary: '', actions:[], warnings:[], remainingIssues:[] };
  state.aiReportRaw = '';
  state.aiReportAt = Date.now();
  render();

  return (state.connected ? Promise.resolve(true) : testLmStudioConnection({ silent:true }))
    .then(function(ok){
      if (!ok) throw new Error('not_connected');
      return generateCardFromInf(inf);
    })
    .then(function(res){
      var boxes = null;
      var contractWarn = [];
      if (typeof res === 'string'){
        state.aiReportRaw = res;
        var parsed = null;
        try{ parsed = JSON.parse(res); }catch(e){ parsed = null; }
        if (parsed && Array.isArray(parsed.boxes)) boxes = parsed.boxes;
      } else {
        var rawTxt = (res && res.raw) ? String(res.raw) : '';
        var human = (res && res.contract) ? humanizeContractCheck(res.contract) : '';
        if (res && res.contract && Array.isArray(res.contract.warnings)){
          contractWarn = res.contract.warnings.slice(0, 8);
        }
        state.aiReportRaw = (human ? (human + "\n\n") : '') + (rawTxt||'');
        if (res && res.ok && res.json && Array.isArray(res.json.boxes)) boxes = res.json.boxes;
        if (res && res.contract && Array.isArray(res.contract.warnings) && res.contract.warnings.length){
          contractWarn = res.contract.warnings.slice(0, 5);
        }
        if (res && !res.ok){
          var warn = [];
          if (res.contract && res.contract.errors && res.contract.errors.length) warn = res.contract.errors.slice(0, 5);
          if (!warn.length) warn = [t('fixParseFail')];
          pushLog('Generate: contract failed');
          state.aiReport = { summary: t('genFail'), actions:[], warnings: warn, remainingIssues: warn };
          return false;
        }
      }

      if (!boxes){
        pushLog('Generate: invalid JSON payload (no boxes)');
        state.aiReport = { summary: t('genFail'), actions:[], warnings:[t('fixParseFail')], remainingIssues:[] };
        return false;
      }

      var added = addCardToList(boxes, 'right', inf);
      if (!added){
        if (!opts.fromBatch) uiToast('Generate failed: cannot access app state.', "warn");
        return false;
      }

      // Visual feedback: porthole smoothly turns green when the verb appears in the right list.
      try{
        state._portholeFlashUntil = now() + 1500;
        var elP = overlay ? q(overlay, '[data-ai-fix] .ai-porthole') : null;
        if (elP) setPortholeSolid(elP, '#22c55e');
      }catch(e){}

      stopGenTimer();
      pushLog('Generate time: ' + (state.genTimerMs/1000).toFixed(2) + 's');
      state.lastGenIdx = added.idx;
      state.lastGenList = added.list;
      state.aiReport = {
        summary: t('genOk') + ': ' + inf,
        actions: [t('genDraftRight')],
        warnings: contractWarn,
        remainingIssues: []
      };

      state.validateSource = 'right';
      try{ state.validateResult = validateCurrentCard(); }catch(e){}
      saveCache();
      return true;
    })
    .catch(function(err){
      var msg = (err && err.message) ? err.message : String(err);
      if (msg === 'not_connected'){
        pushLog('Generate blocked: not connected');
      } else {
        pushLog('Generate ERROR: ' + msg);
      }
      if (!opts.fromBatch) uiToast(t('fixNetFail'), 'warn');
      return false;
    })
    .finally(function(){
      state.genBusy = false;
      stopGenTimer();
      render();
    });
}

var bGen = overlay.querySelector('[data-ai-generate]');
if (bGen) bGen.onclick = function(){
  // Autocorrect infinitive if user typed only a prefix and a completion exists.
  try{ if (genInfAc) genInfAc.autocorrectIfNeeded(); }catch(e){}
  var raw = String(state.genInfText || (elGenInf?elGenInf.value:'') || '').trim();
  // Keep state in sync in case we autocorrected the live input.
  state.genInfText = raw;
  saveCache();

  // Allow multiple infinitives in the same input.
  // Examples:
  //   gehen, kommen, bleiben
  //   gehen kommen bleiben
  //   "Rad fahren" "spazieren gehen"
  var list = parseInfInputList(raw);
  if (list.length > 1){
    // Ensure the app is in RIGHT mode before we start.
    ensureRightCardActive();
    // Run a quick silent check once. If not connected, do not start.
    testLmStudioConnection({ silent:true }).then(function(ok){
      if (!ok){
        uiToast(t('fixNetFail'), 'warn');
        return;
      }
      // Resolve RU/EN tokens into German infinitives before batch generation.
      state.batch.current = '';
      resolveInfList(list).then(function(resolved){
        var finalList = Array.isArray(resolved) ? resolved : [];
        if (!finalList.length){
          uiToast(t('importPick'), 'warn');
          return;
        }
        batchStart(finalList);
      }).catch(function(e){
        pushLog('Batch resolve failed: ' + String((e && e.message) || e));
        batchStart(list);
      });
    });
    return;
  }

  var inf = String(list[0] || '').trim();
  state.genInfText = inf;
  saveCache();
  // Resolve RU/EN input to DE infinitive (best-effort) before generation.
  testLmStudioConnection({ silent:true }).then(function(ok){
    if (!ok){ uiToast(t('fixNetFail'), 'warn'); return; }
    resolveInfinitiveToken(inf).then(function(de){
      var finalInf = String(de || inf).trim();
      state.genInfText = finalInf;
      saveCache();
      doGenerate(finalInf, { fromBatch:false });
    }).catch(function(){
      doGenerate(inf, { fromBatch:false });
    });
  });
};

// Batch import button + file picker
var bImport = overlay.querySelector('[data-ai-import]');
var fImport = overlay.querySelector('[data-ai-import-file]');
if (bImport && fImport){
  bImport.onclick = function(){
    try{ fImport.value = ''; }catch(e){}
    fImport.click();
  };
  fImport.onchange = function(){
    var f = (this.files && this.files[0]) ? this.files[0] : null;
    if (!f) return;
    var r = new FileReader();
    r.onload = function(){
      var verbs = parseVerbsFromText(r.result || '');
      if (!verbs.length){
        uiToast(t('importPick'), 'warn');
        return;
      }
      // Ensure the app is in RIGHT mode before we start.
      ensureRightCardActive();
      // Run a quick silent check once. If not connected, do not start.
      testLmStudioConnection({ silent:true }).then(function(ok){
        if (!ok){
          uiToast(t('fixNetFail'), 'warn');
          return;
        }
        resolveInfList(verbs).then(function(resolved){
          var finalList = Array.isArray(resolved) ? resolved : [];
          if (!finalList.length){
            uiToast(t('importPick'), 'warn');
            return;
          }
          batchStart(finalList);
        }).catch(function(){
          batchStart(verbs);
        });
      });
    };
    r.onerror = function(){ uiToast('File read error.', 'warn'); };
    try{ r.readAsText(f); }catch(e){ uiToast('File read error.', 'warn'); }
  };
}

var bStop = overlay.querySelector('[data-ai-batch-stop]');
if (bStop) bStop.onclick = function(){
  batchStop();
};

// Move draft -> left list
var bMove = overlay.querySelector('[data-ai-moveleft]');
if (bMove) bMove.onclick = function(){
  var ok = moveActiveDraftToLeft();
  if (!ok){
    uiToast('Move failed: cannot access active draft card.', "warn");
    return;
  }
  // switch source to left after moving
  state.validateSource = 'left';
  try{ state.validateResult = validateCurrentCard(); }catch(e){}
  state.aiReport = state.aiReport || {};
  state.aiReport.summary = 'Moved draft card to left list.';
  state.aiReport.actions = (state.aiReport.actions||[]).concat(['Moved active draft card to left list.', 'History updated.']);
  state.aiReportAt = Date.now();
  saveCache();
  render();
};


    return overlay;
  }

  function open(){
    if (overlay) return;
    // Always refresh CSS on each open so UI tweaks are visible without hard reload.
    try{ ensureCss(); }catch(e){}
    state.desiredOpen = true;
    loadCache();
    // Important UX guard: make sure RIGHT (draft/cards) is active.
    // Otherwise generation may create a card in an invalid context.
    try{ ensureRightCardActive(); }catch(e){}
    buildOverlay();
    document.body.appendChild(overlay);
    render();

    // Attach infinitive autocomplete to generator input (non-blocking).
    initGenInfAutocomplete();

    // Auto-check LM Studio on panel open (no manual clicking).
    // If it's down, status indicator will start blinking.
    testLmStudioConnection({ silent:true });
  }

  function close(){
    if (!overlay) return;
    stopPing();
    stopConnBlink();
    stopGenTimer();
    try{ overlay.remove(); }catch(e){}
    overlay = null;
    state.desiredOpen = false;
  }

  // boot
  function ensureCss(){
    // Always refresh CSS on open to avoid cache surprises while iterating UI.
    // Implementation detail: some browsers keep a "sticky" cached stylesheet
    // even when href is updated. The most reliable way is to re-insert the <link>
    // with a unique URL each time.
    try{
      var old = document.querySelector('link[data-ai-css]');
      if (old) old.remove();
    }catch(e){}

    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.dataset.aiCss = '1';
    // Extra entropy to guarantee a new request (even through aggressive caches).
    l.href = 'ai/ai.styles.css?ts=' + now() + '&r=' + Math.random().toString(16).slice(2);
    document.head.appendChild(l);
  }


  
// Expose public API immediately (first click should open without a second click).
window.AI_PANEL = window.AI_PANEL || {};
window.AI_PANEL.open = open;
window.AI_PANEL.close = close;

// Minimal public API for the main UI (so we can place “move to left” outside the modal).
window.LC_AI_PANEL_API = window.LC_AI_PANEL_API || {};
window.LC_AI_PANEL_API.moveActiveDraftToLeft = moveActiveDraftToLeft;

// Load defaults async (non-blocking)
// In the modular build we load defaults through loadCache() inside open().
// The older monolithic build had a separate loadDefaults(); keep behavior
// but avoid hard failure if that helper is absent.
Promise.resolve().finally(function(){
  ensureCss();
});

function lmAlertHtml(){
  if (!state.lmAlert || !state.lmAlert.visible) return '';
  var url = 'https://lmstudio.ai/download';
  var reason = state.lmAlert.reason ? ('<div class="ai-alert-reason">Причина: '+escapeHtml(state.lmAlert.reason)+'</div>') : '';
  return '' +
    '<div class="ai-alert">' +
      '<div class="ai-alert-title">LM Studio не запущена / нет соединения</div>' +
      '<div class="ai-alert-text">Для продолжения:</div>' +
      '<ol class="ai-alert-steps">' +
        '<li>Установите LM Studio: <a href="'+url+'" target="_blank" rel="noopener">lmstudio.ai/download</a></li>' +
        '<li>Скачайте модель (Discover → Download model)</li>' +
        '<li>Загрузите модель (Load to memory)</li>' +
        '<li>Включите Local Server (OpenAI compatible): host <b>localhost</b>, port <b>1234</b></li>' +
      '</ol>' +
      reason +
      '<div class="ai-alert-actions">' +
        '<button class="ai-btn" data-ai-alert-retry>Повторить проверку</button>' +
        '<button class="ai-btn ai-btn-ghost" data-ai-alert-hide>Скрыть</button>' +
      '</div>' +
    '</div>';
}
function emitAiStatus(){
  try{
    window.LC_AI = window.LC_AI || {};
    window.LC_AI.connected = !!state.connected;
    window.LC_AI.reason = String((state.lmAlert && state.lmAlert.reason) || "");
    window.dispatchEvent(new CustomEvent('LC_AI_STATUS', {
      detail: { connected: !!state.connected, reason: window.LC_AI.reason }
    }));
  }catch(e){}
}

})();  // <-- единственный финальный
