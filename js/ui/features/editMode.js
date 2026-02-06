import { renderCard } from "../../render/renderCard.js";
import { bindText, bindTip } from "../i18n.js";
import { isEditingText, commitTextEdit } from "../../editor/textEdit.js";

function uid(){
  return "b" + Math.random().toString(16).slice(2, 8);
}

function getCurrentVerbKey(state){
  const verbs = Array.isArray(state?.data?.verbs) ? state.data.verbs : [];
  const idx = Number.isFinite(state?.selectedIndex) ? state.selectedIndex : 0;
  const v = verbs[idx] || null;
  return String(v?.id || v?.infinitive || v?.inf || v?.name || idx);
}

function nextBlockNumber(state){
  let maxNum = 0;
  for (const b of (state.boxes || [])){
    if (!b) continue;
    // New style
    if (b.labelKey === "box.customBlock" && b.labelParams && Number.isFinite(b.labelParams.n)){
      maxNum = Math.max(maxNum, b.labelParams.n);
      continue;
    }
    // Legacy labels (RU/EN/DE)
    const s = String(b.label || "");
    let m = s.match(/^\s*Блок\s*№\s*(\d+)\s*$/i);
    if (!m) m = s.match(/^\s*Block\s*(?:Nr\.?|#)\s*(\d+)\s*$/i);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10) || 0);
  }
  return maxNum + 1;
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// Полный диапазон шрифта (настрой под себя)
const MIN_FONT_PT = 4;
const MAX_FONT_PT = 240;

export function featureEditMode(){
  return {
    id: "editMode",
    install(ctx){
      // IMPORTANT:
      // Do NOT mutate ctx.state in-place here.
      // Always build new arrays/objects and pass them via setState().
      // This keeps render/undo/autosave deterministic.
      const { i18n, log, setState, ui } = ctx;
      const S = () => (ctx.getState?.() || ctx.state);

      const btnEdit = document.createElement("button");
      btnEdit.id = "btnEdit";
      btnEdit.dataset.group = "edit";
      btnEdit.className = "lc-btn";
      btnEdit.type = "button";
      btnEdit.textContent = i18n.t("ui.btn.editToggle");
      bindText(btnEdit, "ui.btn.editToggle");
      btnEdit.setAttribute("aria-pressed", "false");
      btnEdit.setAttribute("data-tip", i18n.t("ui.tip.editToggle"));
      bindTip(btnEdit, "ui.tip.editToggle");

      const btnNew = document.createElement("button");
      btnNew.id = "btnNewBlock";
      btnNew.dataset.group = "edit";
      btnNew.className = "lc-btn";
      btnNew.type = "button";
      btnNew.textContent = i18n.t("ui.btn.newBlock");
      bindText(btnNew, "ui.btn.newBlock");
      btnNew.setAttribute("data-tip", i18n.t("ui.tip.newBlock"));
      bindTip(btnNew, "ui.tip.newBlock");
      btnNew.style.display = "none";

      // NEW: delete button
      const btnDel = document.createElement("button");
      btnDel.id = "btnDeleteBlock";
      btnDel.dataset.group = "edit";
      btnDel.className = "lc-btn";
      btnDel.type = "button";
      btnDel.textContent = i18n.t("ui.btn.deleteBlock");
      bindText(btnDel, "ui.btn.deleteBlock");
      btnDel.setAttribute("data-tip", i18n.t("ui.tip.deleteBlock"));
      bindTip(btnDel, "ui.tip.deleteBlock");
      btnDel.style.display = "none";

      // NEW: text mode buttons (note vs static)
      const btnUnique = document.createElement("button");
      btnUnique.id = "btnTextUnique";
      btnUnique.dataset.group = "edit";
      btnUnique.className = "lc-btn lc-mode-btn";
      btnUnique.type = "button";
      btnUnique.textContent = i18n.t("ui.btn.textUnique");
      bindText(btnUnique, "ui.btn.textUnique");
      btnUnique.setAttribute("data-tip", i18n.t("ui.tip.textUnique"));
      bindTip(btnUnique, "ui.tip.textUnique");
      btnUnique.style.display = "none";

      const btnCommon = document.createElement("button");
      btnCommon.id = "btnTextCommon";
      btnCommon.dataset.group = "edit";
      btnCommon.className = "lc-btn lc-mode-btn";
      btnCommon.type = "button";
      btnCommon.textContent = i18n.t("ui.btn.textCommon");
      bindText(btnCommon, "ui.btn.textCommon");
      btnCommon.setAttribute("data-tip", i18n.t("ui.tip.textCommon"));
      bindTip(btnCommon, "ui.tip.textCommon");
      btnCommon.style.display = "none";

      function getSelectedBox(){
        const state = S();
        const id = state.selectedBoxId;
        if (!id) return null;
        return (state.boxes || []).find(b => b.id === id) || null;
      }

      function deleteSelectedBox(){
        const state = S();
        const id = state.selectedBoxId;
        if (!id) return;
        if (isEditingText()) return; // в режиме ввода текста — не удаляем

        ctx.history?.begin?.("Delete");

        const before = (state.boxes || []).length;
        const boxes = (state.boxes || []).filter(b => b.id !== id);
        const after = boxes.length;

        if (after === before){
          ctx.history?.cancel?.();
          return;
        }

        // clean per-verb notes (avoid bloating autosave)
        let notesByVerb = (state.notesByVerb && typeof state.notesByVerb === "object") ? state.notesByVerb : {};
        // shallow clone top-level and per-verb maps only when needed
        const nextNotes = {};
        for (const k of Object.keys(notesByVerb)){
          const map = notesByVerb[k];
          if (!map || typeof map !== "object") continue;
          if (map[id] === undefined){
            nextNotes[k] = map;
            continue;
          }
          const copy = { ...map };
          delete copy[id];
          nextNotes[k] = copy;
        }
        notesByVerb = Object.keys(nextNotes).length ? nextNotes : notesByVerb;

        setState({ boxes, notesByVerb, selectedBoxId: null }, { autosave: true, debounceMs: 50 });
        ctx.history?.end?.();
        log.info("block deleted", { id });
        renderCard(ctx);
        sync();
      }

      function sync(){
        const state = S();
        btnEdit.setAttribute("aria-pressed", state.editing ? "true" : "false");
        ui.setEditBadge(!!state.editing);

        btnNew.style.display = state.editing ? "" : "none";

        const hasSel = !!state.selectedBoxId && !!getSelectedBox();
        const canDel = state.editing && hasSel && !isEditingText();
        btnDel.style.display = canDel ? "" : "none";

        // textMode buttons only for selected non-bind boxes
        let canMode = false;
        let mode = "bind";
        if (state.editing && hasSel){
          const b = getSelectedBox();
          mode = String(b?.textMode || (b?.bind ? "bind" : "note"));
          canMode = mode !== "bind";
        }
        const showMode = (state.editing && hasSel && !isEditingText() && canMode);
        btnUnique.style.display = showMode ? "" : "none";
        btnCommon.style.display = showMode ? "" : "none";

        // active state: pressed button becomes red
        btnUnique.classList.toggle("isActive", mode === "note");
        btnCommon.classList.toggle("isActive", mode === "static");

        if (window.LC_DIAG) window.LC_DIAG.lastRenderGeometry = { note: "no render yet", ts: Date.now() };
      }

      btnEdit.addEventListener("click", () => {
        const state = S();
        const next = !state.editing;

        // выключаем editing
        if (!next){
          if (isEditingText()) commitTextEdit(ctx);
          setState({ editing: false, selectedBoxId: null }, { autosave: true });
          renderCard(ctx);
          log.info("editMode toggled", { editing: false });
          sync();
          return;
        }

        // включаем editing
        setState({ editing: true }, { autosave: true });
        renderCard(ctx);
        log.info("editMode toggled", { editing: true });
        sync();
      });

      btnNew.addEventListener("click", () => {
        const state = S();
        if (!state.editing) return;
        if (isEditingText()) return;

        ctx.history?.begin?.("New block");

        const id = uid();
        const num = nextBlockNumber(state);

        const b = {
          id,
          xMm: 20,
          yMm: 20,
          wMm: 60,
          hMm: 20,
          // ВАЖНО:
          // Геометрия блока общая для всех карточек,
          // а текст будет храниться уникально для каждого глагола (notesByVerb).
          textMode: "note",
          staticText: "",
          text: "", // совместимость со старым форматом
          fontPt: 14,
          labelKey: "box.customBlock",
          labelParams: { n: num },
          label: (ctx.i18n && typeof ctx.i18n.t === "function") ? ctx.i18n.t("box.customBlock", { n: num }) : `Блок №${num}`,
        };

        const boxes = Array.isArray(state.boxes) ? state.boxes.slice() : [];
        boxes.push(b);

        // создаём пустую заметку для текущего глагола (не обязательно, но удобно)
        const verbKey = getCurrentVerbKey(state);
        const notesByVerb = (state.notesByVerb && typeof state.notesByVerb === "object") ? state.notesByVerb : {};
        const verbMap = (notesByVerb[verbKey] && typeof notesByVerb[verbKey] === "object") ? notesByVerb[verbKey] : {};
        const nextVerbMap = (verbMap[id] === undefined) ? { ...verbMap, [id]: "" } : verbMap;
        const nextNotesByVerb = (nextVerbMap === verbMap) ? notesByVerb : { ...notesByVerb, [verbKey]: nextVerbMap };

        setState({ boxes, notesByVerb: nextNotesByVerb, selectedBoxId: id }, { autosave: true, debounceMs: 50 });
        ctx.history?.end?.();

        log.info("manual block created", { id });
        renderCard(ctx);
        sync();
      });

      btnDel.addEventListener("click", () => {
        deleteSelectedBox();
      });

      function setTextModeForSelected(targetMode){
        const state = S();
        if (!state.editing) return;
        if (isEditingText()) return;

        const b = getSelectedBox();
        if (!b) return;

        const currentMode = String(b.textMode || (b.bind ? "bind" : "note"));
        if (currentMode === "bind") return;
        if (currentMode === targetMode) return;

        ctx.history?.begin?.("TextMode");

        const verbKey = getCurrentVerbKey(state);
        const notesByVerb = (state.notesByVerb && typeof state.notesByVerb === "object") ? state.notesByVerb : {};
        const verbMap = (notesByVerb[verbKey] && typeof notesByVerb[verbKey] === "object") ? notesByVerb[verbKey] : {};
        let nextNotesByVerb = notesByVerb;
        let nextVerbMap = verbMap;

        if (targetMode === "static"){
          // note → static: берём текущий текст для этого глагола и делаем его общим
          const v = (verbMap[b.id] !== undefined) ? verbMap[b.id] : "";
          const boxes = Array.isArray(state.boxes) ? state.boxes.slice() : [];
          const idx = boxes.findIndex(x => x && x.id === b.id);
          if (idx >= 0){
            const bb = { ...boxes[idx], textMode: "static", staticText: String(v ?? "") };
            bb.text = bb.staticText; // совместимость
            boxes[idx] = bb;

            setState({ boxes }, { autosave: true, debounceMs: 50 });
          }
        } else {
          // static → note: возвращаем уникальный режим
          const boxes = Array.isArray(state.boxes) ? state.boxes.slice() : [];
          const idx = boxes.findIndex(x => x && x.id === b.id);
          if (idx >= 0){
            const prev = boxes[idx];
            const bb = { ...prev, textMode: "note" };
            boxes[idx] = bb;

            // seed note text only if empty/missing
            const cur = verbMap[b.id];
            const seed = String(prev.staticText ?? prev.text ?? "");
            if (cur === undefined || String(cur ?? "").trim() === ""){
              nextVerbMap = { ...verbMap, [b.id]: seed };
              nextNotesByVerb = { ...notesByVerb, [verbKey]: nextVerbMap };
            }

            setState({ boxes, notesByVerb: nextNotesByVerb }, { autosave: true, debounceMs: 50 });
          }
        }
        ctx.history?.end?.();
        renderCard(ctx);
        sync();
      }

      btnUnique.addEventListener("click", () => setTextModeForSelected("note"));
      btnCommon.addEventListener("click", () => setTextModeForSelected("static"));

      // ------------------------------------------------------------
      // Wheel: font size full range (only when editing + selected + NOT text editing)
      // ------------------------------------------------------------
      function onWheel(ev){
        const state = S();
        if (!state.editing) return;
        if (isEditingText()) return;            // во время ввода текста колесо не трогаем
        if (!state.selectedBoxId) return;

        const b = getSelectedBox();
        if (!b) return;

        // Чтобы страница не скроллилась
        ev.preventDefault();

        // Шаг: Shift ускоряет
        const k = ev.shiftKey ? 5 : 1;
        const step = (ev.deltaY < 0) ? +1 : -1;

        const cur = Number.isFinite(b.fontPt) ? b.fontPt : 14;
        const next = clamp(cur + step * k, MIN_FONT_PT, MAX_FONT_PT);
        if (next === cur) return;

        const boxes = Array.isArray(state.boxes) ? state.boxes.slice() : [];
        const idx = boxes.findIndex(x => x && x.id === b.id);
        if (idx < 0) return;
        boxes[idx] = { ...boxes[idx], fontPt: next };
        setState({ boxes }, { autosave: true, debounceMs: 30 });

        renderCard(ctx);
        sync();
      }

      // ------------------------------------------------------------
      // Delete key: delete selected block (only when NOT text editing)
      // ------------------------------------------------------------
      function onKeyDown(ev){
        const state = S();
        if (!state.editing) return;
        if (isEditingText()) return;
        if (!state.selectedBoxId) return;

        if (ev.key === "Delete"){
          ev.preventDefault();
          deleteSelectedBox();
        }
      }

      // Навешиваем на canvas (wheel) и на window (Delete)
      // Важно: wheel нужно {passive:false} чтобы preventDefault работал
      const wheelTarget = () => document.getElementById("lcCardCanvas") || document.getElementById("lcCardLayer");

      function attachWheel(){
        const el = wheelTarget();
        if (!el) return false;
        el.addEventListener("wheel", onWheel, { passive: false });
        return true;
      }

      // пытаться повесить сразу + после первого рендера (canvas может появиться позже)
      let wheelAttached = attachWheel();
      if (!wheelAttached){
        // лёгкий повтор через тик
        setTimeout(() => { wheelAttached = attachWheel(); }, 50);
        setTimeout(() => { wheelAttached = attachWheel(); }, 200);
      }

      window.addEventListener("keydown", onKeyDown, true);

      ui.addTopButton(btnEdit);
      ui.addTopButton(btnNew);
      ui.addTopButton(btnUnique);
      ui.addTopButton(btnCommon);
      ui.addTopButton(btnDel);

      sync();
    },
  };
}
