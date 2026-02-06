import { bindText, bindTip } from "../i18n.js";
import { installRulersOverlay, uninstallRulersOverlay, updateRulersOverlay, setRulersOverlayOpts } from "../../render/rulersOverlay.js";

export function featureRulersGrid(){
  return {
    id: "rulersGrid",
    install(ctx){
      const { i18n, log, state, setState, ui } = ctx;

      const btnToggle = document.createElement("button");
      btnToggle.id = "btnRulers";
      btnToggle.dataset.group = "view";
      btnToggle.className = "lc-btn";
      btnToggle.type = "button";
      btnToggle.textContent = i18n.t("ui.btn.rulersToggle");
      bindText(btnToggle, "ui.btn.rulersToggle");
      btnToggle.setAttribute("aria-pressed", "false");
      btnToggle.setAttribute("data-tip", i18n.t("ui.tip.rulersToggle"));
      bindTip(btnToggle, "ui.tip.rulersToggle");

      const btnStep = document.createElement("button");
      btnStep.id = "btnGridStep";
      btnStep.dataset.group = "view";
      btnStep.className = "lc-btn";
      btnStep.type = "button";
      bindText(btnStep, "ui.btn.gridStep", { mm: state.gridStepMm });
      btnStep.setAttribute("data-tip", i18n.t("ui.tip.gridStep"));
      bindTip(btnStep, "ui.tip.gridStep");
	  
      const btnSnap = document.createElement("button");
      btnSnap.id = "btnSnap";
      btnSnap.dataset.group = "view";
      btnSnap.className = "lc-btn";
      btnSnap.type = "button";
      btnSnap.textContent = i18n.t("ui.btn.snapToggle");
      bindText(btnSnap, "ui.btn.snapToggle");
      btnSnap.setAttribute("aria-pressed", "false");
      btnSnap.setAttribute("data-tip", i18n.t("ui.tip.snapToggle"));
      bindTip(btnSnap, "ui.tip.snapToggle");


      function stepLabel(){
        return i18n.t("ui.btn.gridStep", { mm: state.gridStepMm });
      }

      function sync(){
        btnToggle.setAttribute("aria-pressed", state.rulersOn ? "true" : "false");
        bindText(btnStep, "ui.btn.gridStep", { mm: state.gridStepMm });
        btnStep.textContent = stepLabel();
		btnSnap.setAttribute("aria-pressed", state.snapOn ? "true" : "false");
		
        ui.setRulersStatus(!!state.rulersOn);
		ui.setSnapStatus(!!state.snapOn);
        
        // статус snap — чтобы было видно, что он вообще работает
        if (state.rulersOn){
          setRulersOverlayOpts({ stepMm: state.gridStepMm, snapOn: state.snapOn });
          updateRulersOverlay();
        }


        // если включено — обновляем overlay и опции
        if (state.rulersOn){
          setRulersOverlayOpts({ stepMm: state.gridStepMm });
          updateRulersOverlay();
        }
      }

      btnToggle.addEventListener("click", () => {
        const next = !state.rulersOn;
        setState({ rulersOn: next });
        log.info("rulersGrid toggled", { rulersOn: next });

        if (next) installRulersOverlay(ctx);
        else uninstallRulersOverlay();

        sync();
      });

     btnStep.addEventListener("click", () => {
  // цикл: 2.5 -> 5 -> 10 -> 2.5
  const steps = [2.5, 5, 10];
  const cur = Number(state.gridStepMm);

  let idx = steps.indexOf(cur);
  if (idx < 0) idx = 1; // если почему-то значение странное — считаем, что было 5

  const next = steps[(idx + 1) % steps.length];

  setState({ gridStepMm: next });
  log.info("gridStep changed", { stepMm: next });

  // никаких reinstall — только обновление опций + перерисовка
  setRulersOverlayOpts({ stepMm: next });
  if (state.rulersOn) updateRulersOverlay();

  sync();
});

	  
      btnSnap.addEventListener("click", () => {
        const next = !state.snapOn;
        setState({ snapOn: next });
        log.info("snap toggled", { snapOn: next });

        setRulersOverlayOpts({ snapOn: next });
        if (state.rulersOn) updateRulersOverlay();

        sync();
      });
      // Place view controls near language switches (right side), as requested.
      const host = ctx.shell?.viewHost;
      if (host){
        host.appendChild(btnToggle);
        host.appendChild(btnStep);
        host.appendChild(btnSnap);
      } else {
        ui.addTopButton(btnToggle);
        ui.addTopButton(btnStep);
        ui.addTopButton(btnSnap);
      }
      // если вдруг включено при старте
      if (state.rulersOn) installRulersOverlay(ctx);
      sync();
    },
  };
}
