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

Отдельно есть /api/_og/task/{id} — служебный маршрут ТОЛЬКО для ботов-краулеров мессенджеров
(Telegram, WhatsApp и т.п.), которые строят превью ссылки вида forge.la2era.com/task/141:
такой бот не открывает JS и не входит в аккаунт, поэтому обычный SPA (index.html с og:title="ЭРА")
показывал одну и ту же статичную карточку для любой ссылки. Nginx сам решает по User-Agent, кому
показать этот маршрут, а кому — обычный index.html (см. deploy/nginx.conf, map $is_bot_ua).
"""
import html
import importlib.util
import json
import os
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, Response, StreamingResponse

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


# --- Потоковый (SSE) ответ обычного чата раздела "AI" — ТОЛЬКО self-hosted ------------------
# Облачные функции poehali.dev не умеют долгие потоковые HTTP-ответы (жёсткий контракт
# handler(event, context) -> dict, весь ответ одним куском) — там раздел "AI" по-прежнему
# работает через обычный /api/ai?action=send_message (см. backend/ai/generate.py). Здесь, на
# self-hosted FastAPI-процессе, ограничения нет — используем StreamingResponse. Модуль
# backend/ai/stream.py — НЕ часть обычной карты ACTIONS (backend/ai/index.py), поэтому
# импортируем его отдельно и по требованию, а не через общий механизм HANDLERS выше. Если файла
# ещё нет (self-hosted-пользователь не установил этот апдейт) — маршрут просто не появляется,
# фронт сам обнаруживает 404 и переходит на обычный запрос (см. useAiSection.ts).
_AI_STREAM_MODULE_PATH = BACKEND_DIR / "ai" / "stream.py"
if _AI_STREAM_MODULE_PATH.exists():
    sys.path.insert(0, str(BACKEND_DIR / "ai"))
    _ai_stream_spec = importlib.util.spec_from_file_location("fn_ai_stream", _AI_STREAM_MODULE_PATH)
    _ai_stream_module = importlib.util.module_from_spec(_ai_stream_spec)
    _ai_stream_spec.loader.exec_module(_ai_stream_module)

    @app.post("/api/ai/stream")
    async def ai_stream(request: Request):
        raw_body = await request.body()
        try:
            body = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except Exception:
            body = {}
        headers = {k.lower(): v for k, v in request.headers.items()}
        return StreamingResponse(
            _ai_stream_module.stream_send_message(headers, body),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",  # отключает буферизацию SSE на стороне Nginx (см. nginx.conf)
            },
        )

    @app.options("/api/ai/stream")
    async def ai_stream_options():
        return Response(status_code=200)


# --- Превью ссылки на задачу для ботов-краулеров мессенджеров -----------------------------
# Внутренний задачник не открывает наружу описание задачи (см. backend/tasks/index.py,
# action=og_meta — публично отдаёт ТОЛЬКО id и title, ничего больше). Заголовок вкладки/превью
# формируется как "#{id} · {title}" — так сразу видно номер задачи, по которому её ищут в чате
# команды, и её суть, без перехода по ссылке. Описание намеренно НЕ показываем (см. _og_html) —
# ни один из полей задачи наружу кроме id/title не отдаётся, а общая фраза-заглушка вроде
# "ЭРА — внутренний задачник команды" не несёт пользы в превью конкретной задачи.
_OG_SITE_TITLE = 'ЭРА'


def _og_html(title: str, page_url: str) -> str:
    app_url = (os.environ.get('APP_URL') or '').rstrip('/')
    image_url = f'{app_url}/og-image.jpg' if app_url else '/og-image.jpg'
    # html.escape — заголовок задачи вставляется пользовательским текстом (title из БД),
    # без экранирования кавычки/угловые скобки в названии задачи сломали бы разметку страницы.
    t = html.escape(title)
    u = html.escape(page_url)
    i = html.escape(image_url)
    return f'''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>{t}</title>
<meta name="robots" content="noindex, nofollow"/>
<meta property="og:title" content="{t}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="{u}"/>
<meta property="og:image" content="{i}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="{t}"/>
<meta name="twitter:image" content="{i}"/>
<meta http-equiv="refresh" content="0; url={u}"/>
</head>
<body>
<a href="{u}">{t}</a>
</body>
</html>'''


@app.get("/api/_og/task/{task_id}")
async def og_task(task_id: str):
    '''Только для ботов-краулеров (Nginx направляет сюда по User-Agent, см. nginx.conf) —
    обычные посетители продолжают получать SPA index.html с client-side роутингом React Router.
    Дёргает backend/tasks напрямую (в обход HTTP) тем же способом, что и обычные /api/-маршруты
    выше — без токена, тем же публичным action=og_meta.'''
    app_url = (os.environ.get('APP_URL') or '').rstrip('/')
    page_url = f'{app_url}/task/{task_id}' if app_url else f'/task/{task_id}'

    handler = HANDLERS.get('tasks')
    if handler is None or not task_id.isdigit():
        return HTMLResponse(_og_html(_OG_SITE_TITLE, page_url))

    event = {
        'httpMethod': 'GET',
        'headers': {},
        'queryStringParameters': {'action': 'og_meta', 'id': task_id},
        'body': '',
        'isBase64Encoded': False,
        'requestContext': {'identity': {'sourceIp': ''}},
    }
    result = handler(event, _Context('tasks'))
    if result.get('statusCode') != 200:
        # Задача удалена/не существует — показываем общий заголовок сайта, а не ошибку: ссылка
        # всё равно открывает приложение по клику, просто без конкретики в превью.
        return HTMLResponse(_og_html(_OG_SITE_TITLE, page_url))

    try:
        data = json.loads(result.get('body') or '{}')
    except Exception:
        data = {}
    title = f"#{data.get('id')} · {data.get('title')}" if data.get('title') else _OG_SITE_TITLE
    return HTMLResponse(_og_html(title, page_url))