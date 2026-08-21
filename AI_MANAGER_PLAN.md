# Раздел "AI" — план разработки

Новый раздел трекера "Эра" для общения сотрудников с LLM-моделями (текст, изображения, видео,
код) через единый API-ключ [AI Tunnel](https://aitunnel.ru) — российский OpenAI-совместимый
прокси ко всем провайдерам (OpenAI, Anthropic, Google, DeepSeek, Qwen, Meta Llama, Mistral, xAI,
Moonshot AI, Z AI, MiniMax, Perplexity, Xiaomi, ByteDance Seed, Aion Labs, Sber и др.), оплата в
рублях, без VPN.

Этот файл — контекст для дальнейшей разработки. Обновляется по мере продвижения по этапам
(отмечать `[x]` у выполненных пунктов). Полный текст официальной документации API сохранён в
`docs/ai-tunnel-api-reference.md` — сверяться с ним при написании кода backend-функции.

## Требования (зафиксировано с пользователем)

- **Доступ**: отдельное право `ai_access` в системе прав (как `logs_view`) — включается точечно
  каждому сотруднику через Кабинет → Команда, не по умолчанию всем.
- **Функции**: текстовый чат с выбором модели, генерация изображений, генерация видео, загрузка
  файлов/картинок в чат (vision), отдельный режим помощи с кодом.
- **Бюджет**: у каждого сотрудника — свой месячный лимит трат в рублях, админ видит расход по
  всем сотрудникам.
- **История**: несколько сохранённых диалогов на пользователя, как в ChatGPT (список чатов слева,
  переключение между ними).
- **Модели**: широкий список лучших моделей каждого провайдера, включая PRO-версии (см. раздел
  "Список моделей" ниже).
- **Интеграция**: отдельный независимый раздел меню, без связи с карточками задач.

## Факты об AI Tunnel API (подтверждено документацией)

- **Base URL**: `https://api.aitunnel.ru/v1`
- **Авторизация**: заголовок `Authorization: Bearer sk-aitunnel-xxx`
- **Формат**: полностью OpenAI-совместимый (Chat Completions API) — работает с официальными SDK.
- **Валюта и стоимость**: цены и списания — **в рублях**. Каждый ответ API (чат/картинки/видео)
  содержит объект `usage` с готовыми полями `cost_rub` (сколько списано за этот запрос) и
  `balance` (остаток баланса аккаунта после списания) — **считать стоимость самим не нужно**,
  просто читать и суммировать `usage.cost_rub` из ответов.
- **Каталог моделей — публичный, без ключа**: `GET https://api.aitunnel.ru/public/aitunnel/models`
  (и `/chat`, `/images`, `/videos` — фильтр по группе). Возвращает актуальные цены
  (`prompt_cost`/`completion_cost` за 1М токенов, либо `min_price_per_image`/`max_price_per_image`,
  либо цену за секунду видео), контекст, `modalities.input`/`output` (есть ли `image`/`video`/
  `file` на входе — так определяем какие модели показывать в vision-режиме). CORS открыт, можно
  дёргать прямо с фронта, но правильнее — прокси через backend, чтобы не размножать сетевые
  вызовы и закешировать на бэке на несколько минут.
- **Баланс аккаунта**: `GET https://api.aitunnel.ru/v1/aitunnel/balance` (с ключом) →
  `{"balance": 4999.55, "budget": 850.0}`. Полезно показать админу общий остаток на аккаунте
  AI Tunnel (не путать с лимитом отдельного сотрудника — это разные вещи).
- **Ключи AI Tunnel умеют бюджет "из коробки"**: при создании ключа в кабинете AI Tunnel можно
  задать бюджет — при исчерпании запросы с этим ключом отклоняются, даже если на аккаунте есть
  деньги. Однако управление ключами доступно только через дашборд AI Tunnel (API для
  программного создания ключей в документации не описан) — поэтому лимиты по сотрудникам всё
  равно ведём **на своей стороне** (таблица `ai_usage`), один общий `AITUNNEL_API_KEY` на весь
  проект. Это также проще эксплуатационно — не нужно просить пользователя создавать ключ на
  каждого нового сотрудника вручную в чужом кабинете.
- **Чат**: `POST /chat/completions`, тело `{model, messages, stream}` — формат сообщений и ответа
  1:1 с OpenAI (`choices[].message.content`, при `stream:true` — `choices[].delta.content`).
  Модель `"auto"` — AI Tunnel сам подбирает модель под задачу.
- **Стриминг**: `stream: true` → Server-Sent Events (`data: {...}\n\n`, конец — `data: [DONE]`).
  `usage` (с `cost_rub`/`balance`) приходит **один раз, в последнем чанке**, перед `[DONE]`.
  Работает для всех моделей одинаково.
- **Vision (картинки во входе)**: обычный `POST /chat/completions`, в `content` сообщения —
  массив с `{type: "image_url", image_url: {url}}`, `url` — публичный HTTP(S)-адрес **или**
  `data:image/jpeg;base64,...`. Рекомендация AI Tunnel — сначала текстовая часть, потом картинки
  в том же сообщении.
- **Видео во входе (понимание видео)**: аналогично, `{type: "video_url", video_url: {url}}`.
- **PDF/файлы во входе**: `{type: "file", file: {filename, file_data}}`, `file_data` — URL или
  `data:application/pdf;base64,...`.
- **Генерация изображений**: `POST /v1/images/generations`, тело `{model, prompt, n?, resolution?,
  aspect_ratio?, size?, quality?, output_format?, background?, seed?, input_references?}` —
  **синхронный** запрос, результат сразу в ответе. `input_references` (массив `{type: "image_url",
  image_url:{url}}`) превращает генерацию в image-to-image редактирование референсных картинок
  тем же эндпоинтом. Есть также `POST /v1/images/edits` — multipart/form-data аналог для приёма
  файла напрямую (`image=@photo.png`), под капотом то же самое.
  **Важно**: результат всегда возвращается как `data[].b64_json` (base64), прямых URL нет —
  декодировать и заливать в S3 самим.
- **Генерация видео**: **асинхронный** трёхшаговый процесс (официальный OpenAI SDK его не
  поддерживает — нужен обычный HTTP-клиент):
  1. `POST /v1/videos` `{model, prompt, size?, duration?, ...}` → `{id, polling_url, status:
     "pending"}`.
  2. Поллинг `GET /v1/videos/{id}` до `status: "completed"` (или `"failed"`).
  3. Скачивание `GET /v1/videos/{id}/content?index=0` → бинарник MP4.
  **Отмены задач нет** — провайдер списывает деньги сразу при старте генерации, независимо от
  того, дождались вы результата или нет.
- **Ошибки**: JSON `{"error": {"code": ..., "message": ...}}`, коды в целом совпадают с HTTP
  статусами (400 неверные параметры/модель, 401 неверный ключ, 402 нехватка баланса, 403 модель
  не разрешена для ключа/IP, 429 rate limit).

## Архитектура

```
Frontend (src/pages/index/Ai*.tsx)
   │  HTTP (fetch, включая SSE-стриминг)
   ▼
Backend (backend/ai/index.py)
   │  proxy → AI Tunnel API (api.aitunnel.ru, OpenAI-совместимый)
   │  psycopg2 → таблицы ai_chats / ai_messages / ai_usage
   │  boto3 → S3 (загруженные пользователем файлы, сгенерированные картинки/видео)
   ▼
AI Tunnel API — единый ключ AITUNNEL_API_KEY в service_keys, оплата в рублях
```

Ключевое архитектурное решение: **сервер — единственный, кто видит `AITUNNEL_API_KEY`**.
Frontend никогда не обращается к AI Tunnel напрямую — только через backend-функцию `ai`, которая
проксирует запрос, читает готовую стоимость из `usage.cost_rub` ответа AI Tunnel и прибавляет её
к месячному расходу сотрудника в своей таблице `ai_usage`.

## Этапы разработки

### Этап 0 — Подготовка ✅ (частично)

- [x] Изучена документация AI Tunnel (сохранена в `docs/ai-tunnel-api-reference.md`).
- [x] Поле для ключа добавлено в раздел "Служебные ключи" (`CabinetServiceKeys.tsx`, карточка
      "Доступ к AI Tunnel", ключ `AITUNNEL_API_KEY`, секретное поле).
- [ ] Пользователь создаёт API-ключ в личном кабинете AI Tunnel (баланс должен быть пополнен —
      при балансе 0₽ ключ создать нельзя) и вводит его в этот раздел кабинета.

### Этап 1 — Права доступа и БД ✅ Выполнено

- [x] Миграции `V0076__ai_section_permission_and_tables.sql` +
      `V0077__ai_tables_switch_to_rub_currency.sql`:
  - Добавлено `ai_access` в `ALL_PERMISSIONS`/`PRIVILEGED_PERMISSIONS` (`backend/admin/index.py`)
    и `PermissionKey` (`src/lib/auth.tsx`), по аналогии с `logs_view` — выдаёт (в UI Кабинет →
    Команда) только владелец проекта, т.к. право открывает доступ к платному внешнему сервису.
    Добавлена группа "AI" в `OWNER_ONLY_PERMISSION_GROUPS` (`src/pages/admin/adminShared.ts`).
  - Выдано `ai_access: true` владельцу проекта (`id = 1`), как это сделано для `logs_view` в
    `V0075`.
  - Созданы таблицы (актуальная структура в БД):
    ```sql
    CREATE TABLE ai_chats (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL DEFAULT 'Новый чат',
        mode TEXT NOT NULL DEFAULT 'chat',   -- chat | image | video | code
        model TEXT NOT NULL,
        pinned BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE ai_messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER NOT NULL REFERENCES ai_chats(id),
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        attachments JSONB,        -- [{name,url,contentType,size}] — файлы/картинки/видео
        model TEXT,               -- модель, которой сгенерирован ответ (для assistant)
        cost_rub NUMERIC(10,5),   -- из usage.cost_rub ответа AI Tunnel
        job_id TEXT,              -- id асинхронной задачи видео (POST /v1/videos), пока не done
        job_status TEXT NOT NULL DEFAULT 'done' CHECK (job_status IN ('pending','done','failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE ai_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        month DATE NOT NULL,             -- первое число месяца, для группировки трат
        spent_rub NUMERIC(10,2) NOT NULL DEFAULT 0,
        limit_rub NUMERIC(10,2) NOT NULL DEFAULT 300,   -- лимит сотрудника по умолчанию, ₽/мес
        UNIQUE(user_id, month)
    );
    ```
  - `ai_usage.limit_rub` редактируется админом за сотрудника (аналог `specialization` в
    `UserList.tsx`) — конкретный интерфейс см. Этап 5 (пока не реализован).
  - Примечание: FK-колонки без `ON DELETE CASCADE` (ограничение инструмента миграций в этом
    окружении не даёт использовать `DELETE`-семантику) — при удалении пользователя/чата чистить
    зависимые записи нужно будет вручную в коде backend или отдельной миграцией позже.
- [x] `sync_backend` — функция `admin` задеплоена, тесты пройдены (4/4).

### Этап 2 — Backend: базовый чат (текст) ✅ Выполнено

- [x] Создан `backend/ai/index.py` по стандартному паттерну (`_cors_headers`, `_current_user` по
      токену, `MAIN_DB_SCHEMA`, JSON-ответы `{'error': ...}` при ошибках).
- [x] Проверка доступа: читает `permissions.ai_access` пользователя из БД (как `logs_view`) —
      иначе `403 {'error': 'forbidden'}`.
- [x] `action=list_models` — прокси-запрос к публичному каталогу AI Tunnel
      `GET /public/aitunnel/models/{group}` (chat/images/videos, ключ не нужен), с in-memory
      кешем на 10 минут (`_MODELS_CACHE`). Отдаёт сырой ответ AI Tunnel как есть — фронт сам
      решает, что показывать.
- [x] `action=send_message` — принимает `chatId` (или отсутствует — создаёт новый чат), `model`,
      `content`. Логика реализована как в плане: проверка `spent_rub < limit_rub` → 403
      `limit_exceeded`, сборка истории (последние `MAX_HISTORY_MESSAGES=30` сообщений чата) →
      `POST /chat/completions` → сохранение обоих сообщений в `ai_messages` → прибавление
      `usage.cost_rub` к `ai_usage.spent_rub`.
  - **Важное отступление от исходного плана**: реализовано **без** `stream: true` — обычный
    request/response, а не SSE-проксирование. Причина: 5-секундный таймаут облачной функции по
    умолчанию не позволяет надёжно держать долгий стрим для медленных моделей — надёжнее
    дождаться полного ответа AI Tunnel на бэкенде и одним куском отдать клиенту. **Если ответы
    медленных моделей будут превышать таймаут — пользователю нужно будет вручную поднять таймаут
    функции `ai`** в Ядро → Функции (Настройки функции). Стриминг на фронте (эффект
    "печатающегося" текста) можно сделать позже чисто визуально — либо вернуться к реальному SSE
    отдельным этапом, если платформа окажется способна проксировать поток дольше таймаута.
- [x] `action=list_chats` / `get_chat` / `rename_chat` / `set_pinned` / `delete_chat` — CRUD
      диалогов пользователя (только свои, `WHERE user_id = me.id`).
- [x] `action=usage` — остаток месячного лимита текущего пользователя.
- [x] `action=balance` — прокси `GET /v1/aitunnel/balance`, доступен только при
      `team_manage`/`admin` (общий остаток аккаунта AI Tunnel, отдельно от лимитов сотрудников).
- [x] `requirements.txt`: `psycopg2-binary` (запросы к AI Tunnel — через стандартный
      `urllib.request`, без сторонних SDK, как и в `backend/tg-webhook/index.py`).
- [x] `tests.json` с базовыми проверками (401 без токена на `list_chats`/`send_message`).
- [x] `sync_backend` — функция `ai` задеплоена, тесты пройдены (3/3),
      URL зарегистрирован в `func2url.json`.

### Этап 3 — Frontend: базовый чат (текст) ✅ Выполнено

- [x] Новый раздел `'ai'` в `ViewId` (`src/pages/index/sharedTypes.ts`).
- [x] Пункт меню в `IndexTopbar.tsx` (десктоп-нав и мобильное Sheet-меню) — виден только при
      `can('ai_access')`, по аналогии с `logs_view`.
- [x] Новые файлы (декомпозиция по образцу `Logs.tsx`):
  - `src/pages/index/Ai.tsx` — корневой компонент, вся state-логика (текущий чат, список чатов,
    выбранная модель, история сообщений, отправка, месячный лимит).
  - `src/pages/index/AiTypes.ts` — общие типы (`AiChatSummary`/`AiMessage`/`AiModelsMap`/
    `AiUsage`), словарь `PROVIDER_LABELS` для группировки моделей по провайдерам в UI.
  - `src/pages/index/AiChatList.tsx` — левая колонка со списком диалогов (как в ChatGPT): кнопка
    "Новый чат", закрепление, инлайн-переименование, удаление.
  - `src/pages/index/AiModelPicker.tsx` — выпадающий список моделей на базе `Command`/`Popover`
    (shadcn), группировка по провайдерам с человекочитаемыми названиями, поиск, пункт "Авто —
    ИИ сам подберёт модель". Данные — из `action=list_models`.
  - `src/pages/index/AiMessageList.tsx` — лента сообщений, рендер markdown (`react-markdown` +
    `remark-gfm`) с подсветкой кода (`react-syntax-highlighter`, тема `atomDark`) и кнопкой
    "Копировать" на блоках кода.
  - `src/pages/index/AiComposer.tsx` — поле ввода (Enter — отправить, Shift+Enter — новая
    строка), индикатор "Модель думает…", полоса расхода месячного лимита, блокировка при его
    исчерпании.
- [x] Установлены зависимости: `react-markdown`, `remark-gfm`, `react-syntax-highlighter` (типы
      `@types/react-syntax-highlighter`) — через `package_manager`, не вручную.
- [x] **Отступление от исходного плана — без SSE-стриминга на фронте**: т.к. Этап 2 backend
      реализован без потокового проксирования (см. примечание там), фронт просто ждёт обычный
      JSON-ответ `send_message` и показывает спиннер "Модель думает…" вместо печатающегося
      текста. Если backend позже перейдёт на реальный SSE — `AiComposer`/`Ai.tsx` потребуется
      доработать под построчный разбор потока (пример кода уже есть в
      `docs/ai-tunnel-api-reference.md`, раздел "Стриминг").
- [x] Индикатор оставшегося месячного лимита — полоса прогресса в `AiComposer.tsx`
      (`spentRub`/`limitRub` из `action=usage`), блокирует отправку при исчерпании.
- [x] Проверено вживую: `list_chats`/`usage`/`list_models` возвращают реальные данные через
      backend (публичный каталог AI Tunnel отдаёт живой список моделей без ключа), `send_message`
      корректно возвращает `aitunnel_not_configured` до того, как пользователь заполнит ключ в
      "Служебных ключах" (Этап 0 — ключ ещё не введён пользователем).

### Этап 4 — Вложения, vision, код, изображения, видео ✅ Выполнено

- [x] Загрузка файлов в чат: `action=upload_attachment` в `backend/ai/index.py` — тот же паттерн
      base64→S3, что `_upload_image` в `backend/knowledge/index.py`, префикс ключа
      `ai/uploads/{uuid}.{ext}`. Лимит 30 МБ на файл (`MAX_UPLOAD_SIZE`).
  - Изображения — при отправке сообщения (`send_message`) backend сам собирает multi-part
    `content` (`{type:"image_url", image_url:{url}}`) из вложений с `image/*` в
    `_history_row_to_message` — CDN-URL из S3 передаётся напрямую в AI Tunnel, без повторного
    base64. Не-картиночные вложения (PDF и др.) пока сохраняются к сообщению, но НЕ
    подставляются в `content` как `{type:"file"}` — сознательно упрощено для первой версии.
  - Фронт: кнопка-скрепка в `AiComposer.tsx` → `input[type=file]` → `upload_attachment` →
    превью прикреплённых файлов над полем ввода, можно открепить перед отправкой.
- [x] Режим "Помощь с кодом" — вкладка `code` в переключателе режимов раздела (`MODE_TABS` в
      `AiTypes.ts`, использует ту же группу моделей `chat`). Backend подставляет системный
      промпт `CODE_SYSTEM_PROMPT` первым сообщением, только когда `chat.mode == 'code'`.
- [x] Генерация изображений — вкладка `image`, свой композер `AiGenerateComposer.tsx` (промпт +
      выбор соотношения сторон). `action=generate_image` → `POST /images/generations`, backend
      декодирует `data[].b64_json`, заливает в S3 (`ai/images/{uuid}.{ext}`), возвращает как
      `attachment` сообщения ассистента. `usage.cost_rub` — в `ai_usage` тем же путём.
      **Не реализовано (сознательно, вне первой версии)**: image-to-image редактирование через
      `input_references`.
- [x] Генерация видео — вкладка `video`, тот же `AiGenerateComposer.tsx` (промпт + длительность).
      `action=generate_video` → `POST /videos`, сохраняет `job_id`+`job_status='pending'` в
      `ai_messages`, отвечает мгновенно (сам запуск задачи быстрый, ~3 сек). Фронт (`Ai.tsx`,
      `useEffect`+`setInterval`) поллит `action=check_video_job` раз в 6 секунд для каждого
      сообщения в статусе `pending`; при `completed` backend скачивает MP4 через
      `GET /videos/{id}/content?index=0`, заливает в S3, обновляет сообщение и списывает
      `cost_rub`. **Предупреждение показано в UI** (`AiGenerateComposer.tsx`): отмены нет, деньги
      списываются сразу при старте.
- [x] **Важное открытие при живом тестировании — таймаут функции**: с реальным ключом AI Tunnel
      (пользователь уже его настроил) обычный текстовый чат укладывается в 3 секунды и работает
      стабильно. Но **генерация изображений и vision-запросы (сообщения с картинками) стабильно
      упираются в 504 `execution timeout exceeded`** — эти операции у AI Tunnel медленнее
      5-секундного лимита функции по умолчанию. Генерация видео не страдает (сам запуск задачи
      асинхронный и быстрый, ожидание результата вынесено в отдельный поллинг). **Пользователю
      нужно вручную поднять таймаут функции `ai`** (Ядро → Функции → `ai` → Настройки) минимум до
      20-30 секунд, чтобы генерация изображений и запросы с картинками в чате не падали по
      таймауту — это обоснованный случай согласно правилу Function Timeout (медленная сторонняя
      интеграция).

### Этап 5 — Бюджеты и админ-контроль

- [ ] Кабинет → Команда: в карточке сотрудника (`UserList.tsx`) — новое поле "Лимит на AI (₽/мес)"
      рядом с существующим полем специализации, редактируется по тому же паттерну
      inline-редактирования (`editSpecId`/`saveSpec` → по аналогии `editAiLimitId`/`saveAiLimit`).
- [ ] Новый раздел в Кабинете (или вкладка внутри "Команда") — общая статистика трат по всем
      сотрудникам за месяц: таблица `сотрудник | потрачено ₽ | лимит ₽ | % использования`, плюс
      общий остаток баланса аккаунта AI Tunnel (`action=balance`) — доступна при
      `team_manage`/`admin`.
- [ ] На стороне пользователя в разделе AI — счётчик "Потрачено X из Y ₽ в этом месяце",
      блокировка отправки при достижении лимита с понятным сообщением.
- [ ] `backend/admin/index.py`: `action=set_ai_limit` (по аналогии с `set_permissions`) —
      только для `team_manage`/`admin`.

### Этап 6 — Полировка

- [ ] Обработка ошибок AI Tunnel (`error.code`/`error.message` из ответа — 400 неверная модель,
      401 неверный ключ, 402 нехватка баланса аккаунта, 429 rate limit) — понятные тексты ошибок
      на русском, по паттерну `ERROR_MESSAGES` в `Logs.tsx`.
- [ ] Пустые состояния (нет ни одного чата, `ai_access` не выдан).
- [ ] Мобильная адаптация (список чатов уезжает в Sheet, как боковое меню в `Cabinet.tsx`).
- [ ] Опционально: закрепление избранных диалогов (`ai_chats.pinned`), поиск по истории чатов.

## Список моделей (черновой, для Этапа 2 — `list_models`)

Финальный список и точные ID моделей формируются **динамически** из `GET
/public/aitunnel/models/chat` (Этап 2) — ниже только ориентир по провайдерам/классам моделей для
UI-группировки (повторяет интерфейс AI Tunnel — см. приложенный скриншот):

- **OpenAI** — топовая линейка GPT (текст + vision), облегчённая версия для быстрых задач,
  рассуждающая o-серия, GPT Image (генерация изображений)
- **Anthropic** — Claude (Opus/Sonnet/Haiku — баланс "мощность/цена"), все — vision + код
- **Google** — Gemini Pro/Flash (vision, большой контекст), Veo (видео)
- **DeepSeek** — V-серия (общего назначения) и R-серия (рассуждающая, сильна в коде)
- **Qwen** — топовая линейка + отдельная кодовая модель (Coder)
- **Meta Llama** — крупные open-weight модели
- **Mistral** — топовая модель + Codestral (код)
- **xAI** — Grok
- **Moonshot AI** — Kimi
- **Perplexity** — Sonar (модели с веб-поиском в реальном времени — полезно для ресёрча)
- Остальные провайдеры со скриншота (Z AI, MiniMax, Xiaomi, ByteDance Seed, Aion Labs, Sber) —
  добавляются автоматически, т.к. список тянется из живого каталога, без ручной поддержки.
- **Модель `auto`** — AI Tunnel сам подбирает модель под сложность запроса и баланс цены/качества,
  имеет смысл предложить как вариант по умолчанию для сотрудников, которые не хотят разбираться.

Изображения — модели из `/public/aitunnel/models/images` (GPT Image, Seedream, Flux и др.).
Видео — модели из `/public/aitunnel/models/videos` (Veo, Sora, Seedance, Wan и др., через
асинхронный эндпоинт).

## Закрытые вопросы (были открытыми, подтверждены документацией)

- ✅ Base URL и все нужные пути — см. раздел "Факты об AI Tunnel API" выше.
- ✅ Стоимость запроса приходит готовая в `usage.cost_rub` — считать самим не нужно.
- ✅ SSE-стриминг работает одинаково для всех моделей, `usage` — в последнем чанке.

## Остаются на практике (проверить при реализации Этапа 2)

- Держит ли платформа облачных функций соединение открытым на весь SSE-стрим дольше 5 сек, или
  придётся заранее просить пользователя поднять таймаут функции `ai`.
- Конкретные ID моделей могут поменяться на стороне AI Tunnel — поэтому в Этапе 2 сознательно
  выбран динамический каталог, а не хардкод.