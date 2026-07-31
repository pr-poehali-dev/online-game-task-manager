import Icon from '@/components/ui/icon';

// Заглушка раздела "Управление проектом" — по требованию пользователя наполнение (добавление
// серверов и их настройка, категорий, адресов для MinIO/лаунчера и прочей служебной информации
// для работы проекта, включая ключи) будет сделано отдельным этапом. Пока показываем список
// будущих подразделов неактивными карточками, чтобы обозначить структуру раздела.
const PLACEHOLDER_ITEMS = [
  { icon: 'Server', label: 'Серверы', description: 'Добавление серверов и их настройка' },
  { icon: 'Tag', label: 'Категории', description: 'Категории задач и статей' },
  { icon: 'Cloud', label: 'Хранилище (MinIO)', description: 'Адреса и ключи для файлового хранилища' },
  { icon: 'UploadCloud', label: 'Лаунчер', description: 'Настройки заливки патчей и лаунчера' },
  { icon: 'KeyRound', label: 'Служебные ключи', description: 'Прочая служебная информация для работы проекта' },
];

export default function CabinetProject() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Управление проектом</h1>
      <p className="text-sm text-muted-foreground mb-6">Раздел в разработке — наполнение появится отдельным этапом.</p>

      <div className="space-y-2">
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
