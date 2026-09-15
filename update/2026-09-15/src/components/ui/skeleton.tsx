import { cn } from "@/lib/utils"

/**
 * Заглушка загрузки. Вместо мигания прозрачностью (animate-pulse) — блик, пробегающий слева
 * направо: пульсация читается как «что-то сломалось и моргает», а движение блика — как процесс.
 * Сам блок при этом остаётся спокойным, без скачков яркости.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/70",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer",
        "before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.06] before:to-transparent",
        className
      )}
      {...props}
    />
  )
}

/**
 * Скелетон карточки задачи — повторяет реальную геометрию BoardTaskCard (строка бейджей,
 * заголовок, нижний ряд с аватарами). Заглушка, совпадающая по форме с будущим содержимым,
 * subjectively ускоряет загрузку сильнее, чем любая оптимизация: interface не «прыгает».
 */
export function TaskCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border/70 bg-card p-4 shadow-raised", className)}>
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-4 w-16 rounded-md" />
      </div>
      <Skeleton className="h-4 w-[85%] mb-2" />
      <Skeleton className="h-4 w-[60%] mb-3.5" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-4 w-16 rounded-md" />
        <Skeleton className="h-3.5 w-10 ml-auto" />
      </div>
    </div>
  )
}

/**
 * Колонка доски целиком: несколько карточек с убывающей непрозрачностью — взгляд не упирается
 * в ровную «стену» одинаковых прямоугольников.
 */
export function BoardColumnSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <TaskCardSkeleton key={i} className={i > 0 ? "opacity-[0.6]" : undefined} />
      ))}
    </div>
  )
}

export { Skeleton }
