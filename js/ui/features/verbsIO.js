// js/ui/features/verbsIO.js
// Load/Save/Clear verbs list (JSON) + simple verbs list in left panel.

import { renderCard } from "../../render/renderCard.js";
import { normalizeVerbDataset } from "../../data/normalizeVerbEntry.js";

function makeBtn(id, label){
  const b = document.createElement("button");
  b.id = id;
  b.type = "button";
  b.textContent = label;
  b.style.padding = "8px 12px";
  b.style.borderRadius = "12px";
  b.style.border = "1px solid rgba(255,255,255,0.22)";
  b.style.background = "rgba(10,20,30,0.20)";
  b.style.color = "#fff";
  b.style.cursor = "pointer";
  b.style.backdropFilter = "blur(6px)";
  return b;
}

function downloadJson(obj, fileName){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "verbs.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeVerbsData(obj){
  // Backward-compatible wrapper.
  // Old code expected either an array or {verbs:[...]};
  // New normalizer additionally supports {answers:{...}} and other shapes.
  return normalizeVerbDataset(obj);
}

function ensureTemplateBoxes(state){
  const boxes = Array.isArray(state.boxes) ? state.boxes : [];
  const has = (bind) => boxes.some(b => b.bind === bind);

  // минимальный шаблон: 3 поля (inf / tr / forms)
  const next = [...boxes];

  if (!has("inf"))  next.push({ id: "v_inf",   xMm: 10, yMm: 10, wMm: 120, hMm: 18, fontPt: 26, text: "", label: "Infinitiv", bind: "inf" });
  if (!has("tr"))   next.push({ id: "v_tr",    xMm: 10, yMm: 30, wMm: 120, hMm: 14, fontPt: 12, text: "", label: "Übersetzung", bind: "tr" });
  if (!has("forms"))next.push({ id: "v_forms", xMm: 10, yMm: 46, wMm: 120, hMm: 16, fontPt: 14, text: "", label: "Formen", bind: "forms" });

  return next;
}

function verbTitle(v){
  const inf = v?.inf ?? v?.Inf ?? v?.lemma ?? "—";
  // After normalization meanings is usually Array<{ru,ctx}>.
  const tr = Array.isArray(v?.meanings)
    ? v.meanings.map(m => (typeof m === "string" ? m : (m?.ru ?? "")).trim()).filter(Boolean).join(", ")
    : (v?.tr ?? "");
  return `${inf}${tr ? " — " + tr : ""}`;
}

export function featureVerbsIO(){
  return {
    id: "verbsIO",
    install(ctx){
      const { state, setState, ui, i18n } = ctx;

      // --- buttons (top bar) ---
      const btnLoad = makeBtn("btnLoadVerbs", i18n.t?.("toolbar.loadVerbs") ?? "Загрузить список глаголов");
      const btnSave = makeBtn("btnSaveVerbs", i18n.t?.("toolbar.saveVerbs") ?? "Сохранить список глаголов");
      const btnClear = makeBtn("btnClearVerbs", i18n.t?.("toolbar.clearVerbs") ?? "Очистить список");

      ui.addTopButton(btnLoad);
      ui.addTopButton(btnSave);
      ui.addTopButton(btnClear);

      function syncButtons(){
        const n = (state.verbs || []).length;
        btnSave.disabled = n === 0;
        btnSave.style.opacity = n === 0 ? "0.5" : "1";
        btnClear.style.display = n === 0 ? "none" : "inline-block";
      }

      async function loadFromDisk(){
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          const r = new FileReader();
          r.onload = () => {
            try {
              const obj = JSON.parse(String(r.result || ""));
              const verbs = normalizeVerbsData(obj);
              if (!verbs) throw new Error("Неверный формат JSON (ожидаю массив или {verbs:[...]})");

              const boxes = ensureTemplateBoxes(state);

              setState({
                verbs,
                // Keep legacy + new selection fields in sync.
                selectedVerbIndex: 0,
                selectedIndex: 0,
                boxes,
                selectedBoxId: state.selectedBoxId,
              });
              ui.setStatus(`Загружено глаголов: ${verbs.length}`);
              syncButtons();
              renderVerbsList();
              renderCard(ctx);
            } catch (e){
              ui.setStatus(`Ошибка JSON: ${e?.message || e}`);
            }
          };
          r.readAsText(file, "utf-8");
        };
        input.click();
      }

      function saveToDisk(){
        const verbs = Array.isArray(state.verbs) ? state.verbs : [];
        const payload = { version: 1, verbs };
        const ts = new Date();
        const stamp = ts.toISOString().slice(0,19).replace(/[:T]/g, "-");
        downloadJson(payload, `lingocard_verbs_${stamp}.json`);
        ui.setStatus(`Сохранено глаголов: ${verbs.length}`);
      }

      function clearList(){
        // Keep legacy + new selection fields in sync.
        setState({ verbs: [], selectedVerbIndex: 0, selectedIndex: 0 });
        syncButtons();
        renderVerbsList();
        renderCard(ctx);
        ui.setStatus("Список очищен");
      }

      btnLoad.onclick = () => loadFromDisk();
      btnSave.onclick = () => saveToDisk();
      btnClear.onclick = () => clearList();

      // --- left panel list ---
      let listHost = null;
      function ensureListHost(){
        if (listHost) return listHost;
        listHost = document.createElement("div");
        listHost.id = "lcVerbsList";
        listHost.style.maxHeight = "calc(100vh - 220px)";
        listHost.style.overflow = "auto";
        listHost.style.border = "1px solid rgba(255,255,255,0.10)";
        listHost.style.borderRadius = "12px";
        listHost.style.padding = "8px";
        listHost.style.background = "rgba(0,0,0,0.18)";
        ctx.shell.leftBody.appendChild(listHost);
        return listHost;
      }

      function renderVerbsList(){
        const host = ensureListHost();
        const verbs = Array.isArray(state.verbs) ? state.verbs : [];
        if (verbs.length === 0){
          host.innerHTML = `<div style="opacity:0.7">Глаголы не загружены</div>`;
          return;
        }
        const sel = Number.isFinite(state.selectedVerbIndex) ? state.selectedVerbIndex : 0;
        host.innerHTML = "";
        verbs.forEach((v, idx) => {
          const row = document.createElement("div");
          row.textContent = verbTitle(v);
          row.style.padding = "6px 8px";
          row.style.borderRadius = "10px";
          row.style.cursor = "pointer";
          row.style.whiteSpace = "nowrap";
          row.style.overflow = "hidden";
          row.style.textOverflow = "ellipsis";
          row.style.color = idx === sel ? "#fff" : "rgba(255,255,255,0.82)";
          row.style.background = idx === sel ? "rgba(56,189,248,0.30)" : "transparent";
          row.onclick = () => {
            // IMPORTANT: preview renderer uses `selectedIndex`.
            // `selectedVerbIndex` is kept for UI list highlight, but both must match.
            setState({ selectedVerbIndex: idx, selectedIndex: idx });
            renderVerbsList();
            renderCard(ctx);
          };
          host.appendChild(row);
        });
      }

      // initial
      syncButtons();
      renderVerbsList();
    }
  };
}
