# Образ backend: FastAPI-обёртка (server.py) + все функции из /backend.
# Контекст сборки — корень проекта (см. docker-compose.yml).
FROM python:3.11-slim

WORKDIR /app

# Системные зависимости для psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Python-зависимости
COPY deploy/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Код: обёртка + функции
COPY deploy/server.py /app/deploy/server.py
COPY backend /app/backend

WORKDIR /app/deploy

EXPOSE 8000

# Таймаут увеличен до 180с — загрузка больших вложений (до 300 МБ, см. MAX_FILE_SIZE
# в backend/*/index.py) требует времени на декодирование base64 и отправку в S3/MinIO.
CMD ["gunicorn", "server:app", \
     "--workers", "2", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "180"]