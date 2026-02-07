// js/editor/textEdit.js
import { autoFitBoxToText, autoFitBoxToShown, getLastCardGeom } from "../render/renderCard.js";
import { mmToPx } from "../render/geom.js";
import { resolveVerbBind } from "../data/verbBind.js";

let editing = null;
let ta = null; // textarea overlay

export function isEditingText(){ return !!editing; }
export function getEditing(){ return editing ? { ...editing } : null; }

function updateBoxState(ctx, boxId, updater, { autosave = true, debounceMs = 120 } = {}){
  const boxes = Array.isArray(ctx?.state?.boxes) ? ctx.state.boxes.map((box) => {
    if (!box || box.id !== boxId) return box;
    const next = { ...box };
    updater(next);
    return next;
  }) : [];
  if (autosave && typeof ctx.setState === "function") ctx.setState({ boxes }, { autosave: true, debounceMs });
  return boxes;
}

function getCurrentVerb(ctx){
  const st = ctx?.state;
  const verbs = Array.isArray(st?.data?.verbs) ? st.data.verbs : [];
  const idx = Number.isFinite(st?.selectedIndex) ? st.selectedIndex : 0;
  return verbs[idx] || null;
}

function getCurrentVerbKey(ctx){
  const v = getCurrentVerb(ctx);
  const idx = Number.isFinite(ctx?.state?.selectedIndex) ? ctx.state.selectedIndex : 0;
  return String(v?.id || v?.infinitive || v?.inf || v?.name || idx);
}

function getBoxText(ctx, b){
  const mode = String(b?.textMode || (b?.bind ? "bind" : "note"));
  if (mode === "bind"){
    // For bind boxes we return the currently shown text.
    // If user has an override for this verb+box (stored in notesByVerb), show it.
    const verbKey = getCurrentVerbKey(ctx);
    const notes = (ctx?.state?.notesByVerb && typeof ctx.state.notesByVerb === "object") ? ctx.state.notesByVerb : {};
    if (notes[verbKey] && notes[verbKey][b.id] !== undefined){
      return String(notes[verbKey][b.id] ?? "");
    }

    const v = getCurrentVerb(ctx);
    const r = resolveVerbBind(v, b?.bind);
    return (r && r.kind === "text") ? String(r.text || "") : "";
  }

  if (mode === "static") return String(b.staticText ?? b.text ?? "");

  // note (уникально для глагола)
  const verbKey = getCurrentVerbKey(ctx);
  const notes = (ctx.state.notesByVerb && typeof ctx.state.notesByVerb === "object") ? ctx.state.notesByVerb : {};
  const v = (notes[verbKey] && notes[verbKey][b.id] !== undefined) ? notes[verbKey][b.id] : "";
  return String(v ?? "");
}

function setBoxText(ctx, b, value, { autosave = true, debounceMs = 120 } = {}){
  const mode = String(b?.textMode || (b?.bind ? "bind" : "note"));
  const text = String(value ?? "");

  if (mode === "bind"){
    // SOURCE (левый список): bind-блоки должны оставаться bind,
    // но пользователь может переопределить текст ДЛЯ КОНКРЕТНОГО ГЛАГОЛА.
    // Храним override в notesByVerb[verbKey][boxId].
    // CARDS (правый список): допускаем статический override в самом блоке.

    const viewMode = String(ctx?.state?.viewMode || "");
    if (viewMode === "source"){
      const verbKey = getCurrentVerbKey(ctx);
      const nextNotes = (ctx.state.notesByVerb && typeof ctx.state.notesByVerb === "object") ? { ...ctx.state.notesByVerb } : {};
      const verbNotes = (nextNotes[verbKey] && typeof nextNotes[verbKey] === "object") ? { ...nextNotes[verbKey] } : {};
      verbNotes[b.id] = text;
      nextNotes[verbKey] = verbNotes;

      updateBoxState(ctx, b.id, (next) => {
        if (text.trim()) next.label = "";
        // Не даём старым полям "static" затенять bind-логику.
        if (next.staticText !== undefined) delete next.staticText;
        if (next.text !== undefined) delete next.text;
        next.textMode = "bind";
      }, { autosave: false });

      if (autosave && typeof ctx.setState === "function"){
        ctx.setState({ notesByVerb: nextNotes }, { autosave: true, debounceMs });
      }
      return;
    }

    // CARDS: Convert bind box into a manual override (static)
    updateBoxState(ctx, b.id, (next) => {
      next.textMode = "static";
      next.staticText = text;
      next.text = text; // совместимость
      if (text.trim()) next.label = "";
    }, { autosave, debounceMs });
    return;
  }

  if (mode === "static"){
    updateBoxState(ctx, b.id, (next) => {
      next.staticText = text;
      next.text = text; // совместимость
      if (text.trim()) next.label = "";
    }, { autosave, debounceMs });
    return;
  }

  // note
  const verbKey = getCurrentVerbKey(ctx);
  const nextNotes = (ctx.state.notesByVerb && typeof ctx.state.notesByVerb === "object") ? { ...ctx.state.notesByVerb } : {};
  const verbNotes = (nextNotes[verbKey] && typeof nextNotes[verbKey] === "object") ? { ...nextNotes[verbKey] } : {};
  verbNotes[b.id] = text;
  nextNotes[verbKey] = verbNotes;
  updateBoxState(ctx, b.id, (next) => {
    if (text.trim()) next.label = "";
  }, { autosave: false });

  if (autosave && typeof ctx.setState === "function"){
    ctx.setState({ notesByVerb: nextNotes }, { autosave: true, debounceMs });
  }
}

