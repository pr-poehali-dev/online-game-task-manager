# Обновления от 30 июля

Главная тема — полноценное **редактирование игровых `.dat`-файлов клиента**
прямо в разделе «Патчи» (названия и описания предметов, скиллов, нпс,
брони, оружия и десятков других файлов, для C4 и HF-серверов), плюс защита
приватных сообщений в комментариях к задачам и новая привилегия, которую
может выдавать только руководитель проекта.

Краткое содержание:
1. **Новое:** редактор `.dat`-файлов клиента в разделе «Патчи» — поиск,
   просмотр и правка записей без стороннего софта
2. **Новое:** подсказки с описанием назначения каждого файла/папки клиента
   в дереве «Патчей» — редактировать может только руководитель
3. Исправление: приватные заметки теперь можно оставить к комментарию без
   собственного текста комментария
4. Новая привилегия «Просмотр чужих приватных сообщений» — выдавать её
   может только руководитель проекта, не любой администратор
5. ⚠️ Новая **системная** зависимость на сервере — библиотека `libgmp-dev`
   (для быстрого шифрования больших `.dat`-файлов), см. раздел 6

---

## 1. Редактор `.dat`-файлов клиента в разделе «Патчи»

### Что добавлено
Раньше раздел «Патчи» умел только загружать/скачивать файлы целиком.
Теперь для текстовых `.dat`-файлов клиента (там, где хранятся названия и
описания предметов, скиллов, нпс, квестов, брони, оружия и т.д. — всего
свыше 80 разных файлов клиента, включая самые сложные форматы вроде
`armorgrp.dat`/`weapongrp.dat`/`npcgrp.dat`) добавлен полноценный
редактор прямо в интерфейсе:

- **Поиск** записи по названию/описанию или по точному ID (`id=123`)
- **Просмотр диапазона** записей по ID одной таблицей с редактированием
  прямо в ячейках
- **Создание** одной новой записи или **списком** (вставка нескольких
  строк сразу, например из Excel)
- **Дублирование** и **удаление** существующей записи
- Для файлов со сложной внутренней структурой (список моделей/текстур,
  материалов рецепта и т.п.) — редактирование всей записи целиком одной
  строкой с подписанными колонками
- Порядок записей по ID поддерживается автоматически при создании и
  редактировании (новая запись встаёт на своё место, а не в конец файла)
- Защита от создания дублирующегося ID

Работает одинаково для серверов **C4x1** и **HFx3 old / HF new** —
до этого обновления редактирование сложных файлов (модели/текстуры/
рецепты) было доступно только на C4-сервере.

Кто угодно из авторизованных участников может искать и просматривать
записи. Создавать, редактировать, удалять записи и создавать/дублировать
их могут только администраторы и участники с правом полного
редактирования задач (как и остальные действия в «Патчах»).

### Файлы для переноса
```
backend/patches/ddf_parser.py       (НОВЫЙ файл)
backend/patches/ddf_raw.py          (НОВЫЙ файл)
backend/patches/ddf_registry.py     (НОВЫЙ файл)
backend/patches/ddf_registry_c4.py  (НОВЫЙ файл)
backend/patches/index.py
backend/patches/l2encdec.py
backend/patches/requirements.txt
backend/patches/tests.json
src/pages/index/Patches.tsx
src/pages/index/PatchesTreeFolder.tsx
src/pages/index/PatchesDdfBulkPanel.tsx      (НОВЫЙ файл)
src/pages/index/PatchesDdfCreatePanel.tsx    (НОВЫЙ файл)
src/pages/index/PatchesDdfEditor.tsx         (НОВЫЙ файл)
src/pages/index/PatchesDdfRangePanel.tsx     (НОВЫЙ файл)
src/pages/index/PatchesDdfRawPanel.tsx       (НОВЫЙ файл)
src/pages/index/PatchesDdfSearchPanel.tsx    (НОВЫЙ файл)
src/pages/index/PatchesDdfViewPanel.tsx      (НОВЫЙ файл)
src/pages/index/patchesDdfShared.ts          (НОВЫЙ файл)
src/pages/index/patchesUtils.ts
src/pages/index/useDdfBulk.ts        (НОВЫЙ файл)
src/pages/index/useDdfCreate.ts      (НОВЫЙ файл)
src/pages/index/useDdfRange.ts       (НОВЫЙ файл)
src/pages/index/useDdfRow.ts         (НОВЫЙ файл)
src/pages/index/useDdfSearch.ts      (НОВЫЙ файл)
```

