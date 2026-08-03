# Обновления от 3 августа

Главная тема — **заливка файлов патчей на VPS игрового лаунчера прямо из
приложения** (кнопки «Б»/«П», сверка с реальным состоянием хостинга,
автоматическое отслеживание бейджа «Требуется залить в лаунчер»), слияние
**личного кабинета и админ-панели в единый раздел** `/cabinet`, новая
возможность **настраивать ключи S3/MinIO прямо из кабинета** без захода по
SSH, и декомпозиция нескольких больших файлов на более мелкие компоненты.

Краткое содержание:
1. **Новое:** заливка файлов патчей на VPS лаунчера (быстрое/полное
   обновление), сверка с реальным XML-реестром на хостинге
2. **Новое:** бейдж «Требуется залить в лаунчер» у задачи теперь снимается и
   возвращается автоматически, без ручной отметки
3. **Новое:** массовое удаление файлов в разделе «Патчи» (чекбоксы + одна
   кнопка), переименование отображаемого имени папки в дереве
4. **Новое:** раздел «Управление проектом → Хранилище (MinIO)» в кабинете —
   владелец проекта может менять ключи S3/MinIO прямо из интерфейса, без
   захода по SSH (см. раздел 6 ниже — **обязательна ручная настройка на
   сервере**, иначе кнопка сохранения будет выдавать ошибку)
5. **Новое:** раздел «Управление проектом → Служебные ключи» — SSH-реквизиты
   VPS лаунчера, задаются из кабинета (тоже только владельцем)
6. Админ-панель (`/admin`) полностью объединена с личным кабинетом
   (`/cabinet`) — старые ссылки на `/admin` продолжают работать через
   редирект
7. Вход через Telegram-бота теперь ведёт сразу на доску задач, а не в кабинет
8. Исправление: правка записи в DDF-редакторе (`.dat`-файлы) теперь заново
   пересчитывает контрольную сумму файла — раньше при последующей сверке с
   лаунчером это могло приводить к неверному статусу «залито»
9. Декомпозиция на более мелкие файлы: раздел «Патчи» (`Patches.tsx`),
   дерево файлов (`PatchesTreeFolder.tsx`), общий `shared.tsx`, `Board.tsx`,
   `Cabinet.tsx` — на поведение не влияет, только на структуру кода
10. Обновлены инструкция «Как работать с патчами» и FAQ личного кабинета —
    актуализированы под все перечисленные изменения

---

## 1. Заливка файлов патчей на VPS лаунчера

### Что добавлено
В разделе «Патчи» у каждого файла (если для сервера настроены пути лаунчера)
появились две круглые кнопки: **«Б»** — залить в быстрое обновление, **«П»**
— залить в полное обновление. Кнопки заливают файл на VPS по SFTP (в формате
UPMaker — `.zip`-обёртка + запись в XML-реестре `files.xml`).

Цвет кнопки показывает статус:
- **серый** — файл ещё не заливался (или заливался, но с тех пор изменился,
  и залитая версия больше не актуальна)
- **оранжевый** — залита именно текущая версия файла (сверено по MD5-хэшу)

Кнопка **«Сверить с лаунчером»** (над деревом файлов) подключается к VPS,
читает реальный `files.xml` (fast и full) и обновляет статусы под факт —
полезно, если часть файлов заливали в обход приложения, например вручную по
FTP с ручной правкой того же XML.

Право заливки (`patch_launcher_upload`) выдаётся отдельно поверх права
«Редактирование раздела «Патчи»» (`patch_edit`) — оба права по умолчанию
только у владельца проекта, выдать их другому администратору может тоже
только владелец.

### Требуется настройка перед использованием
1. **Кабинет → Управление проектом → Серверы** — заполнить у нужного сервера
   пути на диске VPS лаунчера: каталог и файл `files.xml` для быстрого и
   полного обновления (например `/var/www/games/updater/C4` и
   `/var/www/games/updater/C4/files.xml`).
2. **Кабинет → Управление проектом → Служебные ключи** — SSH-реквизиты
   самого VPS лаунчера (хост, порт, логин, пароль). Без этого шага заливка
   вернёт ошибку «SSH-доступ не настроен».

