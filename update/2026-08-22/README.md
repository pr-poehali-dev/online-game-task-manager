# Обновления от 22 августа

Это самый крупный апдейт за всё время — в него вошли **два полноценных новых раздела**
и точечные мобильные правки, накопленные с прошлого переноса (6 августа):

1. **Новое: раздел «AI»** — общение сотрудников с ИИ-моделями (текст, код, изображения,
   видео, сборка Excel/Word документов) через единый платный API-ключ AI Tunnel. Доступ —
   отдельное привилегированное право, месячный лимит трат на сотрудника в рублях.
2. **Новое: раздел «Логи» переехал на PostgreSQL** — раньше логи разбирались на лету по
   SFTP при каждом запросе (медленно на широких диапазонах дат), теперь опционально можно
   поднять отдельный self-hosted индексатор, который заранее разбирает файлы и складывает
   в свою базу — поиск по любому диапазону становится мгновенным. SFTP-режим остаётся
   рабочим фолбэком, если индексатор не разворачивать.
3. Более десятка мелких правок мобильной версии интерфейса (в основном относятся к разделу
   AI — он получал больше всего доработок последним, но общие компоненты вроде списка
   выпадающих подсказок (`command.tsx`) чинились для всего приложения).

⚠️ Это большой апдейт с 2 новыми таблицами данных и переносом ~100 файлов. Настоятельно
рекомендуется применять по частям (сначала раздел 1, проверить, что всё стартует и
работает; потом раздел 2) и **обязательно сделать бэкап БД и файлов backend перед началом**.

---

## 0. Порядок действий (коротко)

1. Сделайте бэкап сервера (файлы + БД).
2. Примените 7 новых миграций БД (раздел «Миграции» ниже) — по порядку, от V0075 до V0081.
3. Скопируйте изменённые файлы (см. разделы 1 и 2) поверх своих — **кроме
   `backend/func2url.json`**, его на self-hosted нет и не должно быть.
4. Установите новые Python-зависимости: `openpyxl`, `python-docx` уже добавлены в
   `deploy/requirements.txt` этого апдейта — либо скопируйте файл целиком, либо доустановите
   вручную (`pip install openpyxl python-docx`).
5. Установите новые npm-зависимости (`npm install`) — `package.json` уже обновлён с
   `react-markdown`, `react-syntax-highlighter`, `remark-gfm`.
6. Заполните новые служебные ключи в кабинете (AI Tunnel API-ключ, при желании SFTP/БД логов)
   — см. разделы 1 и 2 ниже.
7. Пересоберите фронтенд (`npm run build`) и перезапустите backend-сервис.
8. Раздел «Логи» → self-hosted индексатор (опционально, ускоряет поиск) — отдельная
   установка на хостинге, где физически лежат файлы логов, см. раздел 2.4.

---

## 1. Раздел «AI»

### Что это

Новый раздел в главном меню (доступен по адресу `/ai`, сохраняется в закладки). Сотрудники
могут:
- вести несколько сохранённых диалогов с ИИ-моделями (как в ChatGPT) — обычный текстовый чат
  и отдельный режим «Код» со своим системным промптом под ревью/рефакторинг;
- прикреплять файлы и картинки к сообщению (vision-модели «видят» изображения);
- генерировать изображения и видео по текстовому описанию;
- собирать документы Excel/Word по запросу («сделай таблицу с расчётом...», «оформи
  договор...») с возможностью донастройки уже готового документа;
- закреплять полезные ответы внутри диалога и экспортировать их;
- искать по содержимому всей истории переписки, не только по названиям чатов;
- пользоваться готовыми и своими шаблонами промптов (11 стандартных шаблонов заведены
  автоматически).

Всё это работает через единый API-ключ **AI Tunnel** (aitunnel.ru — российский
OpenAI-совместимый прокси ко всем провайдерам LLM), который заводится один раз в кабинете
на весь проект. Расход считается в рублях, у каждого сотрудника — свой месячный лимит
(по умолчанию 300 ₽/мес, администратор может менять для каждого индивидуально).

### Доступ

Как и с разделом «Патчи», доступ к «AI» — **привилегированное право** (`ai_access`),
по умолчанию есть только у владельца проекта и не выдаётся автоматически всем
администраторам (открывает доступ к платному внешнему сервису). Выдать его конкретному
сотруднику может владелец в кабинете → «Команда» → права доступа участника.

