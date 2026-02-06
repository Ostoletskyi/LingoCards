# AI Control Panel Patch (LingoCard)

What this adds:
- New folder `ai/` with an isolated AI Control Panel (modal overlay).
- One minimal patch in `js/ui/uiShell.js` to add a top-bar button "🧠 AI Control Panel" that lazy-loads `ai/ai.entry.js`.

Cache TTL:
- Panel state is cached in `localStorage` for 10 minutes (`cacheTtlMs = 600000`), then auto-invalidated.

How to apply:
1) Unzip into your project root.
2) Run PowerShell:
   `powershell -ExecutionPolicy Bypass -File .\install_ai_panel.ps1`
3) Start your local server and click the new button.

LM Studio:
- Start LM Studio Server with OpenAI-compatible API at `http://localhost:1234/v1`
- Then press "Test Connection" inside the panel.
