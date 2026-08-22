import json

from common import _cors_headers, _schema, _db, _bad, _current_user
import chats as chats_actions
import documents as documents_actions
import files as files_actions
import generate as generate_actions


# Карта action → функция-обработчик. Все обработчики имеют одинаковую сигнатуру
# (cur, conn, schema, me, body, qs) и сами закрывают курсор/соединение перед возвратом ответа —
# так было и в исходном едином файле, поведение не менялось. Сами реализации разнесены по
# смыслу: chats.py (диалоги, модели, лимиты, шаблоны), files.py (загрузка вложений в S3),
# generate.py (обращения к моделям AI Tunnel).
ACTIONS = {
    # Каталог моделей, лимиты, диалоги, поиск, шаблоны промптов
    'list_models': chats_actions.handle_list_models,
    'usage': chats_actions.handle_usage,
    'balance': chats_actions.handle_balance,
    'list_chats': chats_actions.handle_list_chats,
    'get_chat': chats_actions.handle_get_chat,
    'search_messages': chats_actions.handle_search_messages,
    'set_message_pinned': chats_actions.handle_set_message_pinned,
    'rename_chat': chats_actions.handle_rename_chat,
    'set_pinned': chats_actions.handle_set_pinned,
    'delete_chat': chats_actions.handle_delete_chat,
    'list_templates': chats_actions.handle_list_templates,
    'create_template': chats_actions.handle_create_template,
    'update_template': chats_actions.handle_update_template,
    'delete_template': chats_actions.handle_delete_template,
    # Загрузка файлов-вложений
    'upload_attachment': files_actions.handle_upload_attachment,
    'file_init': files_actions.handle_file_init,
    'file_chunk': files_actions.handle_file_chunk,
    'file_complete': files_actions.handle_file_complete,
    'file_abort': files_actions.handle_file_abort,
    # Обращения к моделям
    'send_message': generate_actions.handle_send_message,
    'generate_image': generate_actions.handle_generate_image,
    'generate_video': generate_actions.handle_generate_video,
    'check_video_job': generate_actions.handle_check_video_job,
    'generate_title': generate_actions.handle_generate_title,
    'regenerate': generate_actions.handle_regenerate,
    # Сборка готовых офисных документов (Excel/Word) по текстовому запросу
    'generate_document': documents_actions.handle_generate_document,
}


def handler(event: dict, context) -> dict:
    '''Раздел "AI" — чат сотрудников с ИИ-моделями через единый ключ AI Tunnel (aitunnel.ru,
    OpenAI-совместимый API, оплата в рублях). Этот файл — только маршрутизатор: проверяет
    авторизацию и право ai_access, разбирает тело запроса и передаёт управление обработчику
    действия из карты ACTIONS. Реализации действий:

    - chats.py: list_models (публичный каталог моделей AI Tunnel, кешируется,
      group=chat|images|videos), usage (остаток месячного лимита сотрудника), balance (общий
      остаток аккаунта AI Tunnel, только team_manage/admin), list_chats/get_chat/rename_chat/
      set_pinned/delete_chat (CRUD диалогов — delete_chat дополнительно чистит из S3 все файлы
      вложений диалога), search_messages (поиск по содержимому сообщений во ВСЕХ диалогах
      пользователя, возвращает фрагмент вокруг совпадения), set_message_pinned (закрепление
      ОДНОГО ответа внутри диалога, отдельно от ai_chats.pinned), list_templates/create_template/
      update_template/delete_template (индивидуальные шаблоны промптов, полностью приватные).

    - files.py: upload_attachment (маленький файл одним запросом base64 → S3; для текстовых
      файлов сразу извлекает содержимое в поле 'text'), file_init/file_chunk/file_complete/
      file_abort (большой файл кусочками, до MAX_UPLOAD_SIZE=200 МБ — одиночный запрос к функции
      ограничен ~3.5 МБ на уровне платформы).

    - generate.py: send_message (текстовое сообщение с вложениями; mode='code' подставляет
      системный промпт код-ревью; НЕ потоковый режим — платформа не даёт проксировать SSE дольше
      таймаута функции), generate_image (синхронный POST /images/generations, поддерживает
      n/quality/outputFormat/background/inputReferences для image-to-image), generate_video
      (АСИНХРОННЫЙ POST /videos — деньги списываются сразу при старте), check_video_job (опрос
      статуса задачи видео, при completed скачивает MP4 в S3), generate_title (осмысленное
      название диалога дешёвой моделью, фоновый запрос фронта), regenerate (перегенерация
      последнего ответа ассистента, можно другой моделью).

    - documents.py: generate_document (готовый Excel/Word по текстовому запросу — модель отдаёт
      СТРУКТУРУ документа в JSON, а бинарный файл собирается на сервере через openpyxl/python-docx
      и кладётся в S3; ссылка приходит вложением к ответу ассистента).

    Доступ ко всем действиям — только с правом ai_access (отдельное привилегированное право,
    см. db_migrations V0076). Подробное описание раздела: docs/ai-section-overview.md.'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    schema = _schema()
    headers = event.get('headers', {})
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token')

    conn = _db()
    cur = conn.cursor()

    me = _current_user(cur, schema, token)
    if not me:
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unauthorized'})}
    if not me['can_access']:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or ('list_chats' if method == 'GET' else '')

    handle = ACTIONS.get(action)
    if handle:
        return handle(cur, conn, schema, me, body, qs)

    cur.close(); conn.close()
    return _bad('unknown_action')