### Файлы для переноса

```
backend/ai/                        (вся папка целиком, 9 файлов)
  ├── index.py                     (точка входа, карта action → обработчик)
  ├── common.py                    (S3, AI Tunnel HTTP-клиент, БД, сервисные ключи)
  ├── chats.py                     (диалоги, каталог моделей, лимиты, шаблоны, поиск)
  ├── generate.py                  (обращения к AI Tunnel: чат, изображения, видео)
  ├── documents.py                 (сборка Excel/Word)
  ├── files.py                     (загрузка вложений в S3, крупные файлы кусочками)
  ├── templates.py                 (CRUD пользовательских шаблонов промптов)
  ├── requirements.txt
  └── tests.json

db_migrations/V0076__ai_section_permission_and_tables.sql
db_migrations/V0077__ai_tables_switch_to_rub_currency.sql
db_migrations/V0078__ai_prompt_templates_per_user.sql
db_migrations/V0079__ai_messages_pinned.sql
db_migrations/V0080__ai_document_mode_comment.sql
db_migrations/V0081__ai_messages_doc_spec.sql

src/pages/index/Ai.tsx                     (корневой компонент раздела)
src/pages/index/AiChatList.tsx             (список диалогов)
src/pages/index/AiChatPane.tsx             (шапка + лента + композер)
src/pages/index/AiSidebar.tsx              (обёртка колонки чатов: десктоп/мобильный Sheet)
src/pages/index/AiMessageList.tsx          (лента сообщений)
src/pages/index/AiComposer.tsx             (поле ввода текстового режима)
src/pages/index/AiGenerateComposer.tsx     (композер режимов изображение/видео)
src/pages/index/AiGenerateParams.tsx       (параметры генерации картинки/видео)
src/pages/index/AiGenerateAttachments.tsx  (превью опорных кадров/референсов)
src/pages/index/AiGeneratePromptInput.tsx  (поле промпта для генерации)
src/pages/index/AiGenerateStatusBar.tsx    (полоса расхода лимита)
src/pages/index/AiCodeBlock.tsx            (подсветка синтаксиса в ответах)
src/pages/index/AiCodeDiff.tsx             (наглядное сравнение до/после правки кода)
src/pages/index/AiImageLightbox.tsx        (просмотр картинок на весь экран)
src/pages/index/AiModelPicker.tsx          (выбор модели)
src/pages/index/AiModelFaqModal.tsx        (FAQ по моделям)
src/pages/index/AiTemplatesPicker.tsx      (быстрый выбор шаблона промпта)
src/pages/index/AiTemplatesManager.tsx     (управление своими шаблонами)
src/pages/index/AiPromptTemplates.ts       (типы + стандартный набор шаблонов)
src/pages/index/AiTypes.ts                 (общие типы раздела)
src/pages/index/aiCodeDiff.ts              (логика построения диффа кода)
src/pages/index/aiExportPinned.ts          (экспорт закреплённых ответов)
src/pages/index/aiHelpers.ts               (общие мелкие хелперы)
src/pages/index/aiUploadApi.ts             (загрузка вложений кусочками)
src/pages/index/useAiSection.ts            (всё состояние раздела — один большой хук)
src/pages/index/useAiPromptTemplates.ts    (состояние своих шаблонов)
src/pages/index/useAutosizeTextarea.ts     (автоувеличение поля ввода)
src/pages/index/useUndoDelete.ts           (отмена удаления с таймером — используется списком чатов)

# Права доступа/лимиты (частично общие с разделом «Логи», см. раздел 3 ниже)
backend/admin/index.py
src/lib/auth.tsx
src/pages/admin/adminShared.ts
src/pages/admin/UserList.tsx
src/pages/cabinet/useTeamManagement.ts
src/pages/cabinet/CabinetServiceKeys.tsx
src/pages/cabinet/CabinetStats.tsx

# Интеграция в общий каркас приложения (частично общие с «Логи», см. раздел 3)
src/App.tsx
src/pages/Index.tsx
src/pages/Cabinet.tsx
src/pages/index/IndexMain.tsx
src/pages/index/IndexTopbar.tsx
src/pages/index/IndexSidebar.tsx
src/pages/index/sharedHelpers.ts
src/pages/index/sharedTypes.ts
src/components/ui/command.tsx
src/index.css

package.json                       (новые зависимости: react-markdown, react-syntax-highlighter,
                                     remark-gfm, @types/react-syntax-highlighter)
deploy/requirements.txt            (добавлены openpyxl, python-docx)
```

