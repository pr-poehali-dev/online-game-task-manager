# Обновление ERA Task Manager на вашем сервере

Инструкция для установки последних изменений (FAQ в личном кабинете,
кнопки бота «Вход» / «Мои задачи», патч хранилища под свой MinIO,
отключение тестового входа и индексации сайта поисковиками).

Выполняйте по порядку на сервере, где уже установлен проект
(`/var/www/era`).

---

## 1. Заливаем новый код
Скачайте актуальный код проекта (кнопка **Скачать → Скачать код** в редакторе)
и замените им старые файлы на сервере — папки `backend`, `src`, `db_migrations`,
`deploy`, файлы `index.html`, `package.json` и т.д.

```bash
# пример через scp с локальной машины, где распакован новый архив
scp -r backend db_migrations deploy src index.html package.json \
  user@ВАШ-СЕРВЕР:/var/www/era/
```

Файл `backend/func2url.json` **не трогайте** — в нём уже прописаны пути
`/api/...` под ваш домен, они не изменились.

---

## 2. Применяем новые миграции БД
Появились 2 новые миграции — таблица FAQ и наполнение её вопросами.

```bash
cd /var/www/era/deploy
DATABASE_URL="postgresql://era_user:ВАШ_ПАРОЛЬ@localhost:5432/era_db" \
MAIN_DB_SCHEMA="ВАША_СХЕМА" \
bash apply_migrations.sh
```

⚠️ **Важно указать `MAIN_DB_SCHEMA`** — значение должно быть **точно таким же**,
как в вашем `.env` (шаг 3). Часть новых таблиц (FAQ, категории, серверы,
избранное в базе знаний) создаётся без явного указания схемы в самом SQL, и
без `MAIN_DB_SCHEMA` они попадут в схему `public`, а не туда, где их ищет backend
— тогда FAQ и другие новые разделы будут выглядеть пустыми.

Скрипт применяет все миграции по порядку и пропускает уже применённые
(если у вас `IF NOT EXISTS` в старых файлах — новые просто добавятся:
`V0028__create_faq_items.sql`, `V0029__seed_faq_items.sql`).

**Если вы уже применили миграции без `MAIN_DB_SCHEMA` и FAQ не отображается** —
проверьте, куда попала таблица, и перенесите её в нужную схему:
```bash
psql "$DATABASE_URL" -c "SELECT table_schema FROM information_schema.tables WHERE table_name='faq_items';"
# если увидели 'public', а нужна другая схема — перенесите таблицы:
psql "$DATABASE_URL" -c 'ALTER TABLE public.faq_items SET SCHEMA "ВАША_СХЕМА";'
psql "$DATABASE_URL" -c 'ALTER TABLE public.categories SET SCHEMA "ВАША_СХЕМА";'
psql "$DATABASE_URL" -c 'ALTER TABLE public.servers SET SCHEMA "ВАША_СХЕМА";'
psql "$DATABASE_URL" -c 'ALTER TABLE public.kb_favorites SET SCHEMA "ВАША_СХЕМА";'
```

---

## 3. Проверяем .env — добавлены переменные под своё хранилище
Если вы ещё не добавляли S3-патч ранее, откройте `.env` и добавьте:

```bash
cd /var/www/era/deploy
nano .env
```

Убедитесь, что есть строки:
```
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=files
S3_PUBLIC_URL=https://ВАШ-ДОМЕН.РУ/files
```

Если MinIO уже был настроен ранее и эти переменные уже стоят — пропустите
этот шаг.

---

## 4. Пересобираем фронтенд
```bash
cd /var/www/era
npm install
npm run build
```

---

## 5. Перезапускаем backend
```bash
sudo systemctl restart era-backend
sudo systemctl status era-backend   # должно быть active (running)
```

---

## 6. Проверка
- Откройте `https://ВАШ-ДОМЕН.РУ/cabinet` — внизу должен появиться раздел **FAQ**
  с готовыми вопросами
- Напишите боту `/start` — под сообщением должны появиться кнопки
  **🔑 Вход** и **📋 Мои задачи**
- Загрузите картинку в статью базы знаний — убедитесь, что она сохраняется
  и открывается (проверка патча под MinIO)
- Откройте `https://ВАШ-ДОМЕН.РУ/robots.txt` — должно быть `Disallow: /`

---

## Если что-то не работает
- **Логи backend:** `sudo journalctl -u era-backend -n 100 -f`
- **FAQ пустой:** проверьте, что миграции `V0028` и `V0029` реально применились —
  `psql "$DATABASE_URL" -c "SELECT count(*) FROM faq_items;"` (или с указанием
  вашей схемы, если не `public`)
- **Картинки в базе знаний не грузятся:** проверьте `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_PUBLIC_URL` в `.env` и что Nginx отдаёт `/files` наружу