// ai/ui/view.js
import { statusPill, actionsTemplate } from "./templates.js";

export function renderPanel(host, state){
  if (!host) return;

  const statusRow = host.querySelector("#aiStatusRow");
  const actions = host.querySelector("#aiActions");
  const modelsBox = host.querySelector("#aiModels");
  const logBox = host.querySelector("#aiLog");
  const ep = host.querySelector("#aiEndpoint");
  const ctx = host.querySelector("#aiContext");

  if (statusRow) statusRow.innerHTML = statusPill(state.status);
  if (actions && !actions.__aiRendered){
    actions.__aiRendered = true;
    actions.innerHTML = actionsTemplate();
  }

  if (ep) ep.textContent = state.endpoint || "";
  if (ctx) ctx.textContent = state.context || "auto";

  if (modelsBox){
    if (state.models && state.models.length){
      modelsBox.textContent = state.models.map(m => `вЂў ${m}`).join("\n");
    }else{
      modelsBox.textContent = "вЂ”";
    }
  }

  if (logBox){
    const lines = (state.log && state.log.length) ? state.log : ["вЂ”"];
    logBox.textContent = lines.join("\n");
    // keep scroll to bottom
    logBox.scrollTop = logBox.scrollHeight;
  }

  // close button title
  const closeBtn = host.querySelector("#aiCloseBtn");
  if (closeBtn) closeBtn.title = "Close (Esc)";
}