### Как перенести

```bash
cd /var/www/era   # корень вашего проекта на сервере

# backend
mkdir -p backend/ai
cp update/2026-08-22/backend/ai/*.py backend/ai/
cp update/2026-08-22/backend/ai/requirements.txt backend/ai/
cp update/2026-08-22/backend/ai/tests.json backend/ai/
cp update/2026-08-22/backend/admin/index.py backend/admin/index.py

# фронтенд — весь список AiXxx/aiXxx/useAiXxx файлов одной командой
cp update/2026-08-22/src/pages/index/Ai*.tsx src/pages/index/
cp update/2026-08-22/src/pages/index/ai*.ts src/pages/index/
cp update/2026-08-22/src/pages/index/useAi*.ts src/pages/index/
cp update/2026-08-22/src/pages/index/useAutosizeTextarea.ts src/pages/index/
cp update/2026-08-22/src/pages/index/useUndoDelete.ts src/pages/index/

# права доступа, лимиты, статистика трат
cp update/2026-08-22/src/lib/auth.tsx src/lib/auth.tsx
cp update/2026-08-22/src/pages/admin/adminShared.ts src/pages/admin/adminShared.ts
cp update/2026-08-22/src/pages/admin/UserList.tsx src/pages/admin/UserList.tsx
cp update/2026-08-22/src/pages/cabinet/useTeamManagement.ts src/pages/cabinet/useTeamManagement.ts
cp update/2026-08-22/src/pages/cabinet/CabinetServiceKeys.tsx src/pages/cabinet/CabinetServiceKeys.tsx
cp update/2026-08-22/src/pages/cabinet/CabinetStats.tsx src/pages/cabinet/CabinetStats.tsx

# интеграция в каркас — см. ВАЖНО ниже про пересечение с разделом "Логи"
cp update/2026-08-22/src/App.tsx src/App.tsx
cp update/2026-08-22/src/pages/Index.tsx src/pages/Index.tsx
cp update/2026-08-22/src/pages/Cabinet.tsx src/pages/Cabinet.tsx
cp update/2026-08-22/src/pages/index/IndexMain.tsx src/pages/index/IndexMain.tsx
cp update/2026-08-22/src/pages/index/IndexTopbar.tsx src/pages/index/IndexTopbar.tsx
cp update/2026-08-22/src/pages/index/IndexSidebar.tsx src/pages/index/IndexSidebar.tsx
cp update/2026-08-22/src/pages/index/sharedHelpers.ts src/pages/index/sharedHelpers.ts
cp update/2026-08-22/src/pages/index/sharedTypes.ts src/pages/index/sharedTypes.ts
cp update/2026-08-22/src/components/ui/command.tsx src/components/ui/command.tsx
cp update/2026-08-22/src/index.css src/index.css

cp update/2026-08-22/package.json package.json
cp update/2026-08-22/deploy/requirements.txt deploy/requirements.txt

# применить миграции (замените реквизиты на свои — см. общий блок "Миграции" ниже)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET search_path TO \"ВАША_СХЕМА\", public;" \
  -f update/2026-08-22/db_migrations/V0076__ai_section_permission_and_tables.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET search_path TO \"ВАША_СХЕМА\", public;" \
  -f update/2026-08-22/db_migrations/V0077__ai_tables_switch_to_rub_currency.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET search_path TO \"ВАША_СХЕМА\", public;" \
  -f update/2026-08-22/db_migrations/V0078__ai_prompt_templates_per_user.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET search_path TO \"ВАША_СХЕМА\", public;" \
  -f update/2026-08-22/db_migrations/V0079__ai_messages_pinned.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET search_path TO \"ВАША_СХЕМА\", public;" \
  -f update/2026-08-22/db_migrations/V0080__ai_document_mode_comment.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET search_path TO \"ВАША_СХЕМА\", public;" \
  -f update/2026-08-22/db_migrations/V0081__ai_messages_doc_spec.sql

pip install -r backend/ai/requirements.txt   # openpyxl, python-docx — если их ещё нет
npm install
npm run build
sudo systemctl restart era-backend
```

