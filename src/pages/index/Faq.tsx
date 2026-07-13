import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import func2url from '../../../backend/func2url.json';
import { authHeaders } from './shared';

export const FAQ_URL = (func2url as Record<string, string>).faq;

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  authorId: number | null;
  updatedById: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const inputCls = 'w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';

export default function Faq({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FaqItem | 'new' | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(FAQ_URL, { method: 'GET', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  async function saveItem(payload: { id?: string; question: string; answer: string }) {
    const action = payload.id ? 'update' : 'create';
    try {
      const res = await fetch(FAQ_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action, ...payload }),
      });
      if (res.ok) {
        setEditing(null);
        loadList();
      }
    } catch {
      /* ignore */
    }
  }

  async function deleteItem(id: string) {
    setConfirmDelId(null);
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await fetch(FAQ_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id }),
      });
    } catch {
      /* ignore */
    }
  }

  async function reorder(newOrder: FaqItem[]) {
    setItems(newOrder);
    try {
      await fetch(FAQ_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'reorder', ids: newOrder.map((i) => i.id) }),
      });
    } catch {
      /* ignore */
    }
  }

  function moveItem(id: string, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    reorder(next);
  }

  const filtered = items.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q);
  });

  if (editing) {
    return (
      <FaqEditor
        item={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSave={saveItem}
      />
    );
  }

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Icon name="HelpCircle" size={20} className="text-primary" />
        <h2 className="font-display tracking-wide text-lg">FAQ</h2>
        <span className="text-sm text-muted-foreground">· {items.length} вопросов</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Ответы на частые вопросы о том, как пользоваться задачником.</p>

      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по вопросам..."
            className={inputCls + ' pl-9'}
          />
        </div>
        {isAdmin && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            <Icon name="Plus" size={15} />
            <span className="hidden sm:inline">Вопрос</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Icon name="Loader2" size={26} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="HelpCircle" size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{search.trim() ? 'Ничего не найдено' : 'Здесь пока нет вопросов — добавьте первый'}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item, idx) => {
            const isOpen = openId === item.id;
            return (
              <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
                >
                  <Icon name="ChevronRight" size={16} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <span className="text-sm font-medium flex-1">{item.question}</span>
                  {isAdmin && !search.trim() && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => moveItem(item.id, -1)}
                        disabled={idx === 0}
                        title="Переместить выше"
                        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <Icon name="ChevronUp" size={13} />
                      </button>
                      <button
                        onClick={() => moveItem(item.id, 1)}
                        disabled={idx === filtered.length - 1}
                        title="Переместить ниже"
                        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <Icon name="ChevronDown" size={13} />
                      </button>
                    </div>
                  )}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-border/60">
                    <div className="kb-content prose-invert text-sm" dangerouslySetInnerHTML={{ __html: item.answer || '<p class="text-muted-foreground">Ответ пока не добавлен.</p>' }} />
                    {isAdmin && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => setEditing(item)}
                          className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
                        >
                          <Icon name="Pencil" size={12} />
                          Редактировать
                        </button>
                        {confirmDelId === item.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Удалить?</span>
                            <button onClick={() => deleteItem(item.id)} className="h-8 px-2.5 rounded-lg bg-destructive/90 text-white text-xs hover:bg-destructive transition-colors">Да</button>
                            <button onClick={() => setConfirmDelId(null)} className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">Нет</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelId(item.id)}
                            className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1.5"
                          >
                            <Icon name="Trash2" size={12} />
                            Удалить
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FaqEditor({ item, onCancel, onSave }: {
  item: FaqItem | null;
  onCancel: () => void;
  onSave: (p: { id?: string; question: string; answer: string }) => void;
}) {
  const [question, setQuestion] = useState(item?.question ?? '');
  const [answer, setAnswer] = useState(item?.answer ?? '');
  const [saving, setSaving] = useState(false);

  function submit() {
    if (!question.trim() || saving) return;
    setSaving(true);
    onSave({ id: item?.id, question: question.trim(), answer });
  }

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
          <Icon name="ArrowLeft" size={14} />
          Отмена
        </button>
        <h2 className="font-display tracking-wide text-lg">{item ? 'Редактирование вопроса' : 'Новый вопрос'}</h2>
        <button
          onClick={submit}
          disabled={!question.trim() || saving}
          className="ml-auto h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
        >
          {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
          Сохранить
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Вопрос</label>
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="О чём вопрос?"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Ответ</label>
          <RichEditor content={answer} onChange={setAnswer} placeholder="Опишите ответ: шаги, пояснения, ссылки..." />
        </div>
      </div>
    </div>
  );
}