> Обратите внимание: файл `src/pages/index/patchesApi.ts` (уже был перенесён
> в обновлении от 21 июля) **не менялся** — переносить его заново не нужно,
> он уже должен быть на вашем сервере.

### Важно: новая системная зависимость (см. раздел 6)
`backend/patches/requirements.txt` теперь включает пакет `gmpy2` — он
ускоряет шифрование больших `.dat`-файлов примерно в 7 раз (без него
сохранение файла вроде `skillname-e.dat` может занимать заметно дольше).
Пакет **опционален** — если его не удастся установить, код автоматически
использует более медленный запасной вариант на чистом Python, ничего не
сломается. Но для быстрой работы рекомендуется поставить системную
библиотеку `libgmp-dev` перед установкой Python-зависимостей — подробности
в разделе 6 ниже.

### Проверка
- Откройте «Патчи», выберите сервер, найдите в дереве любой `.dat`-файл
  (например `System/itemname-e.dat`) — рядом должна появиться иконка
  редактирования текста.
- Откройте его, найдите любой предмет по названию — должна открыться
  форма с полями, доступными для правки.
- Попробуйте найти запись по точному ID (`id=1`) — должна найтись ровно
  одна запись, а не все, где ID «содержит» единицу.
- Откройте `System/armorgrp.dat` или `System/weapongrp.dat` — записи
  должны открываться в текстовом виде (сложная структура), без ошибок.
- На сервере HFx3 old/HF new повторите то же самое для `armorgrp.dat`,
  `etcitemgrp.dat`, `weapongrp.dat`, `npcgrp.dat`, `recipe-c.dat`,
  `vehiclepartsgrp.dat`, `mantleexception.dat` — раньше эти файлы вообще
  не поддерживались на HF, теперь должны открываться и редактироваться
  так же, как на C4.

---

## 2. Подсказки с описанием файлов и папок клиента

### Что добавлено
Рядом с каждым файлом и папкой в дереве «Патчей» появилась маленькая
иконка ⓘ — при наведении показывает всплывающую подсказку с описанием,
для чего этот файл или папка нужны в игровом клиенте (например
`itemname-e.dat` -> «Имена и описания предметов»). Справочник встроен
в код и покрывает более 80 файлов и все стандартные папки.

Дополнительно **руководитель проекта** может редактировать или добавлять
свои собственные описания прямо в этой же всплывающей подсказке — они
сохраняются в базе данных и автоматически подставляются вместо/вместе со
встроенными. Любой другой администратор видит те же подсказки, но кнопки
редактирования у него нет — сервер в любом случае не даст сохранить
изменение не от имени руководителя, даже в обход интерфейса.

> **Кто «руководитель»:** первый зарегистрированный администратор проекта
> (аккаунт с `id = 1` в таблице `users`). Если хотите назначить другого
> пользователя — единственное место, где это нужно поменять на сервере,
> это константа `OWNER_USER_ID` в самом верху файла `backend/patches/index.py`
> (и в `backend/admin/index.py`, см. раздел 4 ниже — там та же константа,
> используется для отдельной привилегии).

### Файлы для переноса
```
backend/patches/index.py                       (входит в список раздела 1)
src/pages/index/patchesFileDescriptions.ts     (НОВЫЙ файл)
src/pages/index/useDdfFileDescriptions.ts      (НОВЫЙ файл)
src/pages/index/PatchesTreeFolder.tsx          (входит в список раздела 1)
```

### Миграция БД
```
db_migrations/V0059__create_patch_file_descriptions.sql
```

### Проверка
- В дереве «Патчей» рядом с любым файлом должна быть маленькая иконка ⓘ —
  наведите курсор, должна появиться подсказка с описанием.
- Войдите под аккаунтом руководителя (id=1) — в подсказке должна быть
  кнопка «Изменить»/«Добавить описание». Измените текст, сохраните —
  подсказка должна обновиться сразу у всех участников.
- Войдите под любым другим администратором — кнопки редактирования быть
  не должно, только текст подсказки.

---

## 3. Приватная заметка к комментарию без текста

### Что было не так
Если пользователь хотел оставить приватную заметку (видна только автору
и адресату) к новому комментарию, но не хотел писать публичный текст
самого комментария — форма отказывалась отправлять пустой комментарий.

### Что исправлено
Комментарий теперь можно отправить пустым (без текста и вложений), если
к нему сразу прикрепляется приватная заметка — заметке в этом случае
достаточно самого факта существования комментария, к которому она
привязана.

### Файлы для переноса
```
backend/tasks/index.py
backend/tasks/tests.json
src/pages/index/TaskComments.tsx
```

