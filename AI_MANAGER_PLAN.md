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
- [ ] Пользователь создаёт API-ключ в личном кабинете AI Tunnel (баланс должен быть пополнен —
      при балансе 0₽ ключ создать нельзя).
- [ ] Ключ добавляется в раздел "Служебные ключи" (Кабинет → Управление проектом → Служебные
      ключи) — новое поле `AITUNNEL_API_KEY` (секретное).

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

### Этап 2 — Backend: базовый чат (текст)

- [ ] Создать `backend/ai/index.py` по стандартному паттерну (`_cors_headers`, `_current_user` по
      токену, `MAIN_DB_SCHEMA`, JSON-ответы `{'error': ...}` при ошибках).
- [ ] Проверка доступа: читать `permissions.ai_access` пользователя из БД, как это делает
      `backend/logs/index.py` для `logs_view` — иначе `403 {'error': 'forbidden'}`.
- [ ] `action=list_models` — прокси-запрос к публичному каталогу AI Tunnel
      `GET /public/aitunnel/models/chat` (ключ не нужен), с коротким in-memory или БД-кешем на
      несколько минут. Из ответа берём `prompt_cost`/`completion_cost`/`description`/
      `modalities` для UI — не хардкодим список моделей, чтобы не разъезжался с реальным
      каталогом AI Tunnel.
- [ ] `action=send_message` — принимает `chat_id` (или null для нового чата), `model`, `content`,
      `attachments`. Логика:
  1. Проверить остаток месячного лимита в `ai_usage` (`spent_rub < limit_rub`) — если исчерпан,
     вернуть `403 {'error': 'limit_exceeded'}`.
  2. Собрать историю сообщений чата (`ai_messages` по `chat_id`, в хронологии) в формат
     `messages: [{role, content}]`.
  3. Запрос к AI Tunnel: `POST https://api.aitunnel.ru/v1/chat/completions`, заголовок
     `Authorization: Bearer {AITUNNEL_API_KEY}`, тело `{model, messages, stream: true}`.
  4. Ответ сохраняется в `ai_messages`; `usage.cost_rub` из финального SSE-чанка прибавляется к
     `ai_usage.spent_rub` (`UPDATE ... SET spent_rub = spent_rub + %s`).
  5. **Таймаут функции**: облачная функция по умолчанию ограничена 5 сек (см. правило Function
     Timeout) — для стриминга это означает, что функция должна успевать открыть соединение и
     начать проксировать чанки быстро, но общая генерация может идти дольше лимита. Нужно
     проверить на практике, держит ли платформа соединение открытым дольше таймаута при активной
     передаче данных (стриминг) — если нет, пользователю потребуется вручную поднять таймаут
     функции `ai` в Ядро → Функции (см. правило про длинные операции: генерация текста/документов
     — обоснованный случай для увеличения таймаута).
- [ ] `action=list_chats` / `action=get_chat` / `action=rename_chat` / `action=delete_chat` —
      CRUD диалогов пользователя (только свои, `WHERE user_id = me.id`).
- [ ] `action=balance` — прокси `GET /v1/aitunnel/balance` для админа (общий остаток аккаунта AI
      Tunnel, отдельно от лимитов сотрудников).
- [ ] `requirements.txt`: `psycopg2-binary` (запросы к AI Tunnel — через стандартный `urllib`/
      `http.client`, отдельный SDK не нужен, т.к. это чистый REST).
- [ ] `tests.json` с базовыми проверками (`list_models` без токена → 401 и т.д.).
- [ ] `sync_backend`.

### Этап 3 — Frontend: базовый чат (текст)

- [ ] Новый раздел `'ai'` в `ViewId` (`src/pages/index/sharedTypes.ts`).
- [ ] Пункт меню в `IndexTopbar.tsx` / `IndexSidebar.tsx` — виден только при `can('ai_access')`
      (по аналогии с тем, как `logs_view` скрывает пункт "Логи").