⚠️ **ВАЖНО про пересечение с разделом «Логи»:** файлы `src/App.tsx`, `src/pages/Index.tsx`,
`src/pages/index/IndexMain.tsx`, `src/pages/index/IndexTopbar.tsx`,
`src/pages/index/IndexSidebar.tsx`, `src/pages/index/sharedHelpers.ts`,
`src/pages/index/sharedTypes.ts`, `src/lib/auth.tsx`, `backend/admin/index.py` содержат
изменения СРАЗУ ОБОИХ разделов (AI и «Логи») — они разрабатывались в одной сессии и
физически неразделимы на уровне файла. Если переносите только раздел AI без «Логов» (или
наоборот) — всё равно скопируйте актуальную версию этих файлов целиком из `update/2026-08-22/`,
частями их развести нельзя. Разница на поведение не влияет: код каждого раздела просто
не активируется без своей миграции/прав.

### Настройка после переноса

1. Кабинет → «Служебные ключи» → блок **«Доступ к AI Tunnel»** → вставьте API-ключ вида
   `sk-aitunnel-...`. Получить ключ и пополнить баланс — на https://aitunnel.ru.
2. Кабинет → «Команда» → выдайте право **AI** (`ai_access`) нужным сотрудникам (по
   умолчанию есть только у владельца проекта).
3. При необходимости поменяйте месячный лимит трат конкретному сотруднику — там же, в
   карточке участника («Лимит AI: 300 ₽/мес» → нажать и ввести новое значение).

### Проверка

- Раздел «AI» должен появиться в главном меню (только у тех, кому выдано право).
- Откройте `/ai`, начните новый чат, отправьте сообщение — должен прийти ответ модели, а
  внизу — потраченная сумма и остаток месячного лимита.
- Кабинет → «Статистика» → должен появиться блок «Траты на AI за этот месяц» со сводкой
  по сотрудникам и балансом AI Tunnel.
- Попробуйте создать пару шаблонов промптов, закрепить ответ, удалить диалог (должна
  появиться плашка «Удаление через: 5 Вернуть ×» с возможностью отменить).

---

## 2. Раздел «Логи»: переход на PostgreSQL + опциональный self-hosted индексатор

### Что было не так

Раздел «Логи» кабинета при каждом поиске заново скачивал по SFTP и разбирал файлы логов
игрового сервера. Для пары часов истории это работало, но для недели — сотни файлов и
десятки-сотни мегабайт на КАЖДЫЙ поиск, что либо очень медленно, либо не укладывается в
разумное время ответа вовсе.

### Что изменилось

Backend теперь поддерживает два режима, переключаемых автоматически по наличию заполненного
служебного ключа `LOGS_DB_URL`:
- **Если `LOGS_DB_URL` НЕ заполнен** — всё работает по-старому, через SFTP (тот же принцип,
  что раньше). Никаких дополнительных действий не требуется, кроме переноса файлов.
- **Если `LOGS_DB_URL` заполнен** — backend читает уже готовые разобранные события из
  отдельной базы `era_logs`, которую заранее наполняет отдельный self-hosted-скрипт
  (`logs-indexer/indexer.py`, запускается по таймеру раз в минуту НА хостинге, где физически
  лежат файлы логов). Поиск по любому диапазону дат становится мгновенным благодаря индексам
  в этой базе.

Это **необязательное ускорение** — можно перенести только backend/фронтенд (раздел 2.1-2.3
ниже) и продолжать работать через SFTP, а индексатор (раздел 2.4) развернуть отдельно
позже, когда понадобится скорость на широких диапазонах дат.

Также у каждого сервера (кабинет → «Серверы») появилось новое поле **«Директория логов»** —
путь на SFTP-хосте логов, свой у каждого сервера (сам хост/логин/пароль — общие на все
сервера, задаются один раз в «Служебных ключах»).

### 2.1. Файлы для переноса (backend + фронтенд, обязательная часть)

