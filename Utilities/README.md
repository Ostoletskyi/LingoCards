# LingoCard Utilities

Набор утилит для проекта **LingoCard**:
- **Backup menu**: ZIP‑снимки в `_backups/`, проверка архива, безопасное восстановление в `_restore/`.
- **Smoke test**: лёгкая диагностика структуры/импортов/FILEMAP.
- **Git tools** (опционально): init/push/tags.

## Точка входа

Запуск из **корня проекта**:

```bash
bash ./0_Utilities.sh
```

Если вы запустили из другой папки — скрипт всё равно перейдёт в корень проекта (папку, где лежит `0_Utilities.sh`).

## Где что лежит

- `Utilities/backup/backup_menu.sh` — меню бэкапов
- `Utilities/diagnostics/smoke_test.sh` — диагностика
- `Utilities/diagnostics/git_tools.sh` — git‑помощники

## Важно

1) Утилиты **не трогают** рабочий проект при восстановлении: распаковка идёт **только** в `_restore/<имя_архива>/`.
2) В архив бэкапа добавляется `__MANIFEST__.txt` (tag/build/commit/ветка/заметка).
