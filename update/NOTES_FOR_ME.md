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

⚠️ 5 августа: две новые категории проблем self-hosted-сборки/запуска,
проверять КАЖДЫЙ раз перед тем как отдать `update/ДАТА/`:

1. **Новые pip-зависимости отдельных backend-функций не попадают в
   `deploy/requirements.txt`.** У self-hosted `deploy/server.py` грузит ВСЕ
   функции backend при старте одним махом — если хоть одна не импортируется
   (ModuleNotFoundError), падает ВЕСЬ backend, а не только эта функция.
   Пример: `backend/patches/index.py` использует `paramiko` (SSH/SFTP на
   лаунчер) — это было в `backend/patches/requirements.txt`, но не в общем
   `deploy/requirements.txt`, из-за чего весь backend не стартовал у
   пользователя (включая вход через бота, хотя вход тут вообще ни при чём).
   Проверять командой:
   ```
   for f in backend/*/requirements.txt; do cat "$f"; done | sort -u
   ```
   и сверять каждый пакет с `deploy/requirements.txt` — если чего-то не
   хватает, дописывать туда с комментарием, какая функция его требует.

2. **`src/pages/Login.tsx` и любые другие "боевые" страницы НЕ должны
   импортировать dev-only компоненты, которых нет в `update/`.**
   `DevOnlyLoginButton` (кнопка тестового входа, видна только на
   `*.poehali.dev`) и backend `dev-login` — оба намеренно НЕ переносятся в
   `update/` (см. комментарии в самих файлах: "НИКОГДА не переносить").
   Но исходный `src/pages/Login.tsx` жёстко их импортирует — из-за этого
   `npm run build` падает у любого self-hosted пользователя с
   `Could not load src/components/DevOnlyLoginButton`.
   Перед каждым апдейтом: копия `update/ДАТА/src/pages/Login.tsx` должна
   НЕ содержать `import DevOnlyLoginButton` и `<DevOnlyLoginButton .../>`
   (и связанный с ним `useAuth`/`applySession`, если больше нигде на
   странице не используется). Проверять командой:
   ```
   grep -rn "DevOnlyLoginButton\|from '@/lib/auth'.*useAuth" update/ДАТА/src/pages/Login.tsx
   ```
   Общее правило: любой файл с пометкой "не переносить в update/" в
   комментарии — грепать по всем файлам, которые ЕГО импортируют, и в
   копии внутри `update/ДАТА/` вручную вырезать импорт/использование,
   а не просто не копировать сам файл.

   ✅ 6 августа: пользователь подтвердил, что уже вручную перенёс это
   исправление (`update/2026-08-03/src/pages/Login.tsx` без
   `DevOnlyLoginButton`) на свой боевой сервер — на сегодня тема закрыта,
   в новых апдейтах отдельно про неё напоминать не нужно. Но правило выше
   (грепать импорты dev-only файлов перед КАЖДЫМ новым апдейтом) остаётся
   в силе — это защита на будущее, если `DevOnlyLoginButton` снова окажется
   где-то заимпортирован в боевом файле по ошибке.

⚠️ 6 августа: добавлен вывод технического кода ошибки (`code`, например
`ssh_error_AuthenticationException`) в текст сообщения об ошибке заливки/
сверки с лаунчером (`src/pages/index/usePatches.ts`, `handleLauncherUpload`/
`handleLauncherSync`) — раньше при неразобранных явно кодах ошибка
показывала только дженерик-текст "проверьте подключение", и пользователь
без доступа к серверным логам backend не мог понять, в чём именно проблема
(неверный SSH-хост, неверный пароль, нет прав на запись и т.п.). Учтено в
`update/2026-08-06/`. Если в будущем понадобится вывести отладочную
информацию куда-то ещё в интерфейсе (например для storage-config или
service-keys) — использовать тот же паттерн: не прятать код ошибки от
backend, а дописывать его в конец пользовательского сообщения в скобках.

✅ 6 августа (вечер): `update/2026-08-06/` пересобран целиком и включает все
три фичи дня одним пакетом (README.md объединяет все разделы):
1. Свой никнейм/аватарка участника в кабинете, не зависящие от Telegram
   (новые колонки `users.nickname`/`users.avatar_url`, миграция V0074,
   новые actions в `backend/auth`: `set_nickname`/`upload_avatar`/
   `remove_avatar` — доступны самому пользователю без прав администратора).
2. Переименование/удаление ПРОИЗВОЛЬНОЙ вложенной папки в дереве «Патчи»
   (новые actions `rename_folder`/`delete_folder` в `backend/patches`,
   работают по префиксу пути в отличие от старых `rename_root`/
   `delete_root`, которые остались только для корневых папок).
3. Журнал активности (кабинет → «Журнал») теперь фиксирует действия с
   файлами патчей — новые ключи в `ACTIVITY_META`
   (`src/pages/admin/adminShared.ts`) и вызовы `_log_activity` по всему
   `backend/patches/index.py`.

Проверено перед сборкой: `backend/dev-login` НЕ включён (dev-only, как и
предписано правилом выше). `backend/auth/requirements.txt` пополнился
`boto3` (нужен для загрузки аватарки в S3) — учтено в README раздела 1,
но `boto3` уже есть в общем `deploy/requirements.txt`, доп. действий на
сервере пользователя не требуется. Хардкод `poehali.dev` в скопированных
файлах — только safety-default (паттерн `S3_ENDPOINT`/`S3_PUBLIC_URL`/
`CDN_BASE_URL` с fallback на облако poehali.dev), как и должно быть,
самому коду переопределять не нужно. Новых pip-зависимостей, которых нет
в `deploy/requirements.txt`, не добавилось.

✅ 6 августа (поздний вечер): в `update/2026-08-06/` добавлена 4-я тема дня —
скачивание отмеченных чекбоксами файлов одним архивом (`action='zip_bulk'`
в `backend/patches`, кнопка «Скачать архивом» рядом с «Удалить выбранное» в
`PatchesTree.tsx`) и чекбокс на КАЖДОЙ папке дерева (`PatchesTreeFolder.tsx`,
использует новую `collectFilePaths()` из `patchesUtils.ts` — рекурсивно
собирает пути всех файлов внутри узла, включая вложенные подпапки;
`toggleSelectFolder` в `usePatches.ts` отмечает/снимает их разом). Раздел 4
README добавлен между разделом 3 (журнал активности) и прежним разделом 4
(код ошибки лаунчера, который стал разделом 5) — нумерация везде сквозная.
При сборке из апдейта убраны файлы, которые сегодня физически не менялись
(`PatchesTreeFileRow.tsx`, `PatchesToolbar.tsx`, `patchesApi.ts` — были
скопированы по инерции вместе с остальным `src/pages/index/`, но не входили
в `git show f78df12 --stat`) — держать в апдейте только реально изменённые
файлы, чтобы diff для пользователя оставался маленьким и понятным. Общее
правило на будущее: перед копированием файла в `update/ДАТА/` сверяться с
`git log --oneline --since="ДАТА 00:00" -- путь/к/файлу`, а не копировать
директорию целиком по памяти о том, что "там же рядом лежат правки".