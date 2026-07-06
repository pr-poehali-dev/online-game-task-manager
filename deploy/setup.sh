#!/usr/bin/env bash
# Установка окружения на чистой Ubuntu 22.04 / 24.04.
# Запускать под root или через sudo: bash setup.sh
set -e

echo "==> Обновление системы"
apt update && apt upgrade -y

echo "==> Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "==> Python 3.11, PostgreSQL, Nginx, Certbot"
apt install -y python3.11 python3.11-venv python3-pip \
    postgresql postgresql-contrib \
    nginx certbot python3-certbot-nginx git

echo "==> Готово. Дальнейшие шаги — в README.md (создание БД, сборка, запуск)."
echo "    Проверьте версии:"
node -v
python3.11 --version
psql --version || true
nginx -v
