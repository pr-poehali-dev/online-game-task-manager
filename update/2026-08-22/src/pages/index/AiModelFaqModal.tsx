import Icon from '@/components/ui/icon';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

interface RoleRow {
  role: string;
  icon: string;
  pick: string;
  why: string;
}

const ROLE_ROWS: RoleRow[] = [
  {
    role: 'Программирование (сервер, клиент, лаунчер, веб)',
    icon: 'Code2',
    pick: 'Claude Sonnet 4.6 или GPT-5.6 Sol',
    why: 'Обе держат контекст всего проекта (1M токенов), уверенно работают с кодом и понимают, что вы просите поправить, а не переписывают всё с нуля.',
  },
  {
    role: 'Сложный рефакторинг, разбор чужого кода, архитектурные решения',
    icon: 'FileCode',
    pick: 'Claude Opus 5 или GPT-5.5 Pro',
    why: 'Reasoning-модели — думают дольше, но глубже видят связи между файлами и предлагают более обоснованные решения.',
  },
  {
    role: 'Тексты для соцсетей, реклама, посты, описания ивентов',
    icon: 'Megaphone',
    pick: 'GPT-5.4 mini или Gemini 3.5 Flash',
    why: 'Пишут живо и быстро, стоят копейки — для коротких текстов дорогая модель не даст заметно лучший результат.',
  },
  {
    role: 'Разбор логов сервера, поиск аномалий, отчёты по данным',
    icon: 'FileSearch',
    pick: 'Claude Opus 5 или Gemini 3.1 Pro',
    why: 'Большое окно контекста (до 1M+ токенов) — можно скормить целиком большой лог и попросить найти закономерность.',
  },
  {
    role: 'Рутинные быстрые ответы, черновики, "быстро набросать"',
    icon: 'Zap',
    pick: 'GPT-5.6 Luna или Gemini 2.5 Flash Lite',
    why: 'Самые дешёвые и быстрые модели — для простых вопросов разница в качестве с топовыми почти не заметна.',
  },
  {
    role: 'Не разбираюсь, что выбрать',
    icon: 'Wand2',
    pick: 'Авто (подбор ИИ)',
    why: 'AI Tunnel сам подберёт модель под сложность запроса — разумный вариант по умолчанию для большинства сотрудников.',
  },
];

interface RankRow {
  model: string;
  provider: string;
  plus: string;
  minus: string;
  price: string;
}

const TEXT_RANKING: RankRow[] = [
  {
    model: 'Claude Opus 5',
    provider: 'Anthropic',
    plus: 'Лучшее понимание кода и сложных инструкций, почти не «галлюцинирует»',
    minus: 'Самая дорогая модель, ответ занимает больше времени',
    price: '1000 / 5000 ₽ за 1М',
  },
  {
    model: 'GPT-5.5 Pro',
    provider: 'OpenAI',
    plus: 'Сильнейший reasoning, топ для агентных сценариев и кода',
    minus: 'Дорогая, избыточна для простых задач',
    price: '6000 / 36000 ₽ за 1М',
  },
  {
    model: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    plus: 'Баланс цены и качества для ежедневной работы с кодом',
    minus: 'Уступает Opus в самых запутанных задачах',
    price: '600 / 3000 ₽ за 1М',
  },
  {
    model: 'GPT-5.6 Sol',
    provider: 'OpenAI',
    plus: 'Флагман для кода и агентов, контекст 1М токенов',
    minus: 'Дороже средних моделей',
    price: '500 / 3000 ₽ за 1М',
  },
  {
    model: 'Gemini 3.1 Pro',
    provider: 'Google',
    plus: 'Огромный контекст, хорошо анализирует большие документы/логи',
    minus: 'Иногда менее аккуратна в коде, чем Claude/GPT',
    price: '400 / 2400 ₽ за 1М',
  },
  {
    model: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    plus: 'Топовый открытый reasoning почти по цене бюджетной модели',
    minus: 'Отвечает чуть медленнее топов OpenAI/Anthropic',
    price: '132 / 396 ₽ за 1М',
  },
  {
    model: 'Grok 4.6',
    provider: 'xAI',
    plus: 'Сильна в STEM-задачах и коде, свежие знания',
    minus: 'Меньше опыта «в проде» по сравнению с GPT/Claude',
    price: '400 / 1200 ₽ за 1М',
  },
  {
    model: 'Qwen3 Max',
    provider: 'Qwen',
    plus: 'Хорошее качество на больших объёмах текста за разумные деньги',
    minus: 'Слабее в специфике редких языков программирования',
    price: '156 / 780 ₽ за 1М',
  },
  {
    model: 'GPT-5.6 Terra',
    provider: 'OpenAI',
    plus: 'Золотая середина между Luna и Sol — быстро и не дорого',
    minus: 'Не для самых сложных агентных цепочек',
    price: '400 / 2400 ₽ за 1М',
  },
  {
    model: 'Gemini 3.5 Flash',
    provider: 'Google',
    plus: 'Быстрая, мультимодальная, хорошо пишет тексты и код',
    minus: 'Не рассчитана на глубокий reasoning',
    price: '300 / 1800 ₽ за 1М',
  },
  {
    model: 'GPT-5.4 mini',
    provider: 'OpenAI',
    plus: 'Дёшево и быстро для массовых простых запросов',
    minus: 'Хуже держит длинный контекст диалога',
    price: '150 / 900 ₽ за 1М',
  },
  {
    model: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
    plus: 'Очень дешёвая при контексте 1М токенов',
    minus: 'Слабее топов в творческих и неоднозначных задачах',
    price: '15 / 31 ₽ за 1М',
  },
  {
    model: 'GPT-5.6 Luna',
    provider: 'OpenAI',
    plus: 'Самая быстрая и дешёвая модель линейки GPT-5.6',
    minus: 'Не подходит для сложных многошаговых задач',
    price: '40 / 240 ₽ за 1М',
  },
];