Оба раздела видны и редактируются только владельцем проекта (аккаунт с
`id = 1` — тот, кто зарегистрировался первым).

### Файлы для переноса
```
backend/patches/index.py
backend/patches/requirements.txt   (без изменений состава, но переносится вместе с index.py)
backend/patches/tests.json
backend/service-keys/index.py          (НОВАЯ функция)
backend/service-keys/requirements.txt  (НОВАЯ функция)
backend/service-keys/tests.json        (НОВАЯ функция)
db_migrations/V0064__add_launcher_upload_settings_and_tracking.sql
db_migrations/V0065__add_hash_to_patch_files.sql
db_migrations/V0066__create_service_keys_table.sql
db_migrations/V0068__grant_patch_launcher_delete_to_owner.sql
src/pages/cabinet/CabinetServers.tsx
src/pages/cabinet/CabinetServiceKeys.tsx
src/pages/index/PatchesLauncherUploadButton.tsx  (НОВЫЙ файл)
src/pages/index/PatchesTreeFileRow.tsx           (НОВЫЙ файл)
src/pages/index/PatchesTreeFolder.tsx
src/pages/index/PatchesTree.tsx
src/pages/index/PatchesToolbar.tsx
src/pages/index/usePatches.ts
```

### Проверка
- В «Патчах» выберите сервер с настроенными путями лаунчера — у файлов
  должны появиться кнопки «Б»/«П».
- Залейте один файл — кнопка должна стать оранжевой.
- Нажмите «Сверить с лаунчером» — статус не должен пропасть (сверка
  подтверждает уже сделанную заливку).

---

## 2. Автоматический бейдж «Требуется залить в лаунчер»

### Что было не так
Отметка «Загружено в лаунчер» у задачи снималась и ставилась только вручную
кнопкой в карточке задачи — приходилось не забывать нажимать её самому.

### Что изменилось
Бейдж теперь считается автоматически: как только **все** файлы, прикреплённые
к задаче, залиты в лаунчер хотя бы в одну цель (быстрое ИЛИ полное — любая из
двух), бейдж пропадает сам. Если после этого один из файлов перезалить новой
версией (в «Патчах» или через DDF-редактор) и его содержимое разойдётся с уже
залитым на хостинг — бейдж появится снова автоматически, без ручных действий.
Ручная кнопка «Отметить как загружено» осталась и продолжает работать как
раньше.

### Файлы для переноса
Входят в списки разделов 1 и 3 (`backend/patches/index.py`,
`backend/tasks/index.py`) — отдельно переносить не нужно.

### Проверка
- Прикрепите файл к задаче в состоянии «Можно заливать на лайв» — должен
  появиться бейдж «Требуется залить в лаунчер».
- Залейте файл в лаунчер (кнопка «Б» или «П») — бейдж должен пропасть сам.
- Перезалейте тот же файл новой версией в «Патчах» — бейдж должен появиться
  заново.

---

## 3. Массовое удаление файлов и переименование папок в «Патчах»

### Что добавлено
- Кнопка **«Выбрать файлы»** рядом со «Скачать всё» включает режим с
  чекбоксами у каждого файла — можно отметить несколько и удалить их одной
  кнопкой «Удалить выбранное».
- При наведении на любую корневую папку дерева появляется иконка карандаша —
  позволяет задать папке своё отображаемое название (например «system»
  вместо «System»). Меняется **только** вид в интерфейсе — реальный путь к
  файлам и путь в XML-реестре лаунчера при заливке не затрагиваются.

### Также в этом разделе
- Исправлен путь к папке «Быстрое обновление» для тестового сервера C4 (был
  указан с заглавной буквы, реальная папка на диске — со строчной; Linux
  различает регистр в путях) — миграция `V0069`. **Проверьте перед
  применением на боевой базе**, что путь `/var/www/era/test_updater/C4/patch`
  не совпадает с вашим реальным путём — если у вас другая структура папок,
  либо не применяйте эту миграцию, либо поправьте путь в ней под свой сервер.
