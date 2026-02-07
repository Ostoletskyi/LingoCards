// js/ui/features/search.js

import { compileWildcardQuery, matchesQuery } from "../../utils/search.js";
import { bindTip } from "../i18n.js";

function verbLabel(v){
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
  return a || b || "";
}

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

export function featureSearch(){
  return {
    id: "search",
    install(ctx){
      // Button goes into the top bar groups.
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "btnSearch";
      btn.className = "lc-btn lc-btn-sm";
      btn.dataset.group = "view";
      btn.textContent = "🔎";
      btn.title = ctx.i18n.t("ui.search.title");
      // Tooltip must follow current language; bind key so applyI18n can refresh it on switch.
      bindTip(btn, "ui.search.tip");
      btn.setAttribute("data-tip", ctx.i18n.t("ui.search.tip"));

      // Simple popover panel (like author popover): one input + hints.
      let pop = document.getElementById("lcSearchPopover");
      if (!pop){
        pop = document.createElement("div");
        pop.id = "lcSearchPopover";
        pop.style.position = "fixed";
        pop.style.zIndex = "10002";
        pop.style.display = "none";
        pop.style.minWidth = "320px";
        pop.style.maxWidth = "420px";
        pop.style.border = "1px solid rgba(255,255,255,0.18)";
        pop.style.background = "rgba(10,14,26,0.92)";
        pop.style.backdropFilter = "blur(10px)";
        pop.style.borderRadius = "16px";
        pop.style.boxShadow = "0 18px 60px rgba(0,0,0,0.45)";
        pop.style.padding = "12px";
        pop.style.color = "rgba(255,255,255,0.92)";
        pop.style.fontSize = "13px";
        pop.style.lineHeight = "1.35";
        document.body.appendChild(pop);
        pop.addEventListener("click", (e) => e.stopPropagation());
        document.addEventListener("click", () => { pop.style.display = "none"; });
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape") pop.style.display = "none";
        });
      }

      function setQuery(q){
        ctx.setState({ searchQuery: String(q || "") }, { autosave: true, debounceMs: 0 });
        try { ctx.ui?.refreshCardsList?.(); } catch (e) { ctx.log?.warn?.("refreshCardsList failed", { err: String(e) }); }
        try { window.LC_PRESETS?.onVerbChanged?.(); } catch (e) { ctx.log?.warn?.("LC_PRESETS onVerbChanged failed", { err: String(e) }); }
      }

      function runSearch(q){
        const query = String(q || "").trim();
        setQuery(query);

        if (!query){
          ctx.ui?.setStatus?.(ctx.i18n.t("ui.search.cleared"));
          return;
        }

        const re = compileWildcardQuery(query);
        const verbs = Array.isArray(ctx.state?.data?.verbs) ? ctx.state.data.verbs : [];
        const cards = Array.isArray(ctx.state?.cards) ? ctx.state.cards : [];

        let hitVerb = -1;
        for (let i = 0; i < verbs.length; i++){
          if (matchesQuery(verbLabel(verbs[i]), re)) { hitVerb = i; break; }
        }

        let hitCard = -1;
        for (let i = 0; i < cards.length; i++){
          if (matchesQuery(cardSearchText(cards[i]), re)) { hitCard = i; break; }
        }

        if (hitVerb >= 0){
          // Priority: LEFT list (source)
          try {
            if (ctx.cards?.switchToSource) ctx.cards.switchToSource(hitVerb);
            else ctx.setState({ selectedIndex: hitVerb, viewMode: "source" }, { debounceMs: 0 });
          } catch (e) { ctx.log?.warn?.("switchToSource failed", { err: String(e) }); }
          try { ctx.ui?.scrollVerbsToIndex?.(hitVerb, { align: "start" }); } catch (e) { ctx.log?.warn?.("scrollVerbsToIndex failed", { err: String(e) }); }
          ctx.ui?.setStatus?.(ctx.i18n.t("ui.search.hitLeft", { label: verbLabel(verbs[hitVerb]) }));
          try { ctx.ui?.scrollVerbsToIndex?.(hitVerb, { align: 'start' }); } catch (e) { ctx.log?.warn?.("scrollVerbsToIndex failed", { err: String(e) }); }
          return;
        }

        if (hitCard >= 0){
          try {
            if (ctx.cards?.switchTo) ctx.cards.switchTo(hitCard);
            else ctx.setState({ selectedCardIndex: hitCard, viewMode: "cards" }, { debounceMs: 0 });
          } catch (e) { ctx.log?.warn?.("switchTo card failed", { err: String(e) }); }
          try { ctx.ui?.scrollCardsToIndex?.(hitCard, { align: "start" }); } catch (e) { ctx.log?.warn?.("scrollCardsToIndex failed", { err: String(e) }); }
          ctx.ui?.setStatus?.(ctx.i18n.t("ui.search.hitRight", { n: hitCard + 1 }));
          try { ctx.ui?.scrollCardsToIndex?.(hitCard, { align: 'start' }); } catch (e) { ctx.log?.warn?.("scrollCardsToIndex failed", { err: String(e) }); }
          return;
        }

        ctx.ui?.setStatus?.(ctx.i18n.t("ui.search.noHits"));
      }

      function renderPopover(){
        const current = String(ctx.state?.searchQuery || "");
        pop.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div style="font-weight:800;letter-spacing:.2px;">${ctx.i18n.t("ui.search.title")}</div>
            <button id="lcSearchClose" type="button" style="border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.9);border-radius:10px;padding:4px 8px;cursor:pointer;">×</button>
          </div>
          <div style="height:10px"></div>
          <input id="lcSearchInput" type="text" spellcheck="false" placeholder="${ctx.i18n.t("ui.search.placeholder")}" value="${current.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}" 
            style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.92);outline:none;" />
          <div style="height:8px"></div>
          <div style="opacity:.7;font-size:12px;">
            ${ctx.i18n.t("ui.search.hint")}
          </div>
          <div style="height:10px"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="lcSearchClear" type="button" class="lc-btn lc-btn-action">${ctx.i18n.t("ui.search.clear")}</button>
            <button id="lcSearchGo" type="button" class="lc-btn lc-btn-success">${ctx.i18n.t("ui.search.go")}</button>
          </div>
        `;

        const closeBtn = document.getElementById("lcSearchClose");
        const input = document.getElementById("lcSearchInput");
        const clearBtn = document.getElementById("lcSearchClear");
        const goBtn = document.getElementById("lcSearchGo");

        closeBtn?.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          pop.style.display = "none";
        });

        clearBtn?.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (input) input.value = "";
          runSearch("");
        });

        goBtn?.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          runSearch(input?.value || "");
        });

        input?.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter"){
            ev.preventDefault();
            runSearch(input.value);
          }
          if (ev.key === "Escape"){
            ev.preventDefault();
            pop.style.display = "none";
          }
        });

        // Focus after mount
        setTimeout(() => { try { input?.focus?.(); input?.select?.(); } catch (e) { ctx.log?.warn?.("search input focus failed", { err: String(e) }); } }, 0);
      }

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        renderPopover();
        const r = btn.getBoundingClientRect();
        pop.style.left = Math.max(10, Math.min(window.innerWidth - 440, r.left)) + "px";
        pop.style.top = Math.min(window.innerHeight - 20, r.bottom + 10) + "px";
        pop.style.display = (pop.style.display === "none") ? "block" : "none";
      });

      ctx.ui?.addTopButton?.(btn);
    },
  };
}
