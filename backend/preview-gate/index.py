import hmac
import json
import os


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
    }


def handler(event: dict, context) -> dict:
    '''Заглушка публичного превью-домена poehali.dev (НЕ боевой self-hosted сервер — там этой
    функции нет вовсе, см. комментарий "НИКОГДА не переносить" в src/components/PreviewGate.tsx).

    Единственное действие: проверка пароля из секрета PREVIEW_GATE_PASSWORD. Пароль сравнивается
    константным по времени способом (hmac.compare_digest) — простая защита от подбора по таймингу,
    не полноценная авторизация. Успешная проверка не создаёт сессию на сервере: фронтенд сам
    запоминает факт успеха в localStorage (см. PreviewGate.tsx) — это НЕ замена системе входа
    команды через Telegram (backend/auth), а дополнительный барьер ДО неё, чтобы случайный человек,
    открывший ссылку на тестовый домен, не увидел даже форму логина.'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    password = str(body.get('password') or '')
    expected = os.environ.get('PREVIEW_GATE_PASSWORD', '')

    if not expected:
        # Секрет ещё не задан владельцем — не пускаем никого, чтобы пустой пароль не считался
        # "правильным" по ошибке конфигурации.
        return {'statusCode': 503, 'headers': _cors_headers(), 'body': json.dumps({'error': 'gate_not_configured'})}

    if not password or not hmac.compare_digest(password, expected):
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'wrong_password'})}

    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}