const IMAGE_RANKING: RankRow[] = [
  {
    model: 'GPT Image 2',
    provider: 'OpenAI',
    plus: 'Лучшее качество и точный текст на изображении',
    minus: 'Самая дорогая генерация из представленных',
    price: '1,5–32 ₽ за картинку',
  },
  {
    model: 'Seedream 5.0 Pro',
    provider: 'ByteDance',
    plus: 'Реалистичные сцены, точное редактирование готовых картинок',
    minus: 'Дороже базовых моделей',
    price: '7,6–22,4 ₽ за картинку',
  },
  {
    model: 'Flux.2 Pro',
    provider: 'Black Forest Labs',
    plus: 'Продакшен-качество, хорошо для промо-материалов',
    minus: 'Не самая дешёвая',
    price: '5,4–11,9 ₽ за картинку',
  },
  {
    model: 'Gemini 3.1 Flash Image',
    provider: 'Google',
    plus: 'Быстрая, точный контроль пропорций и композиции',
    minus: 'Немного уступает в фотореализме топам',
    price: '5,1–22,1 ₽ за картинку',
  },
  {
    model: 'Seedream 4.5',
    provider: 'ByteDance',
    plus: 'Разумная цена при стабильном качестве',
    minus: 'Меньше контроля над мелкими деталями, чем у Pro-версии',
    price: '6,8 ₽ за картинку',
  },
  {
    model: 'Flux.2 Klein 4B',
    provider: 'Black Forest Labs',
    plus: 'Самая быстрая и дешёвая генерация — для черновых вариантов',
    minus: 'Заметно ниже качество, чем у Pro/Max версий',
    price: '2,55–5,1 ₽ за картинку',
  },
];

const VIDEO_RANKING: RankRow[] = [
  {
    model: 'Veo 3.1',
    provider: 'Google',
    plus: 'До 4K с синхронным аудио, лучшее качество картинки',
    minus: 'Самая дорогая и медленная генерация',
    price: 'высокая',
  },
  {
    model: 'Kling v3.0 Pro',
    provider: 'Kwaivgi',
    plus: 'Кинематографичное видео с аудио и контролем кадров',
    minus: 'Дороже базовых моделей',
    price: 'высокая',
  },
  {
    model: 'Sora 2 Pro',
    provider: 'OpenAI',
    plus: 'Реалистичная физика движения, синхронный звук',
    minus: 'Долгая генерация, высокая цена',
    price: 'высокая',
  },
  {
    model: 'Seedance 2.5',
    provider: 'ByteDance',
    plus: 'Длинные ролики, продление и правка уже готового видео',
    minus: 'Не всегда доступен генератор аудио',
    price: 'средняя',
  },
  {
    model: 'Veo 3.1 Fast',
    provider: 'Google',
    plus: 'Почти то же качество, что Veo 3.1, но быстрее и дешевле',
    minus: 'Чуть более простая детализация сцен',
    price: 'средняя',
  },
  {
    model: 'Seedance 2.0 Fast',
    provider: 'ByteDance',
    plus: 'Быстрая генерация видео и аудио в одном проходе',
    minus: 'Меньше контроля над длительностью и деталями',
    price: 'низкая',
  },
];

