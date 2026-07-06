"""
FastAPI-обёртка для облачных функций проекта.

Каждая папка внутри /backend с файлом index.py и функцией handler(event, context)
превращается в HTTP-эндпоинт /api/<имя-папки>.

Формат event полностью совпадает с облачным:
  - httpMethod: метод запроса
  - headers: заголовки (включая X-Auth-Token)
  - queryStringParameters: query-параметры
  - body: тело запроса как строка (JSON)

Запуск для разработки:
  uvicorn server:app --host 0.0.0.0 --port 8000

В проде запускается через systemd (см. era-backend.service).
"""
import importlib.util
import os
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import Response

# Путь к папке backend (на уровень выше deploy/)
BACKEND_DIR = Path(os.environ.get("BACKEND_DIR", Path(__file__).resolve().parent.parent / "backend"))

app = FastAPI(title="ERA Task Manager API")

# Список функций-эндпоинтов = папки в backend с файлом index.py
FUNCTIONS = [
    d.name
    for d in sorted(BACKEND_DIR.iterdir())
    if d.is_dir() and (d / "index.py").exists()
]


class _Context:
    """Заглушка облачного context (наши функции его почти не используют)."""
    def __init__(self, name: str):
        self.function_name = name
        self.request_id = "local"
        self.memory_limit_in_mb = 256


def _load_handler(func_name: str):
    """Динамически загружает handler из backend/<func_name>/index.py."""
    module_path = BACKEND_DIR / func_name / "index.py"
    spec = importlib.util.spec_from_file_location(f"fn_{func_name}", module_path)
    module = importlib.util.module_from_spec(spec)
    # чтобы относительные импорты внутри функции (models, utils) работали
    sys.path.insert(0, str(BACKEND_DIR / func_name))
    spec.loader.exec_module(module)
    return module.handler


# Загружаем все обработчики один раз при старте
HANDLERS = {name: _load_handler(name) for name in FUNCTIONS}


async def _run(func_name: str, request: Request) -> Response:
    handler = HANDLERS.get(func_name)
    if handler is None:
        return Response(content='{"error":"not_found"}', status_code=404, media_type="application/json")

    raw_body = await request.body()
    event = {
        "httpMethod": request.method,
        "headers": dict(request.headers),
        "queryStringParameters": dict(request.query_params),
        "body": raw_body.decode("utf-8") if raw_body else "",
        "isBase64Encoded": False,
        "requestContext": {
            "identity": {"sourceIp": request.client.host if request.client else ""}
        },
    }

    result = handler(event, _Context(func_name))

    status = result.get("statusCode", 200)
    headers = result.get("headers", {}) or {}
    body = result.get("body", "")
    media_type = headers.pop("Content-Type", "application/json")
    return Response(content=body, status_code=status, headers=headers, media_type=media_type)


def _make_route(func_name: str):
    async def route(request: Request):
        return await _run(func_name, request)
    return route


# Регистрируем маршруты /api/<func> для GET/POST/OPTIONS
for _name in FUNCTIONS:
    app.add_api_route(
        f"/api/{_name}",
        _make_route(_name),
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        name=_name,
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "functions": FUNCTIONS}
