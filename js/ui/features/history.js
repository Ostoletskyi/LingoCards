// js/ui/features/history.js

import { isEditingText } from "../../editor/textEdit.js";
import { bindText, bindTip } from "../i18n.js";

function fmtTime(ts){
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return "";
  }
}

export function featureHistory(){
  return {
    id: "history",
    install(ctx){
      const btn = document.createElement("button");
      // same style as other top buttons
      btn.className = "lc-btn";
      btn.id = "btnHistory";
      btn.dataset.group = "cards";
      btn.textContent = ctx.i18n.t("ui.btn.history");
      bindText(btn, "ui.btn.history");
      btn.setAttribute("data-tip", ctx.i18n.t("ui.tip.history"));
      bindTip(btn, "ui.tip.history");

      let panel = null;
      let listEl = null;
      let open = false;

      function buildPanel(){
        panel = document.createElement("div");
        panel.id = "lcHistoryPanel";
        // styling via CSS (#lcHistoryPanel)
        panel.style.position = "fixed";
        panel.style.top = "56px";
        panel.style.right = "12px";
        panel.style.zIndex = "9999";

        const head = document.createElement("div");
        head.style.display = "flex";
        head.style.alignItems = "center";
        head.style.justifyContent = "space-between";
        head.style.gap = "10px";

        const title = document.createElement("div");
        title.textContent = ctx.i18n.t("ui.panel.historyTitle");
        bindText(title, "ui.panel.historyTitle");
        title.style.fontSize = "14px";
        title.style.opacity = "0.9";

        const controls = document.createElement("div");
        controls.style.display = "flex";
        controls.style.gap = "8px";

        const bUndo = document.createElement("button");
        bUndo.textContent = ctx.i18n.t("ui.btn.undo");
        bindText(bUndo, "ui.btn.undo");
        bUndo.className = "lc-btn lc-btn-sm";
        bUndo.setAttribute("data-tip", ctx.i18n.t("ui.tip.undo"));
        bindTip(bUndo, "ui.tip.undo");
        bUndo.onclick = () => {
          if (ctx.history.undo()) ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.undone"));
          update();
        };

        const bRedo = document.createElement("button");
        bRedo.textContent = ctx.i18n.t("ui.btn.redo");
        bindText(bRedo, "ui.btn.redo");
        bRedo.className = "lc-btn lc-btn-sm";
        bRedo.setAttribute("data-tip", ctx.i18n.t("ui.tip.redo"));
        bindTip(bRedo, "ui.tip.redo");
        bRedo.onclick = () => {
          if (ctx.history.redo()) ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.redone"));
          update();
        };

        const bClose = document.createElement("button");
        bClose.textContent = "✕";
        bClose.className = "lc-btn lc-btn-sm";
        bClose.setAttribute("data-tip", ctx.i18n.t("ui.tip.close"));
        bindTip(bClose, "ui.tip.close");
        bClose.onclick = () => toggle(false);

        controls.appendChild(bUndo);
        controls.appendChild(bRedo);
        controls.appendChild(bClose);

        head.appendChild(title);
        head.appendChild(controls);

        const hint = document.createElement("div");
        hint.textContent = ctx.i18n.t("ui.panel.historyHint");
        bindText(hint, "ui.panel.historyHint");
        hint.style.fontSize = "12px";
        hint.style.opacity = "0.65";
        hint.style.margin = "8px 0 10px";

        listEl = document.createElement("div");

        panel.appendChild(head);
        panel.appendChild(hint);
        panel.appendChild(listEl);

        document.body.appendChild(panel);
      }

      function update(){
        if (!panel || !listEl) return;
        listEl.innerHTML = "";

        const items = ctx.history.getItems(); // oldest -> newest
        if (!items.length){
          const empty = document.createElement("div");
          empty.textContent = ctx.i18n.t("ui.panel.historyEmpty");
          bindText(empty, "ui.panel.historyEmpty");
          bindText(empty, "ui.panel.historyEmpty");
          bindText(empty, "ui.panel.historyEmpty");
          empty.style.opacity = "0.7";
          empty.style.fontSize = "13px";
          listEl.appendChild(empty);
          return;
        }

        // показываем newest -> oldest
        for (let i = items.length - 1; i >= 0; i--){
          const it = items[i];
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.gap = "10px";
          row.style.padding = "8px 10px";
          row.style.marginBottom = "6px";
          row.style.border = "1px solid rgba(255,255,255,0.10)";
          row.style.borderRadius = "12px";
          row.style.cursor = "pointer";
          row.onmouseenter = () => { row.style.borderColor = "rgba(239,68,68,0.55)"; };
          row.onmouseleave = () => { row.style.borderColor = "rgba(255,255,255,0.10)"; };

          const left = document.createElement("div");
          left.textContent = it.label || "change";
          left.style.fontSize = "13px";
          left.style.opacity = "0.95";

          const right = document.createElement("div");
          right.textContent = fmtTime(it.ts);
          right.style.fontSize = "12px";
          right.style.opacity = "0.6";

          row.appendChild(left);
          row.appendChild(right);

          row.onclick = () => {
            // i is index in oldest->newest
            if (ctx.history.jumpTo(i)){
              ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.jumped"));
              update();
            }
          };

          listEl.appendChild(row);
        }
      }

      function toggle(force){
        open = (force !== undefined) ? !!force : !open;
        btn.classList.toggle("on", open);

        if (open){
          if (!panel) buildPanel();
          panel.style.display = "block";
          update();
        } else {
          if (panel) panel.style.display = "none";
        }
      }

      btn.onclick = () => toggle();
      ctx.ui.addTopButton(btn);

      // Hotkeys: Ctrl+Z / Ctrl+Y (+ Ctrl+Shift+Z)
      window.addEventListener("keydown", (e) => {
        const key = String(e.key || "").toLowerCase();
        const ctrl = e.ctrlKey || e.metaKey;
        if (!ctrl) return;
        if (isEditingText()) return; // внутри textarea пусть работает нативный undo

        if (key === "z" && !e.shiftKey){
          e.preventDefault();
          if (ctx.history.undo()) ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.undone"));
          update();
        } else if (key === "y" || (key === "z" && e.shiftKey)){
          e.preventDefault();
          if (ctx.history.redo()) ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.redone"));
          update();
        }
      }, { passive: false });

      // expose into diag
      window.LC_DIAG = window.LC_DIAG || {};
      window.LC_DIAG.history = () => ({
        limit: ctx.history.limit,
        past: ctx.history.past.length,
        future: ctx.history.future.length,
      });
    }
  };
}
