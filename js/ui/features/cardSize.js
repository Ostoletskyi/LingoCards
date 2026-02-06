// js/ui/features/cardSize.js
import { renderCard } from "../../render/renderCard.js";
import { updateRulersOverlay } from "../../render/rulersOverlay.js";
import { bindText, bindTip, applyI18n } from "../i18n.js";

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function toInt(v, def){ const n = Number(v); return Number.isFinite(n) ? Math.round(n) : def; }

export function featureCardSize(){
  return {
    id: "cardSize",
    install(ctx){
      const { state, setState, i18n } = ctx;

      const btn = document.createElement("button");
      btn.id = "btnCardSize";
      btn.dataset.group = "cards";
      btn.className = "lc-btn";
      btn.textContent = i18n.t("ui.btn.cardSize");
      bindText(btn, "ui.btn.cardSize");
      btn.setAttribute("data-tip", i18n.t("ui.tip.cardSize"));
      bindTip(btn, "ui.tip.cardSize");

      const panel = document.createElement("div");
      panel.style.position = "absolute";
      panel.style.top = "42px";
      panel.style.left = "0";
      panel.style.zIndex = "100";
      panel.style.minWidth = "260px";
      panel.style.padding = "10px";
      panel.style.border = "1px solid rgba(255,255,255,0.18)";
      panel.style.borderRadius = "12px";
      panel.style.background = "rgba(15,18,24,0.95)";
      panel.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
      panel.style.display = "none";

      panel.innerHTML = `
        <div style="display:grid; gap:8px;">
          <div style="font-weight:700; opacity:0.9;" data-i18n-key="ui.panel.cardSizeTitle"></div>

          <label style="display:grid; gap:4px;">
            <span style="opacity:0.75;" data-i18n-key="ui.label.width"></span>
            <input id="lcCardWInput" type="text" inputmode="numeric"
              style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:#fff;">
          </label>

          <label style="display:grid; gap:4px;">
            <span style="opacity:0.75;" data-i18n-key="ui.label.height"></span>
            <input id="lcCardHInput" type="text" inputmode="numeric"
              style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:#fff;">
          </label>

          <div style="opacity:0.65;font-size:12px;line-height:1.25;" data-i18n-key="ui.hint.cardSizeWheel"></div>

          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:4px;">
            <button id="lcCardSizeApply" class="lc-btn" data-i18n-key="ui.btn.apply"></button>
            <button id="lcCardSizeClose" class="lc-btn" data-i18n-key="ui.btn.close"></button>
          </div>
        </div>
      `;

      // container for absolute positioning
      const wrap = document.createElement("div");
      wrap.dataset.group = "cards";
      wrap.style.position = "relative";
      wrap.appendChild(btn);
      wrap.appendChild(panel);
      // goes into grouped top bar
      ctx.ui?.addTopButton ? ctx.ui.addTopButton(wrap) : ctx.shell.topActions.appendChild(wrap);

      const wInput = panel.querySelector("#lcCardWInput");
      const hInput = panel.querySelector("#lcCardHInput");
      const bApply = panel.querySelector("#lcCardSizeApply");
      const bClose = panel.querySelector("#lcCardSizeClose");

      // initial i18n fill
      applyI18n(panel, i18n);

      function syncInputs(){
        wInput.value = String(toInt(state.cardWmm, 150));
        hInput.value = String(toInt(state.cardHmm, 105));
      }

      function applyFromInputs(){
        const w = clamp(toInt(wInput.value, toInt(state.cardWmm,150)), 50, 500);
        const h = clamp(toInt(hInput.value, toInt(state.cardHmm,105)), 50, 500);

        setState({ cardWmm: w, cardHmm: h });

        renderCard(ctx);
        updateRulersOverlay?.();

        syncInputs();
      }

      function wheelAdjust(ev, which){
        if (ev.ctrlKey) return; // keep browser zoom
        const step = ev.shiftKey ? 10 : 1;
        const dir = ev.deltaY < 0 ? +1 : -1;

        const curW = toInt(wInput.value, toInt(state.cardWmm, 150));
        const curH = toInt(hInput.value, toInt(state.cardHmm, 105));

        if (which === "w") wInput.value = String(curW + dir * step);
        if (which === "h") hInput.value = String(curH + dir * step);

        applyFromInputs();
        ev.preventDefault();
      }

      btn.onclick = () => {
        const on = panel.style.display === "none";
        panel.style.display = on ? "block" : "none";
        if (on) syncInputs();
        // when opening: refresh i18n (in case language was switched while closed)
        applyI18n(panel, i18n);
      };

      bClose.onclick = () => { panel.style.display = "none"; };
      bApply.onclick = () => applyFromInputs();

      wInput.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFromInputs(); });
      hInput.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFromInputs(); });

      wInput.addEventListener("wheel", (ev) => wheelAdjust(ev, "w"), { passive: false });
      hInput.addEventListener("wheel", (ev) => wheelAdjust(ev, "h"), { passive: false });
    }
  };
}