```
backend/logs/                      (вся папка целиком, 10 файлов)
  ├── index.py                     (точка входа: SFTP-режим + чтение из БД логов)
  ├── game_lookup.py                (резолв item_id/npc_id/skill_id → имена из дерева патчей)
  ├── action_ids_data.py            (справочник action_id → название игрового действия)
  ├── ddf_parser.py                 (разбор бинарных .dat-справочников игры)
  ├── ddf_registry.py                (схема парсинга для обычных серверов)
  ├── ddf_registry_c4.py             (схема парсинга для серверов протокола C4)
  ├── l2encdec.py                    (дешифровка кодировки клиента L2)
  ├── requirements.txt
  ├── tests.json
  └── RESEARCH_NOTES.md             (подробный технический контекст задачи — держите рядом
                                      с кодом на будущее, если понадобится разобраться в
                                      формате логов заново)

db_migrations/V0075__add_logs_dir_and_logs_view_permission.sql

backend/catalog/index.py           (новое поле servers.logs_dir в API каталога)

src/lib/catalog.tsx                (тип ServerItem дополнен полем logsDir)
src/pages/cabinet/CabinetServers.tsx  (поле «Директория логов» в форме сервера)

src/pages/index/Logs.tsx           (корневой компонент раздела)
src/pages/index/LogsFilterBar.tsx  (фильтры: сервер, тип лога, игрок, предмет, даты)
src/pages/index/LogsTable.tsx      (таблица событий с раскрываемыми деталями)
src/pages/index/LogsPagination.tsx (постраничная навигация)
src/pages/index/LogsTypes.ts       (типы и хелперы форматирования)

# Права доступа — общие файлы с разделом AI, см. предупреждение в разделе 1 выше
backend/admin/index.py
src/lib/auth.tsx
src/pages/admin/adminShared.ts
src/pages/cabinet/CabinetServiceKeys.tsx   (новые поля LOGS_SFTP_*/LOGS_DB_URL)

# Интеграция в каркас — тоже общие файлы с разделом AI
src/App.tsx
src/pages/Index.tsx
src/pages/index/IndexMain.tsx
src/pages/index/IndexTopbar.tsx
src/pages/index/IndexSidebar.tsx
```

### 2.2. Как перенести (backend + фронтенд)

```bash
cd /var/www/era

mkdir -p backend/logs
cp update/2026-08-22/backend/logs/*.py backend/logs/
cp update/2026-08-22/backend/logs/requirements.txt backend/logs/
cp update/2026-08-22/backend/logs/tests.json backend/logs/
cp update/2026-08-22/backend/logs/RESEARCH_NOTES.md backend/logs/
cp update/2026-08-22/backend/catalog/index.py backend/catalog/index.py
cp update/2026-08-22/backend/admin/index.py backend/admin/index.py   # если ещё не скопировали в разделе 1

cp update/2026-08-22/src/lib/catalog.tsx src/lib/catalog.tsx
cp update/2026-08-22/src/lib/auth.tsx src/lib/auth.tsx               # если ещё не скопировали в разделе 1
cp update/2026-08-22/src/pages/cabinet/CabinetServers.tsx src/pages/cabinet/CabinetServers.tsx
cp update/2026-08-22/src/pages/cabinet/CabinetServiceKeys.tsx src/pages/cabinet/CabinetServiceKeys.tsx
cp update/2026-08-22/src/pages/admin/adminShared.ts src/pages/admin/adminShared.ts   # если ещё не скопировали

cp update/2026-08-22/src/pages/index/Logs*.tsx src/pages/index/
cp update/2026-08-22/src/pages/index/LogsTypes.ts src/pages/index/

cp update/2026-08-22/src/App.tsx src/App.tsx                          # если ещё не скопировали
cp update/2026-08-22/src/pages/Index.tsx src/pages/Index.tsx          # если ещё не скопировали
cp update/2026-08-22/src/pages/index/IndexMain.tsx src/pages/index/IndexMain.tsx       # если ещё не скопировали
cp update/2026-08-22/src/pages/index/IndexTopbar.tsx src/pages/index/IndexTopbar.tsx   # если ещё не скопировали
cp update/2026-08-22/src/pages/index/IndexSidebar.tsx src/pages/index/IndexSidebar.tsx # если ещё не скопировали

# миграция (замените реквизиты на свои)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET search_path TO \"ВАША_СХЕМА\", public;" \
  -f update/2026-08-22/db_migrations/V0075__add_logs_dir_and_logs_view_permission.sql

pip install -r backend/logs/requirements.txt   # paramiko уже должен быть, если применяли апдейт 6 августа
npm install
npm run build
sudo systemctl restart era-backend
```

### 2.3. Настройка после переноса (обязательно для работы через SFTP)

