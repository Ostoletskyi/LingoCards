// ai/ai.verbs.autocomplete.js
// Ghost autocomplete for infinitive input (keyboard-first).
// Accept keys: Tab / ArrowRight (configurable). Enter is intentionally left to the caller
// (in AI panel it triggers Generate).

export function parseVerbsFromTwoColumnText(txt){
  const verbs = new Set();
  const lines = String(txt || '').split(/\r?\n/);
  for (let raw of lines){
    let line = raw.trim();
    if (!line) continue;
    if (line.toUpperCase().includes('GERMAN VERBS')) continue;
    if (line.startsWith('\f')) continue;

    // Split by 2+ spaces or tabs (left column is the verb).
    const head = line.split(/\s{2,}|\t+/)[0]?.trim();
    if (!head) continue;
    if (/^to\s+/i.test(head)) continue;

    const v = head.replace(/\s+/g, ' ').trim();
    if (v.length < 2) continue;
    verbs.add(v);
  }
  return Array.from(verbs).sort((a,b)=>a.localeCompare(b,'de'));
}

function findCompletion(list, typed){
  const q = String(typed || '').trim().toLowerCase();
  if (!q) return null;
  for (const v of list){
    if (v.toLowerCase().startsWith(q)) return v;
  }
  return null;
}

function isCaretAtEnd(input){
  return input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
}

function copyTypography(fromEl, toEl){
  const cs = getComputedStyle(fromEl);
  toEl.style.font = cs.font;
  toEl.style.padding = cs.padding;
  // Ghost element lives inside a positioned wrapper; margins can cause clipping.
  toEl.style.margin = '0';
  toEl.style.boxSizing = 'border-box';
  // Avoid hard-coding height/line-height: different browsers compute input
  // inner metrics differently and can clip the lower half of glyphs.
  toEl.style.height = 'auto';
  toEl.style.lineHeight = cs.lineHeight;
  toEl.style.borderRadius = cs.borderRadius;
}

export function attachGhostAutocomplete(opts){
  // opts: { input, verbs, acceptKeys=['Tab','ArrowRight'], log?, onAccept? }
  const input = opts?.input;
  const verbs = Array.isArray(opts?.verbs) ? opts.verbs : [];
  const acceptKeys = Array.isArray(opts?.acceptKeys) ? opts.acceptKeys : ['Tab','ArrowRight'];
  const log = (typeof opts?.log === 'function') ? opts.log : null;
  const onAccept = (typeof opts?.onAccept === 'function') ? opts.onAccept : null;

  if (!input || !input.parentNode) {
    return { destroy(){}, getSuggestion(){ return null; }, autocorrectIfNeeded(){ return false; } };
  }

  // Wrap input
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  wrap.style.display = 'inline-block';
  wrap.style.width = getComputedStyle(input).width;

  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const ghost = document.createElement('div');
  ghost.style.position = 'absolute';
  // Fill wrapper and vertically center text to prevent half-glyph clipping.
  ghost.style.inset = '0';
  ghost.style.pointerEvents = 'none';
  ghost.style.whiteSpace = 'pre';
  ghost.style.overflow = 'hidden';
  ghost.style.border = '1px solid transparent';
  ghost.style.color = 'rgba(255,255,255,.35)';
  ghost.style.display = 'flex';
  ghost.style.alignItems = 'center';
  copyTypography(input, ghost);

  // Place ghost behind input
  wrap.insertBefore(ghost, input);

  let currentSuggestion = null;

  function refresh(){
    const val = input.value || '';
    currentSuggestion = findCompletion(verbs, val);
    if (!currentSuggestion) { ghost.textContent = ''; return; }
    if (currentSuggestion.toLowerCase() === val.trim().toLowerCase()) { ghost.textContent = ''; return; }
    ghost.textContent = currentSuggestion;
  }

  function accept(){
    if (!currentSuggestion) return false;
    const s = currentSuggestion;
    input.value = s;
    ghost.textContent = '';
    currentSuggestion = null;
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input', { bubbles:true }));
    if (log) log('Autocomplete: ' + s);
    if (onAccept) onAccept(s);
    return true;
  }

  function autocorrectIfNeeded(){
    const typed = String(input.value || '').trim();
    if (!typed) return false;

    // Exact match?
    const low = typed.toLowerCase();
    let exact = false;
    for (const v of verbs){
      if (v.toLowerCase() === low){ exact = true; break; }
    }
    if (exact) return false;

    refresh();
    if (currentSuggestion){
      const before = typed;
      accept();
      if (log) log('Autocorrect: "' + before + '" → "' + input.value + '"');
      return true;
    }
    return false;
  }

  function onInput(){ refresh(); }

  function onKeyDown(e){
    if (!currentSuggestion) return;
    if (!isCaretAtEnd(input)) return;

    if (acceptKeys.includes(e.key)){
      if (e.key === 'Tab') e.preventDefault();
      accept();
    }
  }

  function sync(){
    wrap.style.width = getComputedStyle(input).width;
    copyTypography(input, ghost);
    refresh();
  }

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', sync);

  refresh();

  return {
    destroy(){
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', sync);
    },
    getSuggestion(){ return currentSuggestion; },
    autocorrectIfNeeded
  };
}

export async function loadInfinitivesFromUrl(url){
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const txt = await r.text();
  const lines = txt.split(/\r?\n/);
  const out = [];
  const seen = new Set();
  for (let line of lines){
    const v = String(line || '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
