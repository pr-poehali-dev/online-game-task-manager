import { useState } from 'react';
import Icon from '@/components/ui/icon';
import CabinetServers from './CabinetServers';
import CabinetCategories from './CabinetCategories';
import CabinetStorage from './CabinetStorage';

type ProjectSubsection = 'menu' | 'servers' | 'categories' | 'storage';

// Остальные подразделы (Лаунчер, Служебные ключи) — заглушки, по требованию пользователя будут
// наполнены отдельными этапами. "Серверы", "Категории" и "Хранилище (MinIO)" уже реализованы
// полностью (см. CabinetServers.tsx / CabinetCategories.tsx / CabinetStorage.tsx) и открываются
// отдельным экраном внутри этого раздела.
const PLACEHOLDER_ITEMS = [
  { icon: 'UploadCloud', label: 'Лаунчер', description: 'Настройки заливки патчей и лаунчера' },
  { icon: 'KeyRound', label: 'Служебные ключи', description: 'Прочая служебная информация для работы проекта' },
];

export default function CabinetProject() {
  const [sub, setSub] = useState<ProjectSubsection>('menu');

  if (sub === 'servers' || sub === 'categories' || sub === 'storage') {
    return (
      <div>
        <button
          onClick={() => setSub('menu')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <Icon name="ArrowLeft" size={14} />
          Управление проектом
        </button>
        {sub === 'servers' ? <CabinetServers /> : sub === 'categories' ? <CabinetCategories /> : <CabinetStorage />}
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Управление проектом</h1>
      <p className="text-sm text-muted-foreground mb-6">Настройка серверов, категорий и служебной информации проекта.</p>

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

        <button
          onClick={() => setSub('categories')}
          className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Icon name="Tag" size={17} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Категории</div>
            <div className="text-xs text-muted-foreground">Категории задач и статей</div>
          </div>
          <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
        </button>

        <button
          onClick={() => setSub('storage')}
          className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Icon name="Cloud" size={17} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Хранилище (MinIO)</div>
            <div className="text-xs text-muted-foreground">Адреса и ключи для файлового хранилища</div>
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
