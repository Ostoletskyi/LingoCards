LingoCard (next) вЂ” modular skeleton

Run:
  cd "C:\Labor\Projekt\_fresh\lingocard-next-20260101-225516"
  python -m http.server 8000
  open http://localhost:8000/index.html?debug=1

Console:
  LC.getState()
  LC_DIAG

Strict manual smoke test (do after each change):
  1) Load verbs JSON (top button "Загрузить список глаголов")
  2) Switch verb in list (left panel)
  3) Toggle rulers/grid
  4) Toggle Edit mode
  5) Create new block and type a note
  6) Switch verb => block stays, note text is different (notesByVerb)
  7) Toggle text mode on selected block: "Текст: уникальный" ↔ "Текст: общий"
     - In "общий" mode the same text should be shown for all verbs
     - Back to "уникальный" mode: current verb should keep its own text
  8) Reload page => notes/modes are persisted (autosave)
  9) Export PDF current + PDF all
 10) Undo/Redo
 11) Reset
 12) Delete selected block (Delete key or "Удалить блок")
 13) Open Admin (⚙) and run smoke test
 14) Open Presets (🧩) and switch preset