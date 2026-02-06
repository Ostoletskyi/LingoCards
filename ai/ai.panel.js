(function(){
  'use strict';

  // =========================
  // Config / State
  // =========================
  var DEFAULTS = {
    endpoint: 'http://localhost:1234/v1',
    timeoutMs: 8000,
    cacheTtlMs: 600000,
    validate: { requireBoxes:['inf','tr','forms'], minInfChars:2 }
  };

  var LS_KEY = 'LC_AI_PANEL_CACHE_V1';

  var state = {
    endpoint: DEFAULTS.endpoint,
    modelsJson: '',
    log: [],
    validateResult: null,
    validatePayloadMode: false,

    // new:
    desiredOpen: false,     // хотим ли мы держать панель открытой
    dockToPreview: true     // панель поверх превью (cardHost)
  };

  var overlay = null;
  var mo = null;           // MutationObserver
  var restoreTimer = 0;

  // =========================
  // Helpers
  // =========================
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
  function escapeHtml(s){
    return String(s).replace(/[&<>'"]/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function setStatusClass(el, kind){
    el.classList.remove('ok','warn','bad');
    if (kind) el.classList.add(kind);
  }
  function clip(s, n){
    s = String(s==null?'':s);
    if (s.length <= n) return s;
    return s.slice(0, n) + '…';
  }

  // =========================
  // Defaults / Cache
  // =========================
  function loadDefaults(){
    return fetch('/ai/config/ai.defaults.json?ts='+now(), { cache: 'no-store' })
      .then(function(r){ return r.ok ? r.text() : ''; })
      .then(function(txt){
        var obj = safeJsonParse(txt);
        if (obj && typeof obj === 'object'){
          DEFAULTS.endpoint  = (typeof obj.endpoint === 'string' && obj.endpoint) ? obj.endpoint : DEFAULTS.endpoint;
          DEFAULTS.timeoutMs = (Number.isFinite(obj.timeoutMs) ? obj.timeoutMs : DEFAULTS.timeoutMs);
          DEFAULTS.cacheTtlMs= (Number.isFinite(obj.cacheTtlMs) ? obj.cacheTtlMs : DEFAULTS.cacheTtlMs);
          if (obj.validate && typeof obj.validate === 'object') DEFAULTS.validate = obj.validate;
        }
      })
      .catch(function(){});
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
        if (typeof obj.state.dockToPreview === 'boolean') state.dockToPreview = obj.state.dockToPreview;
      }
    }catch(e){}
  }

  function saveCache(){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify({
        exp: now() + (DEFAULTS.cacheTtlMs||600000),
        state: {
          endpoint: state.endpoint,
          modelsJson: state.modelsJson,
          log: state.log,
          dockToPreview: !!state.dockToPreview
        }
      }));
    }catch(e){}
  }

  // =========================
  // HTTP
  // =========================
  function httpGet(url){
    var ctrl = new AbortController();
    var t = setTimeout(function(){ ctrl.abort(); }, DEFAULTS.timeoutMs || 8000);
    return fetch(url, { method:'GET', signal: ctrl.signal })
      .finally(function(){ clearTimeout(t); });
  }

  // Некоторые окружения (или обёртки над fetch) могут вернуть не Response,
  // а обычный объект/строку. Нормализуем это в текст максимально безопасно.
  function readResponseText(r){
    try{
      if (r == null) return Promise.resolve('');
      if (typeof r === 'string') return Promise.resolve(r);
      if (typeof r.text === 'function') return r.text();
      // sometimes wrappers use { text: "..." }
      if (typeof r.text === 'string') return Promise.resolve(r.text);
      if (typeof r.body === 'string') return Promise.resolve(r.body);
      // last resort: stringify
      return Promise.resolve(JSON.stringify(r));
    }catch(e){
      return Promise.resolve('');
    }
  }

  // =========================
  // Layout: panel overlays preview (cardHost)
  // =========================
  function getCardHostRect(){
    var el = document.getElementById('cardHost');
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (!r || r.width < 50 || r.height < 50) return null;
    return r;
  }

  function applyPanelLayout(){
    if (!overlay) return;
    var panel = overlay.querySelector('.ai-panel');
    if (!panel) return;

    // если док отключён — оставляем как есть (плавающий вариант)
    if (!state.dockToPreview){
      panel.style.position = 'fixed';
      panel.style.left = '280px';
      panel.style.top = '80px';
      panel.style.width = 'min(1100px, calc(100vw - 320px))';
      panel.style.height = 'min(820px, calc(100vh - 120px))';
      panel.style.maxWidth = 'none';
      panel.style.maxHeight = 'none';
      return;
    }

    var r = getCardHostRect();
    if (!r){
      // fallback
      panel.style.position = 'fixed';
      panel.style.left = '280px';
      panel.style.top = '80px';
      panel.style.width = 'min(1100px, calc(100vw - 320px))';
      panel.style.height = 'min(820px, calc(100vh - 120px))';
      panel.style.maxWidth = 'none';
      panel.style.maxHeight = 'none';
      return;
    }

    panel.style.position = 'fixed';
    panel.style.left = Math.round(r.left) + 'px';
    panel.style.top  = Math.round(r.top) + 'px';
    panel.style.width  = Math.round(r.width) + 'px';
    panel.style.height = Math.round(r.height) + 'px';
    panel.style.maxWidth = 'none';
    panel.style.maxHeight = 'none';
  }

  function attachPanelLayoutWatchers(){
    window.addEventListener('resize', applyPanelLayout, { passive:true });
    window.addEventListener('scroll', applyPanelLayout, { passive:true });
    setTimeout(applyPanelLayout, 0);
    setTimeout(applyPanelLayout, 200);
    setTimeout(applyPanelLayout, 800);
  }

  // =========================
  // App State / Validation
  // =========================
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

  function getBoxText(b){
    if (!b || typeof b !== 'object') return '';
    if (typeof b.text === 'string') return b.text.trim();
    if (Array.isArray(b.lines)){
      return b.lines.map(function(l){
        if (typeof l === 'string') return l;
        if (l && typeof l.text === 'string') return l.text;
        return '';
      }).join('\n').trim();
    }
    if (typeof b.value === 'string') return b.value.trim();
    if (typeof b.content === 'string') return b.content.trim();
    return '';
  }

  function pickActiveCardBoxes(st){
    if (st && st.activeCard && Array.isArray(st.activeCard.boxes) && st.activeCard.boxes.length){
      return { source: 'st.activeCard.boxes', boxes: st.activeCard.boxes, card: st.activeCard };
    }

    if (Array.isArray(st.cards) && st.cards.length){
      var idx = null;
      if (Number.isFinite(st.activeCardIndex)) idx = st.activeCardIndex;
      else if (Number.isFinite(st.selectedCardIndex)) idx = st.selectedCardIndex;
      if (idx == null) idx = 0;

      var c = st.cards[idx];
      if (c && Array.isArray(c.boxes) && c.boxes.length){
        return { source: 'st.cards['+idx+'].boxes', boxes: c.boxes, card: c, index: idx };
      }
    }

    if (Array.isArray(st.cardsRight) && st.cardsRight.length){
      var idxR = null;
      if (Number.isFinite(st.activeRightIndex)) idxR = st.activeRightIndex;
      else if (Number.isFinite(st.selectedRightIndex)) idxR = st.selectedRightIndex;
      if (idxR == null) idxR = 0;

      var cr = st.cardsRight[idxR];
      if (cr && Array.isArray(cr.boxes) && cr.boxes.length){
        return { source: 'st.cardsRight['+idxR+'].boxes', boxes: cr.boxes, card: cr, index: idxR, right: true };
      }
    }

    if (Array.isArray(st.boxes) && st.boxes.length){
      return { source: 'st.boxes', boxes: st.boxes, card: null };
    }

    return { source: 'none', boxes: [], card: null };
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

    var pick = pickActiveCardBoxes(st);
    var boxes = pick.boxes;
    var cardObj = pick.card;

    if (cardObj){
      if (Number.isFinite(cardObj.cardWmm)) cardW = cardObj.cardWmm;
      if (Number.isFinite(cardObj.cardHmm)) cardH = cardObj.cardHmm;
      if (typeof cardObj.id === 'string') res.meta.cardId = cardObj.id;
      if (typeof cardObj.title === 'string') res.meta.cardTitle = cardObj.title;
    }

    res.meta.card = { widthMm: cardW, heightMm: cardH };
    res.meta.boxesSource = pick.source;
    res.meta.boxesCount = boxes.length;
    res.meta.debug = { preview: {} };

    if (!boxes.length){
      res.ok = false;
      res.errors.push('Не удалось найти boxes для активной карточки (source=' + pick.source + ').');
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
        res.errors.push('Отсутствует обязательный блок: '+id);
        continue;
      }

      var txt = getBoxText(b);
      res.meta.debug.preview[id] = clip(txt, 120);

      if (id === 'inf'){
        var minChars = (DEFAULTS.validate && Number.isFinite(DEFAULTS.validate.minInfChars))
          ? DEFAULTS.validate.minInfChars : 2;
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

    // geometry checks
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

    // optional payload
    if (state.validatePayloadMode){
      var cards = Array.isArray(st.cardsRight) ? st.cardsRight : (Array.isArray(st.cards) ? st.cards : []);
      var payload = { version:1, kind:'cards-right', card:{ widthMm:cardW, heightMm:cardH }, cards: cards, verbs: [] };

      for (var c=0;c<cards.length;c++){
        var card = cards[c];
        var infB = boxById(card && card.boxes, 'inf');
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
        payload.verbs[payload.verbs.length-1].forms = { p3: parts2[0]||'', pret: parts2[1]||'', p2: parts2[2]||'', aux: '' };
      }

      res.meta.payload = { cardsCount: cards.length, verbsCount: payload.verbs.length };
      if (!Array.isArray(payload.cards)) { res.ok=false; res.errors.push('payload.cards не массив.'); }
      if (!Array.isArray(payload.verbs)) { res.ok=false; res.errors.push('payload.verbs не массив.'); }
      if (!payload.cards.length) res.warnings.push('payload.cards пустой (в правом списке нет черновиков).');
    }

    return res;
  }

  // =========================
  // Best-effort navigation: Prev/Next card
  // =========================
  function trySelectCard(delta){
    var st = getRuntimeState();
    if (!st || !Array.isArray(st.cards) || !st.cards.length){
      pushLog('NAV: cards[] not found.');
      render();
      return;
    }

    var idx = 0;
    if (Number.isFinite(st.activeCardIndex)) idx = st.activeCardIndex;
    else if (Number.isFinite(st.selectedCardIndex)) idx = st.selectedCardIndex;

    var next = idx + delta;
    if (next < 0) next = 0;
    if (next >= st.cards.length) next = st.cards.length - 1;

    // 1) Dedicated helper?
    if (window.LC_DIAG && typeof window.LC_DIAG.selectCardIndex === 'function'){
      window.LC_DIAG.selectCardIndex(next);
      pushLog('NAV: LC_DIAG.selectCardIndex(' + next + ')');
      render();
      return;
    }

    var ctx = getCtxApp();

    // 2) setState (если есть)
    if (ctx && typeof ctx.setState === 'function'){
      try{
        ctx.setState({ activeCardIndex: next, selectedCardIndex: next });
        pushLog('NAV: ctxApp.setState(activeCardIndex=' + next + ')');
        render();
        return;
      }catch(e){}
    }

    // 3) dispatch (если есть)
    if (ctx && typeof ctx.dispatch === 'function'){
      try{
        ctx.dispatch({ type: 'SET_ACTIVE_CARD', index: next });
        pushLog('NAV: ctxApp.dispatch(SET_ACTIVE_CARD ' + next + ')');
        render();
        return;
      }catch(e){}
    }

    pushLog('NAV: no API to change card index found (need hook in LC_DIAG).');
    render();
  }

  // =========================
  // UI
  // =========================
  function render(){
    if (!overlay) return;

    var elStatus   = overlay.querySelector('[data-ai-status]');
    var elEndpoint = overlay.querySelector('[data-ai-endpoint]');
    var elModels   = overlay.querySelector('[data-ai-models]');
    var elLog      = overlay.querySelector('[data-ai-log]');
    var elVal      = overlay.querySelector('[data-ai-validate]');
    var elValMeta  = overlay.querySelector('[data-ai-validate-meta]');
    var elValMode  = overlay.querySelector('[data-ai-valmode]');
    var elDock     = overlay.querySelector('[data-ai-dock]');

    if (elEndpoint) elEndpoint.value = state.endpoint || DEFAULTS.endpoint;
    if (elModels) elModels.textContent = state.modelsJson || '';
    if (elLog) elLog.textContent = (state.log || []).join('\n');
    if (elValMode) elValMode.checked = !!state.validatePayloadMode;
    if (elDock) elDock.checked = !!state.dockToPreview;

    if (elVal){
      if (!state.validateResult){
        elVal.innerHTML = '<span class="ai-small">Пока не запускали проверку.</span>';
        if (elValMeta) elValMeta.textContent = '';
      } else {
        var r = state.validateResult;
        var BUL = '\u2022 ';
        var DASH = '\u2014';

        var head = r.ok
          ? '<div class="ai-result-ok"><b>OK</b> '+DASH+' ошибок не найдено.</div>'
          : '<div class="ai-result-bad"><b>FAIL</b> '+DASH+' есть ошибки, карточка неканонична.</div>';

        var eList = (r.errors || []).map(function(x){ return BUL + x; }).join('\n');
        var wList = (r.warnings || []).map(function(x){ return BUL + x; }).join('\n');

        var body =
          (eList ? ('Ошибки:\n' + eList + '\n\n') : '') +
          (wList ? ('Предупреждения:\n' + wList) : '');

        elVal.innerHTML = head + '<pre class="ai-pre">' + escapeHtml(body) + '</pre>';

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

    // Контейнер НЕ блокирует UI
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'transparent';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '99999';

    var TITLE = "\uD83E\uDDE0 AI Control Panel";

    overlay.innerHTML =
      '<div class="ai-panel" role="dialog" aria-modal="false" tabindex="-1">' +
        '<div class="ai-header">' +
          '<div class="ai-title">'+TITLE+'</div>' +
          '<button class="ai-close" data-ai-close>Close</button>' +
        '</div>' +

        '<div class="ai-body" style="height: calc(100% - 44px); display:flex; flex-direction:column;">' +

          '<div class="ai-row">' +
            '<div class="ai-label">Status:</div>' +
            '<div class="ai-pill" data-ai-status>Not tested</div>' +
            '<div style="margin-left:auto; display:flex; gap:10px; align-items:center;">' +
              '<label class="ai-check" title="Панель поверх превью (cardHost)"><input type="checkbox" data-ai-dock /> dock to preview</label>' +
            '</div>' +
          '</div>' +

          '<div class="ai-kv">' +
            '<div class="ai-label">Endpoint:</div>' +
            '<input class="ai-input" data-ai-endpoint />' +
          '</div>' +

          '<div class="ai-row" style="gap:8px; flex-wrap:wrap;">' +
            '<button class="ai-btn primary" data-ai-test>Test Connection</button>' +
            '<button class="ai-btn" data-ai-clearlog>Clear Log</button>' +
            '<span style="flex:1"></span>' +
            '<button class="ai-btn" data-ai-prev title="Предыдущая карточка (best-effort)">◀ Prev</button>' +
            '<button class="ai-btn" data-ai-next title="Следующая карточка (best-effort)">Next ▶</button>' +
            '<button class="ai-btn primary" data-ai-validate-btn title="Ctrl+Enter">Validate</button>' +
          '</div>' +

          '<div class="ai-split" style="flex:1; min-height: 280px; overflow:hidden;">' +
            '<div class="ai-box" style="height:100%; overflow:auto;">' +
              '<h4>Models (/v1/models):</h4>' +
              '<pre class="ai-pre" data-ai-models></pre>' +
            '</div>' +
            '<div class="ai-box" style="height:100%; overflow:auto;">' +
              '<h4>Validate:</h4>' +
              '<div class="ai-row">' +
                '<div class="ai-row" style="gap:10px; align-items:center;"><span class="ai-small" style="min-width:120px;">Источник проверки:</span><select class="ai-input" style="max-width:220px;" data-ai-valsource><option value="left">Левый список (карточки)</option><option value="right">Правый список (черновик)</option><option value="auto">Авто</option></select></div><label class="ai-check" style="margin-top:6px;"><input type="checkbox" data-ai-valmode /> validate export payload (cards-right)</label>' +
              '</div>' +
              '<div class="ai-box" style="margin-top:10px">' +
                '<div data-ai-validate></div>' +
              '</div>' +
              '<div class="ai-box" style="margin-top:10px">' +
                '<h4>Meta:</h4>' +
                '<pre class="ai-pre" data-ai-validate-meta></pre>' +
              '</div>' +
              '<div class="ai-small">Источник: window.LC_DIAG.getState()</div>' +
            '</div>' +
          '</div>' +

          '<div class="ai-box" style="height: 160px; overflow:auto; margin-top: 10px;">' +
            '<h4>Log:</h4>' +
            '<pre class="ai-pre" data-ai-log></pre>' +
          '</div>' +

        '</div>' +
      '</div>';

    var panel = overlay.querySelector('.ai-panel');
    panel.style.pointerEvents = 'auto';
    panel.style.borderRadius = '12px';
    panel.style.boxShadow = '0 20px 60px rgba(0,0,0,.55)';

    // handlers
    overlay.querySelector('[data-ai-close]').onclick = function(){ close(); };

    overlay.querySelector('[data-ai-test]').onclick = function(){
      var ep = overlay.querySelector('[data-ai-endpoint]').value.trim();
      state.endpoint = ep || DEFAULTS.endpoint;
      pushLog('Testing: ' + state.endpoint + '/models');
      render();
      httpGet(state.endpoint.replace(/\/+$/,'') + '/models')
        .then(function(r){
          return readResponseText(r).then(function(x){
            if (!x.ok) throw new Error('HTTP '+x.status);
            return x.text;
          });
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
      runValidate();
    };

    overlay.querySelector('[data-ai-valmode]').onchange = function(){
      state.validatePayloadMode = !!this.checked;
      saveCache();
    };

    overlay.querySelector('[data-ai-dock]').onchange = function(){
      state.dockToPreview = !!this.checked;
      saveCache();
      applyPanelLayout();
    };

    overlay.querySelector('[data-ai-prev]').onclick = function(){ trySelectCard(-1); };
    overlay.querySelector('[data-ai-next]').onclick = function(){ trySelectCard(+1); };

    // hotkeys (работают даже когда кликаешь в список глаголов)
    window.addEventListener('keydown', onKeyDown, true);

    applyPanelLayout();
    attachPanelLayoutWatchers();

    return overlay;
  }

  function onKeyDown(e){
    if (!state.desiredOpen) return;

    // Ctrl+Enter = validate
    if (e.ctrlKey && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter')){
      e.preventDefault();
      e.stopPropagation();
      runValidate();
      return;
    }
    // Ctrl+Arrow
    if (e.ctrlKey && (e.key === 'ArrowLeft' || e.code === 'ArrowLeft')){
      e.preventDefault(); e.stopPropagation();
      trySelectCard(-1);
      return;
    }
    if (e.ctrlKey && (e.key === 'ArrowRight' || e.code === 'ArrowRight')){
      e.preventDefault(); e.stopPropagation();
      trySelectCard(+1);
      return;
    }
  }

  function runValidate(){
    if (!overlay) return;
    state.validatePayloadMode = !!overlay.querySelector('[data-ai-valmode]').checked;
    pushLog('Validate: current card JSON (mode='+(state.validatePayloadMode?'payload':'card')+')');
    state.validateResult = validateCurrentCard();
    if (state.validateResult.ok) pushLog('Validate: OK');
    else pushLog('Validate: FAIL ('+(state.validateResult.errors||[]).length+' errors)');
    saveCache();
    render();
  }

  // =========================
  // Persistence: restore panel if app deletes DOM
  // =========================
  function scheduleRestore(){
    if (!state.desiredOpen) return;
    if (restoreTimer) return;
    restoreTimer = setTimeout(function(){
      restoreTimer = 0;
      ensureMounted();
    }, 50);
  }

  function ensureMounted(){
    if (!state.desiredOpen) return;

    // если overlay удалили — пересоздаём
    if (!overlay || !overlay.isConnected){
      overlay = null;
      buildOverlay();
      mountOverlay();
      render();
      pushLog('RESTORE: panel re-mounted after DOM refresh.');
      render();
      return;
    }

    // если жив — просто поправим позицию
    applyPanelLayout();
  }

  function mountOverlay(){
    // Монтируем в <html>, а не в body — body часто чистят при ререндере
    var root = document.documentElement || document.body;
    if (!root) return;

    try{
      root.appendChild(overlay);
    }catch(e){
      // fallback
      try{ document.body && document.body.appendChild(overlay); }catch(e2){}
    }
  }

  function startObserver(){
    if (mo) return;
    mo = new MutationObserver(function(){
      // Любые изменения DOM — проверяем, не выпилили ли нас
      scheduleRestore();
    });
    // наблюдаем за всем документом
    mo.observe(document.documentElement || document.body, { childList:true, subtree:true });
  }

  function stopObserver(){
    if (!mo) return;
    try{ mo.disconnect(); }catch(e){}
    mo = null;
  }

  // =========================
  // Public API
  // =========================
  function open(){
    // Always refresh CSS on each open so UI tweaks are visible without hard reload.
    try{ ensureCss(); }catch(e){}
    state.desiredOpen = true;
    loadCache();

    if (overlay && overlay.isConnected){
      applyPanelLayout();
      render();
      return;
    }

    buildOverlay();
    mountOverlay();
    startObserver();
    applyPanelLayout();
    render();
  }

  function close(){
    state.desiredOpen = false;

    stopObserver();
    window.removeEventListener('keydown', onKeyDown, true);

    if (!overlay) return;
    try{ overlay.remove(); }catch(e){}
    overlay = null;
  }

  // =========================
  // Boot
  // =========================
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


  loadDefaults().finally(function(){
    ensureCss();
    window.AI_PANEL = window.AI_PANEL || {};
    window.AI_PANEL.open = open;
    window.AI_PANEL.close = close;
  });

})();
