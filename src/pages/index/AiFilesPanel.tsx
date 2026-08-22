import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { fmtFileSize } from '../admin/adminShared';
import type { AiFilesState, AiUserFile } from './useAiFiles';

// Порядок групп в дереве — сначала то, что сотрудник загрузил сам (именно эти файлы расходуют
// лимит), потом результаты генерации.
const GROUP_ORDER = ['upload', 'template', 'document', 'image', 'video'];

const GROUP_ICONS: Record<string, string> = {
  upload: 'Paperclip',
  template: 'FileCheck2',
  document: 'FileSpreadsheet',
  image: 'Image',
  video: 'Video',
};

function fileIcon(file: AiUserFile): string {
  if (file.contentType.startsWith('image/')) return 'Image';
  if (file.contentType.startsWith('video/')) return 'Video';
  if (file.contentType.startsWith('audio/')) return 'Music';
  if (file.contentType === 'application/pdf') return 'FileText';
  return 'File';
}

// AiFilesPanel — «Мои файлы»: дерево всех файлов сотрудника в разделе AI с расходом личного
// лимита и самостоятельной очисткой (по одному файлу или целой папкой). Показывается выезжающей
// панелью поверх чата, чтобы не занимать место в основном интерфейсе.
export default function AiFilesPanel({ state, onClose }: { state: AiFilesState; onClose: () => void }) {
  const { files, totalSize, usedFiles, limitFiles, usedMb, limitMb, loading, busyId, clearing } = state;
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(['upload', 'template']));
  // Подтверждение очистки целой папки/всего — необратимое действие, спрашиваем прямо в панели,
  // а не системным confirm (он выглядит чужеродно и легко проскакивается).
  const [confirmClear, setConfirmClear] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, AiUserFile[]>();
    for (const f of files) {
      const list = map.get(f.kind) || [];
      list.push(f);
      map.set(f.kind, list);
    }
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({
      kind: k,
      label: map.get(k)![0].group,
      items: map.get(k)!,
    }));
  }, [files]);

  const percent = limitFiles > 0 ? Math.min(100, (usedFiles / limitFiles) * 100) : 0;
  const sizePercent = limitMb > 0 ? Math.min(100, (usedMb / limitMb) * 100) : 0;
  // Загрузка блокируется, если исчерпан ЛЮБОЙ из двух лимитов — количество или объём.
  const countExceeded = limitFiles > 0 && usedFiles >= limitFiles;
  const sizeExceeded = limitMb > 0 && usedMb >= limitMb;
  const nearLimit = countExceeded || sizeExceeded;

  function toggleGroup(kind: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <Icon name="FolderCog" size={16} className="text-primary shrink-0" />
          <span className="text-sm font-medium flex-1">Мои файлы</span>
          <button
            onClick={state.load}
            title="Обновить список"
            className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="RefreshCw" size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            title="Закрыть"
            className="h-8 w-8 shrink-0 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Расход личного лимита: считаются только загруженные сотрудником файлы, результаты
            генерации место в лимите не занимают (они уже ограничены лимитом трат). */}
        <div className="space-y-1.5">
          <div className="space-y-1">
            <div className="h-1 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${countExceeded ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Файлов: {usedFiles} из {limitFiles}</span>
              <span>всего {fmtFileSize(totalSize)}</span>
            </div>
          </div>
          {/* Второй лимит — суммарный объём. Показываем отдельной полосой: упереться можно в
              любой из двух, и сотруднику важно видеть, какой именно заканчивается. */}
          <div className="space-y-1">
            <div className="h-1 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${sizeExceeded ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${sizePercent}%` }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Объём: {usedMb} из {limitMb} МБ
            </div>
          </div>
        </div>

        {nearLimit && (
          <div className="text-[11px] text-destructive flex items-start gap-1.5">
            <Icon name="AlertCircle" size={12} className="shrink-0 mt-0.5" />
            {countExceeded
              ? 'Лимит количества файлов исчерпан — очистите ненужные, чтобы снова прикреплять файлы'
              : 'Лимит объёма исчерпан — очистите ненужные файлы, чтобы освободить место'}
          </div>
        )}

        {files.length > 0 && (
          confirmClear === 'all' ? (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="flex-1 text-muted-foreground">Очистить все файлы?</span>
              <button
                onClick={() => { setConfirmClear(null); state.clearFiles(); }}
                className="h-7 px-2.5 rounded-lg bg-destructive text-destructive-foreground font-medium hover:opacity-90 transition-opacity"
              >
                Очистить
              </button>
              <button
                onClick={() => setConfirmClear(null)}
                className="h-7 px-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear('all')}
              disabled={clearing}
              className="w-full h-8 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {clearing ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Trash2" size={13} />}
              Очистить все файлы
            </button>
          )
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
        {loading && files.length === 0 ? (
          <div className="py-8 flex justify-center">
            <Icon name="Loader2" size={18} className="animate-spin text-primary" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 px-2">
            Вы пока не загружали файлы в AI
          </div>
        ) : (
          groups.map((group) => {
            const open = openGroups.has(group.kind);
            const groupSize = group.items.reduce((sum, f) => sum + f.size, 0);
            return (
              <div key={group.kind}>
                <div className="flex items-center gap-1 group/folder">
                  <button
                    onClick={() => toggleGroup(group.kind)}
                    className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={12} className="shrink-0 text-muted-foreground" />
                    <Icon name={GROUP_ICONS[group.kind] || 'Folder'} size={13} className="shrink-0 text-primary" />
                    <span className="truncate">{group.label}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground">
                      {group.items.length} · {fmtFileSize(groupSize)}
                    </span>
                  </button>
                  {confirmClear === group.kind ? (
                    <button
                      onClick={() => { setConfirmClear(null); state.clearFiles(group.kind); }}
                      title="Подтвердить очистку папки"
                      className="h-7 px-2 shrink-0 rounded-lg bg-destructive text-destructive-foreground text-[10px] font-medium hover:opacity-90 transition-opacity"
                    >
                      Точно?
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmClear(group.kind)}
                      title="Очистить всю папку"
                      className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground opacity-0 group-hover/folder:opacity-100 hover:text-destructive transition-all"
                    >
                      <Icon name="Trash2" size={12} />
                    </button>
                  )}
                </div>

                {open && (
                  <div className="pl-4 ml-2 border-l border-border/60 space-y-0.5 mt-0.5">
                    {group.items.map((file) => (
                      <div
                        key={file.id}
                        className="group/file flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-secondary/40 transition-colors"
                      >
                        <Icon name={fileIcon(file)} size={13} className="shrink-0 text-muted-foreground" />
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={file.name}
                          className="min-w-0 flex-1 text-xs truncate hover:text-primary transition-colors"
                        >
                          {file.name}
                        </a>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{fmtFileSize(file.size)}</span>
                        <button
                          onClick={() => state.deleteFile(file.id)}
                          disabled={busyId === file.id}
                          title="Очистить файл"
                          className="h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover/file:opacity-100 hover:text-destructive transition-all disabled:opacity-50"
                        >
                          {busyId === file.id
                            ? <Icon name="Loader2" size={11} className="animate-spin" />
                            : <Icon name="X" size={12} />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