- Исправлен `id` тестового сервера, ранее записанный кириллицей (`тест` →
  `test`) — миграция `V0067`, тоже специфична для тестовых данных, проверьте
  перед применением, есть ли у вас сервер с похожим кириллическим `id`.

### Файлы для переноса
```
backend/patches/index.py                     (входит в список раздела 1)
db_migrations/V0067__fix_cyrillic_server_id.sql            (проверить перед применением)
db_migrations/V0069__fix_c4_fast_dir_case.sql              (проверить перед применением)
db_migrations/V0070__create_patch_root_labels.sql
src/pages/index/PatchesTree.tsx               (входит в список раздела 1)
src/pages/index/PatchesTreeFolder.tsx         (входит в список раздела 1)
src/pages/index/PatchesToolbar.tsx            (входит в список раздела 1)
src/pages/index/usePatches.ts                 (входит в список раздела 1)
```

### Проверка
- В «Патчах» нажмите «Выбрать файлы», отметьте несколько файлов, нажмите
  «Удалить выбранное» — файлы должны исчезнуть.
- Наведите курсор на корневую папку, нажмите карандаш, задайте новое имя —
  папка должна отобразиться под новым именем, а реальные файлы внутри
  остаться доступны как прежде.

---

## 4. Настройка S3/MinIO прямо из кабинета

### Что добавлено
Новый раздел **«Управление проектом → Хранилище (MinIO)»** — владелец
проекта может посмотреть и изменить `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_PUBLIC_URL`,
`CDN_BASE_URL` прямо из интерфейса, без захода по SSH и без ручного
редактирования `.env`.

⚠️ **Это самая важная часть апдейта для вашего боевого сервера — без
дополнительной настройки на VPS кнопка сохранения будет возвращать ошибку
«недоступно».** Подробная инструкция — в разделе 6 ниже.

### Файлы для переноса
```
backend/storage-config/index.py          (НОВАЯ функция)
backend/storage-config/requirements.txt  (НОВАЯ функция)
backend/storage-config/tests.json        (НОВАЯ функция)
deploy/era-backend-env.path              (НОВЫЙ файл — systemd path-unit)
deploy/era-backend-env.service           (НОВЫЙ файл — systemd service-unit)
src/pages/cabinet/CabinetStorage.tsx
src/pages/cabinet/CabinetProject.tsx
```

### Проверка
См. раздел 6 — там же итоговая проверка после настройки systemd на сервере.

---

## 5. Слияние личного кабинета и админ-панели

### Что изменилось
Раздел `/admin` (админ-панель) больше не существует как отдельная страница —
все его функции (команда, журнал активности, файлы, статистика) вошли в
единый личный кабинет `/cabinet`, видимость разделов зависит от роли и прав.
Старые ссылки/закладки на `/admin` продолжают работать — теперь это просто
редирект на `/cabinet`.

Дополнительно: вход через Telegram-бота теперь сразу ведёт на доску задач
(`/`), а не в личный кабинет — кабинет по-прежнему открывается кнопкой с
именем пользователя в шапке доски.

### Файлы для переноса
```
src/App.tsx
src/pages/Cabinet.tsx
src/pages/Login.tsx
src/pages/admin/ActivityLogList.tsx        (НОВЫЙ файл)
src/pages/admin/ActivityLogModal.tsx
src/pages/admin/FilesList.tsx              (НОВЫЙ файл)
src/pages/admin/FilesModal.tsx
src/pages/admin/UserList.tsx
src/pages/admin/adminShared.ts
src/pages/cabinet/CabinetCategories.tsx    (НОВЫЙ файл)
src/pages/cabinet/CabinetProfile.tsx       (НОВЫЙ файл)
src/pages/cabinet/CabinetProject.tsx       (НОВЫЙ файл)
src/pages/cabinet/CabinetServers.tsx       (НОВЫЙ файл)
src/pages/cabinet/CabinetSidebar.tsx       (НОВЫЙ файл)
src/pages/cabinet/CabinetStats.tsx         (НОВЫЙ файл)
src/pages/cabinet/useFilesAndActivity.ts   (НОВЫЙ файл)
src/pages/cabinet/useSessionsAndStats.ts   (НОВЫЙ файл)
src/pages/cabinet/useTeamManagement.ts     (НОВЫЙ файл)
backend/admin/index.py
backend/auth/index.py
backend/catalog/index.py
backend/tasks/index.py
```

