// js/ui/features/verbsLoadButton.js
import { loadVerbsFromFile } from "../../data/verbsLoad.js";
import { scanVerbDataset } from "../../data/jsonScan.js";
import { bindText, bindTip } from "../i18n.js";

export function featureVerbsLoadButton(){
  return {
    id: "verbsLoadButton",
    install(ctx){
      const { ui, i18n, log } = ctx;

      // 0) защита: без ui-сервиса нет смысла продолжать
      if (!ui || typeof ui.addTopButton !== "function"){
        log?.warn?.("verbsLoadButton: ui.addTopButton not available");
        return;
      }

      // 1) невидимый input[type=file]
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      document.body.appendChild(input);

      async function doLoad(file){
        if (!file) return;

        // This button is meant for verb datasets, but users sometimes feed it a cards-only export.
        // We auto-detect and route to the right list import instead of erroring.
        let raw = null;
        try { raw = JSON.parse(await file.text()); }
        catch (e){
          ui.setStatus?.("Ошибка JSON: " + (e?.message || String(e)));
          return;
        }

        const verbs = Array.isArray(raw?.verbs) ? raw.verbs : (Array.isArray(raw?.data?.verbs) ? raw.data.verbs : null);
        if (verbs && verbs.length){
          const scan = scanVerbDataset(verbs);
          ctx.setState({
            data: { verbs },
            selectedIndex: 0,
            bindMode: scan.mode,
            bindScan: scan,
          });
          log.info("verbs loaded", { count: verbs.length });
          const modeLine = scan.mode === "auto" ? "AUTO (path)" : "CANON";
          ui.setStatus?.(
            (i18n.t("ui.status.verbsLoaded") || `Список глаголов загружен: ${verbs.length}`)
            + ` · bind: ${modeLine}`
          );
          updateButtonLabel();
          return;
        }

        const cards = Array.isArray(raw?.cards) ? raw.cards : (Array.isArray(raw?.data?.cards) ? raw.data.cards : null);
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

          ui.setStatus?.(`Файл содержит карточки (verbs[] нет). Импортировано в ЧЕРНОВИК (правый список): ${normCards.length}`);
          updateButtonLabel();
          return;
        }

        // Fallback: keep old loader errors (includes more hints)
        const res = await loadVerbsFromFile(file);
        log.error("verbs.load failed", { error: res?.error || "Unknown" });
        ui.setStatus?.(res?.error || "Файл не содержит verbs[] или cards[]");
      }

      input.addEventListener("change", async () => {
        try {
          const f = input.files && input.files[0];
          await doLoad(f);
        } finally {
          // чтобы можно было выбрать тот же файл повторно
          input.value = "";
        }
      });

      // 2) кнопка в top bar
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "btnReloadVerbs";
      btn.dataset.group = "verbs";

      // Подхватываем стиль у любой существующей top-кнопки (самый надёжный способ)
      const sample = ctx.shell?.topActions?.querySelector?.("button");
      if (sample){
        btn.className = sample.className;
        // ВАЖНО: не копируем display/visibility, чтобы кнопку случайно не спрятать
        // Копируем только безопасные inline-стили (если они есть)
        const css = sample.getAttribute("style") || "";
        const safe = css
          .split(";")
          .map(s => s.trim())
          .filter(s => s && !/^display\s*:|^visibility\s*:|^opacity\s*:|^pointer-events\s*:/i.test(s))
          .join("; ");
        if (safe) btn.setAttribute("style", safe);
      } else {
        // fallback, если вдруг ни одной кнопки нет
        btn.className = "lc-btn";
      }

      function updateButtonLabel(){
        const hasVerbs = (ctx.state?.data?.verbs?.length || 0) > 0;
        if (hasVerbs){
          bindText(btn, "toolbar.reloadVerbs");
          btn.textContent = i18n.t("toolbar.reloadVerbs");
        } else {
          bindText(btn, "toolbar.loadVerbs");
          btn.textContent = i18n.t("toolbar.loadVerbs");
        }
      }

      updateButtonLabel();

      btn.onclick = () => {
        ui.setStatus?.(i18n.t("ui.status.chooseJson") || "Выберите JSON файл…");
        input.click();
      };

      // ✅ ВОТ ЭТОГО НЕ ХВАТАЛО: добавляем кнопку в top bar
      ui.addTopButton(btn);

      // 3) diag-ручка (полезно)
      if (window.LC_DIAG){
        window.LC_DIAG.pickVerbsFile = () => input.click();
      }
    }
  };
}