// Совместимость со старым editorBasic.js:
export function handleKeydown(ctx, ev){
  if (!editing) return false;

  // Если textarea существует — любые "текстовые" клавиши должны уходить в неё.
  // Иначе стрелки/Backspace поймают другие обработчики и всё превратится в "монолит".
  if (ta){
    const isTextNavKey = (
      ev.key === "ArrowLeft" || ev.key === "ArrowRight" ||
      ev.key === "ArrowUp" || ev.key === "ArrowDown" ||
      ev.key === "Home" || ev.key === "End" ||
      ev.key === "Backspace" || ev.key === "Delete" ||
      (ev.key && ev.key.length === 1) // печатные
    );

    if (isTextNavKey && document.activeElement !== ta){
      ta.focus({ preventScroll: true });
      // не предотвращаем default: пусть textarea обработает
      return true; // говорим "мы забрали событие", чтобы другие модули не лезли
    }

    // Если фокус уже в textarea — ничего не перехватываем.
    if (document.activeElement === ta) return false;
  }

  // Escape / Ctrl+Enter должны работать даже если фокус не там
  if (ev.key === "Escape"){
    cancelTextEdit(ctx);
    ev.preventDefault();
    return true;
  }

  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)){
    commitTextEdit(ctx);
    ev.preventDefault();
    return true;
  }

  return false;
}

/**
 * textarea живёт поверх canvas. Мы делаем position:fixed и крепим к viewport.
 * Тогда координаты из getBoundingClientRect() ложатся идеально.
 */
function ensureTextarea(ctx){
  const host = document.body;

  if (!ta){
    ta = document.createElement("textarea");
    ta.id = "lcTextEditor";
    ta.spellcheck = false;
    ta.autocomplete = "off";
    ta.autocapitalize = "off";
    ta.wrap = "off";

    Object.assign(ta.style, {
      position: "fixed",       // <<< КЛЮЧЕВО
      zIndex: "2000",
      resize: "none",
      border: "none",
      outline: "none",
      background: "transparent",
      color: "rgba(255,255,255,0.90)",
      caretColor: "rgba(255,255,255,0.95)",
      padding: "6px 8px",
      margin: "0",
      overflow: "hidden",
      whiteSpace: "pre",
      fontFamily: "system-ui, sans-serif",
      lineHeight: "1.25",
    });

    // Enter = новая строка (нативно)
    // Commit: Ctrl+Enter, Cancel: Esc
    ta.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)){
        ev.preventDefault();
        commitTextEdit(ctx);
        return;
      }
      if (ev.key === "Escape"){
        ev.preventDefault();
        cancelTextEdit(ctx);
        return;
      }
    });

    // Любое изменение → синхроним в модель + autofit
    ta.addEventListener("input", () => {
      if (!editing) return;

      editing.value = ta.value;

      const b = (ctx.state.boxes || []).find(x => x.id === editing.id);
      if (b){
        // В режиме note / static — кладём текст туда, куда нужно,
        // не загрязняя общий layout.
        setBoxText(ctx, b, editing.value, { autosave: true, debounceMs: 200 });

        // подгоняем размеры под введённый текст
        autoFitBoxToShown(ctx, b.id, editing.value);
      }

      // перерендер
      if (ctx?.shell?.requestRender) ctx.shell.requestRender();
    });

    host.appendChild(ta);
  }

  return ta;
}

