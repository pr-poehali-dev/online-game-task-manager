import { useState } from 'react';
import Icon from '@/components/ui/icon';
import CabinetServers from './CabinetServers';
import CabinetCategories from './CabinetCategories';
import CabinetStorage from './CabinetStorage';
import CabinetServiceKeys from './CabinetServiceKeys';

type ProjectSubsection = 'menu' | 'servers' | 'categories' | 'storage' | 'keys';

export default function CabinetProject({ isOwner }: { isOwner: boolean }) {
  const [sub, setSub] = useState<ProjectSubsection>('menu');

  if (sub !== 'menu') {
    return (
      <div>
        <button
          onClick={() => setSub('menu')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <Icon name="ArrowLeft" size={14} />
          Управление проектом
        </button>
        {sub === 'servers' && <CabinetServers />}
        {sub === 'categories' && <CabinetCategories />}
        {sub === 'storage' && <CabinetStorage />}
        {sub === 'keys' && <CabinetServiceKeys />}
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
            <div className="text-sm font-medium flex items-center gap-1.5">
              Хранилище (MinIO)
              {/* Backend (storage-config/index.py) разрешает читать/менять эти настройки только
                  владельцу проекта (OWNER_USER_ID) — остальным показываем замок сразу в меню,
                  чтобы не заводить в тупик (раньше пункт открывался, но внутри было "доступно
                  только владельцу"). */}
              {!isOwner && <Icon name="Lock" size={12} className="text-muted-foreground" />}
            </div>
            <div className="text-xs text-muted-foreground">Адреса и ключи для файлового хранилища</div>
          </div>
          <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
        </button>

        <button
          onClick={() => setSub('keys')}
          className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Icon name="KeyRound" size={17} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium flex items-center gap-1.5">
              Служебные ключи
              {!isOwner && <Icon name="Lock" size={12} className="text-muted-foreground" />}
            </div>
            <div className="text-xs text-muted-foreground">Прочая служебная информация для работы проекта</div>
          </div>
          <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
        </button>
      </div>
    </div>
  );
}