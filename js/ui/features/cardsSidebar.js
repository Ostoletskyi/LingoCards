// js/ui/features/cardsSidebar.js

import { bindText, bindTip } from "../i18n.js";
import { makeExportPassport } from "../../data/exportPassport.js";
import { compileWildcardQuery, matchesQuery } from "../../utils/search.js";
import { normalizeVerbDataset } from "../../data/verbsLoad.js";
import { normInfinitive } from "../../data/verbHistory.js";

function cardSearchText(card){
  const c = (card && typeof card === "object") ? card : {};
  const title = String(c.title ?? c.name ?? c.cardTitle ?? c?.meta?.title ?? c?.meta?.name ?? "").trim();
  const boxes = Array.isArray(c.boxes) ? c.boxes : [];
  const parts = [title];
  for (const b of boxes){
    if (!b || typeof b !== "object") continue;
    const t = String(b.text ?? b.staticText ?? "").trim();
    if (t) parts.push(t);
  }
  return parts.join(" \n");
}

function downloadJson(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 50);
}

  function buildDraftCardFromVerbAnswers(ans, st, idx){
    ans = ans || {};
    var inf = (typeof ans.inf === 'string' && ans.inf) ||
              (typeof ans.infinitive === 'string' && ans.infinitive) ||
              '';
    inf = normInfinitive(inf);

    var trs = [];
    for(var k in ans){
      if(!Object.prototype.hasOwnProperty.call(ans,k)) continue;
      if(/^tr_\d+_ru$/.test(k) && typeof ans[k] === 'string' && ans[k].trim()){
        trs.push(ans[k].trim());
      }
    }
    if(!trs.length && typeof ans.tr === 'string' && ans.tr.trim()) trs.push(ans.tr.trim());
    var trLine = trs.join(', ');

    var p3 = String(ans.forms_p3 || ans.praesens_3 || ans.pr_3 || '').trim();
    var prt = String(ans.forms_prt || ans.praeteritum || ans.prt || '').trim();
    var p2  = String(ans.forms_p2 || ans.partizip_2 || ans.p2 || '').trim();
    var aux = String(ans.forms_aux || ans.auxiliary || ans.aux || '').trim();

    var formsLine = '';
    if(p3 || prt || p2){
      var parts = [];
      if(p3) parts.push('er ' + p3);
      if(prt) parts.push('Prät: ' + prt);
      if(p2) parts.push('Perf: ' + (aux ? (aux + ' ') : '') + p2);
      formsLine = parts.join(' • ');
    }

    var tpl = (st && Array.isArray(st.sourceBoxes) && st.sourceBoxes.length) ? st.sourceBoxes :
              (st && st.layout && Array.isArray(st.layout.boxes) ? st.layout.boxes : []);
    var boxes = [];
    try{ boxes = JSON.parse(JSON.stringify(tpl)); }
    catch(e){ boxes = (tpl || []).map(function(b){ return Object.assign({}, b); }); }

    for(var i=0;i<boxes.length;i++){
      var b = boxes[i] || {};
      var id = String(b.id || '').toLowerCase();
      if(id === 'inf') b.text = inf;
      else if(id === 'tr') b.text = trLine;
      else if(id === 'forms') b.text = formsLine;
      else if(b.bind && typeof ans[b.bind] === 'string') b.text = ans[b.bind];
      else if(typeof b.text !== 'string') b.text = '';
      boxes[i] = b;
    }

    var now = Date.now();
    var cid = 'card_' + (inf || ('draft_' + idx)) + '_' + now + '_' + Math.floor(Math.random()*10000);
    return { id: cid, title: inf || ('Card ' + (idx+1)), answers: Object.assign({}, ans), boxes: boxes };
  }


function pad2(n){ return String(n).padStart(2, "0"); }
function stamp(){
  const d = new Date();
  return (
    d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate()) +
    "_" + pad2(d.getHours()) + "-" + pad2(d.getMinutes())
  );
}

