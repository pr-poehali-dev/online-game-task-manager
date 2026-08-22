'''Агентная работа ассистента с файлами проекта (этап 3 плана AI_PROJECTS_PLAN.md).

Отличие от обычного чата: модель не получает файлы проекта заранее (их слишком много и это дорого),
а получает ИНСТРУМЕНТЫ и сама решает, чем воспользоваться:

- search_project_files — найти по содержимому документов проекта
- read_file — прочитать конкретный файл целиком (точнее, его начало — до READ_FILE_LIMIT)
- list_project_files — посмотреть, какие файлы вообще есть в проекте

Цикл: модель просит вызвать инструмент → выполняем у себя → возвращаем результат → модель либо
просит следующий, либо отвечает. Потолок MAX_AGENT_STEPS защищает от зацикливания и лишних трат.

Все использованные документы возвращаются как ИСТОЧНИКИ и сохраняются вместе с сообщением
(ai_messages.sources) — сотрудник должен видеть, на чём основан ответ, и уметь его проверить.'''

import json

from common import (
    _cors_headers, _bad, _ok, _service_key, _get_or_create_usage, _current_month,
    _aitunnel_request, MAX_HISTORY_MESSAGES,
)
from indexing import search_chunks

# Сколько раз подряд модель может попросить инструмент, прежде чем обязана ответить. 4 хватает на
# сценарий "посмотреть список файлов → поискать → прочитать нужный → ответить", а больше — почти
# всегда признак зацикливания (и лишние деньги за каждый шаг).
MAX_AGENT_STEPS = 4

# Сколько символов файла отдаём модели при read_file. Больше нет смысла: длинный документ съест
# контекст и деньги, а для точного ответа обычно достаточно найденных фрагментов.
READ_FILE_LIMIT = 12000

# Сколько фрагментов возвращает один поиск.
SEARCH_LIMIT = 6

