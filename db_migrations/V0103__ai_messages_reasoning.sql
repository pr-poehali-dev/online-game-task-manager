-- Раздел "AI": хранение хода рассуждений (reasoning) модели рядом с готовым ответом.
-- У части моделей (thinking-модели: o1/o3, DeepSeek-R1, Claude с расширенным мышлением и т.п.)
-- AI Tunnel по умолчанию возвращает цепочку мыслей в message.reasoning (см.
-- docs/ai-tunnel-api-reference.md, "Токены рассуждений") — раньше это никак не сохранялось и
-- терялось сразу после ответа. Храним рядом с текстом ответа, чтобы "Ход рассуждений" был виден
-- и после перезагрузки страницы, а не только в момент получения потокового ответа.
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS reasoning TEXT;

COMMENT ON COLUMN ai_messages.reasoning IS 'Цепочка рассуждений модели перед итоговым ответом (message.reasoning от AI Tunnel), если модель её отдаёт.';