- [ ] Новые файлы (по образцу декомпозиции `Logs.tsx` — несколько небольших компонентов):
  - `src/pages/index/Ai.tsx` — корневой компонент раздела, вся state-логика (текущий чат,
    список чатов, выбранная модель, история сообщений, отправка).
  - `src/pages/index/AiChatList.tsx` — левая колонка со списком диалогов пользователя (как в
    ChatGPT), кнопка "Новый чат", переименование/удаление.
  - `src/pages/index/AiModelPicker.tsx` — выпадающий список моделей, сгруппированный по
    провайдерам (дизайн-референс — приложенный скриншот AI Tunnel: логотип провайдера + список
    моделей, активная подсвечена). Данные — из `action=list_models`.
  - `src/pages/index/AiMessageList.tsx` — лента сообщений диалога, рендер markdown +
    подсветка кода в ответах ассистента.
  - `src/pages/index/AiComposer.tsx` — поле ввода, кнопка отправки, индикатор стриминга,
    кнопка прикрепления файла.
- [ ] Рендер markdown-ответов: добавить `react-markdown` + `remark-gfm` (в проекте пока нет —
      `Tiptap` не подходит для рендера чужого markdown-текста, он WYSIWYG-редактор для
      пользовательского ввода). Подсветка кода — `react-syntax-highlighter` или `highlight.js`.
- [ ] SSE-стриминг на фронте: `fetch` + `ReadableStream` (`response.body.getReader()`), парсить
      строки `data: {...}`, останавливаться на `data: [DONE]` — готовый пример разбора уже есть
      в документации AI Tunnel (раздел "Стриминг" в `docs/ai-tunnel-api-reference.md`), backend
      просто ретранслирует эти же чанки клиенту.
- [ ] Индикатор оставшегося месячного лимита сотрудника — небольшой виджет над полем ввода
      (`spent_rub` / `limit_rub` из `ai_usage`).

### Этап 4 — Вложения, vision, код, изображения, видео

- [ ] Загрузка файлов в чат: переиспользовать паттерн `_upload_image`/base64→S3 из
      `backend/knowledge/index.py` — новый префикс ключа `ai/{chat_id}/{uuid}.{ext}`.
  - Изображения — передаются в модель как `{type: "image_url", image_url: {url}}` (публичный
    CDN-URL из S3, не нужно кодировать в base64 второй раз) — только для моделей, у которых
    `modalities.input` содержит `image` (см. `list_models`).
  - PDF — передаются как `{type: "file", file: {filename, file_data: url}}`.
  - Видео (для понимания, не генерации) — `{type: "video_url", video_url: {url}}`.
- [ ] Режим "Помощь с кодом" (`mode=code` у чата) — отдельная вкладка/пресет в композере:
      системный промпт заточен под код-ревью/рефактор, в UI — поле для вставки блока кода с
      подсветкой языка и кнопка "скопировать результат".
- [ ] Генерация изображений — `action=generate_image` → `POST /v1/images/generations`. Backend
      декодирует `data[].b64_json`, заливает в S3 (`ai/images/{uuid}.png`), возвращает CDN-URL
      как `attachment` сообщения ассистента. `usage.cost_rub` — в `ai_usage` тем же путём.
      Параметры из UI: промпт, модель (список — `GET /public/aitunnel/models/images`),
      `aspect_ratio`/`resolution` (простой выбор пресетов, не сырой пиксельный размер).
      Редактирование существующей картинки (image-to-image) — тот же action с доп. полем
      `input_references` (ссылка на уже загрученный в чат файл).
- [ ] Генерация видео — `action=generate_video` → `POST /v1/videos`, сохраняет `job_id` и
      `job_status='pending'` в `ai_messages`. Отдельный `action=check_video_job` — фронт
      поллит его каждые несколько секунд, пока `pending`; при `completed` backend скачивает
      MP4 через `GET /v1/videos/{id}/content?index=0`, заливает в S3, обновляет сообщение.
      **Важно предупредить пользователя в UI**: отмены задачи нет, деньги списываются сразу при
      старте генерации независимо от результата.

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