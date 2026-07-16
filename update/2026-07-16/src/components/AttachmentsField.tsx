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
}: {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  uploadUrl: string;
  authHeaders: () => Record<string, string>;
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
        body: JSON.stringify({ action: 'upload_file', data: dataUrl, name: file.name, contentType: file.type }),
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

  return (
    <div>
      {!!attachments.length && (
        <div className="flex flex-col gap-1.5 mb-2">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <Icon name={fileIconFor(a.name)} size={16} className="text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{fmtSize(a.size)}</span>
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