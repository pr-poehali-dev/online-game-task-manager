import { useRef, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import func2url from '../../../backend/func2url.json';

const AUTH_URL = (func2url as Record<string, string>).auth;
const TOKEN_KEY = 'era_auth_token';

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(TOKEN_KEY) || '' };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export default function CabinetProfile({ user }: { user: AuthUser }) {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(user.nickname || '');
  const [savingNickname, setSavingNickname] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  async function saveNickname() {
    const value = nicknameInput.trim();
    setSavingNickname(true);
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'set_nickname', nickname: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error === 'nickname_too_long' ? 'Имя слишком длинное (максимум 60 символов)' : 'Не удалось сохранить имя');
        return;
      }
      await refreshUser();
      setEditingNickname(false);
      toast.success(value ? 'Имя изменено' : 'Возвращено имя из Telegram');
    } catch {
      toast.error('Не удалось сохранить имя');
    } finally {
      setSavingNickname(false);
    }
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Можно загрузить только изображение');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой (максимум 5 МБ)');
      return;
    }
    setUploadingAvatar(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'upload_avatar', data: dataUrl, ext, contentType: file.type }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error === 'file_too_large' ? 'Файл слишком большой (максимум 5 МБ)' : 'Не удалось загрузить фото');
        return;
      }
      await refreshUser();
      toast.success('Аватарка обновлена');
    } catch {
      toast.error('Не удалось загрузить фото');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    setRemovingAvatar(true);
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'remove_avatar' }),
      });
      if (!res.ok) {
        toast.error('Не удалось сбросить фото');
        return;
      }
      await refreshUser();
      toast.success('Аватарка сброшена');
    } catch {
      toast.error('Не удалось сбросить фото');
    } finally {
      setRemovingAvatar(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Мой профиль</h1>
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-4">
        <div className="relative shrink-0 group">
          {user.photo_url ? (
            <img src={user.photo_url} alt={user.first_name} className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-primary/15 flex items-center justify-center text-primary text-xl font-semibold">
              {user.first_name.slice(0, 1)}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            title="Загрузить фото"
            className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white disabled:opacity-100"
          >
            <Icon name={uploadingAvatar ? 'Loader2' : 'Camera'} size={18} className={uploadingAvatar ? 'animate-spin' : ''} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
        </div>
        <div className="min-w-0 flex-1">
          {editingNickname ? (
            <div className="flex items-center gap-1.5 mb-1">
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveNickname();
                  if (e.key === 'Escape') { setEditingNickname(false); setNicknameInput(user.nickname || ''); }
                }}
                autoFocus
                placeholder={`${user.tg_first_name || user.first_name}${user.tg_last_name ? ' ' + user.tg_last_name : ''}`}
                maxLength={60}
                className="w-full max-w-[220px] rounded-lg border border-border bg-secondary/60 px-2.5 py-1 text-sm focus:outline-none focus:border-primary"
              />
              <button onClick={saveNickname} disabled={savingNickname} className="text-xs text-primary hover:underline shrink-0">
                {savingNickname ? '...' : 'OK'}
              </button>
              <button
                onClick={() => { setEditingNickname(false); setNicknameInput(user.nickname || ''); }}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <Icon name="X" size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/name mb-1">
              <h2 className="text-lg font-semibold truncate">{user.first_name} {user.last_name ?? ''}</h2>
              <button
                onClick={() => { setEditingNickname(true); setNicknameInput(user.nickname || ''); }}
                title="Изменить отображаемое имя"
                className="opacity-0 group-hover/name:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
              >
                <Icon name="Pencil" size={13} />
              </button>
            </div>
          )}
          {user.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary">
            {user.role === 'admin' ? 'Администратор' : 'Участник команды'}
          </span>
        </div>
      </div>

      {(user.nickname || user.avatar_url) && (
        <div className="mt-3 rounded-xl border border-border bg-secondary/30 p-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Вы задали своё имя и/или фото — они не заменяются данными из Telegram при новом входе.
          </p>
          {user.avatar_url && (
            <button
              onClick={removeAvatar}
              disabled={removingAvatar}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0 whitespace-nowrap"
            >
              {removingAvatar ? 'Сброс...' : 'Сбросить фото'}
            </button>
          )}
        </div>
      )}

      {user.tg_username && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <Icon name="Send" size={16} className="text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Telegram</div>
            <a
              href={`https://t.me/${user.tg_username.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:underline hover:text-primary truncate"
            >
              @{user.tg_username.replace('@', '')}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
