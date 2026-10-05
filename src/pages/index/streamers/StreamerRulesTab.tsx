import { useState } from 'react';
import Icon from '@/components/ui/icon';
import RuleEditor from './RuleEditor';
import { useStreamerRules } from './useStreamerRules';
import type { Streamer, Rule, MatchMode } from './streamersTypes';

interface Props {
  active: boolean;
  canEdit: boolean;
  streamers: Streamer[];
  onChanged: () => void;
}

const MODE_LABEL: Record<MatchMode, string> = { any: 'любое слово', all: 'все слова' };

function RuleSummary({ rule }: { rule: Rule }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {rule.keywords.map((w) => (
        <span key={w} className="rounded-md bg-primary/15 text-primary font-medium px-2 py-0.5">{w}</span>
      ))}
      <span className="text-muted-foreground">({MODE_LABEL[rule.matchMode]})</span>
    </div>
  );
}

export default function StreamerRulesTab({ active, canEdit, streamers, onChanged }: Props) {
  const { defaultRule, own, loading, error, save, reset } = useStreamerRules(active, onChanged);
  const [editing, setEditing] = useState<number | 'default' | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Icon name="Loader2" size={16} className="animate-spin" />
        Загрузка…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive flex items-center gap-2">
        <Icon name="AlertCircle" size={15} />
        {error}
      </div>
    );
  }

  async function saveAnd(streamerId: number | null, keywords: string[], mode: MatchMode, base: Rule | null) {
    const err = await save(streamerId, keywords, mode, base);
    if (!err) setEditing(null);
    return err;
  }

  async function resetOne(id: number) {
    const err = await reset(id);
    setRowError((prev) => ({ ...prev, [id]: err || '' }));
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-sm font-medium">Общее правило для всех стримеров</div>
            <div className="text-xs text-muted-foreground">Действует на тех, у кого нет своего правила</div>
          </div>
          {canEdit && editing !== 'default' && (
            <button onClick={() => setEditing('default')} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-secondary/50 flex items-center gap-1.5 shrink-0">
              <Icon name="Pencil" size={12} />
              Изменить
            </button>
          )}
        </div>
        {editing === 'default' ? (
          <RuleEditor
            initialKeywords={defaultRule?.keywords || []}
            initialMode={defaultRule?.matchMode || 'any'}
            saveLabel="Сохранить"
            onSave={(k, m) => saveAnd(null, k, m, defaultRule)}
            onCancel={() => setEditing(null)}
          />
        ) : defaultRule ? (
          <RuleSummary rule={defaultRule} />
        ) : (
          <div className="text-xs text-amber-500">Общее правило не задано, слова не проверяются</div>
        )}
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Правила по стримерам</div>
        {streamers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Стримеров пока нет. Добавьте их на вкладке «Список»
          </div>
        ) : (
          <div className="space-y-2">
            {streamers.map((s) => {
              const rule = own[s.id];
              const isEditing = editing === s.id;
              return (
                <div key={s.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm truncate">{s.displayName}</span>
                        <span className={`rounded-full text-[10px] font-medium px-2 py-0.5 ${rule ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                          {rule ? 'Своё правило' : 'Общее правило'}
                        </span>
                      </div>
                      {!isEditing && (
                        <div className="mt-1.5">
                          {rule ? <RuleSummary rule={rule} /> : defaultRule ? <RuleSummary rule={defaultRule} /> : null}
                        </div>
                      )}
                    </div>
                    {canEdit && !isEditing && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setEditing(s.id)} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-secondary/50">
                          {rule ? 'Изменить' : 'Задать своё'}
                        </button>
                        {rule && (
                          <button onClick={() => resetOne(s.id)} className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-foreground" title="Вернуть общее правило">
                            Сбросить
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {rowError[s.id] && (
                    <div className="mt-2 text-xs text-destructive flex items-center gap-1.5">
                      <Icon name="AlertCircle" size={12} />
                      {rowError[s.id]}
                    </div>
                  )}
                  {isEditing && (
                    <div className="mt-3">
                      <RuleEditor
                        initialKeywords={(rule || defaultRule)?.keywords || []}
                        initialMode={(rule || defaultRule)?.matchMode || 'any'}
                        saveLabel="Сохранить для стримера"
                        onSave={(k, m) => saveAnd(s.id, k, m, rule || defaultRule)}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground flex items-start gap-2">
        <Icon name="Info" size={13} className="mt-0.5 shrink-0" />
        <span>Новое правило действует на следующие проверки. Уже записанные эфиры не пересчитываются.</span>
      </div>
    </div>
  );
}
