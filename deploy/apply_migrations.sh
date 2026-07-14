#!/usr/bin/env bash
# Применяет все миграции из ../db_migrations по порядку (V0001, V0002, ...).
# Использование:
#   DATABASE_URL="postgresql://era_user:пароль@localhost:5432/era_db" \
#   MAIN_DB_SCHEMA="public" \
#   bash apply_migrations.sh
set -e

MIGRATIONS_DIR="$(dirname "$0")/../db_migrations"
SCHEMA="${MAIN_DB_SCHEMA:-public}"

if [ -z "$DATABASE_URL" ]; then
  echo "Ошибка: не задан DATABASE_URL."
  echo "Пример: DATABASE_URL='postgresql://era_user:пароль@localhost:5432/era_db' bash apply_migrations.sh"
  exit 1
fi

echo "==> Применяю миграции из $MIGRATIONS_DIR в схему '$SCHEMA'"
# ВАЖНО: некоторые миграции создают таблицы без явного имени схемы
# (например CREATE TABLE faq_items). Задаём search_path на уровне сессии psql,
# чтобы такие таблицы попадали в вашу рабочую схему, а не в 'public' по умолчанию.
for f in $(ls "$MIGRATIONS_DIR"/V*.sql | sort); do
  echo "  -> $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "SET search_path TO \"$SCHEMA\", public;" \
    -f "$f"
done

echo "==> Все миграции применены успешно."