import Icon from '@/components/ui/icon';
import { useTheme } from '@/lib/theme';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors"
    >
      <Icon name={isDark ? 'Sun' : 'Moon'} size={15} />
    </button>
  );
}