### Проверка
- Откройте любую задачу, в поле комментария оставьте только приватную
  заметку (без текста самого комментария) и отправьте — должно пройти
  без ошибки «Комментарий не может быть пустым».

---

## 4. Привилегия «Просмотр чужих приватных сообщений» — только у руководителя

### Что изменилось
Право «Просмотр чужих приватных сообщений» (`Ядро -> Команда -> права
участника`) теперь может выдавать или отзывать **только руководитель
проекта** (тот же аккаунт `id = 1`, см. раздел 2) — не любой
администратор с доступом к разделу «Команда». Остальные администраторы
по-прежнему видят этот пункт в списке прав, но чекбокс у них заблокирован
(disabled) с пометкой «только руководитель». Даже если запрос на смену
этого права отправить в обход интерфейса — сервер его отклонит с ошибкой
`owner_only_permission`.

Все остальные права участников (создание задач, идей, статей и т.д.)
по-прежнему может менять любой администратор — ограничение касается
только этой одной привилегии.

### Файлы для переноса
```
backend/admin/index.py
src/pages/Admin.tsx
src/pages/admin/UserList.tsx
src/pages/admin/adminShared.ts
```

### Проверка
- Войдите под аккаунтом руководителя (id=1), откройте права любого
  участника — чекбокс «Просмотр чужих приватных сообщений» должен быть
  активен, изменения должны сохраняться.
- Войдите под другим администратором, откройте права любого участника —
  тот же чекбокс должен быть заблокирован (серый, с пометкой «только
  руководитель»), остальные права должны редактироваться как обычно.

---

## 5. Как перенести

```bash
cd /var/www/era   # корень вашего проекта на сервере

# Backend - раздел «Патчи» (новый редактор .dat-файлов)
cp update/2026-07-30/backend/patches/ddf_parser.py backend/patches/ddf_parser.py
cp update/2026-07-30/backend/patches/ddf_raw.py backend/patches/ddf_raw.py
cp update/2026-07-30/backend/patches/ddf_registry.py backend/patches/ddf_registry.py
cp update/2026-07-30/backend/patches/ddf_registry_c4.py backend/patches/ddf_registry_c4.py
cp update/2026-07-30/backend/patches/index.py backend/patches/index.py
cp update/2026-07-30/backend/patches/l2encdec.py backend/patches/l2encdec.py
cp update/2026-07-30/backend/patches/requirements.txt backend/patches/requirements.txt
cp update/2026-07-30/backend/patches/tests.json backend/patches/tests.json

# Backend - приватные заметки к пустому комментарию
cp update/2026-07-30/backend/tasks/index.py backend/tasks/index.py
cp update/2026-07-30/backend/tasks/tests.json backend/tasks/tests.json

# Backend - привилегия только у руководителя
cp update/2026-07-30/backend/admin/index.py backend/admin/index.py

# Frontend - раздел «Патчи»
cp update/2026-07-30/src/pages/index/Patches.tsx src/pages/index/Patches.tsx
cp update/2026-07-30/src/pages/index/PatchesTreeFolder.tsx src/pages/index/PatchesTreeFolder.tsx
cp update/2026-07-30/src/pages/index/PatchesDdfBulkPanel.tsx src/pages/index/PatchesDdfBulkPanel.tsx
cp update/2026-07-30/src/pages/index/PatchesDdfCreatePanel.tsx src/pages/index/PatchesDdfCreatePanel.tsx
cp update/2026-07-30/src/pages/index/PatchesDdfEditor.tsx src/pages/index/PatchesDdfEditor.tsx
cp update/2026-07-30/src/pages/index/PatchesDdfRangePanel.tsx src/pages/index/PatchesDdfRangePanel.tsx
cp update/2026-07-30/src/pages/index/PatchesDdfRawPanel.tsx src/pages/index/PatchesDdfRawPanel.tsx
cp update/2026-07-30/src/pages/index/PatchesDdfSearchPanel.tsx src/pages/index/PatchesDdfSearchPanel.tsx
cp update/2026-07-30/src/pages/index/PatchesDdfViewPanel.tsx src/pages/index/PatchesDdfViewPanel.tsx
cp update/2026-07-30/src/pages/index/patchesDdfShared.ts src/pages/index/patchesDdfShared.ts
cp update/2026-07-30/src/pages/index/patchesUtils.ts src/pages/index/patchesUtils.ts
cp update/2026-07-30/src/pages/index/patchesFileDescriptions.ts src/pages/index/patchesFileDescriptions.ts
cp update/2026-07-30/src/pages/index/useDdfBulk.ts src/pages/index/useDdfBulk.ts
cp update/2026-07-30/src/pages/index/useDdfCreate.ts src/pages/index/useDdfCreate.ts
cp update/2026-07-30/src/pages/index/useDdfFileDescriptions.ts src/pages/index/useDdfFileDescriptions.ts
cp update/2026-07-30/src/pages/index/useDdfRange.ts src/pages/index/useDdfRange.ts
cp update/2026-07-30/src/pages/index/useDdfRow.ts src/pages/index/useDdfRow.ts
cp update/2026-07-30/src/pages/index/useDdfSearch.ts src/pages/index/useDdfSearch.ts
cp update/2026-07-30/src/pages/index/IndexMain.tsx src/pages/index/IndexMain.tsx
cp update/2026-07-30/src/pages/index/TaskComments.tsx src/pages/index/TaskComments.tsx

# Frontend - админка (привилегия только у руководителя)
cp update/2026-07-30/src/pages/Admin.tsx src/pages/Admin.tsx
cp update/2026-07-30/src/pages/admin/UserList.tsx src/pages/admin/UserList.tsx
cp update/2026-07-30/src/pages/admin/adminShared.ts src/pages/admin/adminShared.ts

# Миграция БД (см. раздел 6 про схему)
psql "$DATABASE_URL" -c 'SET search_path TO "ВАША_СХЕМА", public;' \
  -f update/2026-07-30/db_migrations/V0059__create_patch_file_descriptions.sql

# Python-зависимости backend (см. раздел 6 про gmpy2/libgmp-dev)
cd /var/www/era
./venv/bin/pip install -r backend/patches/requirements.txt

npm install
npm run build

sudo systemctl restart era-backend
```