⚠️ Файл `src/pages/Admin.tsx` (старая отдельная страница админки) на вашем
сервере нужно **удалить** — его функциональность полностью перенесена в
перечисленные выше файлы `src/pages/Cabinet.tsx` и `src/pages/cabinet/*`.

### Проверка
- Откройте `/admin` — должно перекинуть на `/cabinet`.
- В кабинете должны быть видны все прежние функции админки (в зависимости
  от вашей роли): команда, журнал, файлы, статистика.
- Войдите через Telegram-бота — должны попасть сразу на доску задач.

---

## 6. Как перенести

```bash
cd /var/www/era   # корень вашего проекта на сервере

# Backend — раздел «Патчи» (заливка в лаунчер, массовое удаление, авто-бейдж)
cp update/2026-08-03/backend/patches/index.py backend/patches/index.py
cp update/2026-08-03/backend/patches/requirements.txt backend/patches/requirements.txt
cp update/2026-08-03/backend/patches/tests.json backend/patches/tests.json

# Backend — новая функция «Служебные ключи» (SSH для лаунчера)
mkdir -p backend/service-keys
cp update/2026-08-03/backend/service-keys/index.py backend/service-keys/index.py
cp update/2026-08-03/backend/service-keys/requirements.txt backend/service-keys/requirements.txt
cp update/2026-08-03/backend/service-keys/tests.json backend/service-keys/tests.json

# Backend — новая функция «Хранилище (MinIO)» из кабинета
mkdir -p backend/storage-config
cp update/2026-08-03/backend/storage-config/index.py backend/storage-config/index.py
cp update/2026-08-03/backend/storage-config/requirements.txt backend/storage-config/requirements.txt
cp update/2026-08-03/backend/storage-config/tests.json backend/storage-config/tests.json

# Backend — слияние кабинета/админки, редирект логина, разное
cp update/2026-08-03/backend/admin/index.py backend/admin/index.py
cp update/2026-08-03/backend/auth/index.py backend/auth/index.py
cp update/2026-08-03/backend/catalog/index.py backend/catalog/index.py
cp update/2026-08-03/backend/tasks/index.py backend/tasks/index.py
cp update/2026-08-03/backend/sprints/index.py backend/sprints/index.py
cp update/2026-08-03/backend/knowledge/index.py backend/knowledge/index.py
cp update/2026-08-03/backend/ideas/index.py backend/ideas/index.py
cp update/2026-08-03/backend/login-code/index.py backend/login-code/index.py

# Frontend — раздел «Патчи» и дерево файлов
cp update/2026-08-03/src/pages/index/Patches.tsx src/pages/index/Patches.tsx
cp update/2026-08-03/src/pages/index/PatchesDdfEditor.tsx src/pages/index/PatchesDdfEditor.tsx
cp update/2026-08-03/src/pages/index/PatchesDdfRangePanel.tsx src/pages/index/PatchesDdfRangePanel.tsx
cp update/2026-08-03/src/pages/index/PatchesHelp.tsx src/pages/index/PatchesHelp.tsx
cp update/2026-08-03/src/pages/index/PatchesInfoHint.tsx src/pages/index/PatchesInfoHint.tsx
cp update/2026-08-03/src/pages/index/PatchesLauncherUploadButton.tsx src/pages/index/PatchesLauncherUploadButton.tsx
cp update/2026-08-03/src/pages/index/PatchesToolbar.tsx src/pages/index/PatchesToolbar.tsx
cp update/2026-08-03/src/pages/index/PatchesTree.tsx src/pages/index/PatchesTree.tsx
cp update/2026-08-03/src/pages/index/PatchesTreeFileRow.tsx src/pages/index/PatchesTreeFileRow.tsx
cp update/2026-08-03/src/pages/index/PatchesTreeFolder.tsx src/pages/index/PatchesTreeFolder.tsx
cp update/2026-08-03/src/pages/index/patchesUtils.ts src/pages/index/patchesUtils.ts
cp update/2026-08-03/src/pages/index/usePatches.ts src/pages/index/usePatches.ts
cp update/2026-08-03/src/pages/index/useDdfRange.ts src/pages/index/useDdfRange.ts
cp update/2026-08-03/src/pages/index/usePrivateNotes.ts src/pages/index/usePrivateNotes.ts

# Frontend — слияние кабинета/админки
cp update/2026-08-03/src/App.tsx src/App.tsx
cp update/2026-08-03/src/pages/Cabinet.tsx src/pages/Cabinet.tsx
cp update/2026-08-03/src/pages/Login.tsx src/pages/Login.tsx
rm -f src/pages/Admin.tsx
cp update/2026-08-03/src/pages/admin/ActivityLogList.tsx src/pages/admin/ActivityLogList.tsx
cp update/2026-08-03/src/pages/admin/ActivityLogModal.tsx src/pages/admin/ActivityLogModal.tsx
cp update/2026-08-03/src/pages/admin/FilesList.tsx src/pages/admin/FilesList.tsx
cp update/2026-08-03/src/pages/admin/FilesModal.tsx src/pages/admin/FilesModal.tsx
cp update/2026-08-03/src/pages/admin/UserList.tsx src/pages/admin/UserList.tsx
cp update/2026-08-03/src/pages/admin/adminShared.ts src/pages/admin/adminShared.ts
mkdir -p src/pages/cabinet
cp update/2026-08-03/src/pages/cabinet/CabinetCategories.tsx src/pages/cabinet/CabinetCategories.tsx
cp update/2026-08-03/src/pages/cabinet/CabinetProfile.tsx src/pages/cabinet/CabinetProfile.tsx
cp update/2026-08-03/src/pages/cabinet/CabinetProject.tsx src/pages/cabinet/CabinetProject.tsx
cp update/2026-08-03/src/pages/cabinet/CabinetServers.tsx src/pages/cabinet/CabinetServers.tsx
cp update/2026-08-03/src/pages/cabinet/CabinetServiceKeys.tsx src/pages/cabinet/CabinetServiceKeys.tsx
cp update/2026-08-03/src/pages/cabinet/CabinetSidebar.tsx src/pages/cabinet/CabinetSidebar.tsx
cp update/2026-08-03/src/pages/cabinet/CabinetStats.tsx src/pages/cabinet/CabinetStats.tsx
cp update/2026-08-03/src/pages/cabinet/CabinetStorage.tsx src/pages/cabinet/CabinetStorage.tsx
cp update/2026-08-03/src/pages/cabinet/useFilesAndActivity.ts src/pages/cabinet/useFilesAndActivity.ts
cp update/2026-08-03/src/pages/cabinet/useSessionsAndStats.ts src/pages/cabinet/useSessionsAndStats.ts
cp update/2026-08-03/src/pages/cabinet/useTeamManagement.ts src/pages/cabinet/useTeamManagement.ts

# Frontend — прочая декомпозиция и точечные правки (доска, база знаний, идеи и т.д.)
cp update/2026-08-03/src/components/KnowledgeBase.tsx src/components/KnowledgeBase.tsx
cp update/2026-08-03/src/components/knowledge-base/ArticleEditor.tsx src/components/knowledge-base/ArticleEditor.tsx
cp update/2026-08-03/src/components/knowledge-base/CatBadge.tsx src/components/knowledge-base/CatBadge.tsx
cp update/2026-08-03/src/components/knowledge-base/articleCache.ts src/components/knowledge-base/articleCache.ts
cp update/2026-08-03/src/components/knowledge-base/shared.ts src/components/knowledge-base/shared.ts
cp update/2026-08-03/src/lib/auth.tsx src/lib/auth.tsx
cp update/2026-08-03/src/lib/catalog.tsx src/lib/catalog.tsx
cp update/2026-08-03/src/pages/index/Archive.tsx src/pages/index/Archive.tsx
cp update/2026-08-03/src/pages/index/Board.tsx src/pages/index/Board.tsx
cp update/2026-08-03/src/pages/index/BoardHoldSection.tsx src/pages/index/BoardHoldSection.tsx
cp update/2026-08-03/src/pages/index/BoardTaskCard.tsx src/pages/index/BoardTaskCard.tsx
cp update/2026-08-03/src/pages/index/CreateTaskModal.tsx src/pages/index/CreateTaskModal.tsx
cp update/2026-08-03/src/pages/index/Ideas.tsx src/pages/index/Ideas.tsx
cp update/2026-08-03/src/pages/index/IndexMain.tsx src/pages/index/IndexMain.tsx
cp update/2026-08-03/src/pages/index/IndexSidebar.tsx src/pages/index/IndexSidebar.tsx
cp update/2026-08-03/src/pages/index/IndexTopbar.tsx src/pages/index/IndexTopbar.tsx
cp update/2026-08-03/src/pages/index/Patchnotes.tsx src/pages/index/Patchnotes.tsx
cp update/2026-08-03/src/pages/index/Restart.tsx src/pages/index/Restart.tsx
cp update/2026-08-03/src/pages/index/SprintModals.tsx src/pages/index/SprintModals.tsx
cp update/2026-08-03/src/pages/index/TaskComments.tsx src/pages/index/TaskComments.tsx
cp update/2026-08-03/src/pages/index/TaskModalMeta.tsx src/pages/index/TaskModalMeta.tsx
cp update/2026-08-03/src/pages/index/boardSort.ts src/pages/index/boardSort.ts
cp update/2026-08-03/src/pages/index/ideas/ideaCache.ts src/pages/index/ideas/ideaCache.ts
cp update/2026-08-03/src/pages/index/shared.tsx src/pages/index/shared.tsx
cp update/2026-08-03/src/pages/index/sharedComponents.tsx src/pages/index/sharedComponents.tsx
cp update/2026-08-03/src/pages/index/sharedConstants.ts src/pages/index/sharedConstants.ts
cp update/2026-08-03/src/pages/index/sharedHelpers.ts src/pages/index/sharedHelpers.ts
cp update/2026-08-03/src/pages/index/sharedTypes.ts src/pages/index/sharedTypes.ts
cp update/2026-08-03/src/pages/index/taskDataCache.ts src/pages/index/taskDataCache.ts

# Deploy — новые systemd-файлы для настройки MinIO из кабинета (см. пункт 7.2 ниже)
cp update/2026-08-03/deploy/era-backend-env.path deploy/era-backend-env.path
cp update/2026-08-03/deploy/era-backend-env.service deploy/era-backend-env.service

# Миграции БД (см. раздел 7 — ОБЯЗАТЕЛЬНО указать вашу схему)
cd /var/www/era
for f in V0061__grant_patch_edit_to_owner.sql \
         V0062__update_faq_patch_edit_permission.sql \
         V0063__add_protocol_description_to_servers.sql \
         V0064__add_launcher_upload_settings_and_tracking.sql \
         V0065__add_hash_to_patch_files.sql \
         V0066__create_service_keys_table.sql \
         V0068__grant_patch_launcher_delete_to_owner.sql \
         V0070__create_patch_root_labels.sql \
         V0071__rewrite_and_reorder_faq.sql \
         V0072__fix_faq_launcher_button_color.sql \
         V0073__fix_faq_launcher_two_statuses.sql; do
  psql "$DATABASE_URL" -c 'SET search_path TO "ВАША_СХЕМА", public;' \
    -f update/2026-08-03/db_migrations/$f
done
# V0067 и V0069 — ПРОВЕРЬТЕ содержимое перед применением (см. раздел 3, они
# точечно правят конкретные тестовые данные этого проекта, не структуру БД):
# psql "$DATABASE_URL" -c 'SET search_path TO "ВАША_СХЕМА", public;' \
#   -f update/2026-08-03/db_migrations/V0067__fix_cyrillic_server_id.sql
# psql "$DATABASE_URL" -c 'SET search_path TO "ВАША_СХЕМА", public;' \
#   -f update/2026-08-03/db_migrations/V0069__fix_c4_fast_dir_case.sql

# Опционально — удалить неиспользуемую зависимость (графики убраны из проекта)
npm uninstall recharts

npm install
npm run build

sudo systemctl restart era-backend
```