function hideTextarea(){
  if (!ta) return;
  ta.style.display = "none";
}

function showTextarea(){
  if (!ta) return;
  ta.style.display = "block";
}

export function startTextEdit(ctx, boxId){
  const b = (ctx.state.boxes || []).find(x => x.id === boxId);
  if (!b) return;

  const initial = getBoxText(ctx, b) ?? "";

  editing = {
    id: boxId,
    original: String(initial),
    value: String(initial),
    startedAt: Date.now(),
  };

  // ✅ история: один шаг на сессию редактирования (открыли -> изменили -> закрыли)
  ctx.history?.begin?.("Text");

  const el = ensureTextarea(ctx);
  el.value = editing.value;

  showTextarea();

  // Фокус + курсор в конец
  el.focus({ preventScroll: true });
  const n = el.value.length;
  el.setSelectionRange(n, n);

  ctx.log.info("textEdit start", { id: boxId });
}

export function commitTextEdit(ctx){
  if (!editing) return;

  const beforeId = editing.id;
  const beforeText = editing.original;

  const b = (ctx.state.boxes || []).find(x => x.id === editing.id);
  if (b){
    const v = (ta ? ta.value : editing.value);
    setBoxText(ctx, b, v, { autosave: true, debounceMs: 50 });
    autoFitBoxToShown(ctx, b.id, v);
  }

  const curText = (ta ? ta.value : editing.value);
  const len = curText.length;
  ctx.log.info("textEdit commit", { id: beforeId, len });
  // пишем в историю только если реально изменили
  if (String(curText) !== String(beforeText)){
    ctx.history?.end?.();
  } else {
    ctx.history?.cancel?.();
  }
  editing = null;
  hideTextarea();
}

export function cancelTextEdit(ctx){
  if (!editing) return;

  const b = (ctx.state.boxes || []).find(x => x.id === editing.id);
  if (b){
    setBoxText(ctx, b, editing.original, { autosave: true, debounceMs: 50 });
  }

  ctx.log.info("textEdit cancel", { id: editing.id });
  ctx.history?.cancel?.();
  editing = null;
  if (ta) ta.value = "";
  hideTextarea();
}

export function stopTextEdit(ctx, { commit = true } = {}){
  if (!editing) return false;
  if (commit) commitTextEdit(ctx);
  else cancelTextEdit(ctx);
  return true;
}

/**
 * Вызывать на каждом renderCard(), чтобы textarea ехала за блоком.
 */
export function syncTextEditorOverlay(ctxApp){
  if (!editing || !ta) return;

  const state = ctxApp.state;
  const b = (state.boxes || []).find(x => x.id === editing.id);
  if (!b) return;

  const g = getLastCardGeom();
  if (!g) return;

  const canvas = document.getElementById("lcCardCanvas");
  if (!canvas) return;

  // координаты блока в px в системе canvas
  const x = g.card.x + mmToPx(b.xMm, g);
  const y = g.card.y + mmToPx(b.yMm, g);
  const w = mmToPx(b.wMm, g);
  const h = mmToPx(b.hMm, g);

  const canvasRect = canvas.getBoundingClientRect();

  // position:fixed => координаты viewport, scroll добавлять НЕ нужно
  ta.style.left   = Math.round(canvasRect.left + x) + "px";
  ta.style.top    = Math.round(canvasRect.top  + y) + "px";
  ta.style.width  = Math.max(10, Math.round(w)) + "px";
  ta.style.height = Math.max(10, Math.round(h)) + "px";

  // Шрифт синхроним
  // b.fontPt is pt in our state. Convert pt -> mm -> px (scaled with current preview size).
  const pt = Number(b.fontPt);
  const safePt = Number.isFinite(pt) ? pt : 14;
  const fontPx = mmToPx(safePt * 0.3527777778, g);
  ta.style.fontSize = Math.max(6, Math.round(fontPx)) + "px";
}
