# Архитектура проекта

Онлайн-задачник для команды: доска задач (Kanban), спринты, база знаний, идеи,
FAQ, вход через Telegram-бота, админ-панель.

## Общая схема

```
┌─────────────┐      HTTP (fetch)      ┌───────────────────┐      psycopg2      ┌──────────────┐
│  Frontend   │ ─────────────────────▶ │  Backend           │ ─────────────────▶ │  PostgreSQL  │
│  React+Vite │ ◀───────────────────── │  Python Cloud Func │ ◀───────────────── │  (1 схема)   │
└─────────────┘   URL из func2url.json └───────────────────┘                     └──────────────┘
                                                │  ▲
                                                ▼  │
                                        ┌───────────────────┐        ┌──────────────┐
                                        │  Telegram Bot API │        │  S3 (файлы)  │
                                        └───────────────────┘        └──────────────┘
```

Frontend никогда не обращается к БД или секретам напрямую — только через backend по HTTP.

---

## 1. Frontend (`/src`)

### Страницы (`src/pages`)
| Файл | Назначение |
|---|---|
| `Index.tsx` | Главная доска задач (Kanban: To Do / In Progress / Done) |
| `Login.tsx` | Вход через Telegram (Login Widget или бот) |
| `Cabinet.tsx` | Личный кабинет пользователя, FAQ |
| `Admin.tsx` | Админ-панель |
| `NotFound.tsx` | 404 |

Подпапки с компонентами конкретных страниц:
- `pages/index/` — Board, Sprints, Ideas, Archive, TaskModal, CreateTaskModal, SprintCard, TaskComments, MentionInput, NotificationBell, Restart, IndexSidebar, IndexTopbar, IndexMain
- `pages/admin/` — InviteForm, UserList, SessionsModal, StatsModal

### Компоненты (`src/components`)
- `TelegramLoginButton.tsx` — вход через Telegram Login Widget
- `BotLoginButton.tsx` — вход через код + Telegram-бота
- `ProtectedRoute.tsx` — защита маршрутов (авторизация / права админа)
- `KnowledgeBase.tsx` — база знаний
- `Faq.tsx` — раздел FAQ
- `RichEditor.tsx` — WYSIWYG редактор (Tiptap)
- `ThemeToggle.tsx` — светлая/тёмная тема
- `ui/` — компоненты shadcn/ui (на базе Radix UI)

### Прочее
- `hooks/` — `use-mobile.tsx`, `use-toast.ts`
- `lib/auth.tsx` — AuthContext: пользователь, права, heartbeat активности
- `lib/catalog.tsx` — категории и серверы
- `lib/theme.tsx` — управление темой
- `lib/utils.ts` — общие хелперы

### Ключевые зависимости
React 18 + React Router 6 · TanStack Query · shadcn/ui (Radix) · Tailwind CSS ·
react-hook-form + zod · Tiptap (редактор) · recharts (графики) · Vite

---

## 2. Backend (`/backend`)

Каждая папка — отдельная Cloud Function (Python), вызывается по HTTP.
Адреса — в `backend/func2url.json`. Авторизация — заголовок `X-Auth-Token`.

| Функция | Назначение | Основные действия |
|---|---|---|
| `auth` | Сессия пользователя, статус онлайн | `me`, `team`, `login`, `logout`, `heartbeat`, `set_theme` |
| `login-code` | Коды входа через бота | `create`, `status` |
| `tg-webhook` | Webhook Telegram-бота, привязка аккаунта | `/start КОД` |
| `tasks` | Задачи: CRUD, комментарии, статусы деплоя | `list`, `get`, `create`, `update`, `delete`, `comment`, `toggle_archive`, `restart`, `update_deploy_status` |
| `sprints` | Спринты | `list`, `create`, `update`, `delete` |
| `ideas` | Обсуждение идей | `list`, `get`, `create`, `comment`, `update_status` |
| `knowledge` | База знаний + картинки в S3 | `list`, `get`, `create`, `update`, `delete`, `upload_image`, `toggle_favorite` |
| `catalog` | Категории и серверы (справочники) | `list`, `create/update/delete_category`, `create/update/delete_server` |
| `faq` | Вопросы-ответы FAQ | `list`, `create`, `update`, `delete`, `reorder` |
| `notifications` | Уведомления в приложении | `list`, `mark_read`, `mark_all`, `clear_all` |
| `admin` | Управление пользователями и правами | `invite`, `sessions`, `stats`, `set_permission`, `toggle_admin`, `toggle_active`, `impersonate` |

---

## 3. База данных (PostgreSQL)

Все таблицы находятся в одной рабочей схеме проекта.

| Таблица | Миграция | Назначение |
|---|---|---|
| `users` | V0001 | Пользователи (Telegram ID, роль, права) |
| `sessions` | V0001 | Токены сессий |
| `task_comments` | V0001 | Комментарии к задачам |
| `task_deploy_statuses` | V0001 | История статусов деплоя |
| `login_codes` | V0006 | Коды входа через бота |
| `tasks` | V0011 | Задачи доски |
| `kb_articles` | V0014 | Статьи базы знаний |
| `idea_topics` | V0017 | Темы-идеи |
| `idea_comments` | V0017 | Комментарии к идеям |
| `notifications` | V0018 | Уведомления пользователей |
| `sprints` | V0021 | Спринты |
| `task_assignment_events` | V0023 | Лог назначений (для статистики) |
| `user_activity_sessions` | V0023 | Сессии активности (время в приложении) |
| `categories` | V0026 | Категории задач/статей |
| `servers` | V0026 | Справочник игровых серверов |
| `kb_favorites` | V0027 | Избранные статьи пользователя |
| `faq_items` | V0028 | Вопросы-ответы FAQ |

Схема меняется только через миграции в `db_migrations/V{номер}__{описание}.sql`.

---

## 4. Интеграции

**Telegram-бот**
- Вход: пользователь получает 6-значный код на `/login`, отправляет боту `/start КОД`, `tg-webhook` подтверждает и создаёт сессию
- Идентификация — по реальному Telegram ID (защита от подмены username), приглашение — по белому списку username
- Уведомления о задачах и упоминаниях дублируются сообщением в Telegram

**S3-хранилище**
- Используется в `knowledge` для загрузки изображений к статьям
- Путь: `kb/{uuid}.{ext}`, отдаётся через CDN

---

## 5. Роли и права доступа

- **admin** — полный доступ ко всем разделам, управление командой и правами
- **member** — базовый доступ, права настраиваются индивидуально (JSONB `permissions` в `users`):
  `task_create`, `task_edit_own`, `task_view_others`, `task_restart`, `idea_create`, `kb_create`, `kb_edit`, `sprint_create`, `sprint_edit`

Проверка на бэкенде: активная сессия (`sessions.expires_at`) → пользователь активен (`users.is_active`) → роль/права.
На фронтенде маршруты закрыты компонентом `ProtectedRoute`.