export function featureCardsSidebar(){
  return {
    id: "cardsSidebar",
    install(ctx){
      const host = ctx.shell?.rightBody;
      if (!host) return;

      host.innerHTML = "";
      // Layout: list scrolls inside; panel itself must not create extra scrollbars.
      host.style.display = "flex";
      host.style.flexDirection = "column";
      host.style.minHeight = "0";

      const list = document.createElement("div");
      list.className = "lc-cardlist";
      list.id = "lcCardsList";
      list.style.flex = "1 1 auto";
      list.style.minHeight = "0";
      list.style.overflow = "auto";

      const actions = document.createElement("div");
      actions.className = "lc-panel-actions";
      actions.style.flex = "0 0 auto";

      // --- Import cards (JSON) ---
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      document.body.appendChild(input);

      funcif (norm.mode === 'verbs'){
          // Import verb dataset INTO RIGHT LIST by creating draft cards.
          // (The left list has its own import button; this one is "Импорт карточек" on the right.)
          const st0 = ctx.getState?.() || ctx.state || {};
          const list = Array.isArray(st0.cardsRight) ? st0.cardsRight : (Array.isArray(st0.cards) ? st0.cards : []);
          const verbs = Array.isArray(norm.data) ? norm.data : [];
          let added = 0;

          for (let i = 0; i < verbs.length; i++){
            const v = verbs[i];
            const ans = (v && v.answers) ? v.answers : v;
            list.push(buildDraftCardFromVerbAnswers(ans, st0, i));
            added++;
          }

          const st1 = Object.assign({}, st0);
          if (Array.isArray(st0.cardsRight)) st1.cardsRight = list;
          else st1.cards = list;

          ctx.setState?.(st1);
          if(ctx.ui?.toast) ctx.ui.toast('Импортировано в правый список: ' + added, 'ok');
          render();
          return;
        }ng(obj?.meta?.kind ?? obj?.kind ?? "");
          if (kind.startsWith('lingocard-verbs-')){
            const v = normalizeVerbDataset(obj);
            if (v && v.ok) return { ok:true, mode:'verbs', verbs:v.verbs, meta:v.meta };
          }
        }catch(e){ /* ignore */ }

        // Accept several common wrappers to avoid "не найден cards[]" surprises.
        const cards =
          (Array.isArray(obj.cards) ? obj.cards : null) ||
          (Array.isArray(obj.data?.cards) ? obj.data.cards : null) ||
          (Array.isArray(obj.payload?.cards) ? obj.payload.cards : null) ||
          (Array.isArray(obj.export?.cards) ? obj.export.cards : null) ||
          (Array.isArray(obj.result?.cards) ? obj.result.cards : null);
        if (!cards) return { ok:false, error:"Не найден массив cards[]" };
        const meta = obj.card || obj.meta || {};
        const widthMm = Number.isFinite(meta.widthMm) ? meta.widthMm : (Number.isFinite(meta.wMm) ? meta.wMm : undefined);
        const heightMm = Number.isFinite(meta.heightMm) ? meta.heightMm : (Number.isFinite(meta.hMm) ? meta.hMm : undefined);
        return { ok:true, mode:'cards', cards, widthMm, heightMm };
      }

      async function importCardsFile(file){
        if (!file) return;
        const text = await file.text();
        const parsed = safeParse(text);
        if (!parsed.ok) {
          ctx.ui?.setStatus?.("Ошибка JSON: " + parsed.error);
          return;
        }
        const norm = normalizeCardsPayload(parsed.value);
        if (!norm.ok) {
          ctx.ui?.setStatus?.("Ошибка импорта: " + norm.error);
          return;
        }

        // Imported a verb list -> apply to SOURCE column.
        if (norm.mode === 'verbs'){
          ctx.setState(s => ({
            ...s,
            verbs: Array.isArray(norm.verbs) ? norm.verbs : (s.verbs || []),
            selectedVerbIndex: 0,
            viewMode: 'SOURCE'
          }));
          ctx.ui?.setStatus?.(`Импортирован список глаголов: ${Array.isArray(norm.verbs)?norm.verbs.length:0}`);
          ctx.ui?.toast?.('Список глаголов загружен в левую колонку (SOURCE)', 'ok');
          ctx.requestRender?.();
          return;
        }

        // Right list geometry is always manual.
        const cards = (norm.cards || []).map((c) => {
          const cc = (c && typeof c === "object") ? c : {};
          const boxes = Array.isArray(cc.boxes) ? cc.boxes : [];
          for (const b of boxes){
            if (!b || typeof b !== "object") continue;
            b.geomMode = "manual";
            b.geomPinned = true;
          }
          return cc;
        });

        const first = cards[0];
        // Apply first card to current preview so user sees it immediately
        ctx.setState({
          cards,
          selectedCardIndex: 0,
          viewMode: "cards",
          cardWmm: Number.isFinite(first?.cardWmm) ? first.cardWmm : (Number.isFinite(norm.widthMm) ? norm.widthMm : ctx.state.cardWmm),
          cardHmm: Number.isFinite(first?.cardHmm) ? first.cardHmm : (Number.isFinite(norm.heightMm) ? norm.heightMm : ctx.state.cardHmm),
          boxes: Array.isArray(first?.boxes) ? first.boxes : ctx.state.boxes,
          notesByVerb: (first?.notesByVerb && typeof first.notesByVerb === "object") ? first.notesByVerb : (ctx.state.notesByVerb || {}),
          selectedIndex: Number.isFinite(first?.selectedIndex) ? first.selectedIndex : (ctx.state.selectedIndex || 0),
          selectedBoxId: null,
          selectedIds: [],
          marqueeRect: null,
        }, { clearSelection: true });

        // Some UI parts wrap requestRender and can be overwritten by later feature installs.
        // Force an immediate sidebar refresh so the imported list is visible even after
        // the RIGHT list was cleared a moment ago.
        try { ctx.ui?.refreshCardsList?.(); } catch (e) { ctx.log?.warn?.("refreshCardsList failed", { err: String(e) }); }
        try { ctx.ui?.setCardBadge?.(ctx.i18n.t("ui.status.card", { i: 1, n: cards.length })); } catch (e) { ctx.log?.warn?.("setCardBadge failed", { err: String(e) }); }
        try { render?.(); } catch (e) { ctx.log?.warn?.("cardsSidebar render failed", { err: String(e) }); }

        ctx.ui?.setStatus?.(`Импортировано карточек: ${cards.length}`);
      }

      input.addEventListener("change", async () => {
        try {
          const f = input.files && input.files[0];
          await importCardsFile(f);
        } finally {
          input.value = "";
        }
      });

      const bImport = document.createElement("button");
      bImport.className = "lc-btn lc-btn-import";
      bImport.id = "btnImportCards";
      bindText(bImport, "ui.btn.importCards");
      bImport.textContent = ctx.i18n.t("ui.btn.importCards") || "Импорт карточек";
      bindTip(bImport, "ui.tip.importCards");
      bImport.setAttribute("data-tip", ctx.i18n.t("ui.tip.importCards") || "Загрузить JSON с карточками");
      bImport.onclick = () => input.click();

      const bClear = document.createElement("button");
      bClear.className = "lc-btn lc-btn-action";
      bClear.id = "btnClearCards";
      bindText(bClear, "ui.btn.clearCards");
      bClear.textContent = ctx.i18n.t("ui.btn.clearCards") || "Очистить список";
      bindTip(bClear, "ui.tip.clearCards");
      bClear.setAttribute("data-tip", ctx.i18n.t("ui.tip.clearCards") || "Удалить все карточки из списка");
      bClear.onclick = () => {
        // Clear RIGHT (draft) list immediately.
        // Also reset preview template so the UI doesn't show a stretched "ghost" card.
        try {
          ctx.cards?.clearAll?.();
        } catch (e){
          ctx.setState({ cards: [], selectedCardIndex: 0, boxes: [] }, { debounceMs: 50, clearSelection: true, autosave: true });
        }
        render();
        ctx.ui?.setStatus?.("Список карточек очищен");
      };

      const bNew = document.createElement("button");
      bNew.className = "lc-btn lc-btn-success";
      bNew.id = "btnNewCardRight";
      bNew.textContent = ctx.i18n.t("ui.btn.newCard") || "Новая карточка";
      bindText(bNew, "ui.btn.newCard");
      bNew.setAttribute("data-tip", ctx.i18n.t("ui.tip.newCard") || "Создать новую карточку");
      bindTip(bNew, "ui.tip.newCard");
      bNew.onclick = () => {
        try {
          ctx.cards?.addNew?.();
          render();
        } catch (e){
          console.error(e);
          ctx.ui?.setStatus?.("Ошибка создания: " + (e?.message || e));
        }
      };

      // New card formatting mode (RIGHT column)
      // UX: by default a new card should match the current right-column formatting.
      // Optional: user can force canonical template formatting.
      const wrapNewMode = document.createElement("label");
      wrapNewMode.className = "lc-row lc-row-inline";
      wrapNewMode.style.gap = "8px";
      wrapNewMode.style.alignItems = "center";

      const cbCanonical = document.createElement("input");
      cbCanonical.type = "checkbox";
      cbCanonical.id = "cbNewCardCanonical";
      const mode0 = String((ctx.getState?.()?.newCardTemplateMode) || (ctx.state?.newCardTemplateMode) || "inherit");
      cbCanonical.checked = (mode0 === "canonical");

      const txt = document.createElement("span");
      txt.textContent = "Сбросить форматирование (канон)";
      txt.title = "Если включено — новая карточка создаётся по каноническому шаблону. Если выключено — повторяет форматирование текущей карточки справа.";

      cbCanonical.addEventListener("change", () => {
        const mode = cbCanonical.checked ? "canonical" : "inherit";
        try {
          ctx.setState?.({ newCardTemplateMode: mode }, { autosave: true, debounceMs: 120, history: false });
        } catch (e) {
          ctx.log?.warn?.("newCardTemplateMode set failed", { err: String(e) });
        }
        try { localStorage.setItem("LC_NEW_CARD_TEMPLATE_MODE", mode); } catch (e) { ctx.log?.warn?.("LC_NEW_CARD_TEMPLATE_MODE save failed", { err: String(e) }); }
      });

      wrapNewMode.appendChild(cbCanonical);
      wrapNewMode.appendChild(txt);

      // Convenience: duplicate "New block" button inside the right panel.
      // This triggers the same action as the top-bar button.
      const bNewBlock = document.createElement("button");
      bNewBlock.className = "lc-btn";
      bNewBlock.id = "btnNewBlockRight";
      bNewBlock.textContent = ctx.i18n.t("ui.btn.newBlock") || "Создать блок";
      bindText(bNewBlock, "ui.btn.newBlock");
      bNewBlock.setAttribute("data-tip", ctx.i18n.t("ui.tip.newBlock") || "Создать новый блок");
      bindTip(bNewBlock, "ui.tip.newBlock");
      bNewBlock.onclick = () => {
        // Delegate to the main edit feature (single source of truth).
        const topBtn = document.getElementById("btnNewBlock");
        if (topBtn && !topBtn.disabled) {
          topBtn.click();
        } else {
          // keep UX honest: explain why nothing happens
          ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.needEditMode") || "Сначала включите режим Редактирования");
        }
      };

      const bDelete = document.createElement("button");
      bDelete.className = "lc-btn lc-btn-danger";
      bDelete.id = "btnDeleteCard";
      bDelete.textContent = ctx.i18n.t("ui.btn.deleteCard") || "Удалить карточку";
      bindText(bDelete, "ui.btn.deleteCard");
      bDelete.setAttribute("data-tip", ctx.i18n.t("ui.tip.deleteCard") || "Удалить текущую карточку");
      bindTip(bDelete, "ui.tip.deleteCard");
      bDelete.onclick = () => {
        try {
          ctx.cards?.deleteCurrent?.();
          // list refresh happens via ctx.requestRender wrapper, but do it immediately too
          render();
        } catch (e){
          console.error(e);
          ctx.ui?.setStatus?.("Ошибка удаления: " + (e?.message || e));
        }
      };

      const bExport = document.createElement("button");
      bExport.className = "lc-btn lc-btn-export";
      bExport.id = "btnExportCards";
      bExport.textContent = ctx.i18n.t("ui.btn.exportCards");
      bindText(bExport, "ui.btn.exportCards");
      bExport.setAttribute("data-tip", ctx.i18n.t("ui.tip.exportCards"));
      bindTip(bExport, "ui.tip.exportCards");
      bExport.onclick = () => {
        const st = ctx.getState?.() || ctx.state;
        // Draft cards live in the RIGHT column.
        // Compatibility: older builds used state.cards; newer can use state.cardsRight.
        const cards = Array.isArray(st?.cardsRight) ? st.cardsRight : (Array.isArray(st?.cards) ? st.cards : []);
        const cardMeta = {
          widthMm: Number.isFinite(st?.cardWmm) ? st.cardWmm : 150,
          heightMm: Number.isFinite(st?.cardHmm) ? st.cardHmm : 105,
        };

        // IMPORTANT: this button exports ONLY the RIGHT list (draft cards).
        // Left list (verbs + canonical/bind) export lives under the LEFT verbs list.
        
        // If the draft card is already заполнена (есть Infinitiv),
        // we also export it as verbs[] so it can be imported into the LEFT list without falling into "draft".
        function _boxTextById(card, id){
          const b = (card?.boxes || []).find(x => x && x.id === id);
          return String(b?.text ?? "").trim();
        }
        function _splitMeanings(s){
          return String(s || "")
            .split(/\n|;|,|•/g)
            .map(t => t.trim())
            .filter(Boolean);
        }
        function _parseForms(line){
          const parts = String(line || "").split("/").map(p => p.trim()).filter(Boolean);
          const forms = { p3:"", pret:"", p2:"", aux:"" };
          if (parts.length >= 1) forms.p3 = parts[0];
          if (parts.length >= 2) forms.pret = parts[1];
          if (parts.length >= 3) forms.p2 = parts[2];
          return forms;
        }
        const verbs = (cards || []).map(c => {
          const inf = _boxTextById(c, "inf");
          if (!inf) return null;
          const trLine = _boxTextById(c, "tr");
          const formsLine = _boxTextById(c, "forms");
          return {
            inf,
            meanings: _splitMeanings(trLine),
            forms: _parseForms(formsLine),
          };
        }).filter(Boolean);
const payload = {
          version: 1,
          kind: "cards-right",
          passport: makeExportPassport(ctx, { kind: "cards-right", scope: "right", schema: 1 }),
          card: { widthMm: cardMeta.widthMm, heightMm: cardMeta.heightMm },
          cards,
          verbs,
        };
        downloadJson(`lingocard_cards_right_${stamp()}.json`, payload);
      };

      const bPdfCur = document.createElement("button");
      bPdfCur.className = "lc-btn lc-btn-action";
      bPdfCur.id = "btnPdfCardsCurrent";
      bPdfCur.textContent = ctx.i18n.t("ui.btn.pdfCardsCurrent");
      bindText(bPdfCur, "ui.btn.pdfCardsCurrent");
      bPdfCur.setAttribute("data-tip", ctx.i18n.t("ui.tip.pdfCardsCurrent"));
      bindTip(bPdfCur, "ui.tip.pdfCardsCurrent");
      // IMPORTANT: keep PDF generation synchronous for the click gesture.
      bPdfCur.onclick = () => {
        try {
          ctx.log?.info?.("pdf.click", { mode: "cards", kind: "current" });
          ctx.pdfR?.exportCurrent?.({ fileName: "lingocard_cards_current.pdf" });
        } catch (e){
          console.error(e);
          ctx.ui?.setStatus?.("Ошибка PDF: " + (e?.message || e));
        }
      };

      const bPdfAll = document.createElement("button");
      bPdfAll.className = "lc-btn lc-btn-action";
      bPdfAll.id = "btnPdfCardsAll";
      bPdfAll.textContent = ctx.i18n.t("ui.btn.pdfCardsAll");
      bindText(bPdfAll, "ui.btn.pdfCardsAll");
      bPdfAll.setAttribute("data-tip", ctx.i18n.t("ui.tip.pdfCardsAll"));
      bindTip(bPdfAll, "ui.tip.pdfCardsAll");
      bPdfAll.onclick = () => {
        try {
          ctx.log?.info?.("pdf.click", { mode: "cards", kind: "all" });
          ctx.pdfR?.exportAll?.({ fileName: "lingocard_cards_all.pdf" });
        } catch (e){
          console.error(e);
          ctx.ui?.setStatus?.("Ошибка PDF (ALL): " + (e?.message || e));
        }
      };

      actions.appendChild(bImport);
      actions.appendChild(bClear);
      actions.appendChild(bNew);
      actions.appendChild(wrapNewMode);

      // Move selected draft card to the LEFT list (etalon)
      const wrapMove = document.createElement("div");
      wrapMove.style.display = "flex";
      wrapMove.style.alignItems = "center";
      wrapMove.style.gap = "8px";

      const cbAll = document.createElement("input");
      cbAll.type = "checkbox";
      cbAll.id = "cbMoveAllRight";
      cbAll.title = "Выбрать все карточки справа";

      const cbAllLbl = document.createElement("label");
      cbAllLbl.htmlFor = "cbMoveAllRight";
      cbAllLbl.textContent = "Все";
      cbAllLbl.style.opacity = "0.9";
      cbAllLbl.style.fontSize = "12px";

      const bMoveLeft = document.createElement("button");
      bMoveLeft.className = "lc-btn lc-btn-action";
      bMoveLeft.id = "btnMoveToLeft";
      bMoveLeft.textContent = "Перенести в левый список";
      bMoveLeft.setAttribute("data-tip", "Перенести выбранную карточку из черновика в эталонный список");
      cbAll.addEventListener("change", () => {
        setSelAll(cbAll.checked);
        render();
      });

      function boxTextById(card, id){
        const b = (card?.boxes || []).find(x => x && x.id === id);
        return String(b?.text ?? "").trim();
      }
      function splitMeanings(s){
        return String(s || "")
          .split(/\n|;|,|•/g)
          .map(t => t.trim())
          .filter(Boolean);
      }
      function parseForms(line){
        // "p3 / präteritum / p2 / aux" (aux optional)
        const parts = String(line || "").split("/").map(p => p.trim()).filter(Boolean);
        const forms = { p3:"", pret:"", p2:"", aux:"" };
        if (parts.length >= 1) forms.p3 = parts[0];
        if (parts.length >= 2) forms.pret = parts[1];
        if (parts.length >= 3) forms.p2 = parts[2];
        if (parts.length >= 4) forms.aux = parts[3];
        return forms;
      }
      function cardToVerb(card){
        const inf = boxTextById(card, "inf");
        if (!inf) return null;
        const trLine = boxTextById(card, "tr");
        const formsLine = boxTextById(card, "forms");
        const translations = splitMeanings(trLine);
        const forms = parseForms(formsLine);
        // Canon-ish object for LEFT verbs list
        return {
          infinitive: inf,
          translations,
          forms,
          // keep raw snapshot for future enhancements
          _fromDraft: true,
        };
      }

      bMoveLeft.onclick = () => {
        try {
          const st0 = ctx.getState?.() || ctx.state;
          const cards0 = Array.isArray(st0?.cards) ? st0.cards : [];
          if (!cards0.length){
            ctx.ui?.setStatus?.("Справа нет карточек для переноса");
            return;
          }

          // Determine indices to move
          let idxs = Array.from(rightSel.values()).filter(n => Number.isFinite(n));
          if (!idxs.length){
            const cur = Number.isFinite(st0?.selectedCardIndex) ? st0.selectedCardIndex : 0;
            idxs = [cur];
          }
          idxs = Array.from(new Set(idxs))
            .filter(i => i >= 0 && i < cards0.length)
            .sort((a,b) => a-b);

          const movedVerbs = [];
          let skippedNoInf = 0;
          for (const i of idxs){
            const v = cardToVerb(cards0[i]);
            if (!v){ skippedNoInf++; continue; }
            movedVerbs.push(v);
          }

          if (!movedVerbs.length){
            ctx.ui?.setStatus?.("Нечего переносить: в выбранных карточках нет блока Infinitiv (id=inf)");
            return;
          }

          // Append into LEFT verbs list (ctx.state.data.verbs)
          const st = ctx.getState?.() || ctx.state;
          const prevVerbs = Array.isArray(st?.data?.verbs) ? st.data.verbs : [];
          const seen = new Set(prevVerbs.map(v => normInfinitive(v)).filter(Boolean));

          let added = 0;
          let skippedDup = 0;
          const nextVerbs = prevVerbs.slice();
          for (const v of movedVerbs){
            const k = normInfinitive(v);
            if (k && seen.has(k)) { skippedDup++; continue; }
            if (k) seen.add(k);
            nextVerbs.push(v);
            added++;
          }

          // Remove moved cards from RIGHT list (remove by indices, descending)
          const toRemove = new Set(idxs);
          const nextCards = cards0.filter((_, i) => !toRemove.has(i));

          // Choose next active card index
          let nextCur = 0;
          if (nextCards.length){
            const oldCur = Number.isFinite(st0?.selectedCardIndex) ? st0.selectedCardIndex : 0;
            // If removed before current, shift left; if removed current, keep same numeric slot
            let shift = 0;
            for (const r of idxs){ if (r < oldCur) shift++; }
            nextCur = Math.max(0, Math.min(nextCards.length - 1, oldCur - shift));
          }

          const nextCard = nextCards[nextCur] || null;

          ctx.setState({
            // LEFT verbs
            data: { ...(st?.data || {}), verbs: nextVerbs },
            leftNeedsExport: true,
            // RIGHT cards
            cards: nextCards,
            selectedCardIndex: nextCur,
            viewMode: "cards",
            ...(nextCard ? {
              boxes: Array.isArray(nextCard?.boxes) ? nextCard.boxes : (st?.boxes || []),
              notesByVerb: (nextCard?.notesByVerb && typeof nextCard.notesByVerb === "object") ? nextCard.notesByVerb : (st?.notesByVerb || {}),
              selectedIndex: Number.isFinite(nextCard?.selectedIndex) ? nextCard.selectedIndex : (st?.selectedIndex || 0),
              selectedBoxId: null,
              selectedIds: [],
              marqueeRect: null,
            } : {
              boxes: [],
              selectedIndex: 0,
              selectedBoxId: null,
              selectedIds: [],
              marqueeRect: null,
            }),
          }, { clearSelection: true, autosave: true });

          // Clear selection after move
          rightSel.clear();
          rightSelAll = false;
          cbAll.checked = false;

          try { ctx.ui?.refreshCardsList?.(); } catch (e) { ctx.log?.warn?.("refreshCardsList failed", { err: String(e) }); }
          try { ctx.ui?.refreshVerbsList?.(); } catch (e) { ctx.log?.warn?.("refreshVerbsList failed", { err: String(e) }); }

          ctx.ui?.setStatus?.(`Перенесено в левый список: ${added}`
            + (skippedDup ? ` · Дубликаты пропущены: ${skippedDup}` : "")
            + (skippedNoInf ? ` · Без Infinitiv: ${skippedNoInf}` : "")
          );

          ctx.requestRender?.();
        } catch (e){
          console.error(e);
          ctx.ui?.setStatus?.("Ошибка переноса: " + (e?.message || e));
        }
      };

      wrapMove.appendChild(cbAll);
      wrapMove.appendChild(cbAllLbl);
      wrapMove.appendChild(bMoveLeft);
      actions.appendChild(wrapMove);

      actions.appendChild(bNewBlock);
      actions.appendChild(bDelete);
      actions.appendChild(bPdfCur);
      actions.appendChild(bPdfAll);
      actions.appendChild(bExport);

      host.appendChild(list);
      host.appendChild(actions);

      // -----------------------------------------------------------------
      // RIGHT list state: multi-select + inline rename
      // -----------------------------------------------------------------

      // Inline rename state (right list)
      let editingIndex = null;
      let editingValue = "";

      // Multi-select (RIGHT list)
      // If user checks any cards -> Move-to-left will move selected; otherwise moves active card.
      const rightSel = new Set();
      let rightSelAll = false;

      function setSelAll(on){
        rightSelAll = !!on;
        rightSel.clear();
        const st = ctx.getState?.() || ctx.state;
        const cards = Array.isArray(st?.cards) ? st.cards : [];
        if (rightSelAll){
          for (let i=0;i<cards.length;i++) rightSel.add(i);
        }
      }

      function toggleSel(i, on){
        const n = Number(i);
        if (!Number.isFinite(n) || n < 0) return;
        if (on) rightSel.add(n);
        else rightSel.delete(n);
        rightSelAll = false;
      }

      function commitRename(){
        if (editingIndex === null) return;
        const st = ctx.getState?.() || ctx.state;
        const cards = Array.isArray(st?.cards) ? st.cards : [];
        const i = editingIndex;
        const prev = cards[i];
        const nextTitle = String(editingValue || "").trim();
        editingIndex = null;
        editingValue = "";

        if (!prev) { render(); return; }
        if (!nextTitle) { render(); return; }

        const nextCards = cards.slice();
        nextCards[i] = { ...prev, title: nextTitle };
        ctx.setState({ cards: nextCards }, { debounceMs: 50 });

        // keep badge consistent if current card renamed
        try {
          const cur = Number.isFinite(st?.selectedCardIndex) ? st.selectedCardIndex : 0;
          if (cur === i){
            const ii = (ctx.cards?.getIndex?.() || 0) + 1;
            const nn = ctx.cards?.getCount?.() || 1;
            ctx.ui?.setCardBadge?.(ctx.i18n.t("ui.status.card", { i: ii, n: nn }));
          }
        } catch (e) { ctx.log?.warn?.("setCardBadge failed", { err: String(e) }); }

        render();
      }

      function cancelRename(){
        editingIndex = null;
        editingValue = "";
        render();
      }

      
      function pickCardTitle(card){
        // Right sidebar should display a meaningful title if it exists.
        // Accept several legacy/alternate fields for compatibility with imported JSON.
        const c = (card && typeof card === "object") ? card : {};
        const candidates = [
          c.title,
          c.name,
          c.cardTitle,
          c.meta && (c.meta.title || c.meta.name),
        ];
        for (const v of candidates){
          const s = (v == null) ? "" : String(v).trim();
          if (s) return s;
        }
        return "";
      }

function render(){
        const st = ctx.getState?.() || ctx.state;
        const cards = Array.isArray(st?.cards) ? st.cards : [];
        const cur = Number.isFinite(st?.selectedCardIndex) ? st.selectedCardIndex : 0;
        const searchQuery = String(st?.searchQuery || "").trim();
        const searchRe = compileWildcardQuery(searchQuery);

        list.innerHTML = "";

        let activeEl = null;
        if (!cards.length){
          const empty = document.createElement("div");
          empty.className = "lc-muted";
          empty.textContent = ctx.i18n.t("ui.right.noCards");
          empty.dataset.i18nKey = "ui.right.noCards";
          list.appendChild(empty);
        } else {
          const items = cards.map((c, i) => ({ c, i }));

          items.forEach(({ c, i }) => {
            const item = document.createElement("div");
            item.className = "lc-carditem" + (i === cur ? " isActive" : "");
            item.dataset.idx = String(i);
            const t = pickCardTitle(c);
            const title = t ? t : ctx.i18n.t("ui.right.card", { n: i+1 });

            // Inline rename editor
            if (editingIndex === i){
              item.className += " isEditing";
              const inp = document.createElement("input");
              inp.type = "text";
              inp.className = "lc-carditem-edit";
              inp.value = editingValue || title;
              inp.spellcheck = false;
              inp.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter") { ev.preventDefault(); editingValue = inp.value; commitRename(); }
                if (ev.key === "Escape") { ev.preventDefault(); cancelRename(); }
              });
              inp.addEventListener("blur", () => {
                editingValue = inp.value;
                commitRename();
              });
              // prevent click from switching card while editing
              inp.addEventListener("pointerdown", (ev) => ev.stopPropagation());
              item.appendChild(inp);
              // autofocus after mount
              setTimeout(() => {
                try { inp.focus(); inp.select(); } catch (e) { ctx.log?.warn?.("input focus failed", { err: String(e) }); }
              }, 0);
            } else {
              // Row: checkbox + title (click title = select card)
              const row = document.createElement("div");
              row.style.display = "flex";
              row.style.alignItems = "center";
              row.style.gap = "8px";

              const cb = document.createElement("input");
              cb.type = "checkbox";
              cb.checked = rightSelAll || rightSel.has(i);
              cb.title = "Выбрать для переноса в левый список";
              cb.addEventListener("change", () => {
                toggleSel(i, cb.checked);
                // keep "All" box in sync
                cbAll.checked = rightSelAll;
              });
              cb.addEventListener("pointerdown", (ev) => ev.stopPropagation());

              const span = document.createElement("span");
              span.textContent = title;
              span.style.flex = "1 1 auto";
              span.style.minWidth = "0";
              span.style.overflow = "hidden";
              span.style.textOverflow = "ellipsis";
              span.style.whiteSpace = "nowrap";

              // click on row (except checkbox) selects the card
              row.onclick = () => {
                ctx.cards?.switchTo?.(i);
                const ii = (ctx.cards?.getIndex?.() || 0) + 1;
                const nn = ctx.cards?.getCount?.() || 1;
                ctx.ui?.setCardBadge?.(ctx.i18n.t("ui.status.card", { i: ii, n: nn }));
                render();
              };

              row.ondblclick = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                editingIndex = i;
                editingValue = title;
                render();
              };

              row.appendChild(cb);
              row.appendChild(span);
              item.appendChild(row);
            }
            list.appendChild(item);

            if (i === cur) activeEl = item;
          });
        }

        // Keep active card visible when navigating via arrows
        try { activeEl?.scrollIntoView?.({ block: (ctx.ui?.__scrollAlignStartRight ? "start" : "nearest") }); } catch (e) { ctx.log?.warn?.("scrollIntoView failed", { err: String(e) }); }
        try { if (ctx.ui) ctx.ui.__scrollAlignStartRight = false; } catch (e) { ctx.log?.warn?.("scrollAlignStartRight reset failed", { err: String(e) }); }

        // Keep "All" checkbox in sync
        try { cbAll.checked = !!rightSelAll; } catch (e) { ctx.log?.warn?.("bulk checkbox set failed", { err: String(e) }); }

        // disable actions when nothing to export
        const has = cards.length > 0;
        bPdfCur.disabled = !has;
        bPdfAll.disabled = !has;
        bExport.disabled = !has;
        bDelete.disabled = !has;

        // "New block" is available only in edit mode.
        bNewBlock.disabled = !((ctx.state && ctx.state.editing) || (ctx.getState?.()?.editing));
      }

      // Expose a refresh hook so other UI parts (e.g., arrow navigation)
      // can update the active highlight without direct access to this closure.
      ctx.ui = ctx.ui || {};
      ctx.ui.refreshCardsList = () => {
        try { render(); } catch (e) { ctx.log?.warn?.("cardsSidebar render failed", { err: String(e) }); }
      };

      // Scroll right cards list to a card index without changing order
      ctx.ui.scrollCardsToIndex = (cardIndex, opts = {}) => {
        const i = Number(cardIndex);
        if (!Number.isFinite(i)) return false;
        const el = list.querySelector(`div[data-idx="${i}"]`);
        if (!el) return false;
        try {
          if (opts.align === 'start'){ ctx.ui.__scrollAlignStartRight = true; }
          el.scrollIntoView({ block: (opts.align === 'start') ? 'start' : 'nearest' });
        } catch (e) { ctx.log?.warn?.("scrollCardsToIndex failed", { err: String(e) }); }
        return true;
      };

      // install updater
      // We don't have a central render callback bus; the safest cheap hook is to wrap requestRender.
      // This keeps the list and button states in sync whenever the app redraws.
      const origReq = ctx.requestRender;
      if (typeof origReq === "function"){
        ctx.requestRender = () => {
          try { origReq(); } finally { render(); }
        };
      }

      // also render once now
      render();
    },
  };
}