AGENT_TOOLS = [
    {
        'type': 'function',
        'function': {
            'name': 'search_project_files',
            'description': (
                'Ищет по содержимому документов проекта. Используй ВСЕГДА, когда вопрос касается '
                'данных, которые могут быть в файлах проекта (цифры, сроки, условия, имена, '
                'формулировки). Возвращает фрагменты текста с указанием файла-источника.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'query': {
                        'type': 'string',
                        'description': 'Поисковый запрос: ключевые слова из вопроса пользователя',
                    },
                },
                'required': ['query'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'read_file',
            'description': (
                'Читает начало конкретного файла проекта целиком. Используй, когда нужен общий '
                'смысл документа, а не отдельный факт, либо когда поиск нашёл файл, но фрагментов '
                'не хватает для ответа.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'fileId': {'type': 'integer', 'description': 'Идентификатор файла из списка файлов проекта'},
                },
                'required': ['fileId'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'list_project_files',
            'description': 'Показывает список файлов проекта с их идентификаторами и размерами.',
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
]


def _system_prompt(project, files_line):
    instructions = (project.get('instructions') or '').strip()
    base = (
        f'Ты — ассистент, который работает с проектом «{project["name"]}» — рабочим пространством '
        f'сотрудника с его документами.\n\n'
        f'Правила работы:\n'
        f'1. Если вопрос касается содержимого документов — ОБЯЗАТЕЛЬНО сначала вызови '
        f'search_project_files, не отвечай по памяти и не выдумывай.\n'
        f'2. Отвечай, опираясь на найденное. Если в документах нужных данных нет — прямо скажи '
        f'об этом, а не додумывай.\n'
        f'3. Указывай, из какого файла взята информация.\n'
        f'4. Отвечай на русском, по делу, без лишних вступлений.\n\n'
        f'Файлы проекта:\n{files_line}'
    )
    if instructions:
        base += f'\n\nОсобые указания сотрудника для этого проекта:\n{instructions}'
    return base


def _project_files(cur, schema, user_id, project_id):
    cur.execute(
        f"SELECT id, name, size, index_status FROM {schema}.ai_files "
        f"WHERE user_id = %s AND project_id = %s ORDER BY id ASC",
        (user_id, project_id)
    )
    return cur.fetchall()


def _files_line(files):
    if not files:
        return '(в проекте пока нет файлов)'
    lines = []
    for fid, name, size, status in files:
        mark = '' if status == 'ready' else ' — текст недоступен для поиска'
        lines.append(f'- [{fid}] {name} ({round((size or 0) / 1024)} КБ){mark}')
    return '\n'.join(lines)


def _run_tool(cur, schema, user_id, project_id, name, args, sources, steps):
    '''Выполняет инструмент, о котором попросила модель, и возвращает текст результата для неё.
    Попутно копит источники (какие файлы реально использовались) и шаги (что делал агент).'''
    if name == 'search_project_files':
        query = str(args.get('query') or '').strip()
        hits = search_chunks(cur, schema, user_id, project_id, query, SEARCH_LIMIT)
        steps.append({'tool': 'search', 'arg': query, 'found': len(hits)})
        if not hits:
            return f'По запросу «{query}» в документах проекта ничего не найдено.'
        parts = []
        for hit in hits:
            sources.append({
                'fileId': hit['fileId'], 'fileName': hit['fileName'], 'fileUrl': hit['fileUrl'],
                'quote': hit['content'][:300],
            })
            parts.append(f"Из файла «{hit['fileName']}» (id {hit['fileId']}):\n{hit['content']}")
        return '\n\n---\n\n'.join(parts)

    if name == 'read_file':
        try:
            file_id = int(args.get('fileId'))
        except (TypeError, ValueError):
            return 'Не указан корректный идентификатор файла.'
        cur.execute(
            f"SELECT name, url FROM {schema}.ai_files WHERE id = %s AND user_id = %s AND project_id = %s",
            (file_id, user_id, project_id)
        )
        row = cur.fetchone()
        if not row:
            return 'Такого файла в проекте нет.'
        file_name, file_url = row
        cur.execute(
            f"SELECT content FROM {schema}.ai_file_chunks WHERE file_id = %s ORDER BY chunk_index ASC",
            (file_id,)
        )
        chunks = [r[0] for r in cur.fetchall()]
        steps.append({'tool': 'read', 'arg': file_name, 'found': len(chunks)})
        if not chunks:
            return f'Файл «{file_name}» не содержит извлекаемого текста (возможно, это изображение или скан).'
        text = '\n'.join(chunks)[:READ_FILE_LIMIT]
        sources.append({'fileId': file_id, 'fileName': file_name, 'fileUrl': file_url, 'quote': text[:300]})
        return f'Содержимое файла «{file_name}»:\n{text}'

    if name == 'list_project_files':
        files = _project_files(cur, schema, user_id, project_id)
        steps.append({'tool': 'list', 'arg': '', 'found': len(files)})
        return _files_line(files)

    return 'Неизвестный инструмент.'


def _dedupe_sources(sources):
    '''Один и тот же файл мог попасть в источники несколько раз (разные фрагменты) — оставляем по
    одной записи на файл, иначе под ответом будет список из десяти одинаковых названий.'''
    seen, result = set(), []
    for src in sources:
        if src['fileId'] in seen:
            continue
        seen.add(src['fileId'])
        result.append(src)
    return result


def handle_project_message(cur, conn, schema, me, body, qs):
    '''Сообщение в сессии проекта: ассистент сам ищет по документам и отвечает со ссылками на них.

    Стоимость КАЖДОГО шага агента списывается в тот же месячный лимит трат сотрудника, что и
    обычный чат — отдельного кошелька у проектов нет.'''
    model = (body.get('model') or '').strip()
    content = (body.get('content') or '').strip()
    chat_id = body.get('chatId')
    project_id = body.get('projectId')
    if not model or not content or not project_id:
        cur.close(); conn.close()
        return _bad('bad_request')

    cur.execute(
        f"SELECT id, name, instructions FROM {schema}.ai_projects WHERE id = %s AND user_id = %s",
        (project_id, me['id'])
    )
    prow = cur.fetchone()
    if not prow:
        cur.close(); conn.close()
        return _bad('not_found', 404)
    project = {'id': prow[0], 'name': prow[1], 'instructions': prow[2]}

    spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
    if spent >= limit_:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'limit_exceeded', 'spentRub': spent, 'limitRub': limit_})}

    api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
    if not api_key:
        cur.close(); conn.close()
        return _bad('aitunnel_not_configured')

    if chat_id:
        cur.execute(
            f"SELECT id FROM {schema}.ai_chats WHERE id = %s AND user_id = %s AND project_id = %s",
            (chat_id, me['id'], project_id)
        )
        if not cur.fetchone():
            cur.close(); conn.close()
            return _bad('not_found', 404)
    else:
        title = content[:60] + ('…' if len(content) > 60 else '')
        cur.execute(
            f"INSERT INTO {schema}.ai_chats (user_id, title, mode, model, project_id) "
            f"VALUES (%s, %s, 'chat', %s, %s) RETURNING id",
            (me['id'], title, model, project_id)
        )
        chat_id = cur.fetchone()[0]

    cur.execute(
        f"INSERT INTO {schema}.ai_messages (chat_id, role, content) VALUES (%s, 'user', %s) "
        f"RETURNING id, created_at",
        (chat_id, content)
    )
    user_msg_id, user_created_at = cur.fetchone()

    files = _project_files(cur, schema, me['id'], project_id)
    cur.execute(
        f"SELECT role, content FROM {schema}.ai_messages WHERE chat_id = %s AND content <> '' "
        f"ORDER BY id DESC LIMIT %s",
        (chat_id, MAX_HISTORY_MESSAGES)
    )
    history = [{'role': r, 'content': c} for r, c in reversed(cur.fetchall())]
    messages = [{'role': 'system', 'content': _system_prompt(project, _files_line(files))}] + history

    sources, steps = [], []
    total_cost = 0.0
    answer = ''
    used_model = model

    for _step in range(MAX_AGENT_STEPS):
        data, err = _aitunnel_request('/chat/completions', api_key, {
            'model': model, 'messages': messages, 'tools': AGENT_TOOLS,
            'tool_choice': 'auto', 'max_tokens': 4000,
        })
        if err:
            cur.close(); conn.close()
            status, payload = err
            payload['userMessageId'] = user_msg_id
            payload['chatId'] = chat_id
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload)}

        choice = (data.get('choices') or [{}])[0]
        message = choice.get('message') or {}
        used_model = data.get('model') or model
        total_cost += float((data.get('usage') or {}).get('cost_rub') or 0)

        tool_calls = message.get('tool_calls') or []
        if not tool_calls:
            answer = (message.get('content') or '').strip()
            break

        # Ответ модели с запросом инструментов кладём в историю как есть — этого требует протокол:
        # каждый результат инструмента должен ссылаться на свой tool_call_id.
        messages.append({
            'role': 'assistant',
            'content': message.get('content') or '',
            'tool_calls': tool_calls,
        })
        for call in tool_calls:
            fn = call.get('function') or {}
            try:
                args = json.loads(fn.get('arguments') or '{}')
            except Exception:
                args = {}
            result = _run_tool(cur, schema, me['id'], project_id, fn.get('name'), args, sources, steps)
            messages.append({
                'role': 'tool',
                'tool_call_id': call.get('id'),
                'name': fn.get('name'),
                'content': result[:READ_FILE_LIMIT],
            })

    if not answer:
        answer = ('Не удалось собрать ответ по документам проекта за отведённое число шагов — '
                  'попробуйте задать вопрос конкретнее.')

    sources = _dedupe_sources(sources)
    cur.execute(
        f"INSERT INTO {schema}.ai_messages (chat_id, role, content, model, cost_rub, sources, agent_steps) "
        f"VALUES (%s, 'assistant', %s, %s, %s, %s, %s) RETURNING id, created_at",
        (chat_id, answer, used_model, total_cost,
         json.dumps(sources) if sources else None,
         json.dumps(steps) if steps else None)
    )
    assistant_msg_id, assistant_created_at = cur.fetchone()

    cur.execute(
        f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
        (total_cost, me['id'], _current_month())
    )
    cur.execute(f"UPDATE {schema}.ai_chats SET updated_at = NOW() WHERE id = %s", (chat_id,))
    cur.execute(f"UPDATE {schema}.ai_projects SET updated_at = NOW() WHERE id = %s", (project_id,))

    cur.close(); conn.close()
    return _ok({
        'chatId': chat_id,
        'projectId': project_id,
        'userMessage': {
            'id': user_msg_id, 'role': 'user', 'content': content,
            'createdAt': user_created_at.isoformat(),
        },
        'assistantMessage': {
            'id': assistant_msg_id, 'role': 'assistant', 'content': answer, 'model': used_model,
            'costRub': round(total_cost, 5), 'sources': sources, 'agentSteps': steps,
            'createdAt': assistant_created_at.isoformat(),
        },
        'usage': {'spentRub': spent + total_cost, 'limitRub': limit_},
    })
