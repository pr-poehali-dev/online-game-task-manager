import { useState } from 'react';
import Icon from '@/components/ui/icon';
import RichEditor from '@/components/RichEditor';
import UserMultiSelect from './UserMultiSelect';
import { KNOWLEDGE_URL, authHeaders, kbCategories, inputCls, fmtSize, fileIconFor } from './shared';
import type { Article, KbCategoryId, KbAttachment, KbVisibility, Author } from './shared';

export default function ArticleEditor({ article, defaultCategory, authors, onCancel, onSave }: {
  article: Article | null;
  defaultCategory: KbCategoryId;
  authors: Author[];
  onCancel: () => void;
  onSave: (p: { id?: string; title: string; category: KbCategoryId; excerpt: string; content: string; attachments: KbAttachment[]; visibility: KbVisibility; allowedUserIds: number[] }) => void;
}) {
  const [title, setTitle] = useState(article?.title ?? '');
  const [category, setCategory] = useState<KbCategoryId>(article?.category ?? defaultCategory);
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? '');
  const [content, setContent] = useState(article?.content ?? '');
  const [attachments, setAttachments] = useState<KbAttachment[]>(article?.attachments ?? []);
  const [visibility, setVisibility] = useState<KbVisibility>(article?.visibility ?? 'public');
  const [allowedUserIds, setAllowedUserIds] = useState<number[]>(article?.allowedUserIds ?? []);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [saving, setSaving] = useState(false);

  async function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(file: File): Promise<string> {
    const dataUrl = await readAsDataUrl(file);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const res = await fetch(KNOWLEDGE_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'upload_image', data: dataUrl, ext, contentType: file.type }),
    });
    if (!res.ok) return '';
    const d = await res.json();
    return d.url || '';
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');
    setUploadingFile(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await fetch(KNOWLEDGE_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'upload_file', data: dataUrl, name: file.name, contentType: file.type }),
      });
      const d = await res.json();
      if (!res.ok) {
        setUploadError(d.error === 'file_too_large' ? 'Файл слишком большой (максимум 300 МБ)' : 'Не удалось загрузить файл');
        return;
      }
      if (d.attachment) setAttachments((prev) => [...prev, d.attachment]);
    } catch {
      setUploadError('Не удалось загрузить файл');
    } finally {
      setUploadingFile(false);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    onSave({ id: article?.id, title: title.trim(), category, excerpt: excerpt.trim(), content, attachments, visibility, allowedUserIds });
  }

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1.5">
          <Icon name="ArrowLeft" size={14} />
          Отмена
        </button>
        <h2 className="font-display tracking-wide text-lg">{article ? 'Редактирование статьи' : 'Новая статья'}</h2>
        <button
          onClick={submit}
          disabled={!title.trim() || saving}
          className="ml-auto h-9 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
        >
          {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
          Сохранить
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Заголовок статьи..."
          className="w-full bg-transparent text-xl font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1.5 transition-colors placeholder:text-muted-foreground/50"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Категория</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as KbCategoryId)}
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {kbCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Краткое описание</label>
            <input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="1-2 предложения для списка" className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Доступ к статье</label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={`flex-1 h-9 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                visibility === 'public' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              <Icon name="Globe" size={14} />
              Публичная
            </button>
            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={`flex-1 h-9 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                visibility === 'private' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              <Icon name="Lock" size={14} />
              Приватная
            </button>
          </div>
          {visibility === 'public' ? (
            <p className="text-xs text-muted-foreground">Статья видна всем участникам команды.</p>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Выберите, кому открыть доступ (администраторам и автору статья доступна всегда):</p>
              <UserMultiSelect authors={authors} value={allowedUserIds} onChange={setAllowedUserIds} />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Содержание</label>
          <RichEditor content={content} onChange={setContent} onImageUpload={uploadImage} placeholder="Опишите решение: шаги, изображения, ссылки..." />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Вложения (документы, архивы и другие файлы)</label>
          {!!attachments.length && (
            <div className="flex flex-col gap-1.5 mb-2">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <Icon name={fileIconFor(a.name)} size={16} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtSize(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    title="Убрать вложение"
                    className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Icon name="X" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors cursor-pointer">
            <Icon name={uploadingFile ? 'Loader2' : 'Paperclip'} size={14} className={uploadingFile ? 'animate-spin' : ''} />
            {uploadingFile ? 'Загрузка...' : 'Прикрепить файл'}
            <input type="file" className="hidden" onChange={handleAttachFile} disabled={uploadingFile} />
          </label>
          {uploadError && <p className="text-xs text-destructive mt-1.5">{uploadError}</p>}
        </div>
      </div>
    </div>
  );
}