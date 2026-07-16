import Icon from '@/components/ui/icon';
import { kbCatMeta } from './shared';

export default function CatBadge({ id }: { id: string }) {
  const c = kbCatMeta(id);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md"
      style={{ background: `hsl(${c.color} / 0.12)`, color: `hsl(${c.color})` }}
    >
      <Icon name={c.icon} size={10} />
      {c.label}
    </span>
  );
}
