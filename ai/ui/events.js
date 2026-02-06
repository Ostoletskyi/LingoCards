// ai/ui/events.js
// Binds UI events. Designed to be safe to call multiple times.

export function bindPanelEvents(host, api){
  if (!host || host.__aiEventsBound) return;
  host.__aiEventsBound = true;

  const byId = (id) => host.querySelector(id);

  const closeBtn = byId("#aiCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", () => api.close());

  // Action buttons
  const map = [
    ["#aiBtnCheck", api.checkLMStudio],
    ["#aiBtnInstall", api.installLMStudio],
    ["#aiBtnDownloadModel", api.downloadModel],
    ["#aiBtnStartServer", api.startServer],
    ["#aiBtnTest", api.testConnection],
    ["#aiBtnRefreshModels", api.refreshModels]
  ];

  for (const [sel, fn] of map){
    const el = byId(sel);
    if (el && typeof fn === "function"){
      el.addEventListener("click", () => fn());
    }
  }
}