1. Кабинет → «Служебные ключи» → блок **«SFTP-доступ к логам»** → заполните хост, порт,
   логин, пароль SFTP-хоста, где физически лежат файлы логов игрового сервера.
2. Кабинет → «Серверы» → откройте карточку каждого игрового сервера → заполните
   **«Директория логов»** — путь вида `/logs/hfx3old` (внутри ожидаются подпапки
   `cached/`, `server/`, `npc/`).
3. Кабинет → «Команда» → выдайте право **Логи** (`logs_view`) нужным сотрудникам (по
   умолчанию есть только у владельца — раздел открывает доступ к персональным данным
   игроков: никам, торговле, действиям).

### 2.4. Опционально: self-hosted индексатор для ускоренного поиска

Это отдельная установка **НЕ через основной backend проекта**, а самостоятельный скрипт,
который запускается на хостинге, где физически лежат файлы логов (может быть тот же сервер,
что и основной backend, а может быть и другой).

```
logs-indexer/                      (вся папка — переносится ЦЕЛИКОМ на хостинг логов,
                                     НЕ в основной backend проекта)
  ├── indexer.py                   (точка входа)
  ├── schema.sql                   (SQL создания базы era_logs)
  ├── game_lookup.py, ddf_parser.py, ddf_registry.py, ddf_registry_c4.py, l2encdec.py
  │                                 (копии модулей резолва имён — используют локальный
  │                                  MinIO/S3 по умолчанию, не облачный)
  ├── action_ids_data.py
  ├── requirements.txt
  ├── .env.example                 (шаблон настроек — скопируйте в .env и заполните)
  ├── era-logs-indexer.service     (systemd unit)
  ├── era-logs-indexer.timer       (systemd таймер — запуск раз в минуту)
  └── README.md                    (подробная пошаговая инструкция установки —
                                     ПРОЧИТАЙТЕ ЕЁ ПОЛНОСТЬЮ перед установкой, там же
                                     объяснена вся архитектура со схемой)
```

Коротко порядок действий (полностью — в `logs-indexer/README.md`):
1. Создать отдельную базу `era_logs` в вашем Postgres, накатить в неё `schema.sql`.
2. Скопировать папку `logs-indexer/` на хостинг логов, поставить туда venv и зависимости
   из `requirements.txt`.
3. Заполнить `.env` (см. `.env.example`) — обязательно: `LOGS_DB_URL` (подключение к
   `era_logs`), `LOGS_ROOT` (корневая папка с логами на диске), `LOGS_SERVERS` (id серверов
   через запятую, должны совпадать с `servers.id` в основной базе проекта). Необязательно,
   но рекомендуется: `MAIN_DB_URL`/`AWS_*`/`S3_*` — для резолва имён предметов/нпс через
   дерево патчей (без них логи будут работать с числовыми id вместо имён).
4. Проверить разовый запуск (`python3 indexer.py`), затем поставить systemd-таймер
   (`era-logs-indexer.service`/`.timer`) на автозапуск раз в минуту.
5. В кабинете → «Служебные ключи» → блок **«База логов (ускоренный поиск)»** → заполните
   `LOGS_DB_URL` — тем же значением, что в `.env` индексатора (или тем, по которому основной
   backend сможет достучаться до базы `era_logs` по сети, если хостинг другой). После этого
   backend САМ переключится на чтение из базы, дополнительных действий на фронтенде не
   требуется.

По умолчанию база хранит 7 дней истории (настраивается `RETENTION_DAYS` в `.env`,
старые события чистятся автоматически при каждом запуске индексатора).

### Проверка

- Раздел «Логи» должен появиться в главном меню (только у тех, кому выдано право).
- Без индексатора: откройте «Логи», выберите сервер и небольшой диапазон дат (пара часов) —
  должны прийти события. Широкий диапазон (неделя+) будет медленным — это ожидаемо для
  SFTP-режима.
- С индексатором: после первого успешного прогона `indexer.py` тот же поиск по широкому
  диапазону должен отвечать мгновенно.

---

## 3. Мобильные правки

Более десятка точечных доработок мобильной версии, попутно сделанных при разработке
раздела AI (он получал больше всего внимания на телефоне последним) — но некоторые
затрагивают компоненты, общие для всего приложения:

