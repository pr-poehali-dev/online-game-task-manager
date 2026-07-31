import { useState } from 'react';
import Icon from '@/components/ui/icon';
import CabinetServers from './CabinetServers';

type ProjectSubsection = 'menu' | 'servers';

// Остальные подразделы (Категории, Хранилище/MinIO, Лаунчер, Служебные ключи) — заглушки, по
// требованию пользователя будут наполнены отдельными этапами. "Серверы" уже реализован полностью
// (см. CabinetServers.tsx) и открывается отдельным экраном внутри этого раздела.
const PLACEHOLDER_ITEMS = [
  { icon: 'Tag', label: 'Категории', description: 'Категории задач и статей' },
  { icon: 'Cloud', label: 'Хранилище (MinIO)', description: 'Адреса и ключи для файлового хранилища' },
  { icon: 'UploadCloud', label: 'Лаунчер', description: 'Настройки заливки патчей и лаунчера' },
  { icon: 'KeyRound', label: 'Служебные ключи', description: 'Прочая служебная информация для работы проекта' },
];

export default function CabinetProject() {
  const [sub, setSub] = useState<ProjectSubsection>('menu');

  if (sub === 'servers') {
    return (
      <div>
        <button
          onClick={() => setSub('menu')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <Icon name="ArrowLeft" size={14} />
          Управление проектом
        </button>
        <CabinetServers />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Управление проектом</h1>
      <p className="text-sm text-muted-foreground mb-6">Настройка серверов и служебной информации проекта.</p>

      <div className="space-y-2">
        <button
          onClick={() => setSub('servers')}
          className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Icon name="Server" size={17} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Серверы</div>
            <div className="text-xs text-muted-foreground">Добавление серверов и их настройка</div>
          </div>
          <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
        </button>

        {PLACEHOLDER_ITEMS.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-4 opacity-60"
          >
            <div className="h-9 w-9 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
              <Icon name={item.icon} size={17} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.description}</div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground shrink-0">скоро</span>
          </div>
        ))}
      </div>
    </div>
  );
}