---

## 6. Что дополнительно установить на VPS

### 6.1. Системная библиотека для быстрого шифрования (рекомендуется)
Новый редактор `.dat`-файлов активно шифрует/расшифровывает файлы клиента
при каждом сохранении. Пакет `gmpy2` (добавлен в
`backend/patches/requirements.txt`) ускоряет эту операцию примерно в 7 раз,
но для его установки через `pip` нужна системная библиотека **GMP** и
компилятор — поставьте их ДО установки Python-зависимостей:

```bash
sudo apt update
sudo apt install -y libgmp-dev libmpfr-dev libmpc-dev build-essential
```

После этого выполните (или повторите) установку зависимостей:
```bash
cd /var/www/era
./venv/bin/pip install -r backend/patches/requirements.txt
```

Если по какой-то причине `gmpy2` не установится (например на другом
дистрибутиве без этих пакетов) — ничего страшного, редактор `.dat`-файлов
всё равно будет работать, просто сохранение больших файлов будет заметно
медленнее (используется встроенный в Python аналог).

### 6.2. Обновите схему при ручном применении миграции
Новая таблица `patch_file_descriptions` создаётся без явного указания
схемы в SQL-файле — если вы применяете миграции вручную (команда
`apply_migrations.sh` в этом проекте не используется), обязательно
выполните `SET search_path` перед самой миграцией (команда уже приведена
в разделе 5 выше, замените `ВАША_СХЕМА` на значение вашей переменной
`MAIN_DB_SCHEMA` из `.env`) — иначе таблица создастся в `public`, а backend
будет искать её в вашей рабочей схеме и не найдёт.

### 6.3. Ничего нового для Node.js/фронтенда
Никаких новых npm-пакетов в этом обновлении нет — обычного
`npm install && npm run build` достаточно.

---

## Проверено перед публикацией
- Ни в одном файле этого обновления не используется `cdn.poehali.dev`
  напрямую — единственные упоминания `poehali.dev` в скопированных backend-
  файлах (`backend/patches/index.py`, `backend/admin/index.py`,
  `backend/tasks/index.py`) — это **запасной адрес по умолчанию**
  (`os.environ.get('S3_ENDPOINT', 'https://bucket.poehali.dev')`), который
  используется, только если переменная `S3_ENDPOINT` не задана в вашем
  `.env`. Если вы уже настроили `S3_ENDPOINT`/`S3_PUBLIC_URL` по инструкции
  из `deploy/README.md` (шаг 4) — это никак вас не коснётся, патчить код
  не нужно.
- Кнопка/функция тестового входа в обход Telegram-бота (`backend/dev-login/`)
  в этом обновлении не участвует и по-прежнему не должна разворачиваться
  на боевом сервере — см. предупреждение в `deploy/README.md`.
