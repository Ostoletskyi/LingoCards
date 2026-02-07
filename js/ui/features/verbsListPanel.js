// js/ui/features/verbsListPanel.js
import { rerender } from "../../render/renderCard.js";
import { loadVerbsFromFile } from "../../data/verbsLoad.js";
import { scanVerbDataset } from "../../data/jsonScan.js";
import { makeExportPassport } from "../../data/exportPassport.js";
import { bindText, bindTip } from "../i18n.js";
import { compileWildcardQuery, matchesQuery } from "../../utils/search.js";
import { addVerbsToHistory, findHistoryMatches, getHistoryList, clearVerbHistory, normInfinitive } from "../../data/verbHistory.js";
import { log } from "../../utils/log.js";

function getVerbs(ctx){
  const v = ctx.state?.data?.verbs;
  return Array.isArray(v) ? v : [];
}

function verbLabel(v){
  // Пытаемся быть совместимыми с разными JSON-структурами
  // Canon (v2+): infinitive + translations[]
  const inf = v?.infinitive ?? v?.inf ?? v?.Inf ?? v?.lemma ?? v?.base ?? "";

  let tr = "";
  if (Array.isArray(v?.translations) && v.translations.length){
    tr = v.translations.filter(Boolean).join(", ");
  } else if (Array.isArray(v?.meanings) && v.meanings.length){
    tr = v.meanings.filter(Boolean).join(", ");
  } else {
    tr = v?.tr ?? v?.translation ?? v?.meaning ?? "";
  }

  const a = String(inf || "").trim();
  const b = String(tr || "").trim();

  if (a && b) return `${a} — ${b}`;
  return a || b || "(без названия)";
}

function stamp(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth()+1) +
    pad(d.getDate()) + "_" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
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
  }, 0);
}

function normStr(s){
  return String(s || "").trim().toLowerCase();
}

function verbKey(v){
  // Stable-ish key for dedupe.
  // Prefer explicit id; otherwise fall back to infinitive/lemma/base.
  const id = v?.id ?? v?._id;
  if (id !== undefined && id !== null) return `id:${String(id)}`;

  const inf =
    v?.infinitive ??
    v?.inf ??
    v?.Inf ??
    v?.lemma ??
    v?.base ??
    "";

  const a = normStr(inf);
  return a ? `inf:${a}` : `raw:${normStr(JSON.stringify(v || {}))}`;
}


