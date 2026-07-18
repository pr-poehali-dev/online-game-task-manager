# Инструкция: применение фикса загрузки больших файлов

Этот фикс решает проблему «иногда не удаётся загрузить файл» — Nginx обрывал
запрос раньше, чем приложение успевало его обработать. Подробности — в
основном README.md (раздел 11).

Ниже — точные команды по шагам. Выберите вариант в зависимости от того,
как у вас развёрнут backend: **обычный systemd-сервис** или **Docker**.

---

## Вариант А — обычный сервер (systemd + Nginx на хосте)

Используйте этот вариант, если backend у вас запускается через
`era-backend.service` (systemd), а не через `docker compose`.

### Шаг 1. Скопируйте новый конфиг Nginx

```bash
cd /var/www/era   # корень вашего проекта на сервере
sudo cp update/2026-07-18/deploy/nginx.conf /etc/nginx/sites-available/era
```

⚠️ Если вы раньше правили `server_name` в этом файле (указывали свой домен
вместо `ВАШ-ДОМЕН.РУ`) — откройте новый файл и впишите свой домен заново,
он не переносится автоматически:

```bash
sudo nano /etc/nginx/sites-available/era
# найдите строку "server_name ВАШ-ДОМЕН.РУ;" и замените на свой домен
```

Также проверьте, нет ли у вас в старом конфиге секции для SSL (443 порт,
пути к сертификатам certbot) — если есть, добавьте её обратно в новый
файл по аналогии (обычно добавляется автоматически командой `certbot`,
описанной ниже, если сертификат уже был выпущен ранее — certbot сам
допишет нужный блок при следующем продлении, либо перевыпустите).

### Шаг 2. Проверьте конфиг и перезапустите Nginx

```bash
sudo nginx -t
```

Если написано `syntax is ok` и `test is successful` — применяйте:

```bash
sudo systemctl reload nginx
```

### Шаг 3. Скопируйте новый unit-файл backend

```bash
sudo cp update/2026-07-18/deploy/era-backend.service /etc/systemd/system/era-backend.service
sudo systemctl daemon-reload
sudo systemctl restart era-backend
```

### Шаг 4. Обновите код backend-функций

Скопируйте обновлённые файлы функций поверх старых (пути сохраняются
такими же, как в проекте):

```bash
cp update/2026-07-18/backend/tasks/index.py backend/tasks/index.py
cp update/2026-07-18/backend/ideas/index.py backend/ideas/index.py
cp update/2026-07-18/backend/knowledge/index.py backend/knowledge/index.py
```

Backend уже перезапущен на шаге 3 — новый код подхватится автоматически
при следующем перезапуске. Если вы копируете файлы ПОСЛЕ шага 3 — перезапустите
ещё раз:

```bash
sudo systemctl restart era-backend
```

### Шаг 5. Проверьте, что всё поднялось

```bash
sudo systemctl status era-backend
```

Строка должна быть `active (running)`, без ошибок. Также проверьте логи:

```bash
sudo journalctl -u era-backend -n 50 --no-pager
```

---

## Вариант Б — Docker-деплой

Используйте, если backend и MinIO у вас подняты через `docker compose`
(папка `deploy/docker`).

### Шаг 1. Скопируйте новый Dockerfile

```bash
cd /var/www/era   # корень вашего проекта на сервере
cp update/2026-07-18/deploy/docker/Dockerfile deploy/docker/Dockerfile
```

### Шаг 2. Обновите код backend-функций

```bash
cp update/2026-07-18/backend/tasks/index.py backend/tasks/index.py
cp update/2026-07-18/backend/ideas/index.py backend/ideas/index.py
cp update/2026-07-18/backend/knowledge/index.py backend/knowledge/index.py
```

### Шаг 3. Пересоберите и перезапустите контейнер backend

```bash
cd deploy/docker
docker compose build backend
docker compose up -d backend
```

### Шаг 4. Обновите Nginx на хосте (он у вас отдельно от Docker)

Даже при Docker-деплое Nginx обычно стоит на хосте и указан в
`deploy/nginx.conf` — примените так же, как в Варианте А (шаги 1-2):

```bash
cd /var/www/era
sudo cp update/2026-07-18/deploy/nginx.conf /etc/nginx/sites-available/era
# впишите свой server_name, если правили его раньше
sudo nginx -t
sudo systemctl reload nginx
```

### Шаг 5. Проверьте, что контейнер поднялся

```bash
docker compose ps
docker compose logs -f backend
```

---

## Общий шаг для обоих вариантов — обновите фронтенд

```bash
cd /var/www/era
cp update/2026-07-18/src/components/AttachmentsField.tsx src/components/AttachmentsField.tsx
npm run build
```

(Файл фронтенда даёт понятное сообщение об ошибке при повреждённой
загрузке — само по себе не критично, но рекомендуется перенести вместе
с остальным.)

---

## Проверка результата

1. Откройте любую задачу и попробуйте прикрепить файл размером **25-50 МБ**
   (раньше такой файл мог не загружаться) — теперь должен пройти без ошибок.
2. Попробуйте файл больше 300 МБ — должен корректно отклоняться с сообщением
   «Файл слишком большой (максимум 300 МБ)».
3. Если у вас медленный канал — попробуйте загрузить файл 100-200 МБ и
   подождите чуть дольше обычного (до 3 минут) — раньше запрос мог обрываться
   по таймауту 60 секунд, теперь лимит увеличен до 180 секунд.

## Если что-то пошло не так

- `sudo nginx -t` показывает ошибку → проверьте, что вы не потеряли
  секцию с вашим доменом/SSL при копировании нового `nginx.conf`.
- Backend не стартует (`systemctl status era-backend` красный) →
  проверьте `sudo journalctl -u era-backend -n 100 --no-pager`, чаще
  всего причина — опечатка при копировании или не тот путь к venv.
- Загрузка всё равно не работает → проверьте лимиты на стороне
  MinIO/S3 (если используете внешний облачный S3-провайдер, а не свой
  MinIO — там тоже может быть свой лимит на размер объекта или запроса).