- **`src/components/ui/command.tsx`** — компонент выпадающего списка с поиском (используется
  автодополнением выбора шаблонов и моделей в разделе AI, но сам компонент — общий UI-элемент
  проекта). Выделенный пункт списка красился в сплошной яркий цвет с плохо читаемым текстом
  описания поверх — заменено на мягкую заливку.
- **`src/index.css`** — добавлена анимация «печатает…» (три мигающие точки, как в мессенджерах)
  для индикатора ответа ИИ, и утилита `.scrollbar-none` для горизонтальных лент на телефоне
  (вкладки режимов раздела AI — прокручиваются пальцем без отображения полосы прокрутки,
  которая на узком экране просто съедает высоту).
- Внутри самого раздела AI (`Ai*.tsx`) — адаптация списка диалогов и композера под мобильный
  Sheet, свайп от края экрана для открытия списка чатов, автоувеличение поля ввода,
  устранение пустого пространства под полем ввода на телефоне, откат случайного удаления
  диалога через таймер с кнопкой «Вернуть» вместо мгновенного удаления без возможности
  отмены. Все эти файлы уже входят в список раздела 1 выше — отдельно копировать не нужно.

Никаких дополнительных действий, кроме переноса файлов из разделов 1 и 2 выше, эта тема не
требует — это не отдельная фича, а сопутствующие правки уже перечисленных файлов.

---

## Итоговый список миграций (применять по порядку)

```
V0075__add_logs_dir_and_logs_view_permission.sql
V0076__ai_section_permission_and_tables.sql
V0077__ai_tables_switch_to_rub_currency.sql
V0078__ai_prompt_templates_per_user.sql
V0079__ai_messages_pinned.sql
V0080__ai_document_mode_comment.sql
V0081__ai_messages_doc_spec.sql
```

⚠️ Все миграции написаны БЕЗ явного имени схемы (используют `search_path`) — обязательно
передавайте `SET search_path TO "ВАША_СХЕМА", public;` перед каждой, как в примерах выше
(или через `deploy/apply_migrations.sh` с переменной `MAIN_DB_SCHEMA`, если у вас настроен
он — см. `deploy/README.md`).

## Новые зависимости — сводка

**Python** (`deploy/requirements.txt` уже обновлён в этом апдейте):
- `openpyxl`, `python-docx` — новые, нужны разделу AI (сборка Excel/Word).
- `psycopg2-binary`, `boto3`, `paramiko` — уже были нужны раньше, доп. действий не требуют.

**npm** (`package.json` уже обновлён в этом апдейте, `npm install` подтянет сам):
- `react-markdown`, `remark-gfm` — рендер форматированных ответов ИИ-моделей.
- `react-syntax-highlighter`, `@types/react-syntax-highlighter` — подсветка кода в ответах.

## Проверено перед сборкой апдейта

- `grep -rn "poehali.dev" update/2026-08-22/ | grep -v func2url.json` — только текстовые
  пояснения в комментариях/докстроках/README про сам редактор poehali.dev, ни одного
  адреса в коде запросов. Исправлены боевые дефолты в `backend/ai/common.py`,
  `backend/logs/game_lookup.py`, `backend/admin/index.py` (были/остались на `https://
  bucket.poehali.dev` — заменены на `http://127.0.0.1:9000` + приоритет
  `S3_PUBLIC_URL`/`CDN_BASE_URL`, тот же паттерн, что в `backend/tasks/index.py`).
- `backend/dev-login` НЕ включён (dev-only, не переносится на self-hosted).
- `src/pages/Login.tsx` не менялся с прошлого апдейта (6 августа) — переносить не нужно,
  ваша уже перенесённая тогда копия без `DevOnlyLoginButton` актуальна.
- Миграции V0078–V0081 изначально содержали хардкод имени схемы редактора
  (`t_p84024572_online_game_task_man`), которого на вашем сервере не существует — убран,
  все миграции теперь полагаются на `search_path`, как остальные корректные миграции
  проекта.
- Все pip-зависимости новых функций (`backend/ai/requirements.txt`,
  `backend/logs/requirements.txt`) сверены с `deploy/requirements.txt` — недостающие
  (`openpyxl`, `python-docx`) добавлены с комментарием, какая функция их требует.
  `logs-indexer/requirements.txt` — отдельный процесс вне основного backend, свой venv,
  общего requirements.txt не касается.