---

## 7. Дополнительная настройка на VPS

### 7.1. Ничего нового для Python-зависимостей
`backend/service-keys` и `backend/storage-config` используют только
`psycopg2` — тот же пакет, что уже установлен для остальных функций проекта.
Отдельно `pip install` делать не нужно.

### 7.2. Обязательно для раздела «Хранилище (MinIO)» в кабинете
Backend-функция `storage-config` читает и переписывает файл `.env` на диске
сервера, но **сама не может выполнять системные команды** (это запрещено в
облачных функциях этого проекта из соображений безопасности) — поэтому
перезапуск backend после сохранения новых ключей должен делать `systemd`,
реагируя на изменение файла:

```bash
# права на запись .env для пользователя, от которого работает backend
sudo chown www-data:www-data /var/www/era/deploy/.env
sudo chmod 600 /var/www/era/deploy/.env

# systemd path-unit — следит за файлом .env и перезапускает backend при изменении
sudo cp /var/www/era/deploy/era-backend-env.path /etc/systemd/system/
sudo cp /var/www/era/deploy/era-backend-env.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now era-backend-env.path
sudo systemctl status era-backend-env.path   # должно быть active (waiting)
```

Если пропустить этот шаг — при попытке сохранить настройки в разделе
«Хранилище (MinIO)» кабинет покажет ошибку «недоступно»: раздел проверяет,
что файл `.env` существует и доступен для записи по пути
`/var/www/era/deploy/.env` (можно переопределить переменной окружения
`ENV_FILE_PATH` в самом `.env`, если структура папок на вашем сервере
отличается).

