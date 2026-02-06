# LingoCard patch: ESM boot + fallback

## Что добавлено
- `js/app/app.legacy.js` — запасной entry (не даёт белый экран, показывает сообщение и просит первую ошибку из Console).
- `INDEX_LOADER_SNIPPET.html` — готовый блок для вставки в ваш настоящий `index.html`.

## Как внедрить
1) Положите `app.legacy.js` рядом с `app.js`:
   - `js/app/app.js`
   - `js/app/app.legacy.js`

2) В вашем реальном `index.html`:
   - Удалите любые прямые подключения модульных файлов (например `cardSidebar.js`) как обычный `<script src="...">`.
   - Оставьте только один вход: вставьте блок из `INDEX_LOADER_SNIPPET.html` (обычно перед `</head>` или перед `</body>`).

## Почему это чинит ошибку `Unexpected token '{'`
Ошибка возникает, когда файл с `import/export` загружается браузером как обычный script. При загрузке через `import()` файл гарантированно парсится как ES-module.
