#!/usr/bin/env bash
# Применяет все миграции из ../db_migrations по порядку (V0001, V0002, ...).
# Использование:
#   DATABASE_URL="postgresql://era_user:пароль@localhost:5432/era_db" bash apply_migrations.sh
set -e

MIGRATIONS_DIR="$(dirname "$0")/../db_migrations"

if [ -z "$DATABASE_URL" ]; then
  echo "Ошибка: не задан DATABASE_URL."
  echo "Пример: DATABASE_URL='postgresql://era_user:пароль@localhost:5432/era_db' bash apply_migrations.sh"
  exit 1
fi

echo "==> Применяю миграции из $MIGRATIONS_DIR"
for f in $(ls "$MIGRATIONS_DIR"/V*.sql | sort); do
  echo "  -> $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "==> Все миграции применены успешно."
