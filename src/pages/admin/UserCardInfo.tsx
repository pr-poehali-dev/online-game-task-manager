import Icon from '@/components/ui/icon';
import type { TeamUser } from './adminShared';

// UserCardInfo — левая часть карточки участника: аватар с индикатором онлайна, имя (с правкой),
// список задач и все лимиты раздела «AI» (траты, количество файлов, объём, число проектов).
// Разметка перенесена из UserList.tsx без изменений.
export default function UserCardInfo({
  u,
  pending,
  editNameId,
  setEditNameId,
  editFirstName,
  setEditFirstName,
  editLastName,
  setEditLastName,
  saveName,
  editSpecId,
  setEditSpecId,
  editSpecValue,
  setEditSpecValue,
  saveSpec,
  editAiLimitId,
  setEditAiLimitId,
  editAiLimitValue,
  setEditAiLimitValue,
  saveAiLimit,
  editAiFileLimitId,
  setEditAiFileLimitId,
  editAiFileLimitValue,
  setEditAiFileLimitValue,
  saveAiFileLimit,
  editAiSizeLimitId,
  setEditAiSizeLimitId,
  editAiSizeLimitValue,
  setEditAiSizeLimitValue,
  saveAiSizeLimit,
  editAiProjectLimitId,
  setEditAiProjectLimitId,
  editAiProjectLimitValue,
  setEditAiProjectLimitValue,
  saveAiProjectLimit,
}: {
  u: TeamUser;
  pending: boolean;
  editNameId: number | null;
  setEditNameId: (id: number | null) => void;
  editFirstName: string;
  setEditFirstName: (v: string) => void;
  editLastName: string;
  setEditLastName: (v: string) => void;
  saveName: (id: number) => void;
  editSpecId: number | null;
  setEditSpecId: (id: number | null) => void;
  editSpecValue: string;
  setEditSpecValue: (v: string) => void;
  saveSpec: (id: number) => void;
  editAiLimitId: number | null;
  setEditAiLimitId: (id: number | null) => void;
  editAiLimitValue: string;
  setEditAiLimitValue: (v: string) => void;
  saveAiLimit: (id: number) => void;
  editAiFileLimitId: number | null;
  setEditAiFileLimitId: (id: number | null) => void;
  editAiFileLimitValue: string;
  setEditAiFileLimitValue: (v: string) => void;
  saveAiFileLimit: (id: number) => void;
  editAiSizeLimitId: number | null;
  setEditAiSizeLimitId: (id: number | null) => void;
  editAiSizeLimitValue: string;
  setEditAiSizeLimitValue: (v: string) => void;
  saveAiSizeLimit: (id: number) => void;
  editAiProjectLimitId: number | null;
  setEditAiProjectLimitId: (id: number | null) => void;
  editAiProjectLimitValue: string;
  setEditAiProjectLimitValue: (v: string) => void;
  saveAiProjectLimit: (id: number) => void;
}) {
  return (
    <>
      <div className="relative shrink-0">
        {u.photo_url ? (
          <img src={u.photo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center text-primary font-semibold">
            {u.first_name.slice(0, 1)}
          </div>
        )}
        <span
          title={u.online ? 'Онлайн' : 'Оффлайн'}
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${u.online ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        {editNameId === u.id ? (
          <div className="flex items-center gap-1">
            <input
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(u.id); if (e.key === 'Escape') setEditNameId(null); }}
              autoFocus
              placeholder="Имя"
              className="w-24 rounded border border-border bg-secondary/60 px-2 py-0.5 text-sm focus:outline-none"
            />
            <input
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(u.id); if (e.key === 'Escape') setEditNameId(null); }}
              placeholder="Фамилия"
              className="w-28 rounded border border-border bg-secondary/60 px-2 py-0.5 text-sm focus:outline-none"
            />
            <button onClick={() => saveName(u.id)} className="text-xs text-primary hover:underline shrink-0">OK</button>
            <button onClick={() => setEditNameId(null)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">
              <Icon name="X" size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group/name">
            <span className="text-sm font-medium truncate">{u.first_name} {u.last_name ?? ''}</span>
            <button
              onClick={() => { setEditNameId(u.id); setEditFirstName(u.first_name); setEditLastName(u.last_name || ''); }}
              title="Изменить имя"
              className="opacity-0 group-hover/name:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
            >
              <Icon name="Pencil" size={12} />
            </button>
            {pending && <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">ожидает входа</span>}
            {!u.is_active && <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">отключён</span>}
            {!u.show_in_team && <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">скрыт из команды</span>}
            {u.tg_notify_muted && <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">TG скрыт</span>}
          </div>
        )}
        {editSpecId === u.id ? (
          <div className="flex items-center gap-1 mt-1">
            <input
              value={editSpecValue}
              onChange={(e) => setEditSpecValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveSpec(u.id); if (e.key === 'Escape') setEditSpecId(null); }}
              autoFocus
              placeholder="Список задач"
              className="flex-1 rounded border border-border bg-secondary/60 px-2 py-0.5 text-xs focus:outline-none"
            />
            <button onClick={() => saveSpec(u.id)} className="text-xs text-primary hover:underline">OK</button>
          </div>
        ) : (
          <button
            onClick={() => { setEditSpecId(u.id); setEditSpecValue(u.specialization || ''); }}
            className="text-xs text-muted-foreground hover:text-foreground text-left truncate block max-w-full"
            title="Изменить список задач"
          >
            {u.specialization || <span className="italic opacity-60">задать список задач…</span>}
          </button>
        )}
        {u.permissions.ai_access && (
          editAiLimitId === u.id ? (
            <div className="flex items-center gap-1 mt-1">
              <Icon name="Sparkles" size={11} className="text-muted-foreground shrink-0" />
              <input
                value={editAiLimitValue}
                onChange={(e) => setEditAiLimitValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveAiLimit(u.id); if (e.key === 'Escape') setEditAiLimitId(null); }}
                autoFocus
                inputMode="decimal"
                placeholder="300"
                className="w-16 rounded border border-border bg-secondary/60 px-2 py-0.5 text-xs focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">₽/мес</span>
              <button onClick={() => saveAiLimit(u.id)} className="text-xs text-primary hover:underline">OK</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditAiLimitId(u.id); setEditAiLimitValue(String(u.ai_limit_rub)); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-0.5"
              title="Изменить месячный лимит трат на AI"
            >
              <Icon name="Sparkles" size={11} />
              Лимит AI: {u.ai_limit_rub.toFixed(0)} ₽/мес
            </button>
          )
        )}
        {/* Лимит на КОЛИЧЕСТВО файлов в разделе "AI" — отдельно от лимита трат: он не
            сбрасывается ежемесячно и ограничивает занимаемое место, а не расходы.
            0 — загрузка файлов сотруднику полностью запрещена. */}
        {u.permissions.ai_access && (
          editAiFileLimitId === u.id ? (
            <div className="flex items-center gap-1 mt-1">
              <Icon name="FolderCog" size={11} className="text-muted-foreground shrink-0" />
              <input
                value={editAiFileLimitValue}
                onChange={(e) => setEditAiFileLimitValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveAiFileLimit(u.id); if (e.key === 'Escape') setEditAiFileLimitId(null); }}
                autoFocus
                inputMode="numeric"
                placeholder="50"
                className="w-16 rounded border border-border bg-secondary/60 px-2 py-0.5 text-xs focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">файлов</span>
              <button onClick={() => saveAiFileLimit(u.id)} className="text-xs text-primary hover:underline">OK</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditAiFileLimitId(u.id); setEditAiFileLimitValue(String(u.ai_file_limit)); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-0.5"
              title="Сколько файлов сотрудник может одновременно хранить в разделе «AI». 0 — загрузка запрещена"
            >
              <Icon name="FolderCog" size={11} />
              Файлы AI: {u.ai_files_used} из {u.ai_file_limit}
            </button>
          )
        )}
        {/* Второй лимит — на суммарный ОБЪЁМ файлов: количество плохо отражает нагрузку на
            хранилище (десяток видео весит больше сотен документов). 0 — запрет загрузки. */}
        {u.permissions.ai_access && (
          editAiSizeLimitId === u.id ? (
            <div className="flex items-center gap-1 mt-1">
              <Icon name="HardDrive" size={11} className="text-muted-foreground shrink-0" />
              <input
                value={editAiSizeLimitValue}
                onChange={(e) => setEditAiSizeLimitValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveAiSizeLimit(u.id); if (e.key === 'Escape') setEditAiSizeLimitId(null); }}
                autoFocus
                inputMode="numeric"
                placeholder="1024"
                className="w-20 rounded border border-border bg-secondary/60 px-2 py-0.5 text-xs focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">МБ</span>
              <button onClick={() => saveAiSizeLimit(u.id)} className="text-xs text-primary hover:underline">OK</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditAiSizeLimitId(u.id); setEditAiSizeLimitValue(String(u.ai_size_limit_mb)); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-0.5"
              title="Суммарный объём файлов, который сотрудник может хранить в разделе «AI». 0 — загрузка запрещена"
            >
              <Icon name="HardDrive" size={11} />
              Объём AI: {u.ai_size_used_mb} из {u.ai_size_limit_mb} МБ
            </button>
          )
        )}
        {/* Третий лимит — число проектов (рабочих пространств с файлами и сессиями).
            Архивные проекты в лимит не считаются. 0 — создание проектов запрещено. */}
        {u.permissions.ai_access && (
          editAiProjectLimitId === u.id ? (
            <div className="flex items-center gap-1 mt-1">
              <Icon name="FolderKanban" size={11} className="text-muted-foreground shrink-0" />
              <input
                value={editAiProjectLimitValue}
                onChange={(e) => setEditAiProjectLimitValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveAiProjectLimit(u.id); if (e.key === 'Escape') setEditAiProjectLimitId(null); }}
                autoFocus
                inputMode="numeric"
                placeholder="10"
                className="w-16 rounded border border-border bg-secondary/60 px-2 py-0.5 text-xs focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">проектов</span>
              <button onClick={() => saveAiProjectLimit(u.id)} className="text-xs text-primary hover:underline">OK</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditAiProjectLimitId(u.id); setEditAiProjectLimitValue(String(u.ai_project_limit)); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-0.5"
              title="Сколько проектов сотрудник может держать в разделе «AI». Архивные не считаются. 0 — создание запрещено"
            >
              <Icon name="FolderKanban" size={11} />
              Проекты AI: {u.ai_projects_used} из {u.ai_project_limit}
            </button>
          )
        )}
        {(u.tg_username || u.username) && (
          <a href={`https://t.me/${(u.tg_username || u.username || '').replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
            @{(u.tg_username || u.username || '').replace('@', '')}
          </a>
        )}
      </div>
    </>
  );
}
