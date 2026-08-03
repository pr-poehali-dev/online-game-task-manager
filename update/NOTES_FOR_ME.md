# Заметка себе (не для пользователя)

⚠️ ВСЕГДА проверять и заменять `poehali.dev`/`cdn.poehali.dev`/
`bucket.poehali.dev` на боевые значения проекта, прежде чем класть файлы
в `update/ДАТА/`:

- `endpoint_url=os.environ.get('S3_ENDPOINT', 'https://bucket.poehali.dev')`
  → `endpoint_url=os.environ.get('S3_ENDPOINT', 'http://127.0.0.1:9000')`
- `_public_url()` с хардкодом `https://cdn.poehali.dev/projects/{AWS_ACCESS_KEY_ID}/bucket/{key}`
  → паттерн с приоритетом `S3_PUBLIC_URL` / `CDN_BASE_URL`, запасной вариант
  `http://{S3_ENDPOINT}/{S3_BUCKET}/{key}` (см. `backend/tasks/index.py`
  как эталон — уже приведён к этому виду).

Боевой домен пользователя: **forge.la2era.com** (использовать в комментариях
вида `# https://forge.la2era.com/files/<key>`).

Проверять командой перед тем как сказать пользователю "готово":
```
grep -rn "poehali.dev" backend/ update/ДАТА/ | grep -v __pycache__ | grep -v func2url.json
```
(`func2url.json` и `backend/dev-login`/`RESEARCH_NOTES.md` — норма, это
служебные вещи платформы/заметки, не боевой S3-код).

Файлы, где эта проблема уже встречалась и была исправлена 30 июля:
`backend/patches/index.py`, `backend/admin/index.py`, `backend/tasks/index.py`,
`backend/knowledge/index.py`, `backend/ideas/index.py` (+ их копии в
`update/2026-07-30/backend/...`, кроме knowledge/ideas — они не входили в
этот апдейт).

3 августа (`update/2026-08-03/`) та же проверка повторена и пройдена для
всех скопированных backend-файлов — исправлены `backend/patches/index.py`,
`backend/admin/index.py` (только endpoint_url — там нет своего `_public_url`,
использует общий паттерн иначе), `backend/tasks/index.py`,
`backend/knowledge/index.py`, `backend/ideas/index.py`. Новые файлы
`backend/service-keys/index.py` и `backend/storage-config/index.py` S3 не
используют вовсе (сервисные разделы кабинета), хардкода в них нет. Оставшиеся
упоминания `poehali.dev` в `backend/storage-config/index.py` и
`src/pages/cabinet/CabinetStorage.tsx` — осознанные текстовые пояснения для
пользователя про разницу облачного/self-hosted окружения, не адреса
запросов — трогать не нужно.

Также с 30 июля появился новый паттерн self-hosted-only функционала:
`backend/storage-config` пишет/читает `.env` на диске VPS (ключ MANAGED_KEYS)
и требует ручной настройки systemd path-unit на сервере пользователя
(`deploy/era-backend-env.path`/`.service`) — сама функция НЕ может
перезапустить backend (subprocess запрещён в облачных функциях), поэтому
всегда описывать этот шаг явно в README апдейта, не полагаться, что
пользователь сам найдёт эти файлы.