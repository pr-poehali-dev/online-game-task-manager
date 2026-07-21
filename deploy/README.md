# Перенос ERA Task Manager на свой VPS

Пошаговая инструкция. Выполняйте по порядку. Команды копируйте целиком.
Замените заглушки: `ВАШ-ДОМЕН.РУ`, `ВАШ_ПАРОЛЬ` и т.п. на свои значения.

> Итоговая структура на сервере:
> ```
> /var/www/era/
>   ├── backend/         (папка с функциями — копируется из проекта)
>   ├── db_migrations/   (SQL-миграции — копируется из проекта)
>   ├── deploy/          (этот пакет: server.py, конфиги, скрипты)
>   ├── dist/            (собранный фронтенд — появится после сборки)
>   └── venv/            (виртуальное окружение Python — создадим)
> ```

---

## 0. Что понадобится заранее
- VPS на Ubuntu 22.04/24.04 (мин. 2 vCPU, 4 ГБ RAM, 40 ГБ SSD), доступ по SSH
- Домен, направленный A-записью на IP сервера
- Telegram-бот: токен и username (создаётся у [@BotFather](https://t.me/BotFather))
- Скачанный код проекта (кнопка «Скачать код» в редакторе)

---

## 1. Заливаем код на сервер
Скопируйте папки `backend`, `db_migrations`, `deploy`, а также `package.json`,
`src`, `index.html` и прочие файлы фронтенда в `/var/www/era/` на сервере
(через `scp`, `git` или файловый менеджер панели).

```bash
sudo mkdir -p /var/www/era
sudo chown -R $USER:$USER /var/www/era
# затем залейте файлы проекта внутрь /var/www/era
```

---

## 2. Устанавливаем окружение
```bash
cd /var/www/era/deploy
sudo bash setup.sh
```
Скрипт поставит Node.js, Python 3.11, PostgreSQL, Nginx, Certbot.

---

## 3. Создаём базу данных
```bash
sudo -u postgres psql
```
В открывшемся psql выполните (замените пароль):
```sql
CREATE USER era_user WITH PASSWORD 'ВАШ_ПАРОЛЬ';
CREATE DATABASE era_db OWNER era_user;
\q
```

Применяем миграции:
```bash
cd /var/www/era/deploy
DATABASE_URL="postgresql://era_user:ВАШ_ПАРОЛЬ@localhost:5432/era_db" bash apply_migrations.sh
```

> **Про MAIN_DB_SCHEMA:** миграции в этом проекте создавались в схеме с длинным
> именем (`t_p84024572_...`). Откройте любой файл в `db_migrations/` и посмотрите,
> в какую схему идут `CREATE TABLE`. Это имя и укажите в `MAIN_DB_SCHEMA` (шаг 6).
> Если хотите чистую установку — можно заменить это имя на `public` во всех
> файлах миграций (Find & Replace) перед их применением, тогда `MAIN_DB_SCHEMA=public`.

---

## 4. Хранилище файлов (S3 / MinIO)
Нужно для загрузки картинок в «Базе знаний». Два пути:

**Вариант А — внешний Object Storage** (проще): заведите bucket `files`
в Yandex Object Storage / VK Cloud / AWS S3, получите ключ и секрет.

**Вариант Б — свой MinIO на этом же сервере:**
```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
chmod +x /usr/local/bin/minio
sudo mkdir -p /var/minio-data
# запустите (для теста); в проде оформите как systemd-сервис
MINIO_ROOT_USER=era_s3 MINIO_ROOT_PASSWORD=ВАШ_S3_ПАРОЛЬ \
  minio server /var/minio-data --console-address ":9001" &
```
Создайте bucket `files` через веб-консоль MinIO (порт 9001).

> ⚠️ **Про переменные окружения хранилища.** Код всех функций с файлами
> (`backend/knowledge/index.py`, `backend/tasks/index.py`,
> `backend/ideas/index.py`, `backend/patches/index.py`) уже написан так,
> чтобы читать адрес хранилища из переменных окружения `S3_ENDPOINT` и
> `S3_PUBLIC_URL` — жёстко зашитый адрес облака `bucket.poehali.dev` /
> `cdn.poehali.dev` используется только как запасной вариант (fallback),
> если эти переменные не заданы. Патчить сам код не нужно — достаточно
> прописать в `.env` (шаг 6):
> ```
> S3_ENDPOINT=http://127.0.0.1:9000        # адрес MinIO/S3
> S3_PUBLIC_URL=https://ВАШ-ДОМЕН.РУ/files # публичный адрес файлов
> ```
> Для MinIO настройте отдачу bucket `files` наружу (через Nginx или публичную политику bucket).

---

## 5. Python-окружение для backend
```bash
cd /var/www/era
python3.11 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r deploy/requirements.txt
```

---

## 6. Секреты
```bash
cd /var/www/era/deploy
cp .env.example .env
nano .env   # заполните все значения
```
Заполните `DATABASE_URL`, `MAIN_DB_SCHEMA`, `AWS_*`, `TELEGRAM_*`, `APP_URL`,
`BACKEND_DIR=/var/www/era/backend` (и `S3_*`, если делали патч из шага 4).

---

## 7. Запускаем backend как сервис
```bash
sudo cp /var/www/era/deploy/era-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now era-backend
sudo systemctl status era-backend   # должно быть active (running)
```
Проверка: `curl http://127.0.0.1:8000/api/health` — вернёт список функций.

---

## 8. Собираем фронтенд
Перед сборкой пропишите адрес backend. Откройте `backend/func2url.json` и
замените все облачные URL на путь через ваш домен (важно перечислить
**все** функции — по одной на каждую папку внутри `backend/`, кроме
`dev-login` — см. предупреждение ниже):
```json
{
  "faq":                "https://ВАШ-ДОМЕН.РУ/api/faq",
  "catalog":            "https://ВАШ-ДОМЕН.РУ/api/catalog",
  "sprints":            "https://ВАШ-ДОМЕН.РУ/api/sprints",
  "notifications":      "https://ВАШ-ДОМЕН.РУ/api/notifications",
  "ideas":              "https://ВАШ-ДОМЕН.РУ/api/ideas",
  "knowledge":          "https://ВАШ-ДОМЕН.РУ/api/knowledge",
  "tasks":              "https://ВАШ-ДОМЕН.РУ/api/tasks",
  "patches":            "https://ВАШ-ДОМЕН.РУ/api/patches",
  "patchnotes":         "https://ВАШ-ДОМЕН.РУ/api/patchnotes",
  "deadline-reminders": "https://ВАШ-ДОМЕН.РУ/api/deadline-reminders",
  "login-code":         "https://ВАШ-ДОМЕН.РУ/api/login-code",
  "tg-webhook":         "https://ВАШ-ДОМЕН.РУ/api/tg-webhook",
  "admin":              "https://ВАШ-ДОМЕН.РУ/api/admin",
  "auth":               "https://ВАШ-ДОМЕН.РУ/api/auth"
}
```

> ⚠️ **Не переносите папку `backend/dev-login/` на свой сервер.** Это
> временная функция только для тестового превью в редакторе poehali.dev —
> выдаёт сессию администратору в обход Telegram-авторизации. На фронтенде
> кнопка теста уже скрыта проверкой домена (`window.location.hostname`),
> но сам backend-эндпоинт лучше не разворачивать — просто не копируйте эту
> папку на сервер и не добавляйте её в `func2url.json`.

Собираем:
```bash
cd /var/www/era
npm install
npm run build      # создаст папку dist/
```

---

## 9. Nginx + HTTPS
```bash
sudo cp /var/www/era/deploy/nginx.conf /etc/nginx/sites-available/era
sudo nano /etc/nginx/sites-available/era   # замените ВАШ-ДОМЕН.РУ
sudo ln -s /etc/nginx/sites-available/era /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Бесплатный SSL-сертификат:
sudo certbot --nginx -d ВАШ-ДОМЕН.РУ
```
Certbot сам добавит HTTPS и автопродление.

---

## 10. Telegram-webhook
Скажите Telegram, куда слать обновления бота (подставьте токен и домен):
```bash
curl "https://api.telegram.org/botВАШ_ТОКЕН/setWebhook?url=https://ВАШ-ДОМЕН.РУ/api/tg-webhook"
```

---

## Готово 🎉
Откройте `https://ВАШ-ДОМЕН.РУ` — сайт должен работать. Вход через бота,
задачи, идеи, база знаний и уведомления будут функционировать на вашем сервере.

---

## Если что-то не работает
- **Логи backend:** `sudo journalctl -u era-backend -n 100 -f`
- **Логи Nginx:** `sudo tail -f /var/log/nginx/error.log`
- **Проверка backend напрямую:** `curl http://127.0.0.1:8000/api/health`
- **База не подключается:** проверьте `DATABASE_URL` и что PostgreSQL запущен (`sudo systemctl status postgresql`)
- **Вход не проходит:** проверьте `TELEGRAM_BOT_TOKEN`, `APP_URL` и что webhook установлен (шаг 10). Всё должно работать строго по HTTPS.
- **Картинки не грузятся:** проверьте патч из шага 4 и переменные `S3_*`.

## Обновление сайта в будущем
1. Залейте новые файлы проекта в `/var/www/era`
2. `cd /var/www/era && npm install && npm run build`
3. Примените новые миграции (если появились): `bash deploy/apply_migrations.sh`
4. `sudo systemctl restart era-backend`