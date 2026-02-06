Hotfix: AI Control Panel loader (no ES modules)

1) Unzip into project root.
2) Run:
   powershell -ExecutionPolicy Bypass -File .\hotfix_ai_panel_no_modules.ps1
3) Hard-reload page (Ctrl+F5) and click 🧠 AI Control Panel.

This hotfix replaces the previous dynamic import() loader with script-tag injection and replaces ai/ai.entry.js with a classic script (no import/export).