function RankTable({ rows, priceLabel }: { rows: RankRow[]; priceLabel: string }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Модель</TableHead>
            <TableHead>Провайдер</TableHead>
            <TableHead>Плюсы</TableHead>
            <TableHead>Минусы</TableHead>
            <TableHead className="whitespace-nowrap">{priceLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.model}>
              <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
              <TableCell className="font-medium whitespace-nowrap">{r.model}</TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">{r.provider}</TableCell>
              <TableCell className="text-xs text-muted-foreground min-w-[220px]">{r.plus}</TableCell>
              <TableCell className="text-xs text-muted-foreground min-w-[200px]">{r.minus}</TableCell>
              <TableCell className="text-xs whitespace-nowrap font-mono">{r.price}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AiModelFaqModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-2xl border border-border bg-card p-5 max-h-[85vh] overflow-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Icon name="HelpCircle" size={18} className="text-primary" />
            <h2 className="text-base font-semibold">Как выбрать модель</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <Icon name="X" size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          В каталоге больше 170 моделей от разных провайдеров — не нужно разбираться во всех.
          Ниже понятная шпаргалка: что выбрать под свою задачу и чем модели отличаются друг от друга.
        </p>

        <div className="space-y-8 text-sm">
          <section>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="Users" size={14} className="text-primary" />
              Быстрый выбор по типу задачи
            </h3>
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Чем занимаетесь</TableHead>
                    <TableHead>Что выбрать</TableHead>
                    <TableHead>Почему</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ROLE_ROWS.map((r) => (
                    <TableRow key={r.role}>
                      <TableCell className="min-w-[180px]">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Icon name={r.icon} size={13} className="text-muted-foreground shrink-0" />
                          {r.role}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-primary">{r.pick}</TableCell>
                      <TableCell className="text-xs text-muted-foreground min-w-[220px]">{r.why}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="Info" size={14} className="text-primary" />
              Принцип выбора — на что смотреть
            </h3>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex gap-2">
                <Icon name="Gauge" size={14} className="text-primary shrink-0 mt-0.5" />
                <span><b className="text-foreground">Дороже не значит лучше для любой задачи.</b> Для короткого поста в соцсети дорогая reasoning-модель даст результат не лучше дешёвой — но потратит в 10–50 раз больше.</span>
              </li>
              <li className="flex gap-2">
                <Icon name="Brain" size={14} className="text-primary shrink-0 mt-0.5" />
                <span><b className="text-foreground">Reasoning-модели (Pro, Thinking, Opus, o3) думают дольше.</b> Они «рассуждают» перед ответом — лучше для сложных многошаговых задач и кода, но ответ приходит медленнее и стоит дороже.</span>
              </li>
              <li className="flex gap-2">
                <Icon name="FileSearch" size={14} className="text-primary shrink-0 mt-0.5" />
                <span><b className="text-foreground">Контекст (окно памяти) важен для больших логов и документов.</b> Модели с контекстом 1М+ токенов (Claude, GPT-5.6, Gemini, DeepSeek V4) могут переварить целиком большой файл за один запрос.</span>
              </li>
              <li className="flex gap-2">
                <Icon name="Wand2" size={14} className="text-primary shrink-0 mt-0.5" />
                <span><b className="text-foreground">Режим «Авто» — разумный выбор по умолчанию.</b> AI Tunnel сам подбирает модель под сложность запроса, если не хочется разбираться каждый раз.</span>
              </li>
              <li className="flex gap-2">
                <Icon name="Wallet" size={14} className="text-primary shrink-0 mt-0.5" />
                <span><b className="text-foreground">У каждого сотрудника свой месячный лимит трат.</b> Цена указывается в каталоге за 1 миллион токенов (это очень много текста) — обычное сообщение стоит копейки, но большие reasoning-запросы к топовым моделям расходуют лимит заметно быстрее.</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="Trophy" size={14} className="text-primary" />
              Рейтинг моделей для текста и кода
            </h3>
            <p className="text-xs text-muted-foreground mb-2">От самых мощных к самым бюджетным. Цена — рубли за 1 млн токенов (запрос / ответ).</p>
            <RankTable rows={TEXT_RANKING} priceLabel="Цена / 1М" />
          </section>

          <section>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="Image" size={14} className="text-primary" />
              Рейтинг моделей для изображений
            </h3>
            <p className="text-xs text-muted-foreground mb-2">Цена указана за одну сгенерированную картинку (зависит от разрешения).</p>
            <RankTable rows={IMAGE_RANKING} priceLabel="Цена / картинка" />
          </section>

          <section>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="Video" size={14} className="text-primary" />
              Рейтинг моделей для видео
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Точная цена зависит от длительности и разрешения ролика — ориентир по категориям «низкая / средняя / высокая».
              Помните: деньги списываются сразу при запуске генерации, отменить нельзя.
            </p>
            <RankTable rows={VIDEO_RANKING} priceLabel="Цена" />
          </section>
        </div>
      </div>
    </div>
  );
}
