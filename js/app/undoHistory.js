// js/app/undoHistory.js
// Undo/Redo history manager (state snapshots).
//
// ARCH: App-core only. No UI here.
// UI panel/button is implemented in js/ui/features/history.js (wrapper) / undoHistoryPanel.js.

function deepClone(obj){
  // For this app state: JSON clone is sufficient and deterministic.
  return JSON.parse(JSON.stringify(obj));
}

function now(){ return Date.now(); }

export function clampInt(n, min, max){
  n = n|0;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function applyState(ctx, nextState){
  // NEVER replace ctx.state object reference.
  // The app keeps `state` as a single shared object captured by closures.
  // Use ctx.setState when available to trigger render/autosave.
  const cloned = deepClone(nextState);
  if (typeof ctx?.setState === 'function'){
    // history restore should always be immediate and not create new history entries.
    ctx.setState(cloned, { clearSelection: true, autosave: true, debounceMs: 0, history: false });
  } else if (ctx && ctx.state && typeof ctx.state === 'object'){
    Object.assign(ctx.state, cloned);
  } else if (ctx){
    ctx.state = cloned; // last resort (should not happen in this project)
  }
}

export function createHistoryManager(ctx, { limit = 20 } = {}){
  // Internal transaction (begin/end) support for drag/resize etc.
  let tx = null; // { label, before, startedAt }

  const api = {
    enabled: true,
    limit,
    stack: [],
    idx: -1,
    lastCommitAt: 0,

    // ---- Compatibility layer (expected by UI panel) ----------------------
    get past(){
      // includes current
      return (api.idx >= 0) ? api.stack.slice(0, api.idx + 1) : [];
    },
    get future(){
      return (api.idx >= 0) ? api.stack.slice(api.idx + 1) : [];
    },
    getItems(){
      // oldest -> newest
      return api.stack.map(s => ({
        label: s?.label || '',
        ts: s?.ts ?? s?.time ?? 0,
      }));
    },
    jumpTo(index){
      if (!api.stack.length) return false;
      const i = clampInt(index, 0, api.stack.length - 1);
      if (i === api.idx) return true;
      api.idx = i;
      const snap = api.current();
      if (!snap) return false;
      applyState(ctx, snap.state);
      ctx?.onStateRestored && ctx.onStateRestored('jump', snap);
      return true;
    },

    // ---- Transaction API (used by editorBasic/editMode) ------------------
    begin(label){
      if (!api.enabled) return;
      // Nested begin: keep outermost.
      if (tx) return;
      tx = {
        label: label || 'Change',
        before: deepClone(ctx.state),
        startedAt: now(),
      };
    },
    end(label){
      if (!api.enabled) return false;
      if (!tx) {
        // No tx: behave like a normal snapshot.
        api.snapshot(label || 'Change');
        return true;
      }
      const lbl = label || tx.label || 'Change';
      const before = tx.before;
      tx = null;

      // If state didn't change (JSON compare), don't commit.
      // Cheap but effective because our clone method is JSON.
      let changed = true;
      try {
        changed = (JSON.stringify(before) !== JSON.stringify(ctx.state));
      } catch { changed = true; }
      if (!changed) return false;

      api._pushSnapshot(lbl);
      return true;
    },
    cancel(){
      if (!tx) return false;
      const before = tx.before;
      const lbl = tx.label || 'Cancel';
      tx = null;
      applyState(ctx, before);
      ctx?.onStateRestored && ctx.onStateRestored('cancel', { label: lbl, state: before });
      return true;
    },

    // ---- Core API --------------------------------------------------------
    canUndo(){ return api.idx > 0; },
    canRedo(){ return api.idx >= 0 && api.idx < api.stack.length - 1; },
    current(){ return api.idx >= 0 ? api.stack[api.idx] : null; },

    _truncateAfterIdx(){
      if (api.idx < api.stack.length - 1){
        api.stack.splice(api.idx + 1);
      }
    },
    _trimToLimit(){
      while (api.stack.length > api.limit){
        api.stack.shift();
        api.idx--;
      }
      if (api.idx < 0) api.idx = api.stack.length ? 0 : -1;
    },
    _pushSnapshot(label){
      const t = now();
      const snap = {
        label: label || 'Change',
        time: t,
        ts: t,
        state: deepClone(ctx.state),
      };
      api._truncateAfterIdx();
      api.stack.push(snap);
      api.idx = api.stack.length - 1;
      api._trimToLimit();
      api.lastCommitAt = t;
    },
    snapshot(label){
      if (!api.enabled) return;
      // If inside transaction, snapshot is deferred to end().
      if (tx) return;
      api._pushSnapshot(label || 'Change');
    },
    undo(){
      if (!api.canUndo()) return false;
      api.idx = clampInt(api.idx - 1, 0, api.stack.length - 1);
      const snap = api.current();
      if (!snap) return false;
      applyState(ctx, snap.state);
      ctx?.onStateRestored && ctx.onStateRestored('undo', snap);
      return true;
    },
    redo(){
      if (!api.canRedo()) return false;
      api.idx = clampInt(api.idx + 1, 0, api.stack.length - 1);
      const snap = api.current();
      if (!snap) return false;
      applyState(ctx, snap.state);
      ctx?.onStateRestored && ctx.onStateRestored('redo', snap);
      return true;
    },
    reset(){
      api.stack = [];
      api.idx = -1;
      api.lastCommitAt = 0;
      tx = null;
    },
  };

  return api;
}
