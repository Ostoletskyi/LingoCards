// js/ui/features/helpGuide.js

export function featureHelpGuide(){
  return {
    id: "helpGuide",
    install(ctx){
      const btn = document.getElementById("lcHelpBtn");
      if (!btn) return;

      // Tooltip text comes from i18n; uiShell sets the title.
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        // Open as a separate page (fast, reliable, no extra modal logic).
        window.open("help/index.html", "_blank", "noopener,noreferrer");
        ctx.ui?.setStatus?.(ctx.i18n.t("ui.status.helpOpened"));
      });
    }
  };
}
