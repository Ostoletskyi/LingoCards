// ai/ui/templates.js
export function statusPill(status){
  const level = status?.level || "unknown";
  const text = status?.text || "\uD83E\uDDE0";
  const dotClass = {
    connected: "ai-dot ai-dot-green",
    not_running: "ai-dot ai-dot-yellow",
    not_installed: "ai-dot ai-dot-red",
    pending: "ai-dot ai-dot-gray",
    unknown: "ai-dot ai-dot-gray"
  }[level] || "ai-dot ai-dot-gray";

  // Dot color is set inline to keep CSS minimal and self-contained.
  const dotColor = {
    connected: "rgba(110, 255, 160, 0.85)",
    not_running: "rgba(255, 220, 120, 0.9)",
    not_installed: "rgba(255, 120, 120, 0.9)",
    pending: "rgba(180, 190, 255, 0.85)",
    unknown: "rgba(255,255,255,0.35)"
  }[level] || "rgba(255,255,255,0.35)";

  return `
    <div class="ai-pill" title="${text}">
      <span class="${dotClass}" style="background:${dotColor}"></span>
      <span>${text}</span>
    </div>
  `;
}

export function actionsTemplate(){
  return `
    <button class="ai-btn" id="aiBtnCheck" type="button">Check LM Studio</button>
    <button class="ai-btn" id="aiBtnInstall" type="button">Install LM Studio</button>
    <button class="ai-btn" id="aiBtnDownloadModel" type="button">Download Model</button>
    <button class="ai-btn" id="aiBtnStartServer" type="button">Start AI Server</button>
    <button class="ai-btn ai-btn-primary" id="aiBtnTest" type="button">Test Connection</button>
    <button class="ai-btn" id="aiBtnRefreshModels" type="button">Refresh Models</button>
  `;
}