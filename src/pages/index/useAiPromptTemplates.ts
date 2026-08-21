import { useCallback, useEffect, useState } from 'react';
import { AI_URL, authHeaders } from './shared';
import type { AiPromptTemplate } from './AiPromptTemplates';

// Хук управления ИНДИВИДУАЛЬНЫМИ шаблонами промптов пользователя (см. backend/ai/index.py,
// action=list_templates/create_template/update_template/delete_template, таблица
// ai_prompt_templates). Вынесен из Ai.tsx отдельно, т.к. используется и в композере (AiComposer →
// AiTemplatesPicker, только чтение) и в разделе управления (AiTemplatesManager — полный CRUD).
export function useAiPromptTemplates() {
  const [templates, setTemplates] = useState<AiPromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'list_templates' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setTemplates(data.templates || []);
    } catch {
      /* ignore — раздел шаблонов просто останется пустым, не критично для основного чата */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createTemplate(draft: Omit<AiPromptTemplate, 'id'>): Promise<boolean> {
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'create_template', ...draft }),
    });
    if (res.ok) await load();
    return res.ok;
  }

  async function updateTemplate(template: AiPromptTemplate): Promise<boolean> {
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'update_template', ...template }),
    });
    if (res.ok) await load();
    return res.ok;
  }

  async function deleteTemplate(id: number): Promise<boolean> {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'delete_template', id }),
    });
    if (!res.ok) await load();
    return res.ok;
  }

  return { templates, loading, load, createTemplate, updateTemplate, deleteTemplate };
}