function dedupeByInfinitive(list){
  const out = [];
  const seen = new Set();
  for (const v of (Array.isArray(list) ? list : [])){
    const k = normInfinitive(v);
    if (!k) { out.push(v); continue; }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function sortModeNext(mode){
  const m = String(mode || "added");
  if (m === "added") return "az";
  if (m === "az") return "za";
  return "added";
}

function sortModeLabel(ctx, mode){
  const m = String(mode || "added");
  if (m === "az") return ctx.i18n.t?.("ui.sort.az") || "A–Z";
  if (m === "za") return ctx.i18n.t?.("ui.sort.za") || "Z–A";
  return ctx.i18n.t?.("ui.sort.added") || "Добавление";
}

export function featureVerbsListPanel(){
  return {
    id: "verbsListPanel",
    install(ctx){
      const { log } = ctx;

      const host =
        ctx.shell?.leftPanelContent ||
        ctx.shell?.leftPanel ||
        document.getElementById("leftPanel");

      if (!host){
        log?.warn?.("verbsListPanel: left panel host not found");
        return;
      }

      // Если уже был старый список — удалим только его, не ломая всю панель
      const old = host.querySelector("#lcVerbsList");
      if (old) old.remove();

// --- Verb import history (persistent, to avoid duplicates) ----------
function makeTopBtn(id, label){
  const b = document.createElement("button");
  b.type = "button";
  b.id = id;
  b.dataset.group = "verbs";
  // style from any existing top button
  const sample = ctx.shell?.topActions?.querySelector?.("button");
  if (sample){
    b.className = sample.className;
    const css = sample.getAttribute("style") || "";
    const safe = css
      .split(";")
      .map(s => s.trim())
      .filter(s => s && !/^display\s*:|^visibility\s*:|^opacity\s*:|^pointer-events\s*:/i.test(s))
      .join("; ");
    if (safe) b.setAttribute("style", safe);
  } else {
    b.className = "lc-btn";
  }
  b.textContent = label;
  return b;
}

function fmtTs(ms){
  if (!ms) return "";
  try {
    const d = new Date(ms);
    return d.toISOString().slice(0, 19).replace("T", " ");
  } catch (e) {
    log.warn("format timestamp failed", { err: String(e) });
    return "";
  }
}

function openHistoryModal(){
  const data = getHistoryList();
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.55)";
  overlay.style.zIndex = "99999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const panel = document.createElement("div");
  panel.style.width = "min(820px, 92vw)";
  panel.style.maxHeight = "min(80vh, 720px)";
  panel.style.overflow = "auto";
  panel.style.background = "rgba(15,23,42,0.98)";
  panel.style.border = "1px solid rgba(255,255,255,0.18)";
  panel.style.borderRadius = "16px";
  panel.style.padding = "14px 14px 10px";
  panel.style.boxShadow = "0 18px 60px rgba(0,0,0,0.5)";

  const head = document.createElement("div");
  head.style.display = "flex";
  head.style.alignItems = "center";
  head.style.justifyContent = "space-between";
  head.style.gap = "12px";

  const h = document.createElement("div");
  h.style.fontSize = "16px";
  h.style.fontWeight = "700";
  h.style.color = "#fff";
  h.textContent = "История карточек (импортированные глаголы)";

  const controls = document.createElement("div");
controls.style.display = "flex";
controls.style.gap = "8px";
controls.style.alignItems = "center";

const clearBtn = document.createElement("button");
clearBtn.type = "button";
clearBtn.textContent = "Очистить историю";
clearBtn.style.borderRadius = "12px";
clearBtn.style.border = "1px solid rgba(255,255,255,0.18)";
clearBtn.style.background = "rgba(255,255,255,0.08)";
clearBtn.style.color = "#fff";
clearBtn.style.cursor = "pointer";
clearBtn.style.padding = "6px 10px";
clearBtn.style.fontSize = "12px";
clearBtn.onclick = () => {
  const ok = confirm("Очистить историю карточек? (для теста)");
  if (!ok) return;
  clearVerbHistory();
  ctx.ui?.setStatus?.("История карточек очищена");
  overlay.remove();
  // reopen to show empty (optional)
  // openHistoryModal();
};

const close = document.createElement("button");
close.type = "button";
close.textContent = "✕";
close.style.borderRadius = "12px";
close.style.border = "1px solid rgba(255,255,255,0.18)";
close.style.background = "rgba(255,255,255,0.08)";
close.style.color = "#fff";
close.style.cursor = "pointer";
close.style.padding = "6px 10px";
close.onclick = () => overlay.remove();

controls.appendChild(clearBtn);
controls.appendChild(close);

head.appendChild(h);
head.appendChild(controls);

  const info = document.createElement("div");
  info.style.margin = "10px 0 10px";
  info.style.opacity = "0.85";
  info.style.fontSize = "12px";
  info.style.color = "rgba(255,255,255,0.85)";
  info.textContent = `Всего уникальных глаголов в истории: ${data.length}`;

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.innerHTML = `
    <thead>
      <tr style="text-align:left; opacity:0.9;">
        <th style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.12);">Infinitiv</th>
        <th style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.12); width:70px;">Count</th>
        <th style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.12); width:170px;">First seen</th>
        <th style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.12); width:170px;">Last seen</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  for (const row of data){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.08); color:#fff;">${String(row.inf || row.key)}</td>
      <td style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.08); color:rgba(255,255,255,0.9);">${row.count}</td>
      <td style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.08); color:rgba(255,255,255,0.8); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">${fmtTs(row.firstSeen)}</td>
      <td style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.08); color:rgba(255,255,255,0.8); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">${fmtTs(row.lastSeen)}</td>
    `;
    tbody.appendChild(tr);
  }

  panel.appendChild(head);
  panel.appendChild(info);
  panel.appendChild(table);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

const btnVerbsHistory = makeTopBtn("btnVerbsHistory", "История карточек");
btnVerbsHistory.onclick = () => openHistoryModal();

// Make history button less prominent
btnVerbsHistory.classList.add("lc-btn-sm");
btnVerbsHistory.style.padding = "4px 8px";
btnVerbsHistory.style.fontSize = "12px";
btnVerbsHistory.style.opacity = "0.85";
btnVerbsHistory.style.borderColor = "rgba(255,200,0,0.35)";
btnVerbsHistory.style.background = "rgba(255,200,0,0.10)";
btnVerbsHistory.style.color = "rgba(255,255,255,0.92)";

ctx.ui?.addTopButton?.(btnVerbsHistory);


      // контейнер панели
      const wrap = document.createElement("div");
      wrap.id = "lcVerbsList";
      wrap.style.padding = "0";
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.gap = "8px";
      wrap.style.height = "100%";

      const list = document.createElement("div");
      // Shell already renders the left panel title. Avoid duplicating it.
      list.style.padding = "12px";
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "6px";
      // IMPORTANT: only the verbs list should scroll.
      // The left panel itself must NOT create an extra scrollbar.
      list.style.overflow = "auto";
      list.style.flex = "1 1 auto";
      // allow flex child to shrink without forcing parent overflow
      list.style.minHeight = "0";

      // actions under list
      const actions = document.createElement("div");
      actions.id = "lcVerbsActions";
      actions.className = "lc-panel-actions";

      // Unsaved indicator: shows when LEFT list was modified (e.g., moved from draft)
      const unsaved = document.createElement("div");
      unsaved.id = "lcLeftUnsaved";
      unsaved.textContent = "Карточки не сохранены! Экспортируйте файл!";
      unsaved.style.display = "none";
      unsaved.style.padding = "8px 10px";
      unsaved.style.borderRadius = "12px";
      unsaved.style.border = "1px solid rgba(255,70,70,0.45)";
      unsaved.style.background = "rgba(255,70,70,0.12)";
      unsaved.style.color = "rgba(255,255,255,0.92)";
      unsaved.style.fontWeight = "800";
      unsaved.style.letterSpacing = "0.2px";
      unsaved.style.marginBottom = "8px";
      actions.appendChild(unsaved);

      function updateUnsaved(){
        const st = ctx.getState?.() || ctx.state;
        unsaved.style.display = st?.leftNeedsExport ? "block" : "none";
      }

      function makeActionBtn(id, key, tipKey){
        const b = document.createElement("button");
        b.type = "button";
        b.id = id;
        b.className = "lc-btn lc-btn-action";
        b.textContent = ctx.i18n.t(key);
        bindText(b, key);
        if (tipKey){
          b.setAttribute("data-tip", ctx.i18n.t(tipKey));
          bindTip(b, tipKey);
        }
        return b;
      }

      const btnImport = makeActionBtn("btnImportVerbs", "toolbar.loadVerbs", "ui.tip.loadVerbs");
      const btnAppend = makeActionBtn("btnAppendVerbs", "toolbar.appendVerbs", "ui.tip.appendVerbs");
      const btnSort   = makeActionBtn("btnSortVerbs", "toolbar.sortVerbs", "ui.tip.sortVerbs");
      const btnClear  = makeActionBtn("btnClearVerbs", "toolbar.clearVerbs", "ui.tip.clearVerbs");
      const btnPdfCur = makeActionBtn("btnPdfVerbsCurrent", "toolbar.pdfCurrent", "ui.tip.pdfCurrent");
      const btnPdfAll = makeActionBtn("btnPdfVerbsAll", "toolbar.pdfAll", "ui.tip.pdfAll");

      function updateSortBtn(){
        const base = ctx.i18n.t?.("toolbar.sortVerbs") || "Сортировка";
        const mode = ctx.state?.verbsSortMode || "added";
        btnSort.textContent = `${base}: ${sortModeLabel(ctx, mode)}`;
      }

      // Export LEFT list pack: verbs + current cards layout snapshot
      const btnExportLeft = document.createElement("button");
      btnExportLeft.type = "button";
      btnExportLeft.id = "btnExportCardsLeft";
      btnExportLeft.className = "lc-btn lc-btn-export";
      btnExportLeft.textContent = ctx.i18n.t("ui.btn.exportCards");
      bindText(btnExportLeft, "ui.btn.exportCards");
      btnExportLeft.setAttribute("data-tip", ctx.i18n.t("ui.tip.exportCardsLeft"));
      bindTip(btnExportLeft, "ui.tip.exportCardsLeft");

      btnExportLeft.onclick = () => {
        const st = ctx.getState?.() || ctx.state;
        const payload = {
          version: 1,
          passport: makeExportPassport(ctx, { kind: "pack-left", scope: "left", schema: 1 }),
          card: {
            widthMm: Number.isFinite(st?.cardWmm) ? st.cardWmm : 150,
            heightMm: Number.isFinite(st?.cardHmm) ? st.cardHmm : 105,
          },
          // Left list = verbs
          verbs: Array.isArray(st?.data?.verbs) ? st.data.verbs : [],
          // Per-verb overrides for SOURCE view (user edits to bind-text, notes, etc.)
          notesByVerb: (st?.notesByVerb && typeof st.notesByVerb === "object") ? st.notesByVerb : {},
          // Source layout snapshot (geometry + binds) to keep preview/PDF consistent after reimport
          sourceBoxes: Array.isArray(st?.sourceBoxes) ? st.sourceBoxes : null,
          verbsSortMode: st?.verbsSortMode || "added",
          // Include current cards snapshot for compatibility/backups
          cards: Array.isArray(st?.cards) ? st.cards : [],
        };
        downloadJson(`lingocard_pack_${stamp()}.json`, payload);
      };

      actions.appendChild(btnImport);
      actions.appendChild(btnAppend);
      actions.appendChild(btnSort);
      actions.appendChild(btnClear);
      actions.appendChild(btnPdfCur);
      actions.appendChild(btnPdfAll);
      actions.appendChild(btnExportLeft);

      // initial label
      updateSortBtn();

      wrap.appendChild(list);
      wrap.appendChild(actions);

      // Вставим сверху (без host.innerHTML = "")
      host.prepend(wrap);

      // --- verbs import (file) ---
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      document.body.appendChild(input);

      async function doLoad(file, mode){
        if (!file) return;
        const importMode = (mode === "append") ? "append" : "replace";
        // We support two payload families:
        //  1) Verb datasets (verbs[] / data.verbs[])
        //  2) Draft cards exports (cards[] / data.cards[]) coming from the right list.
        // If a user accidentally imports a cards-only file here, we auto-route it into the right list
        // (so we don't block them with "нет verbs[]").

        const text = await file.text();
        let raw = null;
        try { raw = JSON.parse(text); }
        catch (e){
          ctx.ui?.setStatus?.("Ошибка JSON: " + (e?.message || String(e)));
          return;
        }

        const verbs = Array.isArray(raw?.verbs) ? raw.verbs : (Array.isArray(raw?.data?.verbs) ? raw.data.verbs : null);
        if (verbs && verbs.length){
          const prev = getVerbs(ctx);

          // Optional extras for "packs": per-verb overrides (notes) and source layout snapshot.
          const importedNotes = (raw?.notesByVerb && typeof raw.notesByVerb === "object")
            ? raw.notesByVerb
            : ((raw?.data?.notesByVerb && typeof raw.data.notesByVerb === "object") ? raw.data.notesByVerb : null);
          const importedSourceBoxes = Array.isArray(raw?.sourceBoxes)
            ? raw.sourceBoxes
            : (Array.isArray(raw?.data?.sourceBoxes) ? raw.data.sourceBoxes : null);
          const importedSortMode = raw?.verbsSortMode || raw?.data?.verbsSortMode || null;

          let nextVerbs = verbs;
          let added = verbs.length;
          let skipped = 0;

          if (importMode === "append" && prev.length){
            const seen = new Set(prev.map(verbKey));
            const out = [...prev];
            added = 0;
            for (const v of verbs){
              const k = verbKey(v);
              if (seen.has(k)) { skipped++; continue; }
              seen.add(k);
              out.push(v);
              added++;
            }
            nextVerbs = out;
          } else if (importMode === "append" && !prev.length){
            // append into empty list = behave like replace but keep semantic
            nextVerbs = verbs;
            added = verbs.length;
          }


// De-dup inside the incoming payload by infinitive (prevents "импорт дублей" даже в replace).
nextVerbs = dedupeByInfinitive(nextVerbs);

// Detect matches against the persistent history BEFORE we touch it (so it's "already existed before").
const histMatches = findHistoryMatches(nextVerbs);

// Update persistent history counter (keeps info even after list clears).
const histStat = addVerbsToHistory(nextVerbs);
          const scan = scanVerbDataset(nextVerbs);
          const keepSel = Number.isFinite(ctx.state?.selectedIndex) ? ctx.state.selectedIndex : 0;
          const selNext = (importMode === "replace") ? 0 : Math.max(0, Math.min(keepSel, nextVerbs.length - 1));

          // Merge notesByVerb:
          // - replace: take imported as-is
          // - append: add missing verbKeys, do not overwrite existing edits
          let nextNotesByVerb = (ctx.state?.notesByVerb && typeof ctx.state.notesByVerb === "object") ? ctx.state.notesByVerb : {};
          if (importedNotes){
            if (importMode === "replace"){
              nextNotesByVerb = importedNotes;
            } else {
              const merged = { ...nextNotesByVerb };
              for (const k of Object.keys(importedNotes)){
                if (merged[k] === undefined) merged[k] = importedNotes[k];
              }
              nextNotesByVerb = merged;
            }
          }

          // Normalize imported sourceBoxes: bind blocks are AUTO by default.
          if (importedSourceBoxes){
            for (const b of importedSourceBoxes){
              if (!b || typeof b !== "object") continue;
              if (!String(b.bind || "").trim()) continue;
              if (b.geomPinned === true || b.manualGeom === true) continue;
              if (String(b.geomMode || "") === "manual") delete b.geomMode;
            }
          }

          ctx.setState({
            data: { verbs: nextVerbs },
            selectedIndex: selNext,
            bindMode: scan.mode,
            bindScan: scan,
            notesByVerb: nextNotesByVerb,
            // Source layout snapshot is only meaningful in SOURCE mode.
            ...(importedSourceBoxes ? { sourceBoxes: importedSourceBoxes } : {}),
            ...(importedSortMode ? { verbsSortMode: importedSortMode } : {}),
          });

          const modeLine = scan.mode === "auto" ? "AUTO (path)" : "CANON";
          if (importMode === "append"){
            ctx.ui?.setStatus?.(`Добавлено: ${added} · Дубликаты пропущены: ${skipped} · Всего: ${nextVerbs.length} · bind: ${modeLine}` + (histMatches.length ? ` · Данный глагол уже оформлен в виде карточки. Обнаружено совпадение! (${histMatches.length})` : ""));
          } else {
            ctx.ui?.setStatus?.(
              (ctx.i18n.t("ui.status.verbsLoaded") || `Список глаголов загружен: ${nextVerbs.length}`)
              + ` · bind: ${modeLine}`
              + (histMatches.length ? ` · Данный глагол уже оформлен в виде карточки. Обнаружено совпадение! (${histMatches.length})` : "")
            );
          }
          return;
        }

        // Cards-only? Import into the right list (draft) automatically.
        // Accept a few wrappers used by older/newer exporters.
        const cards =
          (Array.isArray(raw?.cards) ? raw.cards : null)
          || (Array.isArray(raw?.data?.cards) ? raw.data.cards : null)
          || (Array.isArray(raw?.payload?.cards) ? raw.payload.cards : null)
          || (Array.isArray(raw?.export?.cards) ? raw.export.cards : null)
          || (Array.isArray(raw?.result?.cards) ? raw.result.cards : null);
        if (cards && cards.length){
          const meta = raw.card || raw.meta || {};
          const widthMm = Number.isFinite(meta.widthMm) ? meta.widthMm : (Number.isFinite(meta.wMm) ? meta.wMm : undefined);
          const heightMm = Number.isFinite(meta.heightMm) ? meta.heightMm : (Number.isFinite(meta.hMm) ? meta.hMm : undefined);

          const normCards = (cards || []).map((c) => {
            const cc = (c && typeof c === "object") ? c : {};
            const boxes = Array.isArray(cc.boxes) ? cc.boxes : [];
            for (const b of boxes){
              if (!b || typeof b !== "object") continue;
              b.geomMode = "manual";
              b.geomPinned = true;
            }
            return cc;
          });

          const first = normCards[0];
          ctx.setState({
            cards: normCards,
            selectedCardIndex: 0,
            viewMode: "cards",
            cardWmm: Number.isFinite(first?.cardWmm) ? first.cardWmm : (Number.isFinite(widthMm) ? widthMm : ctx.state.cardWmm),
            cardHmm: Number.isFinite(first?.cardHmm) ? first.cardHmm : (Number.isFinite(heightMm) ? heightMm : ctx.state.cardHmm),
            boxes: Array.isArray(first?.boxes) ? first.boxes : ctx.state.boxes,
            notesByVerb: (first?.notesByVerb && typeof first.notesByVerb === "object") ? first.notesByVerb : (ctx.state.notesByVerb || {}),
            selectedIndex: Number.isFinite(first?.selectedIndex) ? first.selectedIndex : (ctx.state.selectedIndex || 0),
            selectedBoxId: null,
            selectedIds: [],
            marqueeRect: null,
          }, { clearSelection: true });

          ctx.ui?.setStatus?.(`Файл содержит карточки (verbs[] нет). Импортировано в ЧЕРНОВИК (правый список): ${normCards.length}`);
          return;
        }

        // Fallback to old loader for better error messages.
        const res = await loadVerbsFromFile(file);
        ctx.log?.error?.("verbs.load failed", { error: res?.error || "Unknown" });
        ctx.ui?.setStatus?.(res?.error || "Файл не содержит verbs[] или cards[]");
      }

      let _pendingImportMode = "replace";

      input.addEventListener("change", async () => {
        try {
          const f = input.files && input.files[0];
          await doLoad(f, _pendingImportMode);
        } finally {
          input.value = "";
          _pendingImportMode = "replace";
        }
      });

      btnImport.onclick = () => {
        _pendingImportMode = "replace";
        ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.chooseJson") || "Выберите JSON файл…");
        input.click();
      };

      btnAppend.onclick = () => {
        _pendingImportMode = "append";
        ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.chooseJson") || "Выберите JSON файл…");
        input.click();
      };

      btnSort.onclick = () => {
        const cur = ctx.state?.verbsSortMode || "added";
        const next = sortModeNext(cur);
        ctx.setState({ verbsSortMode: next }, { debounceMs: 0 });
        updateSortBtn();
        try { render(); } catch (e) { ctx.log?.warn?.("verbsList.render failed", { err: String(e) }); }
        const base = ctx.i18n.t?.("toolbar.sortVerbs") || "Сортировать";
        ctx.ui?.setStatus?.(`${base}: ${sortModeLabel(ctx, next)}`);
      };

      btnExportLeft.onclick = () => {
        const st = ctx.getState?.() || ctx.state;
        const cards = Array.isArray(st?.cards) ? st.cards : [];
        const payload = {
          version: 1,
          card: {
            widthMm: Number.isFinite(st?.cardWmm) ? st.cardWmm : 150,
            heightMm: Number.isFinite(st?.cardHmm) ? st.cardHmm : 105,
          },
          cards,
          verbs: Array.isArray(st?.data?.verbs) ? st.data.verbs : [],
          notesByVerb: (st?.notesByVerb && typeof st.notesByVerb === "object") ? st.notesByVerb : {},
          sourceBoxes: Array.isArray(st?.sourceBoxes) ? st.sourceBoxes : null,
          verbsSortMode: st?.verbsSortMode || "added",
        };
        downloadJson(`lingocard_pack_${stamp()}.json`, payload);
        try {
          ctx.setState?.({ leftNeedsExport: false }, { debounceMs: 0 });
        } catch (e) {
          ctx.log?.warn?.("leftNeedsExport reset failed", { err: String(e) });
        }
        try { updateUnsaved(); } catch (e) { ctx.log?.warn?.("updateUnsaved failed", { err: String(e) }); }
        ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.exported") || "Экспортировано");
      };

      btnClear.onclick = () => {
        ctx.setState({ data: { verbs: [] }, selectedIndex: 0, bindMode: "canon", bindScan: null });
        ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.listCleared") || "Список очищен");
      };

      // IMPORTANT: PDF download must be initiated within the same user gesture stack.
      // Using async/await can break that in some browsers (download gets blocked).
      btnPdfCur.onclick = () => {
        try {
          ctx.log?.info?.("pdf.click", { mode: "verbs", kind: "current" });
          ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.pdfOne") || "PDF…");
          // no await here — keep it synchronous for the click gesture
          ctx.pdfL?.exportCurrent?.();
          ctx.ui?.setStatus?.("PDF готов");
        } catch (e){
          ctx.ui?.setStatus?.("Ошибка PDF: " + (e?.message || e));
          console.error(e);
        }
      };

      btnPdfAll.onclick = () => {
        try {
          ctx.log?.info?.("pdf.click", { mode: "verbs", kind: "all" });
          ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.pdfAll") || "PDF…");
          ctx.pdfL?.exportAll?.({ fileName: "lingocard_verbs_all.pdf" });
          ctx.ui?.setStatus?.("PDF готов");
        } catch (e){
          ctx.ui?.setStatus?.("Ошибка PDF (ALL): " + (e?.message || e));
          console.error(e);
        }
      };

      function requestCardRender(){
        // 1) если ты завёл мягкий хук в ctx — используем его
        if (typeof ctx.requestRender === "function"){
          try { ctx.requestRender(); } catch (e) { ctx.log?.warn?.("requestRender failed", { err: String(e) }); }
          return;
        }
        // 2) иначе напрямую перерендерим карточку
        try { rerender(); } catch (e) { ctx.log?.warn?.("rerender failed", { err: String(e) }); }
      }

      function render(){
        updateUnsaved();
        const verbs = getVerbs(ctx);
        const sel = Number.isFinite(ctx.state?.selectedIndex) ? ctx.state.selectedIndex : 0;
        const sortMode = ctx.state?.verbsSortMode || "added";
        const searchQuery = String(ctx.state?.searchQuery || "").trim();
        const searchRe = compileWildcardQuery(searchQuery);

        list.innerHTML = "";

        if (!verbs.length){
          const empty = document.createElement("div");
          empty.textContent = ctx.i18n.t?.("ui.status.verbsEmpty") || "Список глаголов не загружен";
          empty.style.opacity = "0.7";
          empty.style.padding = "8px 6px";
          list.appendChild(empty);
          return;
        }

        let activeEl = null;

        // Keep stable selection by storing original indexes.
        let items = verbs.map((v, idx) => ({ v, idx }));
        if (sortMode !== "added"){
          items.sort((a, b) => {
            const la = normStr(verbLabel(a.v));
            const lb = normStr(verbLabel(b.v));
            const cmp = la.localeCompare(lb, "de");
            return (sortMode === "za") ? -cmp : cmp;
          });
        }

        items.forEach(({ v, idx }, pos) => {
          const row = document.createElement("button");
          row.type = "button";

          row.dataset.idx = String(idx);
          row.dataset.idx = String(idx);

          row.className = "lcListRow"; // если класса нет — не страшно
          row.textContent = verbLabel(v);

          // fallback inline style
          row.style.textAlign = "left";
          row.style.padding = "10px 12px";
          row.style.borderRadius = "12px";
          row.style.border = "1px solid rgba(255,255,255,0.10)";
          row.style.background = (idx === sel) ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.06)";
          row.style.color = "rgba(255,255,255,0.90)";
          row.style.cursor = "pointer";

          row.onmouseenter = () => {
            if (idx !== sel) row.style.background = "rgba(255,255,255,0.10)";
          };
          row.onmouseleave = () => {
            row.style.background = (idx === sel) ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.06)";
          };

          row.onclick = () => {
            // Клик по глаголу = показываем ИСТОЧНИК (source) и не затираем созданные карточки.
            if (ctx.cards?.switchToSource){
              ctx.cards.switchToSource(idx);
            } else {
              // fallback
              ctx.setState({ selectedIndex: idx }, { debounceMs: 50 });
            }
			try { window.LC_PRESETS?.onVerbChanged?.(); } catch (e) { ctx.log?.warn?.("LC_PRESETS onVerbChanged failed", { err: String(e) }); }

            ctx.ui?.setStatus?.(`Выбран глагол: ${pos + 1}/${verbs.length}`);

            // ВАЖНО: перерисовать карточку, чтобы bind-поля обновились
            requestCardRender();

            // Обновим подсветку в списке
            render();
          };

          list.appendChild(row);

          if (idx === sel) activeEl = row;
        });

        // Keep active item visible (arrow navigation should not "lose" the selection)
        // Keep active item visible
        try { activeEl?.scrollIntoView?.({ block: (ctx.ui?.__scrollAlignStart ? "start" : "nearest") }); } catch (e) { ctx.log?.warn?.("scrollIntoView failed", { err: String(e) }); }
        // reset one-shot align flag
        try { if (ctx.ui) ctx.ui.__scrollAlignStart = false; } catch (e) { ctx.log?.warn?.("scrollAlignStart reset failed", { err: String(e) }); }
      }

      // Expose a lightweight hook so other UI parts (e.g., top arrows)
      // can refresh the active highlight when selection changes without
      // relying on brittle setState-wrapping order.
      ctx.ui = ctx.ui || {};
      ctx.ui.refreshVerbsList = () => {
        try { render(); } catch (e) { ctx.log?.warn?.("verbsList.render failed", { err: String(e) }); }
        try { syncActionStates(); } catch (e) { ctx.log?.warn?.("syncActionStates failed", { err: String(e) }); }
      };

      ctx.ui.scrollVerbsToIndex = (verbIndex, opts = {}) => {
        const i = Number(verbIndex);
        if (!Number.isFinite(i)) return false;
        const el = list.querySelector(`button[data-idx="${i}"]`);
        if (!el) return false;
        try {
          // one-shot align flag used inside render() for selected item
          if (opts.align === 'start'){ ctx.ui.__scrollAlignStart = true; }
          el.scrollIntoView({ block: (opts.align === 'start') ? 'start' : 'nearest' });
        } catch (e) { ctx.log?.warn?.("scrollVerbsToIndex failed", { err: String(e) }); }
        return true;
      };

// первичный рендер
      render();

      // enable/disable buttons based on verbs count
      function syncActionStates(){
        const n = getVerbs(ctx).length;
        const has = n > 0;
        btnClear.disabled = !has;
        btnPdfCur.disabled = !has;
        btnPdfAll.disabled = !has;
        btnSort.disabled = n < 2;
        try { updateSortBtn(); } catch (e) { ctx.log?.warn?.("updateSortBtn failed", { err: String(e) }); }
      }
      syncActionStates();

      // чтобы список обновлялся после загрузки JSON
      // (у тебя нет subscribe(), поэтому делаем перехват setState — но аккуратно, один раз)
      if (!ctx.__verbsListPanelPatchedSetState){
        ctx.__verbsListPanelPatchedSetState = true;

        const origSetState = ctx.setState.bind(ctx);
        ctx.setState = (patch, opts) => {
          origSetState(patch, opts);

          // если менялись data/selectedIndex/sortMode — перерисуем список
          if (patch && (patch.data || patch.selectedIndex !== undefined || patch.verbsSortMode !== undefined || patch.searchQuery !== undefined)){
            render();
            syncActionStates();
            try { updateSortBtn(); } catch (e) { ctx.log?.warn?.("updateSortBtn failed", { err: String(e) }); }
          }
        };
      }

      log?.info?.("verbsListPanel installed");
    }
  };
}