Раздел виден только владельцу проекта (пользователю с `id = 1` — тому, кто
зарегистрировался первым). Владелец может поменять там `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_PUBLIC_URL`,
`CDN_BASE_URL` — сохранение переписывает `.env`, а `era-backend-env.path`
перезапускает `era-backend.service` в течение пары секунд, новые значения
применяются без захода на сервер по SSH.

### 7.3. Обязательно для раздела «Служебные ключи» (SSH лаунчера) и заливки в лаунчер
Ничего дополнительно устанавливать не нужно — SSH-подключение к VPS
лаунчера идёт через `paramiko`, который уже входит в зависимости проекта
(использовался и раньше, до этого апдейта). Убедитесь только, что:
- пользователь, из-под которого будет заходить приложение на VPS лаунчера,
  имеет права на запись в папки быстрого/полного обновления;
- реквизиты в разделе «Служебные ключи» указывают именно на этот VPS (хост,
  порт, логин, пароль).

### 7.4. Точечные миграции с тестовыми данными (напоминание)
Как уже сказано в разделе 6 — миграции `V0067` и `V0069` содержат конкретные
значения (id тестового сервера `тест`→`test`, путь `.../C4/patch`),
подобранные под тестовое окружение этого проекта. Прежде чем применять их на
боевой базе, откройте оба файла и убедитесь, что затрагиваемые ими данные
либо у вас отсутствуют (тогда `UPDATE` просто ничего не найдёт и не
изменит), либо совпадают по смыслу с вашей структурой серверов.

---

## Проверено перед публикацией
Во всех файлах этого обновления заменён хардкод `poehali.dev`/
`cdn.poehali.dev`/`bucket.poehali.dev` — запасной адрес по умолчанию
(используется только если `S3_ENDPOINT`/`S3_PUBLIC_URL` не заданы в `.env`)
во всех затронутых файлах (`backend/patches/index.py`,
`backend/admin/index.py`, `backend/tasks/index.py`,
`backend/knowledge/index.py`, `backend/ideas/index.py`) указывает на
локальный MinIO (`http://127.0.0.1:9000`), как и в остальных файлах проекта.
Убедитесь, что в `.env` у вас заданы `S3_ENDPOINT`/`S3_PUBLIC_URL` под ваш
сервер (см. шаг 3 `deploy/UPDATE.md` и новый раздел 4 этого файла, если вы
уже перешли на настройку через кабинет).

Оставшиеся упоминания `poehali.dev` в `backend/storage-config/index.py` —
это текстовые пояснения для пользователя о разнице между облачным и
self-hosted окружением, а не адреса запросов, трогать не нужно.
