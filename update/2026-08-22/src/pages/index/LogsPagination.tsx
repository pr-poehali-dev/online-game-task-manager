import Icon from '@/components/ui/icon';
import { PAGE_SIZE } from './LogsTypes';

interface LogsPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (updater: (p: number) => number) => void;
}

export default function LogsPagination({ page, totalPages, onPageChange }: LogsPaginationProps) {
  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-xs text-muted-foreground">Страница {page} из {totalPages} · по {PAGE_SIZE} строк</span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange((p) => Math.max(1, p - 1))}
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name="ChevronLeft" size={14} />
        </button>
        <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange((p) => p + 1)}
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Icon name="ChevronRight" size={14} />
        </button>
      </div>
    </div>
  );
}
