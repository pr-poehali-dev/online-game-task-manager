import { useState } from 'react';
import Icon from '@/components/ui/icon';

export interface Attachment {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
}

function fmtSize(bytes: number) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function fileIconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf', 'doc', 'docx'].includes(ext)) return 'FileText';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'FileSpreadsheet';
  if (['zip', 'rar', '7z'].includes(ext)) return 'FileArchive';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'FileImage';
  return 'File';
}

export function AttachmentsList({ attachments }: { attachments: Attachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/50 hover:bg-secondary/40 transition-colors"
        >
          <Icon name={fileIconFor(a.name)} size={16} className="text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">{a.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">{fmtSize(a.size)}</span>
          <Icon name="Download" size={13} className="text-muted-foreground shrink-0" />
        </a>
      ))}
    </div>
  );
}

export default function AttachmentsField({
  attachments,
  onChange,
  uploadUrl,
  authHeaders,
  action = 'upload_file',
  compact = false,
}: {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  uploadUrl: string;
  authHeaders: () => Record<string, string>;
  action?: string;
  compact?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action, data: dataUrl, name: file.name, contentType: file.type }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error === 'file_too_large' ? 'Файл слишком большой (максимум 300 МБ)' : 'Не удалось загрузить файл');
        return;
      }
      if (d.attachment) onChange([...attachments, d.attachment]);
    } catch {
      setError('Не удалось загрузить файл');
    } finally {
      setUploading(false);
    }
  }

  function remove(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
  }

  if (compact) {
    return (
      <div>
        {!!attachments.length && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs bg-secondary/40">
                <Icon name={fileIconFor(a.name)} size={12} className="text-muted-foreground shrink-0" />
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Скачать файл"
                  className="max-w-[140px] truncate hover:text-primary hover:underline transition-colors"
                >
                  {a.name}
                </a>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  title="Убрать вложение"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Icon name="X" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <label
          title="Прикрепить файл"
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer shrink-0"
        >
          <Icon name={uploading ? 'Loader2' : 'Paperclip'} size={15} className={uploading ? 'animate-spin' : ''} />
          <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {!!attachments.length && (
        <div className="flex flex-col gap-1.5 mb-2">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <Icon name={fileIconFor(a.name)} size={16} className="text-muted-foreground shrink-0" />
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Скачать файл"
                className="flex-1 truncate hover:text-primary hover:underline transition-colors"
              >
                {a.name}
              </a>
              <span className="text-xs text-muted-foreground shrink-0">{fmtSize(a.size)}</span>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Скачать файл"
                className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Icon name="Download" size={13} />
              </a>
              <button
                type="button"
                onClick={() => remove(a.id)}
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
        <Icon name={uploading ? 'Loader2' : 'Paperclip'} size={14} className={uploading ? 'animate-spin' : ''} />
        {uploading ? 'Загрузка...' : 'Прикрепить файл'}
        <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
      {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
    </div>
  );
}