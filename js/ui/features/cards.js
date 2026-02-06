// js/ui/features/cards.js

import { bindText, bindTip } from "../i18n.js";

export function featureCards(){
  return {
    id: "cards",
    install(ctx){
      // New card
      const bNew = document.createElement("button");
      bNew.className = "lc-btn lc-btn-success";
      bNew.id = "btnNewCard";
      bNew.dataset.group = "cards";
      bNew.textContent = ctx.i18n.t("ui.btn.newCard");
      bindText(bNew, "ui.btn.newCard");
      bNew.setAttribute("data-tip", ctx.i18n.t("ui.tip.newCard"));
      bindTip(bNew, "ui.tip.newCard");
      bNew.onclick = (ev) => {
        // Default: create a blank card (Shift-click clones current)
        ctx.cards?.addNew?.({ cloneCurrent: !!(ev && ev.shiftKey) });
        const i = (ctx.cards?.getIndex?.() || 0) + 1;
        const n = ctx.cards?.getCount?.() || 1;
        ctx.ui?.setCardBadge?.(ctx.i18n.t("ui.status.card", { i, n }));
      };

      // Prev / Next (small)
      const bPrev = document.createElement("button");
      bPrev.className = "lc-btn lc-btn-sm";
      bPrev.id = "btnPrevCard";
      bPrev.dataset.group = "cards";
      bPrev.textContent = "◀";
      bPrev.setAttribute("data-tip", ctx.i18n.t("ui.tip.prevCard"));
      bindTip(bPrev, "ui.tip.prevCard");
      bPrev.onclick = () => {
        const mode = ctx.state?.viewMode || "cards";
        if (mode === "source"){
          const cur = Number.isFinite(ctx.state?.selectedIndex) ? ctx.state.selectedIndex : 0;
          const next = Math.max(0, cur - 1);
          ctx.cards?.switchToSource?.(next);
          // Keep left list highlight in sync when navigating via arrows
          ctx.ui?.refreshVerbsList?.();
          return;
        }

        const cur = ctx.cards?.getIndex?.() || 0;
        ctx.cards?.switchTo?.(cur - 1);
        ctx.ui?.refreshCardsList?.();
        const i = (ctx.cards?.getIndex?.() || 0) + 1;
        const n = ctx.cards?.getCount?.() || 1;
        ctx.ui?.setCardBadge?.(ctx.i18n.t("ui.status.card", { i, n }));
      };

      const bNext = document.createElement("button");
      bNext.className = "lc-btn lc-btn-sm";
      bNext.id = "btnNextCard";
      bNext.dataset.group = "cards";
      bNext.textContent = "▶";
      bNext.setAttribute("data-tip", ctx.i18n.t("ui.tip.nextCard"));
      bindTip(bNext, "ui.tip.nextCard");
      bNext.onclick = () => {
        const mode = ctx.state?.viewMode || "cards";
        if (mode === "source"){
          const nVerbs = ctx.state?.data?.verbs?.length || 0;
          const cur = Number.isFinite(ctx.state?.selectedIndex) ? ctx.state.selectedIndex : 0;
          const next = Math.min(Math.max(0, nVerbs - 1), cur + 1);
          ctx.cards?.switchToSource?.(next);
          ctx.ui?.refreshVerbsList?.();
          return;
        }

        const cur = ctx.cards?.getIndex?.() || 0;
        ctx.cards?.switchTo?.(cur + 1);
        ctx.ui?.refreshCardsList?.();
        const i = (ctx.cards?.getIndex?.() || 0) + 1;
        const n = ctx.cards?.getCount?.() || 1;
        ctx.ui?.setCardBadge?.(ctx.i18n.t("ui.status.card", { i, n }));
      };

      ctx.ui?.addTopButton?.(bNew);
      ctx.ui?.addTopButton?.(bPrev);
      ctx.ui?.addTopButton?.(bNext);

      // initial status hint
      const i = (ctx.cards?.getIndex?.() || 0) + 1;
      const n = ctx.cards?.getCount?.() || 1;
      ctx.ui?.setCardBadge?.(ctx.i18n.t("ui.status.card", { i, n }));
    },
  };
}
