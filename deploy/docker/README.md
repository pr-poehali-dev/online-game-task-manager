# Быстрый старт через Docker

Этот путь заменяет шаги 3-7 основной инструкции (`../README.md`):
база данных, хранилище MinIO и backend поднимаются одной командой.
Фронтенд и Nginx с HTTPS настраиваются как в основном README (шаги 8-10).

## Предварительно
Установите Docker и Docker Compose:
```bash
curl -fsSL https://get.docker.com | sudo sh
```

## Патч кода под своё хранилище (один раз)
Откройте `backend/knowledge/index.py` и замените блок клиента S3 на версию
с переменными окружения (точный код — в основном README, шаг 4).
Docker уже передаёт `S3_ENDPOINT` и `S3_PUBLIC_URL` в backend автоматически.

## Запуск
```bash
cd deploy/docker
cp .env.example .env
nano .env          # заполните пароли, токен бота, домен
docker compose up -d --build
```
Что произойдёт:
- **postgres** — создаст БД и применит все миграции из `db_migrations/` автоматически
- **minio** — поднимет S3-хранилище, создаст публичный bucket `files`
- **backend** — соберётся из `Dockerfile` и запустится на `127.0.0.1:8000`

Проверка:
```bash
curl http://127.0.0.1:8000/api/health   # вернёт список функций
docker compose ps                        # все сервисы healthy/running
docker compose logs -f backend           # логи backend
```

## Дальше — как в основном README
- **Шаг 8:** заменить URL в `backend/func2url.json` на `https://ВАШ-ДОМЕН.РУ/api/...`, собрать фронт (`npm install && npm run build`)
- **Шаг 9:** Nginx + Certbot (раздаёт `dist`, проксирует `/api/` → `127.0.0.1:8000`)
  - Дополнительно добавьте в конфиг Nginx раздачу картинок MinIO:
    ```nginx
    location /files/ {
        proxy_pass http://127.0.0.1:9000/files/;
    }
    ```
- **Шаг 10:** установить Telegram webhook

## Управление
```bash
docker compose down          # остановить (данные сохраняются в volumes)
docker compose up -d         # запустить снова
docker compose restart backend
docker compose down -v       # ⚠️ удалить ВСЁ вместе с данными БД и файлами
```

## Обновление
```bash
# залейте новый код проекта, затем:
cd deploy/docker
docker compose up -d --build backend   # пересобрать backend
# новые миграции применяйте вручную:
# docker compose exec -T postgres psql -U era_user -d era_db < ../../db_migrations/VXXXX__*.sql
```
