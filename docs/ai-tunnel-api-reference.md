# AI Tunnel — справочник API (для раздела "AI" трекера)

Извлечено из официальной документации https://aitunnel.ru/docs (PDF предоставлены пользователем)
21.08.2026. Используется как контекст при разработке `backend/ai/index.py` и фронтенд-раздела AI
(см. `AI_MANAGER_PLAN.md` в корне проекта). При реализации сверяйте актуальные детали (цены,
конкретные ID моделей) через публичный каталог `GET https://api.aitunnel.ru/public/aitunnel/models`
— цифры в примерах ниже могут устареть.

Ключевое: Base URL `https://api.aitunnel.ru/v1`, авторизация `Authorization: Bearer sk-aitunnel-xxx`,
формат запросов — OpenAI-совместимый.

Разделы документа: Документация (введение) · Баланс и оплата · API-ключи · Список моделей ·
Справочник API · Стриминг · Параметры · Ошибки и отладка · Картинки · PDF · Видео · Аудио ·
Озвучка текста · Распознавание речи · Вызов инструментов · Структурированный вывод ·
Токены рассуждений · Лимиты · Запасные модели (fallback) · Выбор провайдера · Кеширование
промпта · Защита данных (PII) · Пресеты · Модерация · Эмбеддинги.

---

## Документация AITUNNEL.pdf

Главная/ Документация/ Введение
Введение
AITUNNEL — единый  OpenAI- совместимый  API к  ведущим  ИИ - моделям : GPT,
Claude, Gemini, DeepSeek, Qwen, Kimi и  другим . Один  ключ , один  формат
запросов , оплата  в  рублях . Запросы  идут  на  российский  сервер , поэтому  VPN и
прокси  не  нужны .
Ключевые  параметры
Всё , что  нужно , чтобы  отправить  первый  запрос  из  любой  библиотеки , совместимой  с  OpenAI.
Base URL https://api.aitunnel.ru/v1
Авторизация Authorization: Bearer sk-aitunnel-xxx
Формат  ключа sk-aitunnel-…  — создаётся  вразделе  « Ключи »
Формат  запросов OpenAI Chat Completions API — код  на  официальных  SDK работает  без  изменений
Модели 100+ моделей , актуальные  цены  — вкаталоге и  попубличному  API
VPN не  нужен
Все  запросы  идут  на  российский  сервер  api.aitunnel.ru  — VPN и  прокси  не  требуются . Модели  с  ограничениями
по  региону  доступны  из  России  без  обходных  путей .
Скорость  ответов
Если  запрос  отправляется  с  сервера  за  пределами  России , ответ  вернётся  ещё  быстрее  — без  дополнительных
прокси .
Быстрый  старт
cURL Python JavaScript Go PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "deepseek-v4-pro",
    "max_tokens": 50000,
    "messages": [
      { "role": "user", "content": " Скажи  интересный  факт " }
    ]
  }'
Указывайте  max_tokens
По  этому  значению  резервируется  стоимость  запроса , а  после  ответа  списывается  фактический  расход . Без
него  оценка  стоимости  получается  менее  точной .
Возможности
Один  ключ  открывает  все  эндпоинты  — от  чата  до  генерации  видео . Пути  указаны  относительно  base URL.
POST /chat/completions
Чат  с  моделями
Текстовые  запросы  к  100+ моделям :
GPT, Claude, Gemini, DeepSeek, Qwen,
Kimi и  другим .
POST /images/generations
Генерация  изображений
GPT Image, Flux, Seedream —
генерация  и  редактирование  по
референсным  изображениям .
POST /videos
Генерация  видео
Veo, Sora, Seedance, Wan через
асинхронный  эндпоинт  с  опросом
статуса  задачи .
POST /chat/completions
Аудио  в  чате
Аудиофайл  на  вход  (input_audio) и
голосовой  ответ  модели  (modalities,
audio).
POST /audio/speech
Озвучка  текста
Text-to-Speech с  выбором  голоса  и
формата  аудио .
POST /audio/transcriptions
Распознавание  речи
Whisper, GPT-4o Transcribe, Voxtral,
Qwen3-ASR, Chirp 3 — транскрипция
аудио .
POST /embeddings
Эмбеддинги
Векторные  представления  текста  для
поиска  и  RAG.
POST /moderations
Модерация
Проверка  контента  перед  отправкой
в  модель  или  публикацией .
POST /rerank
Ранжирование
Перестановка  документов  по
релевантности  запросу  — второй  шаг
RAG после  эмбеддингов .
POST /embeddings · /rerank
RAG
Поиск  по  своей  базе  и  ответ  модели
по  найденному  контексту  —
эмбеддинги , rerank, чат .
POST /messages · /responses
Другие  форматы  API
Нативный  Claude Messages API и
Responses API OpenAI — те  же  ключ  и
base URL.
POST /batches
Пакетные  запросы
Много  запросов  одним  пакетом  со
скидкой  на  токены . Результаты
забираете  позже .
Модель  auto
Не  уверены , какую  модель  выбрать  — укажите  auto , и  AITUNNEL подберёт  её  сам , ориентируясь  на  сложность
запроса  и  баланс  цены  и  качества .
cURL Python JavaScript Go PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "auto",
    "messages": [
      { "role": "user", "content": " Скажи  интересный  факт " }
    ]
  }'
Списание  идёт  по  фактически  выбранной  модели , её  точное  название  возвращается  в  поле  model  ответа .
Работает  в/chat/completions , /responses  и/messages .
Для  ИИ - агентов
Документация  рассчитана  и  на  людей , и  на  кодовых  агентов . К  любой  странице  добавьте  .md  — получите
исходный  markdown без  парсинга  HTML. Карта  статей  —/llms.txt. В  шапке  кнопка  Markdown копирует  исходник  или
открывает  сырой  файл .
Дальше
Баланс  и  оплата
Pay-as-you-go, способы  пополнения ,
авто - пополнение  и  проверка  баланса
через  API.
API- ключи
Создание  ключа , лимит  по  балансу ,
бюджет , срок  действия  и  как  не
засветить  ключ  в  git.
Список  моделей
Публичный  каталог  без  ключа : цены
в  рублях , группы  и  имя  модели  для
запросов .
Поддержка
Следующая
Баланс  и  оплата
Не  нашли  нужное  — напишите  нам , мы  дополним  документацию . support@aitunnel.ru

---

## Баланс и оплата

Главная/ Документация/ Баланс  и  оплата
Баланс  и  оплата
AITUNNEL работает  по  модели  pay-as-you-go: вы  пополняете  баланс  и  платите
только  за  фактическое  использование . Подписок  и  фиксированных  платежей
нет .
Как  работает  оплата
Пример  поля  usage :
JSON
{
"choices": [...],
"usage": {
"prompt_tokens": 150,
"completion_tokens": 300,
"total_tokens": 450,
"cost_rub": 0.45,
"balance": 4999.55
  }
}
Способы  оплаты
от 500 ₽
Карты  и  СБП
Мгновенное  пополнение  картой  или
через  СБП . Карту  можно  сохранить
для  следующих  платежей .
от 5000 ₽
Счета  для  компаний
Счёт  выставляется  в  личном
кабинете . Для  договора  или  КП
напишите  наsupport@aitunnel.ru.
от 1000 ₽
Криптовалюта
Пополнение  через  CryptoCloud в
основных  криптовалютах .
Сохранённая  карта  нужна  и  дляавто - пополнения: когда  баланс  падает  ниже  порога , сумма  списывается  сама .
Авто - пополнение
Когда  баланс  опускается  ниже  порога , с  сохранённой  карты  автоматически  списывается  заданная  сумма . Так
сервисы  не  останавливаются  на  нуле .
Порог При  каком  балансе  срабатывает  пополнение , например  500 ₽
Сумма На  сколько  пополнить , например  2 000 ₽
Месячный  лимит Максимум  авто - пополнений  за  месяц , например  10 000 ₽
Пример : порог  500 ₽ , сумма  2 000 ₽ , лимит  10 000 ₽ / мес . Баланс  упал  ниже  500 ₽  — с  карты  списывается  2 000 ₽ .
Если  за  месяц  авто - пополнения  уже  набрали  10 000 ₽ , новых  не  будет .
Для  продакшена
Для  боевых  сервисов  авто - пополнение  лучше  включить  сразу  — иначе  нулевой  баланс  просто  остановит
запросы .
Проверка  баланса
Текущий  баланс  всегда  виден  в  верхней  частипанели  управления. Через  API:
cURL
curl https://api.aitunnel.ru/v1/aitunnel/balance \
  -H "Authorization: Bearer sk-aitunnel-xxx"
Ответ :
JSON
{
"balance": 4999.55,
"budget": 850.0
}
Поле  budget  есть  только  если  у  ключа  настроен  бюджет . Актуальный  баланс  также  приходит  в  каждом  ответе  API
—usage.balance . Справка  по  методу  —GET /aitunnel/balance.
Уведомления  о  низком  балансе
Порог  задаётся  внастройках. Когда  баланс  опустится  ниже  него , придёт  письмо .
Ценообразование
Стоимость  запроса  зависит  от :
Актуальные  цены  — вкаталоге  моделей.
Тип  API Единица  тарификации
Чат  (Chat Completions) За  1 М  токенов  ( вход  / выход  отдельно )
Эмбеддинги За  1 М  токенов
Генерация  и  редактирование  изображений За  изображение  ( зависит  от  модели  и  параметров )
Генерация  видео За  секунду  видео
Озвучка  текста  (TTS) За  1 М  символов
Транскрипция  аудио За  минуту  аудио
Возврат  средств
Возврат  неиспользованных  средств  возможен  в  течение  24 часов  после  пополнения  картой , СБП  или  по  счёту .
Напишите  наsupport@aitunnel.ru.
Что  не  возвращается
Криптовалютные  платежи  не  подлежат  возврату . Комиссии  платёжных  систем  за  пополнение  тоже  не
возвращаются .
Предыдущая
Введение
Следующая
API- ключи

---

## API-ключи

Главная/ Документация/ API- ключи
API- ключи
API- ключ  — идентификатор  для  доступа  к  AITUNNEL. Один  ключ  работает  со
всеми  моделями  и  эндпоинтами .
Создание  ключа
Формат  ключа
Все  ключи  AITUNNEL начинаются  с  префиксаsk-aitunnel- . Передавайте  его  в  заголовке :
HTTP
Authorization: Bearer sk-aitunnel-xxx
Лимит  на  количество  ключей
Сколько  ключей  можно  создать , зависит  от  текущего  баланса . При  балансе  0 ₽  — ни  одного . Как  только  на  счёте
есть  деньги  — один  ключ . Дальше  каждый  полный  1 000 ₽  даёт  ещё  один .
Баланс Ключей
0 ₽ 0
500 ₽ 1
1 000 ₽ 2
2 000 ₽ 3
5 000 ₽ 6
Если  баланс  упал , уже  созданные  ключи  продолжают  работать . Новый  создать  нельзя , пока  не  пополните .
Имя  ключа
Имя  нужно  только  вам , на  запросы  оно  не  влияет . Удобно  называть  по  назначению : Production API , Dev /
Testing , Claude Code .
Информация  о  ключе
Текущие  настройки  ключа  через  API —GET /aitunnel/key.
Бюджет  ключа
Бюджет  ограничивает  расходы  по  конкретному  ключу . Когда  он  исчерпан , запросы  с  этим  ключом  отклоняются  —
даже  если  на  балансе  аккаунта  ещё  есть  деньги .
При  создании  или  редактировании  укажите :
Можно  включить  письмо , когда  останется  меньше  20% бюджета  — на  почту  аккаунта  или  на  другой  адрес .
Срок  действия
При  создании  можно  ограничить  жизнь  ключа :
По  истечении  срока  ключ  перестаёт  работать .
Разрешённые  модели
Можно  ограничить , какие  модели  вызывает  ключ . Укажите  точные  имена  — по  одному  на  строку . Пустое  поле  —
все  модели . Сюда  же  можно  поставить  имяпресета.
Совпадение  точное . Если  модель  не  в  списке , API отвечает403 .
Разрешённые  IP
Ключ  можно  привязать  к  адресам  или  CIDR- диапазонам  (IPv4 и  IPv6). Пусто  — запросы  с  любого  IP. Иначе  чужой
адрес  получит  403 .
Защита  данных
На  ключе  можно  включить  поиск  персональных  данных  в  запросах : паспорта , ИНН , телефоны , ФИО . Два  режима  —
подменить  синтетикой  до  модели  или  сразу  вернуть  ошибку . Подробности  — в  статьеЗащита  данных  (PII).
Без  правок  в  коде
Включается  внастройках  ключа. Клиентский  код  не  меняется .
Управление
Имя , бюджет , модели , IP и  защита  данных  меняются  впанели. Удалённый  ключ  сразу  перестаёт  работать : запросы
возвращают  401 .
Лучшие  практики
Предыдущая
Баланс  и  оплата
Следующая
Список  моделей

---

## Список моделей

Главная/ Документация/ Список  моделей
Список  моделей
Чтобы  собрать  селектор , проверить  цену  или  узнать , что  модель  ещё  в
каталоге , не  парсите  HTML сайта . Есть  публичный  эндпоинт  без  ключа .
Эндпоинт https://api.aitunnel.ru/public/aitunnel/models
Авторизация Не  нужна
Как  вызвать
cURL Python JavaScript PHP
# все  группы
curl https://api.aitunnel.ru/public/aitunnel/models
# только  чат
curl https://api.aitunnel.ru/public/aitunnel/models/chat
Полный  ответ  — объект  по  группам : chat , images , videos  и  остальные . Одна  группа : GET
https://api.aitunnel.ru/public/aitunnel/models/chat  — сразу  карта  « имя  →  параметры », без  обёртки .
Можно  из  браузера
CORS открыт . Ключ  и  заголовок  Authorization  не  нужны .
Группы
Группа Что  внутри Куда  слать  запросы
chat Текст , reasoning, мультимодальный  чат . Аудио  во  входе  и
выходе  — аудио
/chat/completions , /responses ,
/messages
images Генерация  и  редактирование .Картинки /images/generations
videos Генерация . Видео /videos
embeddings Векторы .Эмбеддинги /embeddings
speech Озвучка .Озвучка  текста /audio/speech
transcriptions Распознавание  речи .Документация /audio/transcriptions
rerank Переранжирование .Ранжирование /rerank
moderations Модерация .Модерация /moderations
Ключ  объекта  — имя  модели  для  поля  model  в  запросе : claude-sonnet-4.6 , gpt-5.6-sol , auto .
Что  в  ответе
Пример  GET …/models/chat . Цифры  из  живого  каталога  меняются  — берите  из  ответа , не  со  страницы .
JSON
{
"claude-sonnet-4.6": {
"provider": "anthropic",
"prompt_cost": 600,
"completion_cost": 3000,
"context_size": 1000000,
"max_output": 64000,
"description": " Надёжная  модель  для  кода , текстов  и  анализа ",
"modalities": {
"input": ["text", "image", " le"],
"output": ["text"]
    },
"created": 1759161676,
"batch": { "discount": 0.5, "window": "24h" }
  }
}
Поле Смысл
provider Кто  крутит  модель
description Коротко , зачем  модель
modalities input  / output : text , image , audio , video , file , embedding , rerank
created Unix- время  появления  в  каталоге
cache_discount Скидка  на  чтение  кэша  промпта  (0.9  = 90% скидки ). См . кеширование  промпта
Цены  — в  рублях , комиссия  уже  внутри . Те  же  числа , что  вкаталоге  на  сайте. Если  естьbatch  — модель  ходит  в
Batch запросы.
У  чата  prompt_cost  и  completion_cost  — за  1 млн  токенов . У  картинок  min_price_per_image  /
max_price_per_image , у  видео  — за  секунду , у  озвучки  — за  символы  или  минуту . Набор  полей  зависит  от  группы .
OpenAI- совместимый  список
GET /v1/models  — формат  OpenAI: только  id , created , owned_by . Нужен  ключ . Цен  и  возможностей  нет . В
список  попадают  вашипресеты сowned_by: "preset" .
cURL Python
curl https://api.aitunnel.ru/v1/models \
  -H "Authorization: Bearer sk-aitunnel-xxx"
JSON
{
"object": "list",
"data": [
    {
"id": "claude-sonnet-4.6",
"created": 1759161676,
"object": "model",
"owned_by": "anthropic"
    },
    {
"id": "my-preset",
"created": 1735689600,
"object": "model",
"owned_by": "preset"
    }
  ]
}
Для  цен  и  возможностей  берите  публичный  каталог . /v1/models  — когда  нужен  стандартный  SDK- список  или
пресеты .
Предыдущая
API- ключи
Следующая
Запасные  модели

---

## Справочник API

Главная/ Документация/ Справочник  API
Справочник  API
Схемы  запросов  и  ответов  очень  похожи  на  OpenAI Chat API. AITUNNEL
нормализует  их  для  всех  моделей  и  провайдеров  — достаточно  выучить  одну .
Индекс  документации
Полный  список  статей  —/llms.txt. К  любой  странице  добавьте  .md, чтобы  получить  исходный  markdown без
парсинга  HTML.
Этот  справочник  про  POST https://api.aitunnel.ru/v1/chat/completions . Те  же  поля  принимают  /responses  и
/messages . Картинки , видео , речь  и  эмбеддинги  — ввведении. Понимание  и  генерация  картинок  —картинки. PDF в
чате  —PDF. Понимание  и  генерация  видео  —видео. Аудио  во  входе  и  выходе  чата  —аудио. Озвучка  текста  —
озвучка. Распознавание  речи  —распознавание  речи. Методы  кабинета  — вAITUNNEL API.
Запросы
Схема  запроса
Тело  POST  на  /chat/completions :
TypeScript
// Определения  подтипов  — ниже
type Request = {
// Нужно  одно  из  двух : messages или  prompt
  messages?: Message[];
  prompt?: string;
// Имя  модели , пресета  или  слаг  provider/model.
// "auto" — AITUNNEL выберет  модель  сам .
  model?: string;
// JSON по  схеме . Подробнее : /docs/structured-outputs
  response_format?: ResponseFormat;
  stop?: string | string[];
  stream?: boolean;
// Сжатие  слишком  длинного  промпта . Включено  по  умолчанию .
// Подробнее : /docs/transforms
  plugins?: Plugin[];
  max_tokens?: number; // [1, context_length)
  temperature?: number; // [0, 2]
// Function-tools и  серверные  инструменты  (aitunnel:web_search).
// Подробнее : /docs/tool-calling, /docs/web-search
  tools?: Tool[];
  tool_choice?: ToolChoice;
  parallel_tool_calls?: boolean;
  seed?: number;
  top_p?: number; // (0, 1]
  top_k?: number; // [1, ∞ ) — у  OpenAI игнорируется
  frequency_penalty?: number; // [-2, 2]
  presence_penalty?: number; // [-2, 2]
  repetition_penalty?: number; // (0, 2]
  logit_bias?: { [key: number]: number };
  top_logprobs?: number;
  min_p?: number; // [0, 1]
  top_a?: number; // [0, 1]
// Предсказанный  хвост  ответа  — меньше  задержка , если  угадали .
  prediction?: { type: "content"; content: string };
// Голосовой  ответ . Подробнее : /docs/audio
  modalities?: ("text" | "audio")[];
  audio?: { voice: string; format: string };
// Параметры  AITUNNEL
  models?: string[]; // запасные  модели . /docs/fallback
  provider?: { sort?: "price" | "throughput" | "latency" }; // /docs/provider
  reasoning?: Reasoning; // /docs/reasoning
  cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" }; // /docs/caching
  session_id?: string; // липкая  маршрутизация  кэша
  service_tier?: " ex" | "priority"; // /docs/service-tiers
};
type TextContent = {
type: "text";
  text: string;
};
type ImageContentPart = {
type: "image_url";
  image_url: {
url: string; // URL или  data:…;base64. Подробнее : /docs/images
    detail?: string; // по  умолчанию  "auto"
  };
};
type FileContentPart = {
type: " le";
   le: {
 lename: string;
     le_data: string; // URL или  data:application/pdf;base64,…  /docs/pdf
  };
};
type VideoContentPart = {
type: "video_url";
  video_url: {
url: string; // URL или  data:video/mp4;base64. Подробнее : /docs/videos
  };
};
type AudioContentPart = {
type: "input_audio";
  input_audio: {
data: string; // сырой  base64, не  URL. Подробнее : /docs/audio
    format: string; // например  "wav" или  "mp3"
  };
};
type ContentPart =
  | TextContent
  | ImageContentPart
  | FileContentPart
  | VideoContentPart
  | AudioContentPart;
type Message =
  | {
role: "user" | "assistant" | "system";
      content: string | ContentPart[];
      name?: string;
    }
  | {
role: "tool";
      content: string;
      tool_call_id: string;
      name?: string;
    };
type FunctionDescription = {
  description?: string;
  name: string;
  parameters: object; // JSON Schema
};
type Tool =
  | { type: "function"; function: FunctionDescription }
  | { type: "aitunnel:web_search"; parameters?: object };
type ToolChoice =
  | "none"
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };
type ResponseFormat =
  | { type: "json_object" }
  | {
type: "json_schema";
      json_schema: {
name: string;
        strict?: boolean;
        schema: object;
      };
    };
type Plugin =
  | {
id: "context-compression";
      enabled?: boolean;
    }
  | {
id: " le-parser"; // PDF. /docs/pdf
      pdf?: { engine?: "mistral-ocr" | "cloud are-ai" | "native" };
    };
type Reasoning = {
  effort?:
    | "max"
    | "xhigh"
    | "high"
    | "medium"
    | "low"
    | "minimal"
    | "none";
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
};
Сэмплинг , штрафы , stop , logprobs  —параметры. Аудио  во  входе  и  выходе  — аудио.
Структурированный  вывод
response_format  заставляет  модель  ответить  JSON:
Подробности  и  примеры  —структурированный  вывод. Есть  не  у  всех  моделей : смотрите  страницу  модели .
Плагины
Плагины  расширяют  запрос  на  стороне  AITUNNEL, не  модели . Сжатие  середины  промпта  включено  по  умолчанию .
Чтобы  выключить :
JSON
{
"plugins": [{ "id": "context-compression", "enabled": false }]
}
Подробнее  —оптимизация  сообщений. PDF — плагинfile-parser , см . PDF. Поиск  в  сети  — не  плагин , асерверный
инструментaitunnel:web_search .
Стриминг
SSE для  всех  моделей
Передайте  stream: true. Формат  —Server-Sent Events. usage приходит  один  раз  в  финальном  чанке  с  пустым
choices, перед  [DONE]. Примеры  и  разбор  ошибок  — стриминг.
Нестандартные  параметры
Если  модель  не  умеет  параметр  ( например  logit_bias не  у  OpenAI или  top_k у  OpenAI), он  игнорируется.
Остальное  уходит  провайдеру  как  есть .
Маршрутизация  модели
В  ответе  поле  model  — фактически  использованная  модель , не  пресет  и  не  auto .
Предзаполнение  ответа
Можно  попросить  модель  продолжить  начатую  реплику : последнее  сообщение  с  role: "assistant"  — это
префикс , который  она  допишет .
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gpt-5.6-sol",
    "messages": [
      { "role": "user", "content": " В  чём  смысл  жизни ?" },
      { "role": "assistant", "content": " Не  уверен , но  моё  лучшее  предположение :" }
    ]
  }'
Ответы
Схема  нормализована  подOpenAI Chat Completions. choices  всегда  массив . При  стриминге  у  выбора  естьdelta ,
иначе  — message . Один  и  тот  же  код  работает  со  всеми  моделями .
TypeScript
type Response = {
id: string;
  choices: (NonStreamingChoice | StreamingChoice | NonChatChoice)[];
  created: number; // Unix timestamp
  model: string; // фактически  использованная  модель
object: "chat.completion" | "chat.completion.chunk";
  system_ ngerprint?: string;
  usage?: ResponseUsage;
};
type ResponseUsage = {
prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_rub: number; // сколько  списали  за  этот  запрос
  balance: number; // остаток  кабинета  после  списания
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  server_tool_use?: {
    web_search_requests?: number;
  };
};
type NonChatChoice = {
 nish_reason: string | null;
  text: string;
  error?: ErrorResponse;
};
type NonStreamingChoice = {
 nish_reason: string | null;
  native_ nish_reason: string | null;
  message: {
content: string | null;
    role: string;
    tool_calls?: ToolCall[];
    reasoning?: string;
    reasoning_details?: unknown[];
    audio?: { data: string; transcript?: string };
  };
  error?: ErrorResponse;
};
type StreamingChoice = {
 nish_reason: string | null;
  native_ nish_reason: string | null;
  delta: {
content: string | null;
    role?: string;
    tool_calls?: ToolCall[];
    audio?: { data?: string; transcript?: string };
  };
  error?: ErrorResponse;
};
type ErrorResponse = {
code: number;
  message: string;
  metadata?: Record<string, unknown>;
};
type ToolCall = {
id: string;
type: "function";
function: { name: string; arguments: string };
};
Пример :
JSON
{
"id": "chatcmpl-xxxxxxxxxxxxxx",
"choices": [
    {
" nish_reason": "stop",
"native_ nish_reason": "stop",
"message": {
"role": "assistant",
"content": " Привет !"
      }
    }
  ],
"usage": {
"prompt_tokens": 12,
"completion_tokens": 4,
"total_tokens": 16,
"prompt_tokens_details": { "cached_tokens": 0 },
"completion_tokens_details": { "reasoning_tokens": 0 },
"cost_rub": 0.51,
"balance": 1212.38933
  },
"model": "gpt-5.6-sol"
}
Причина  завершения
finish_reason  приводится  к  одному  из : tool_calls , stop , length , content_filter , error .
Исходная  строка  провайдера  — в  native_finish_reason .
Стоимость  и  usage
usage  всегда  есть  в  нестриминговом  ответе . При  стриминге  — в  последнем  чанке .
История  расхода  по  ключу  —статистика, не  отдельный  generation- эндпоинт .
Дальше
temperature, max_tokens
Параметры
Сэмплинг , длина  ответа , stop,
logprobs, verbosity.
tools
Вызов  инструментов
Модель  предлагает  вызов  — вы
исполняете  у  себя .
response_format
Структурированный  вывод
JSON по  схеме , без  выдуманных
полей .
reasoning
Токены  рассуждений
effort, max_tokens и  reasoning_details
между  шагами .
error.code
Ошибки  и  отладка
JSON- ошибки , 402 из - за  max_tokens,
стрим  и  пустой  ответ .
aitunnel:web_search
Веб - поиск
Модель  сама  ищет  в  сети , когда
решит .
Предыдущая
Кеширование  промпта
Следующая
Стриминг

---

## Стриминг

Главная/ Документация/ Стриминг
Стриминг
AITUNNEL отдаёт  стрим  от  любой  модели . Интерфейс  обновляется  по  мере
генерации , не  дожидаясь  полного  ответа .
Передайте  stream: true . Ответ  приходит  чанками  в  форматеServer-Sent Events: строки  data: {…} , в  конце  —
data: [DONE] .
Работает  в  /chat/completions , /responses  и/messages . Голосовой  ответ  модели  стримится  вdelta.audio  —
аудио.
Как  включить
Проще  всего  читать  поток  через  OpenAI SDK. Сырой  HTTP тоже  подходит  — парсите  строки  data: .
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -N \
  -d '{
    "model": "gpt-5.6-sol",
    "stream": true,
    "messages": [
      { "role": "user", "content": " Как  построить  самое  высокое  здание  в  мире ?" }
    ]
  }'
В  финальном  чанке  ( часто  с  пустым  choices ) приходитusage  — токены , cost_rub  иbalance . Подробнее  о
схеме  —справочник  API.
Разбор  SSE вручную
Если  SDK нет , читайте  тело  ответа  построчно . Каждое  событие  — строкаdata: , затем  JSON. data: [DONE]  —
конец  потока .
JavaScript
const response = await fetch('https://api.aitunnel.ru/v1/chat/completions', {
method: 'POST',
headers: {
Authorization: 'Bearer sk-aitunnel-xxx',
'Content-Type': 'application/json',
  },
body: JSON.stringify({
model: 'gpt-5.6-sol',
stream: true,
messages: [{ role: 'user', content: ' Как  построить  самое  высокое  здание  в  мире ?' }],
  }),
});
if (!response.ok) {
const error = await response.json();
thrownewError(error.error?.message ?? response.statusText);
}
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
const { done, value } = await reader.read();
if (done) break;
  buffer += decoder.decode(value, { stream: true });
while (true) {
const lineEnd = buffer.indexOf('\n');
if (lineEnd === -1) break;
const line = buffer.slice(0, lineEnd).trim();
    buffer = buffer.slice(lineEnd + 1);
if (!line.startsWith('data: ')) continue;
const data = line.slice(6);
if (data === '[DONE]') return;
const parsed = JSON.parse(data);
if (parsed.error) {
thrownewError(parsed.error.message);
    }
if (parsed.usage) {
console.log('Usage:', parsed.usage);
    }
const content = parsed.choices?.[0]?.delta?.content;
if (content) process.stdout.write(content);
  }
}
Рекомендуемые  клиенты :OpenAI SDKиVercel AI SDK. Они  сами  собирают  чанки .
Ошибки  в  стриме
Поведение  зависит  от  того , успели  ли  уйти  токены .
До  первого  токена
Обычный  JSON с  HTTP- статусом  ошибки :
JSON
{
"error": {
"code": 400,
"message": "Invalid model speci ed"
  }
}
Полный  список  —ошибки  и  отладка.
После  начала  генерации
HTTP уже  200, ошибка  приходит  событием  SSE с  полем  error  иfinish_reason: "error" :
SSE
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-5.6-sol","error":{"code":500,"messa
Проверяйте  error в  каждом  чанке
После  такого  события  поток  заканчивается . Не  полагайтесь  только  на  HTTP- статус : он  уже  200.
Python JavaScript
from openai import OpenAI, APIError
client = OpenAI(
    api_key="sk-aitunnel-xxx",
    base_url="https://api.aitunnel.ru/v1/",
)
try:
    stream = client.chat.completions.create(
        model="gpt-5.6-sol",
        messages=[{"role": "user", "content": " Как  построить  самое  высокое  здание  в  мире ?"}],
        stream=True,
    )
for chunk in stream:
ifgetattr(chunk, "error", None):
print(" Ошибка  в  потоке :", chunk.error)
break
        delta = chunk.choices[0].delta.content if chunk.choices elseNone
if delta:
print(delta, end="",  ush=True)
except APIError as e:
print(" Ошибка  до  потока :", e.message)
Предыдущая
Справочник  API
Следующая
Лимиты

---

## Параметры

Главная/ Документация/ Параметры
Параметры
Параметры  выборки  формируют  процесс  генерации  токенов . Можно
отправить  любые  поля  из  списка  ниже  — и  другие , которые  понимает  модель .
Если  параметра  нет  в  запросе , AITUNNEL не  подставляет  своё  значение : провайдер  применяет  свой  дефолт . « По
умолчанию » ниже  — обычное  значение  у  провайдеров , не  то , что  мы  инжектим . Явно  передатьtemperature: 1.0  и
не  передавать  поле  — не  одно  и  то  же : например , это  может  влиять  на  ключ  кэша  на  стороне  провайдера .
Нестандартные  параметры
Поля , которые  понимает  модель , уходят  провайдеру  как  есть . Если  модель  параметр  не  умеет  ( например  top_k
у  OpenAI), онигнорируется. Остальное  не  ломает  запрос .
Temperature
Влияет  на  разнообразие  ответов . Ниже  — предсказуемее  и  типичнее . Выше  — разнообразнее  и  реже . При  0 модель
для  одного  и  того  же  входа  даёт  один  и  тот  же  ответ .
Top P
Ограничивает  выбор  процентом  вероятных  токенов : берутся  только  те , чьи  вероятности  в  сумме  дают  P. Ниже  —
предсказуемее . По  умолчанию  доступен  весь  диапазон . Это  динамический  Top-K.
Top K
На  каждом  шаге  модель  выбирает  из  K самых  вероятных  токенов . 1 — всегда  самый  вероятный  следующий  токен .
0 — настройка  выключена , рассматриваются  все  варианты . У  OpenAI поле  игнорируется .
Frequency Penalty
Штрафует  токены  пропорционально  тому , как  часто  они  уже  встречались  во  входе . Чем  чаще  токен  появлялся , тем
сильнее  штраф . Отрицательные  значения  поощряют  повтор .
Presence Penalty
Штрафует  токены , которые  уже  были  во  входе , независимо  от  числа  повторов . Выше  — меньше  повторов .
Отрицательные  значения  поощряют  повтор .
Repetition Penalty
Снижает  повтор  токенов  из  входа . Выше  — меньше  повторов , но  слишком  высокое  значение  ломает  связность
( длинные  предложения  без  коротких  слов ). Штраф  масштабируется  от  исходной  вероятности  токена .
Min P
Минимальная  вероятность  токена  относительно  самого  вероятного . При0.1  остаются  только  токены  не  слабее
1/10 от  лучшего  варианта . Порог  двигается  вместе  с  уверенностью  лидера .
Top A
Оставляет  токены  с  « достаточно  высокой » вероятностью  относительно  лидера . Это  динамический  Top-P: ниже  —
уже  фильтр  вокруг  самого  вероятного  токена . Выше  не  обязательно  делает  ответ  креативнее  — уточняет  отсечку .
Seed
Если  задан , выборка  должна  быть  детерминированной : одинаковые  seed и  параметры  — одинаковый  результат .
Для  части  моделей  детерминизм  не  гарантируется .
Max Tokens
Верхняя  граница  числа  токенов  в  ответе . Максимум  — длина  контекста  минус  длина  промпта .
На  прямом  маршруте  к  новым  моделям  OpenAI max_tokens автоматически  уходит  как  max_completion_tokens .
Max Completion Tokens
То  же  ограничение  длины  ответа , что  и  max_tokens . Нужен  новым  моделям  OpenAI, которые  отклоняют
устаревшее  полеmax_tokens .
Logit Bias
JSON- объект : id токена  в  токенизаторе  →  смещение  от  −100 до  100. Смещение  прибавляется  к  логитам  до
выборки . Эффект  зависит  от  модели : −1…1 слегка  меняет  вероятность , −100 / 100 обычно  запрещает  или
принудительно  выбирает  токен .
Logprobs
Вернуть  логарифмические  вероятности  выходных  токенов . Еслиtrue , в  ответе  будут  logprobs каждого
возвращённого  токена .
Top Logprobs
Число  от  0 до  20: сколько  самых  вероятных  токенов  вернуть  на  каждой  позиции  вместе  с  logprob. Требует
logprobs: true .
Response Format
Заставляет  модель  ответить  в  заданном  формате . { "type": "json_object" }  включает  JSON- режим : сообщение
будет  валидным  JSON.
JSON- режим
Модель  всё  равно  нужно  попросить  отвечать  JSON — системным  или  пользовательским  сообщением .
Строгая  схема  —{ "type": "json_schema", "json_schema": { … } } . Подробнее  —структурированный  вывод.
Structured Outputs
Может  ли  модель  вернуть  структурированный  вывод  черезresponse_format  с  json_schema . Основной  способ
задать  схему  — само  поле  response_format .
Stop
Генерация  останавливается , как  только  модель  встречает  любой  токен  из  списка .
Tools
Вызов  инструментов  в  форме  OpenAI. Для  других  провайдеров  схема  преобразуется . Сюда  же  кладётся  серверный
aitunnel:web_search . Подробнее  —вызов  инструментов ивеб - поиск.
Tool Choice
Какой  инструмент  вызывать :
Parallel Tool Calls
Разрешить  несколько  вызовов  инструментов  сразу . false  — строго  по  одному . Имеет  смысл , только  если  в
запросе  естьtools .
Include Reasoning
Устаревший  алиас . true  = reasoning: {} , false  = reasoning: { "exclude": true } . Лучше  объект  reasoning .
Подробнее  —токены  рассуждений.
Reasoning
Рассуждения  у  моделей  с  thinking- токенами : включить , задать  effort / бюджет , скрыть  цепочку  из  ответа .
Подробнее  —токены  рассуждений.
Reasoning Effort
Короткий  вариант  в  стиле  OpenAI. Выше  — больше  внутренних  токенов  рассуждения , если  модель  это  умеет .
Эквивалентreasoning.effort .
Web Search Options
Настройки  встроенного  поиска  у  моделей , которые  ищут  сами  ( без  серверного  инструмента ). Для  обычного  поиска
через  AITUNNEL используйтеtools: [{ "type": "aitunnel:web_search" }] . Подробнее  —веб - поиск.
Verbosity
Краткость  ответа . Ниже  — короче , выше  — подробнее . Появилось  у  OpenAI в  Responses API; провайдер , который
поле  не  понимает , его  игнорирует .
Другие  поля  AITUNNEL
Это  не  сэмплинг , но  часто  рядом  в  том  же  теле  запроса :
Предыдущая
Лимиты
Следующая
Ошибки  и  отладка

---

## Ошибки и отладка

Главная/ Документация/ Ошибки  и  отладка
Ошибки  и  отладка
Неверный  запрос , ключ  или  баланс  приходят  HTTP- ошибкой . Если  модель  уже
генерирует  — статус  200, а  сбой  в  теле  ответа  или  в  SSE.
Форма  ответа
TypeScript
type ErrorResponse = {
error: {
code: number;
    message: string;
    metadata?: Record<string, unknown>;
  };
};
HTTP- статус  совпадает  с  error.code , если  запрос  отклонили  до  генерации : неверные  параметры , нет  ключа , не
хватает  баланса .
Если  модель  уже  начала  отвечать , HTTP будет  200, а  ошибка  придёт  в  теле  или  событием  SSE. Подробнее  —
стриминг.
JavaScript Python
const request = await fetch("https://api.aitunnel.ru/v1/chat/completions", {
method: "POST",
headers: {
Authorization: "Bearer sk-aitunnel-xxx",
"Content-Type": "application/json",
  },
body: JSON.stringify({
model: "gpt-5.6-sol",
messages: [{ role: "user", content: " Привет " }],
  }),
});
console.log(request.status); // код  ошибки , если  модель  ещё  не  начала  генерацию
const response = await request.json();
console.error(response.error?.code);
console.error(response.error?.message);
Коды  ошибок
Ошибки  модерации
Если  ввод  пометили , в  error.metadata  будет  причина :
TypeScript
type ModerationErrorMetadata = {
reasons: string[]; // почему  пометили  ввод
   agged_input: string; // фрагмент  до  100 символов ; длиннее  — обрезан  посередине  через  …
  provider_name: string; // кто  запросил  модерацию
  model_slug: string;
};
Сообщение  error.message  уже  переписано  по - русски : какой  провайдер  отклонил  и  почему .
Ошибки  провайдера
Если  упал  апстрим , в  error.metadata  может  быть :
TypeScript
type ProviderErrorMetadata = {
provider_name: string; // провайдер , у  которого  случилась  ошибка
  raw?: unknown; // исходный  текст  ошибки , без  внутренних  ссылок
};
Внутренние  ссылки  и  брендинг  из  текста  ошибки  вычищаются . Не  полагайтесь  на  точный  вид  raw  —
ориентируйтесь  наcode  и  message .
Когда  ответа  нет
Иногда  модель  не  генерирует  текст : холодный  старт  или  масштабирование  у  провайдера . Обычно  это  секунды ,
иногда  минуты .
Если  пустые  ответы  повторяются  — простой  retry или  другая  модель  /запасные  модели.
Списание  за  промпт
В  части  случаев  провайдер  всё  равно  берёт  плату  за  обработку  промпта , даже  если  токенов  ответа  не  было .
Ошибки  в  стриме
До  первого  токена  — обычный  JSON и  HTTP 4xx/5xx. После  начала  генерации  статус  уже  200: ошибка  приходит  SSE-
событием  с  error  иfinish_reason: "error" . Примеры  кода  —стриминг.
Что  проверить
Предыдущая
Параметры
Следующая
Эмбеддинги

---

## Картинки

Главная/ Документация/ Картинки
Картинки
AITUNNEL генерирует  изображения  по  текстовому  промпту  через  POST
/images/generations. Запрос  синхронный  — ответ  с  готовым  изображением
приходит  в  том  же  HTTP- ответе , без  опроса  статуса . На  этой  же  странице  — как
отдать  картинку  в  чат .
Понимание  изображений
Запросы  с  картинками  идут  вPOST https://api.aitunnel.ru/v1/chat/completions  с  параметромmessages  в
формате  multi-part. image_url  может  быть  либо  URL, либо  изображением  в  формате  base64. Несколько
изображений  можно  отправить  в  отдельных  элементах  массива  content . Количество  изображений  в  одном
запросе  зависит  от  провайдера  и  модели .
Сначала  текст
Из - за  того , как  обрабатывается  контент , мы  рекомендуем  сначала  отправлять  текстовый  запрос , а  затем
изображения . Если  изображения  должны  идти  первыми , положите  их  в  системный  промпт .
Модель  должна  уметь  картинки  во  входе : вкаталоге у  неёmodalities.input  содержит  image . Пример  ниже  —
gpt-5.6-sol .
Использование  URL изображений
Публичный  адрес  удобнее : ничего  не  кодируете  на  своей  стороне .
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gpt-5.6-sol",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": " Что  изображено  на  этой  картинке ?"},
          {
            "type": "image_url",
            "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-board
          }
        ]
      }
    ]
  }'
Использование  изображений  в  формате  Base64
Для  локально  хранящихся  изображений  отправьте  их  как  data-URI data:image/jpeg;base64,...  ( подставьте  MIME
файла ).
cURL Python JavaScript PHP
# url — data-URI: data:image/jpeg;base64,<...>
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gpt-5.6-sol",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": " Что  изображено  на  этой  картинке ?"},
          {
            "type": "image_url",
            "image_url": {"url": "data:image/jpeg;base64,/9j/4AAQ..."}
          }
        ]
      }
    ]
  }'
Опционально  у  image_url  есть  detail : auto  ( по  умолчанию ), low  или  high .
Поддерживаемые  типы  изображений :
Какие  чат - модели  видят  картинки  — группа  chat  публичного  каталога , фильтр  по  modalities.input :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/chat
Генерация  и  редактирование  изображений
AITUNNEL генерирует  изображения  по  текстовому  промпту  (text-to-image) через  POST
https://api.aitunnel.ru/v1/images/generations . Запрос  синхронный  — ответ  с  готовым  изображением  приходит  в
том  же  HTTP- ответе , без  опроса  статуса .
Набор  параметров  (resolution , aspect_ratio , size , quality , output_format , seed  и  т . д .) единый  для  всех
моделей . resolution , aspect_ratio  иbackground  проверяются  строго  по  возможностям  конкретной  модели  ( см .
раздел  ниже ) — недопустимое  значение  вернёт400 . А  size , quality , output_format  и  seed  — универсальные
необязательные  параметры : их  можно  передавать  для  любой  модели , мы  проверяем  только  формат  значения , а
не  то , « поддерживает » ли  его  конкретная  модель . Если  параметр  не  имеет  смысла  для  модели , она  просто
применит  его  ( если  может ) или  проигнорирует  — без  ошибки .
Нужно  отредактировать  существующее  изображение ?
Тот  же  эндпоинт  /images/generations умеет  и  генерацию  по  референсным  изображениям  (image-to-image) —
просто  добавьтеinput_references к  обычному  запросу . Подробности  — в  разделе« Редактирование
существующих  изображений ».
Поддерживаемые  модели
Актуальный  список  моделей  генерации  изображений  вместе  с  их  возможностями  ( разрешения , aspect ratio,
форматы , лимиты ) доступен  через  публичный  эндпоинт :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/images
Также  его  можно  посмотреть  настранице  моделей.
Каждая  запись  содержит  поля :
Поле Описание
provider Провайдер  модели  ( например , openai , google , bytedance-seed , black-forest-labs ,
x-ai )
min_price_per_image  /
max_price_per_image
Ориентировочный  диапазон  цены  за  одно  изображение  в  рублях  ( комиссия
включена )
supported_resolutions Поддерживаемые  разрешения  ( например , 1K , 2K , 4K )
supported_aspect_ratios Поддерживаемые  соотношения  сторон  ( например , 16:9 , 9:16 , 1:1 )
supported_quality Значения  quality , которые  точно  дают  эффект  у  этой  модели  ( например , low ,
medium , high ) — справочно ; параметр  можно  передавать  и  другим  моделям , они
просто  проигнорируют  его  без  ошибки
supported_output_formats Значения  output_format , которые  точно  дают  эффект  у  этой  модели  ( например , png ,
jpeg ) — справочно , как  и  supported_quality
supported_background Допустимые  значения  background  ( например , auto , transparent , opaque ) — строго
проверяется: значение  не  из  списка  вернёт  400
supports_seed Есть  ли  у  модели  реальный  эффект  от  параметра  seed — справочно , как  и
supported_quality
max_n Максимум  изображений  за  один  запрос  (n )
max_input_references Максимум  референс - изображений  для  image-to-image (0 — редактирование  не
поддерживается )
supports_generation  /
supports_edit
Поддерживает  ли  модель  генерацию  / редактирование
Тарификация
Базовая  генерация
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/images/generations \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-4.5",
    "prompt": " Красивый  закат  над  горами , кинематографичный  стиль ",
    "resolution": "2K",
    "aspect_ratio": "16:9"
  }'
Изображения  приходят  как  base64
В  отличие  от  старой  версии  API, результат  всегда  возвращается  как  base64 в  поле  data[i].b64_json — прямых
URL на  изображение  больше  нет . Декодируйте  base64 самостоятельно  и  сохраняйте  файл .
Параметры  запроса
Параметр Тип Обязательный Описание
model string да ID модели  ( например , seedream-4.5 ). Список  — через  публичный
эндпоинт  моделей
prompt string да Текстовое  описание  изображения
n integer нет Количество  изображений  (1–10 в  зависимости  от  модели , по
умолчанию  1). Проверяйте  max_n
resolution string нет Разрешение  ( например , 1K , 2K , 4K ) — должно  входить  в
supported_resolutions  модели
aspect_ratio string нет Соотношение  сторон  ( например , 16:9 , 1:1 ) — должно  входить  в
supported_aspect_ratios  модели
size string нет Универсальный  опциональный  параметр  длялюбой модели  — тир
(2K ), точные  пиксели  WIDTHxHEIGHT  ( например , 1024x1536 ,
латинская  x ) илиauto . Необязателен  — без  него  модель  отдаёт
свой  размер  по  умолчанию . Явные  пиксели  нельзя  комбинировать  с
resolution /aspect_ratio  в  одном  запросе
quality string нет Универсальный  опциональный  параметр  — low , medium , high  или
auto . Модели  без  « ручки » качества  (supported_quality пуст ) просто
проигнорируют  его
output_format string нет Универсальный  опциональный  параметр  — png , jpeg , webp  или
svg . Модели  без  поддержки  конкретного  формата
(supported_output_formats  пуст ) проигнорируют  его
background string нет Фон  ( например , auto , transparent , opaque ) — единственный из  этой
группы  параметров , который  строго  проверяется : значение  должно
входить  в  supported_background  модели , иначе400
output_compression integer нет Сжатие  для  jpeg /webp , 0–100
seed integer нет Универсальный  опциональный  параметр  — seed для  детерминизма .
Модели  без  реальной  поддержки  (supports_seed: false ) просто
проигнорируют  его
input_references array нет Референсные  изображения  для  image-to-image — см .раздел  ниже
Строго  проверяются  только  resolution / aspect_ratio / background
resolution, aspect_ratio иbackground должны  входить  в  соответствующиеsupported_* поля  модели  —
иначе400 Bad Request. size, quality, output_format и  seed — универсальные  и  необязательные : их  можно
передавать  любой  модели , мы  проверяем  только  формат  значения . Если  параметр  не  имеет  смысла  для
конкретной  модели , она  либо  применит  его  сама , либо  тихо  проигнорирует  — без  ошибки .
Провайдер - специфичные  параметры
Некоторые  модели  принимают  дополнительные  параметры , специфичные  для  конкретного  провайдера
( например , moderation  для  моделей  семейства  GPT Image). Список  таких  параметров  для  модели  — в  поле
allowed_passthrough_parameters  публичного  эндпоинта  моделей . Передавайте  их  прямо  на  верхнем  уровне
запроса , как  обычный  параметр :
JSON
{
"model": "gpt-image-1",
"prompt": " Логотип  кофейни ",
"moderation": "low"
}
Несколько  изображений  за  раз
Передайте  n , если  модель  поддерживает  max_n больше  1:
JSON
{
"model": "gpt-image-1",
"prompt": " Логотип  кофейни  в  минималистичном  стиле , разные  цветовые  варианты ",
"n": 4,
"quality": "medium"
}
Каждый  элемент  результата  — отдельный  объект  в  массиве  data .
Формат  ответа
JSON
{
"created": 1234567890,
"data": [
    {
"b64_json": "iVBORw0KGgoAAAANSUhEUgAA...",
"media_type": "image/png"
    }
  ],
"model": "seedream-4.5",
"usage": {
"cost_rub": 3.4,
"balance": 1245.6
  }
}
Редактирование  существующих  изображений  (image-to-image)
Чтобы  отредактировать  существующее  изображение , добавьте  к  обычному  запросу  генерации  параметр
input_references  — массив  объектов  с  референсными  изображениями . Модель  использует  их  как  визуальную
основу  и  применяет  к  ним  вашу  текстовую  инструкцию  изprompt . Отдельный  эндпоинт  для  этого  не  нужен  —
работает  тот  же  POST https://api.aitunnel.ru/v1/images/generations .
Каждый  элемент  input_references  — объект{ "type": "image_url", "image_url": { "url": "..." } } ; url  — это
data:  base64- строка  для  локального  файла  или  публичный  HTTP(S)- адрес . Максимальное  количество
референсов  на  запрос  — в  поле  max_input_references  модели .
Редактирование  локального  файла
Python JavaScript PHP
import base64
import requests
withopen("photo.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode("utf-8")
response = requests.post(
"https://api.aitunnel.ru/v1/images/generations",
    headers={"Authorization": "Bearer sk-aitunnel-xxx"},
    json={
"model": "gpt-image-1",
"prompt": " Добавь  солнечные  очки  на  лицо  человека ",
"input_references": [
            {
"type": "image_url",
"image_url": {"url": f"data:image/png;base64,{b64}"},
            },
        ],
    },
)
result = response.json()
print(result["data"][0]["b64_json"][:50])
print(" Стоимость :", result["usage"]["cost_rub"], " ₽ ")
Комбинирование  нескольких  локальных  файлов
Передайте  несколько  объектов  в  input_references , чтобы  объединить  элементы  разных  фото  в  одно  изображение
( лимит  —max_input_references  модели ):
Python
import base64
import requests
defto_data_url(path):
withopen(path, "rb") as f:
returnf"data:image/png;base64,{base64.b64encode(f.read()).decode('utf-8')}"
response = requests.post(
"https://api.aitunnel.ru/v1/images/generations",
    headers={"Authorization": "Bearer sk-aitunnel-xxx"},
    json={
"model": "seedream-4.5",
"prompt": " Помести  человека  с  первого  фото  на  фон  пляжа  со  второго  фото ",
"input_references": [
            {"type": "image_url", "image_url": {"url": to_data_url("person.png")}},
            {"type": "image_url", "image_url": {"url": to_data_url("beach.png")}},
        ],
    },
)
result = response.json()
print(result["data"][0]["b64_json"][:50])
Прозрачный  фон  при  редактировании
JSON
{
"model": "gpt-image-1",
"prompt": " Удали  фон , оставь  только  товар ",
"input_references": [
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,<...>" } }
  ],
"background": "transparent"
}
Если  изображение  уже  доступно  по  URL
Так  же  можно  указать  публичный  HTTP(S)- адрес  напрямую , без  кодирования :
JSON
{
"model": "gpt-image-1",
"prompt": " Добавь  солнечные  очки  на  лицо  человека ",
"input_references": [
    { "type": "image_url", "image_url": { "url": "https://example.com/photo.png" } }
  ]
}
Также  поддерживается : POST /images/edits
Для  удобства  клиентов , привыкших  к  OpenAI Images API, у  нас  также  есть  отдельный  эндпоинтPOST
https://api.aitunnel.ru/v1/images/edits , который  принимает  файлы  напрямую  через  multipart/form-data  ( без
ручного  base64- кодирования ) и  под  капотом  делает  то  же  самое , что  иinput_references  выше :
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/images/edits \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -F model="gpt-image-1" \
  -F image="@photo.png" \
  -F prompt=" Добавь  солнечные  очки  на  лицо  человека "
Принимает  те  же  параметры , что  и  /images/generations , плюсimage  ( файл , до  25 МБ ) и  image[]  ( несколько
файлов  вместо  image ).
Лучшие  практики
Устранение  неполадок
400 Bad Request  с  упоминанием  параметра ?
Модель  не  найдена ?
Модель  не  поддерживает  редактирование ?
Смотрите  также
Предыдущая
Ранжирование
Следующая
PDF

---

## PDF

Главная/ Документация/ PDF
PDF
PDF уходит  в  chat/completions как  type  le: публичный  URL или  data-URI с
base64. Работает  с  любой  моделью  — либо  нативно , либо  через  разбор  файла .
POST https://api.aitunnel.ru/v1/chat/completions , вmessages  — массив  частей . В  file_data  — публичный  URL
или  data:application/pdf;base64,... .
Нативно  или  через  разбор
Если  модель  умеет  файлы  нативно  (file  вmodalities.input ), PDF передаётся  ей  напрямую . Иначе  AITUNNEL
разбирает  файл  и  отдаёт  модели  текст  ( и  при  OCR — картинки ).
Несколько  PDF — отдельные  элементы  content . Сколько  штук  примет  запрос , зависит  от  провайдера  и  модели .
Текст  лучше  ставить  первым , затем  файлы . Если  PDF должен  идти  первым  — положите  его  в  системный  промпт . В
одном  запросе  можно  смешать  PDF икартинки.
Плагин  не  обязателен
Разбор  сработает  и  без  plugins . Движок  по  умолчанию  — нативный , если  модель  его  умеет , иначе  mistral-
ocr .
URL
Для  публично  доступных  PDF достаточно  ссылки , без  загрузки  и  кодирования .
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gpt-5.6-sol",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": " Какие  основные  моменты  в  этом  документе ?"},
          {
            "type": " le",
            " le": {
              " lename": "document.pdf",
              " le_data": "https://bitcoin.org/bitcoin.pdf"
            }
          }
        ]
      }
    ]
  }'
Base64
Локальный  или  закрытый  файл  — data-URI.
cURL Python JavaScript PHP
#  le_data — data-URI: data:application/pdf;base64,<...>
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gpt-5.6-sol",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": " Какие  основные  моменты  в  этом  документе ?"},
          {
            "type": " le",
            " le": {
              " lename": "document.pdf",
              " le_data": "data:application/pdf;base64,JVBERi0..."
            }
          }
        ]
      }
    ]
  }'
Движок  разбора
Движок  задаётся  плагином  file-parser  вplugins :
JSON
{
"plugins": [
    {
"id": " le-parser",
"pdf": {
"engine": "cloud are-ai"
      }
    }
  ]
}
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gpt-5.6-sol",
    "plugins": [
      {
        "id": " le-parser",
        "pdf": { "engine": "mistral-ocr" }
      }
    ],
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": " Какие  основные  моменты  в  этом  документе ?"},
          {
            "type": " le",
            " le": {
              " lename": "document.pdf",
              " le_data": "https://bitcoin.org/bitcoin.pdf"
            }
          }
        ]
      }
    ]
  }'
Официальные  SDK не  знают  про  plugins
Поле  plugins  не  входит  в  стандарт  OpenAI: в  Python передавайте  через  extra_body , в  TypeScript — с@ts-
expect-error . На  cURL и  любых  « сырых » HTTP- клиентах  ограничений  нет .
Сжатие  слишком  длинного  промпта  — другой  плагин ,оптимизация  сообщений.
Движок Когда Оплата
native Модель  принимает  файлы  сама  (file  во  входе
каталога )
Как  обычные  токены  входа
mistral-ocr Сканы , PDF с  картинками OCR плюс  токены  модели  — всё  в
usage.cost_rub
cloudflare-ai Текст  в  PDF, нужен  markdown Разбор  бесплатный , токены  модели  — как
обычно
Если  движок  не  указать : сначала  нативный  разбор  модели , если  его  нет  —mistral-ocr . У  gpt-5.6-sol  во  входе
естьfile , поэтому  без  плагина  пойдёт  native . Явно  задайте  mistral-ocr  или  cloudflare-ai , если  нужен
другой  движок .
На  прямых  маршрутах  отдельных  провайдеров  plugins  не  передаются  — остаётся  только  нативная  поддержка
файлов  у  модели .
Какие  модели  принимают  файлы  сами  — группа  chat , полеmodalities.input :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/chat
Картинки  из  OCR
У  mistral-ocr  из  PDF в  модель  уходит  не  больше8 изображений. Лишние  отбрасываются , текст  сохраняется
целиком . Лимит  нужен , потому  что  у  провайдеров  разные  потолки  на  число  картинок  в  одном  запросе : часть  сразу
отвечает  ошибкой , часть  упирается  в  контекст , если  с  каждой  страницы  идёт  картинка .
Если  выбранная  модель  вообще  не  принимает  изображения , OCR- картинки  выкидываются , остаётся  только  текст .
Не  разбирать  PDF повторно
В  ответе  ассистента  могут  быть  annotations  — разобранное  содержимое  файла . Если  отдать  их  обратно  в
следующем  запросе  ( вместе  с  тем  же  file ), PDF не  разбирают  заново : быстрее  и  без  повторной  оплаты  OCR.
Python
import base64
import requests
defdata_url(path):
withopen(path, "rb") as f:
return"data:application/pdf;base64," + base64.b64encode(f.read()).decode()
url = "https://api.aitunnel.ru/v1/chat/completions"
headers = {
"Authorization": "Bearer sk-aitunnel-xxx",
"Content-Type": "application/json",
}
 le_part = {
"type": " le",
" le": {" lename": "document.pdf", " le_data": data_url("document.pdf")},
}
 rst = requests.post(
    url,
    headers=headers,
    json={
"model": "gpt-5.6-sol",
"messages": [
            {
"role": "user",
"content": [
                    {"type": "text", "text": " Какие  основные  моменты  в  этом  документе ?"},
                     le_part,
                ],
            }
        ],
    },
).json()
msg =  rst["choices"][0]["message"]
annotations = msg.get("annotations")
follow = requests.post(
    url,
    headers=headers,
    json={
"model": "gpt-5.6-sol",
"messages": [
            {
"role": "user",
"content": [
                    {"type": "text", "text": " Какие  основные  моменты  в  этом  документе ?"},
                     le_part,
                ],
            },
            {
"role": "assistant",
"content": msg["content"],
"annotations": annotations,
            },
            {"role": "user", "content": " Разверни  второй  пункт "},
        ],
    },
)
print(follow.json()["choices"][0]["message"]["content"])
Схема  аннотации :
TypeScript
type FileAnnotation = {
type: " le";
   le: {
hash: string; // идентификатор  разобранного  файла
    name?: string; // исходное  имя
    content: ContentPart[]; // текст  и  картинки  из  PDF
  };
};
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
hash  стабилен  для  одного  и  того  же  разобранного  файла . По  нему  можно  дедуплицировать  аннотации  из
успешного  ответа  и  из  ошибки .
Формат  ответа
JSON
{
"id": "gen-1234567890",
"model": "gpt-5.6-sol",
"object": "chat.completion",
"created": 1234567890,
"choices": [
    {
"message": {
"role": "assistant",
"content": " Документ  обсуждает ...",
"annotations": [
          {
"type": " le",
" le": {
"hash": "abc123...",
"name": "document.pdf",
"content": [
                { "type": "text", "text": " Разобранный  текст ..." },
                {
"type": "image_url",
"image_url": { "url": "data:image/png;base64,..." }
                }
              ]
            }
          }
        ]
      }
    }
  ],
"usage": {
"prompt_tokens": 1000,
"completion_tokens": 100,
"total_tokens": 1100,
"cost_rub": 1.2,
"balance": 950.5
  }
}
annotations  есть , когда  PDF разбирали  движкомmistral-ocr  или  cloudflare-ai . Уnative  файла  в  ответе  нет :
его  видела  сама  модель . Вusage  — токены , cost_rub  иbalance  после  списания .
Ошибки  после  разбора
Если  PDF уже  разобрали , но  ни  один  провайдер  не  смог  сгенерировать  ответ , в  ошибке  могут  лежать  те  же
аннотации : error.metadata.file_annotations . Их  можно  сразу  отдать  в  повторном  запросе , чтобы  не  платить  за
разбор  снова . Дляnative  аннотаций  нет  — файл  уходил  в  модель  как  есть .
JSON
{
"error": {
"code": 502,
"message": " Провайдер  вернул  ошибку ",
"metadata": {
" le_annotations": [
        {
"type": " le",
" le": {
"hash": "abc123...",
"name": "document.pdf",
"content": [{ "type": "text", "text": " Разобранный  текст ..." }]
          }
        }
      ]
    }
  }
}
Коды  ошибок  — ошибки  и  отладка.
Предыдущая
Картинки
Следующая
Видео

---

## Видео

Главная/ Документация/ Видео
Видео
Два  сценария . Понимание  — видео  на  вход  /chat/completions. Генерация  —
асинхронный  POST /videos: задача , опрос  статуса , скачивание  MP4.
Понимание  видео
Запросы  с  видео  идут  вPOST https://api.aitunnel.ru/v1/chat/completions  с  параметромmessages  в  формате
multi-part. video_url.url  может  быть  публичным  URL или  data-URI с  base64. Несколько  роликов  — отдельные
элементы  массиваcontent . Текст  лучше  ставить  первым , затем  видео .
Модель  должна  уметь  видео  во  входе : вкаталоге у  неёmodalities.input  содержит  video . Пример  ниже  —
gemini-3.7-flash .
URL и  YouTube
Публичный  URL удобнее : ничего  не  кодируете  на  своей  стороне . У  моделей  Gemini по  прямой  ссылке  обычно
принимают  YouTube. Для  локального  файла  — base64. Другие  модели  с  video  во  входе  могут  принимать
обычные  HTTPS URL — зависит  от  провайдера .
Использование  URL видео
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gemini-3.7- ash",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": " Опиши , что  происходит  в  этом  видео ."},
          {
            "type": "video_url",
            "video_url": {"url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ"}
          }
        ]
      }
    ]
  }'
Использование  видео  в  формате  Base64
Для  локально  хранящихся  видео  отправьте  их  как  data-URI data:video/mp4;base64,...  ( подставьте  MIME файла ).
cURL Python JavaScript PHP
# url — data-URI: data:video/mp4;base64,<...>
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gemini-3.7- ash",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": " Что  происходит  в  этом  видео ?"},
          {
            "type": "video_url",
            "video_url": {"url": "data:video/mp4;base64,AAAA..."}
          }
        ]
      }
    ]
  }'
Поддерживаемые  типы  видео :
Какие  чат - модели  видят  видео  — группа  chat  публичного  каталога , фильтр  по  modalities.input :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/chat
Видеофайлы  бывают  большими : сжимайте , обрезайте  до  нужного  фрагмента , не  гоните  4K, если  хватает  720p.
Длинный  ролик  лучше  резать  на  сегменты  — у  моделей  разные  потолки  длительности .
Генерация  видео
AITUNNEL поддерживает  генерацию  видео  по  текстовому  промпту  (text-to-video), по  опорному  изображению  (image-
to-video), по  референсу  (reference-to-video) и  правку  существующего  видео(video-to-video) через  асинхронный  API.
Процесс  состоит  из  трёх  шагов :
SDK не  умеет  /videos
Официальный  OpenAI SDK не  умеет  /videos  — используйте  HTTP- клиент .
Поддерживаемые  модели
Актуальный  список  моделей  генерации  видео  вместе  с  их  возможностями  ( размеры , aspect ratio, длительности ,
поддержка  аудио , image-to-video, референсов , video-to-video, passthrough- параметров  и  тарификации ) доступен
через  публичный  эндпоинт :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/videos
Также  его  можно  посмотреть  настранице  моделей.
Каждая  запись  содержит  поля :
Поле Описание
provider Провайдер  модели  ( например , google , openai , bytedance , alibaba )
supported_resolutions Поддерживаемые  разрешения  ( например , 720p , 1080p , 4K )
supported_aspect_ratios Поддерживаемые  соотношения  сторон  ( например , 16:9 , 9:16 )
supported_sizes Точные  пиксельные  размеры  WIDTHxHEIGHT
supported_durations Допустимые  значения  duration  в  секундах
supported_frame_images Типы  опорных  кадров  для  image-to-video: first_frame , last_frame
generate_audio Управление  аудио : true  — параметрgenerate_audio  можно  переключать , false  —
модель  никогда  не  генерирует  аудио , null  — переключатель  не  документирован
( аудио  может  присутствовать  непредсказуемо , без  возможности  управления )
supports_seed Принимает  ли  параметр  seed
supports_input_references Поддерживает  ли  input_references  ( изображения , а  у  части  моделей  — также
video_url  / audio_url )
modalities.input Входные  модальности . Если  есть  "video"  — модель  умеет  править  исходное  видео
(video-to-video) черезinput_references  сtype: "video_url"
allowed_passthrough_parameters Разрешённые  ключи  вprovider.options.<slug>.parameters
Тарификация
Стоимость  зависит  от  модели , разрешения  и  длительности :
Отмены  задач  нет
Провайдер  начинает  генерацию  сразу  и  выставляет  нам  счёт  независимо  от  того , ждёте  вы  результат  или  нет .
Поэтому  у  API нет  метода  отмены  — « отмена » означала  бы  вернуть  вам  деньги  за  работу , которую  мы  всё  равно
оплатим .
Отправка  задачи
Базовый  text-to-video
cURL Python JavaScript PHP
# 1. Отправить  задачу
curl -X POST "https://api.aitunnel.ru/v1/videos" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2.0-fast",
    "prompt": "A golden retriever playing fetch on a sunny beach",
    "size": "1280x720",
    "duration": 5
  }'
# => { "id": "abc123", "polling_url": "https://api.aitunnel.ru/v1/videos/abc123", "status": "pending" }
# 2. Опросить  статус  ( повторять  до  completed/failed)
curl "https://api.aitunnel.ru/v1/videos/abc123" \
  -H "Authorization: Bearer sk-aitunnel-xxx"
# 3. Скачать  видео  после  completed
curl -L "https://api.aitunnel.ru/v1/videos/abc123/content?index=0" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  --output video.mp4
Параметры  запроса
Параметр Тип Обязательный Описание
model string да ID модели  ( например , seedance-2.0 ). Список  — через  публичный
эндпоинт  моделей
prompt string да Текстовое  описание  видео
duration integer нет Длительность  в  секундах  ( значение  должно  входить  в
supported_durations  модели )
resolution string нет Разрешение  выхода  ( например , 720p , 1080p )
aspect_ratio string нет Соотношение  сторон  ( например , 16:9 , 9:16 )
size string нет Точные  пиксели  WIDTHxHEIGHT . Альтернатива  пареresolution  +
aspect_ratio
frame_images array нет Опорные  кадры  для  image-to-video (first_frame , last_frame )
input_references array нет Референсы : image_url , а  у  моделей  с"video"  во  входе  — также
video_url  ( правка  видео ) и  при  поддержке  провайдера  audio_url
generate_audio boolean нет Генерировать  ли  аудио . Доступен  только  для  моделей  с
generate_audio: true  — для  остальных  запрос  вернёт  ошибку  400
seed integer нет Seed для  детерминизма  ( не  гарантируется  всеми  провайдерами )
provider object нет Passthrough- параметры  провайдера
Указывайте  duration явно
Если  duration  не  задан , биллинг  используетмаксимальную  длительность  модели для  расчёта  резерва , и  вы
переплатите  до  получения  результата  ( избыток  вернётся  послеcompleted ). Явное  duration  даёт
минимальный  резерв  сразу .
Поддерживаемые  разрешения  и  aspect ratio
Общий  набор  значений  по  всем  моделям  ( конкретные  опции  зависят  от  модели  — сверяйтесь  с  её
supported_resolutions  / supported_aspect_ratios  / supported_sizes ):
Image-to-Video ( опорные  кадры )
Передайте  массив  frame_images  с  первым  и / или  последним  кадром  — модель  сгенерирует  переход  между  ними
( или  продолжение  первого  кадра ).
JSON
{
"model": "wan-2.7",
"prompt": "A character walking through a misty forest",
"frame_images": [
    {
"type": "image_url",
"image_url": { "url": "https://example.com/ rst-frame.png" },
"frame_type": " rst_frame"
    }
  ],
"resolution": "1080p",
"duration": 5
}
Для  указания  последнего  кадра  используйте"frame_type": "last_frame" . Поддерживаемые  типы  опорных  кадров
для  модели  указаны  в  полеsupported_frame_images  публичного  эндпоинта .
Reference-to-Video ( визуальный  референс )
input_references  — референсные  изображения  для  стиля  или  содержания , а  не  покадровая  основа .
Поддерживается  моделями , у  которыхsupports_input_references: true .
JSON
{
"model": "seedance-1-5-pro",
"prompt": "A colossal solar  are beside a planet",
"input_references": [
    {
"type": "image_url",
"image_url": { "url": "https://example.com/style-ref.png" }
    }
  ],
"resolution": "1080p",
"duration": 6
}
Комбинация  frame_images + input_references
Если  заданы  оба  поля , frame_images  имеет  приоритет  и  запрос  обрабатывается  как  image-to-video.
Video-to-Video ( правка  видео )
Модели , у  которых  в  каталоге  modalities.input  содержит"video"  ( например , aleph-2 , hailuo-3 ), принимают
исходное  видео  вinput_references  с  типом  video_url . Промпт  описывает  правку : заменить  объект , сменить
фон , переосмыслить  стиль , освещение  и  т . п .
URL может  быть  публичной  HTTPS- ссылкой  или  data URL (data:video/mp4;base64,… ). Провайдер  принимает  только
HTTPS для  video_url  / audio_url  — при  data URL AITUNNEL сам  выкладывает  файл  во  временное  хранилище  и
подставляет  публичный  URL перед  отправкой .
JSON
{
"model": "aleph-2",
"prompt": "Replace the red car with a blue convertible, keep camera motion",
"aspect_ratio": "16:9",
"duration": 5,
"input_references": [
    {
"type": "video_url",
"video_url": { "url": "https://example.com/source.mp4" }
    }
  ]
}
Можно  комбинировать  исходное  видео  с  image- референсом  ( стиль  / ключевой  кадр ), если  модель  это  допускает :
JSON
{
"model": "hailuo-3",
"prompt": "Transfer the motion from the source clip onto this character",
"size": "1280x720",
"duration": 6,
"input_references": [
    {
"type": "video_url",
"video_url": { "url": "https://example.com/motion-source.mp4" }
    },
    {
"type": "image_url",
"image_url": { "url": "https://example.com/character.png" }
    }
  ]
}
Как  узнать , что  модель  умеет  править  видео
Смотрите  поле  modalities.input  вGET https://api.aitunnel.ru/public/aitunnel/models/videos : наличие
"video"  во  входе  = video-to-video черезvideo_url . Для  image-only референсов  достаточно
supports_input_references: true .
Passthrough- параметры  провайдера
Некоторые  модели  принимают  специфичные  опции  через  полеprovider.options.<slug>.parameters :
JSON
{
"model": "veo-3.1",
"prompt": "A time-lapse of a  ower blooming",
"provider": {
"options": {
"google-vertex": {
"parameters": {
"personGeneration": "allow",
"negativePrompt": "blurry, low quality"
        }
      }
    }
  }
}
Разрешённые  ключи  для  каждой  модели  приходят  в  полеallowed_passthrough_parameters  публичного  эндпоинта
моделей . Всё , что  не  входит  в  этот  список , будет  отфильтровано  и  залогировано , но  не  приведёт  к  ошибке .
Формат  ответов
POST /v1/videos  — отправка  (202 Accepted )
JSON
{
"id": "abc123",
"polling_url": "https://api.aitunnel.ru/v1/videos/abc123",
"status": "pending"
}
На  этом  шаге  usage не  возвращается — итоговая  стоимость  известна  только  после  completed .
GET /v1/videos/{id}  — статус
Поля  расширяются  по  мере  прогресса  задачи .
Pending / in_progress:
JSON
{
"id": "abc123",
"polling_url": "https://api.aitunnel.ru/v1/videos/abc123",
"status": "in_progress"
}
Completed:
JSON
{
"id": "abc123",
"generation_id": "gen-1234567890-abcdef",
"polling_url": "https://api.aitunnel.ru/v1/videos/abc123",
"status": "completed",
"unsigned_urls": [
"https://api.aitunnel.ru/v1/videos/abc123/content?index=0"
  ],
"model": "seedance-2.0-fast",
"usage": {
"cost_rub": 47.92
  }
}
Failed:
JSON
{
"id": "abc123",
"status": "failed",
"error": "Provider rejected the prompt due to content policy",
"model": "seedance-2.0-fast",
"usage": {
"cost_rub": 0
  }
}
Возможные  статусы
Статус Описание
pending Задача  принята  и  стоит  в  очереди
in_progress Идёт  генерация
completed Видео  готово , можно  скачивать
expired Задача  не  завершилась  до  expires_at  — провайдер  так  и  не  отдал  результат . Резерв  возвращён
полностью , списания  нет
cancelled Провайдер  отменил  задачу  на  своей  стороне ; резерв  возвращён  полностью . Через  API отменить  задачу
нельзя
failed Генерация  упала  ( см . поле  error ); резерв  полностью  возвращён
Скачивание  видео
После  completed  — используйте  либо  URL изunsigned_urls[0] , либо  обращайтесь  напрямую  к  content- эндпоинту :
cURL
curl -L "https://api.aitunnel.ru/v1/videos/abc123/content?index=0" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  --output video.mp4
Параметр  index  по  умолчанию  0 . Используйте  другие  значения , если  модель  вернула  несколько  выходных
видео .
Ссылки  в  unsigned_urls  указывают  на  наш  content- эндпоинт  ине  имеют  срока  действия  с  истекающей  подписью
— они  работают , пока  задача  доступна  у  нас . Это  не  временные  подписанные  ссылки  провайдера .
Задачи  хранятся  у  нас  3 месяца, потом  завершённые  удаляются  ( списания  в  истории  расходов  остаются ). Сам
файл  живёт  у  провайдера  и  может  стать  недоступен  раньше , поэтому  скачивайте  нужное  видео  сразу , а  не
рассчитывайте  на  ссылку  как  на  хранилище .
Прямая  ссылка  с  токеном  в  URL
Если  нужно  скачать  видео  по  обычной  ссылкебез  заголовка  Authorization  ( например , чтобы  Telegram или
браузер  могли  забрать  файл  по  прямому  URL), передайте  API- ключ  в  query- параметреtoken :
cURL
# Без  заголовка  Authorization — ключ  прямо  в  URL
curl -L "https://api.aitunnel.ru/v1/videos/abc123/content?index=0&token=sk-aitunnel-xxx" \
  --output video.mp4
Такую  ссылку  можно  отдать , например , Telegram Bot API (sendVideo  с  video=<URL> ), который  скачает  файл  сам .
Безопасность  токена  в  URL
Query- параметр  token  — запасной  способ  авторизации , когда  передать  заголовок  Authorization  невозможно .
Он  работает  на  любом  эндпоинте  API, но  основной  кейс  — именно  скачивание  видео  по  прямой  ссылке .
Помните : ключ  в  URL может  попасть  в  логи  серверов , заголовокReferer  и  историю  браузера . Используйте  этот
способ  только  когда  заголовок  Authorization  передать  нельзя , и  не  публикуйте  такие  ссылки . Если  ключ
скомпрометирован  — отзовите  его  в  кабинете  и  создайте  новый .
Если  заголовок  Authorization  доступен  — предпочитайте  его  query- параметру . При  наличии  и  заголовка , и
token приоритет  у  заголовка .
Список  задач
Если  id  потерялся  или  нужно  понять , что  ещё  выполняется , задачи  можно  перечислить .
cURL
# Только  видео , новые  сверху
curl "https://api.aitunnel.ru/v1/videos?limit=20" \
  -H "Authorization: Bearer sk-aitunnel-xxx"
# Только  те , что  ещё  держат  резерв
curl "https://api.aitunnel.ru/v1/videos?active=true" \
  -H "Authorization: Bearer sk-aitunnel-xxx"
Параметры : status , active=true , limit  ( до  100), after  — id последней  задачи  предыдущей  страницы . Ответ
содержит  data , has_more  и  last_id .
Все  асинхронные  задачи  любого  типа  — видео  иBatch — доступны  одним  запросом :
cURL
curl "https://api.aitunnel.ru/v1/jobs?active=true" \
  -H "Authorization: Bearer sk-aitunnel-xxx"
GET /v1/jobs  дополнительно  отвечает  на  главный  вопрос  по  деньгам : active_count  и  active_reserved_rub  —
сколько  задач  ещё  выполняется  и  сколько  рублей  они  держат . У  каждой  записи  есть  kind  (video  / batch ),
reserved_rub , а  после  расчёта  — cost_rub  иrefunded_rub . GET /v1/jobs/{id}  возвращает  одну  задачу  любого
типа .
Задачи  доступны  только  владельцу  ключа : чужой  id  вернёт404 .
В  личном  кабинете
То  же  самое  без  кода  — на  страницеСтатистика  →  Задачи:
Списания  живут  в  соседней  вкладке  « Расходы »: там  только  фактически  потраченное , резервы  туда  не  попадают .
Лучшие  практики
Устранение  неполадок
Задача  надолго  зависла  в  pending?
400 Bad Request на  POST /v1/videos?
status: "failed"?
Модель  не  найдена ?
Видео  не  обрабатывается  в  чате ?
Смотрите  также
Предыдущая
PDF
Следующая
Аудио

---

## Аудио

Главная/ Документация/ Аудио
Аудио
Аудиофайл  на  вход  /chat/completions и  голосовой  ответ  модели . Не  путать  с
POST /audio/speech и  /audio/transcriptions.
Аудио  в  чате  идёт  вPOST https://api.aitunnel.ru/v1/chat/completions . Это  неозвучка  текста (/audio/speech ) и  не
распознавание  речи (/audio/transcriptions ).
Аудио  на  вход
Модель  с  "audio"  вmodalities.input  принимает  запись  в  multi-part messages : элемент  type: "input_audio" .
data  — сырой  base64, не  публичный  URL и  не  data-URI. Рядом  укажите  format . Текст  лучше  ставить  первым .
Пример  ниже  — gemini-3.7-flash . Какие  модели  слышат  аудио  — группа  chat  публичного  каталога :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/chat
На  сайте : страница  моделей. Фильтр  по  входной  модальности  « Аудио ».
Только  base64
Прямые  URL для  аудиоконтента  не  поддерживаются . Кодируйте  файл  в  base64 на  своей  стороне .
cURL Python JavaScript PHP
# data — сырой  base64, не  data-URI
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gemini-3.7- ash",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": " Расшифруй  эту  запись ."},
          {
            "type": "input_audio",
            "input_audio": {
              "data": "UklGRuQXDAB...",
              "format": "wav"
            }
          }
        ]
      }
    ]
  }'
Несколько  записей  — отдельные  элементы  массива  content . Модель  с  аудио  и  во  входе , и  в  выходе  ( например
gpt-audio-mini ) может  слушать  файл  и  ответить  голосом  в  одном  запросе : добавьте  modalities  и  audio , как  в
разделе  ниже .
Форматы  входа
Чаще  всего  wav  и  mp3 . Другие  значенияformat  зависят  от  модели  и  провайдера  — если  запрос  отклонён ,
попробуйте  wav .
Аудио  на  выход
Модель  с  "audio"  вmodalities.output  может  вернуть  речь . Передайтеmodalities: ["text", "audio"]  и  объект
audio  с  голосом  и  форматом . Пример  —gpt-audio-mini .
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gpt-audio-mini",
    "messages": [
      {"role": "user", "content": " Скажи  короткое  приветствие ."}
    ],
    "modalities": ["text", "audio"],
    "audio": {
      "voice": "alloy",
      "format": "wav"
    }
  }'
В  нестриминговом  ответе  аудио  лежит  вchoices[0].message.audio :
content  при  голосовом  ответе  часто  пустой  — текст  смотрите  в  transcript .
Параметры  audio
Поле Тип Обязательный Описание
voice string да Голос  модели . Набор  зависит  от  модели
format string да Формат  файла , например  wav  или  mp3 . Зависит  от  модели
Не  перечисляйте  голоса  из  документации  — берите  допустимые  значения  у  конкретной  модели .
Стриминг
Можно  включить  stream: true : куски  приходят  вdelta.audio . Склейте  data  и  декодируйте  base64. Подробнее
про  SSE —стриминг.
JSON
{
"choices": [
    {
"delta": {
"audio": {
"data": "<base64-encoded audio chunk>",
"transcript": " Привет "
        }
      }
    }
  ]
}
Python
import base64
from openai import OpenAI
client = OpenAI(
    api_key="sk-aitunnel-xxx",
    base_url="https://api.aitunnel.ru/v1/",
)
stream = client.chat.completions.create(
    model="gpt-audio-mini",
    messages=[{"role": "user", "content": " Скажи  короткое  приветствие ."}],
    modalities=["text", "audio"],
    audio={"voice": "alloy", "format": "wav"},
    stream=True,
)
audio_chunks = []
transcript_chunks = []
for chunk in stream:
ifnot chunk.choices:
continue
    audio = getattr(chunk.choices[0].delta, "audio", None)
ifnot audio:
continue
ifgetattr(audio, "data", None):
        audio_chunks.append(audio.data)
ifgetattr(audio, "transcript", None):
        transcript_chunks.append(audio.transcript)
print("".join(transcript_chunks))
withopen("output.wav", "wb") as f:
    f.write(base64.b64decode("".join(audio_chunks)))
Тарификация
У  части  чат - моделей  в  каталоге  есть  audio_input_cost  иaudio_output_cost  — цена  за  1 млн  аудиотокенов  в
рублях . Итог  запроса  — usage.cost_rub , остаток  —usage.balance .
Лучшие  практики
Устранение  неполадок
Модель  не  видит  аудио ?
В  ответе  нет  message.audio?
Голос  или  формат  не  приняты ?
Модель  не  найдена ?
Смотрите  также
Предыдущая
Видео
Следующая
Озвучка  текста

---

## Озвучка текста

Главная/ Документация/ Озвучка  текста
Озвучка  текста
Текст  в  речь  через  POST /audio/speech. Совместимо  с  OpenAI SDK — подмените
base_url. Ответ  — сырой  аудиопоток , не  JSON.
POST https://api.aitunnel.ru/v1/audio/speech  принимает  JSON. В  OpenAI SDK укажите  base_url
https://api.aitunnel.ru/v1/ .
Поддерживаемые  модели
Актуальный  список , голоса , форматы  и  цены  — публичный  каталог :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/speech
На  сайте :страница  моделей.
Поле Описание
voices Идентификаторы  голосов  для  поля  voice
supported_formats Значения  response_format . Первый  — если  параметр  не  указать
symbols_cost Цена  за  1 млн  символов  в  рублях
prompt_cost  / completion_cost Цена  за  1 млн  токенов , если  модель  тарифицируется  по  токенам
russian_supported Надёжно  ли  озвучивает  русский
Имя  в  запросе  — без  префикса  провайдера : gpt-4o-mini-tts , не  openai/gpt-4o-mini-tts . Префикс
provider/model  обходит  каталог  — см .OpenRouter.
Базовое  использование
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/audio/speech \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini-tts",
    "voice": "alloy",
    "input": " Привет ! Это  пример  озвучки  текста  через  AITUNNEL.",
    "response_format": "mp3"
  }' \
  --output output.mp3
Параметры  запроса
Параметр Тип Обязательный Описание
model string да Имя  из  каталога  или  provider/model
input string да Текст  для  озвучки
voice string да Голос  из  voices  модели
response_format string нет Формат  аудио . Если  не  указать  — первый  изsupported_formats  ( обычно
mp3 )
speed number нет Скорость  речи , 0.25 –4.0 . Есть  у  моделей  OpenAI, у  остальных  может
игнорироваться
instructions string нет Стиль  речи . Есть  у  gpt-4o-mini-tts
input_references array нет Сэмпл  голоса  для  клонирования  —ниже
Gemini — только  pcm
mp3  и  pcm  — у  большинства  моделей . opus , aac , flac , wav  — у  tts-1  и  tts-1-hd . Уgemini-3.1-flash-
tts-preview  только  pcm : mp3  вернёт  400.
Формат  ответа
Тело  — бинарное  аудио . Стоимость  и  баланс  — в  заголовках :
Заголовок Описание
Content-Type audio/mpeg  для  mp3 , audio/pcm  для  pcm
cost-rub Стоимость  запроса  в  рублях
balance Остаток  баланса  после  списания
Ошибка  приходит  JSON- ом , не  аудио : сначала  проверьте  статус  ответа .
Клонирование  голоса
У  части  моделей  можно  передать  короткий  сэмпл  вinput_references  — отдельный  « загрузить  голос » шаг  не
нужен . Нужен  один  input_audio  (base64 или  data-URI) и  по  желанию  text  с  расшифровкой  сэмпла :
JSON
{
"model": "voxtral-mini-tts-2603",
"input": "Hello from my cloned voice!",
"response_format": "mp3",
"input_references": [
    {
"type": "input_audio",
"input_audio": { "data": "data:audio/wav;base64,UklGRuQXDAB..." }
    },
    { "type": "text", "text": "This is the transcript of the reference audio." }
  ]
}
Не  все  модели  это  умеют . Слишком  большой  сэмпл  провайдер  отклонит .
Примеры
gpt-4o-mini-tts с  инструкциями  по  стилю
Python
response = client.audio.speech.create(
    model="gpt-4o-mini-tts",
    voice="nova",
input=" Добро  пожаловать ! Сегодня  у  нас  отличные  скидки .",
    instructions=" Говори  с  энтузиазмом , как  диктор  рекламы .",
)
response.stream_to_ le("promo.mp3")
Grok Voice TTS 1.0
Python
response = client.audio.speech.create(
    model="grok-voice-tts-1.0",
    voice="eve",
input="Hello! This is a test of Grok Voice TTS.",
    response_format="mp3",
)
response.stream_to_ le("grok.mp3")
Gemini 3.1 Flash TTS с  эмоциональными  тегами
Только  pcm :
Python
response = client.audio.speech.create(
    model="gemini-3.1- ash-tts-preview",
    voice="Kore",
input="[excited] Невероятно ! [whispers] Это  работает .",
    response_format="pcm",
)
response.stream_to_ le("gemini.pcm")
Voxtral Mini TTS
Python
response = client.audio.speech.create(
    model="voxtral-mini-tts-2603",
    voice="en_paul_neutral",
input="Welcome to our service. How can I help you today?",
    response_format="mp3",
)
response.stream_to_ le("voxtral.mp3")
Несколько  голосов  в  подкасте
Python
segments = [
    ("nova", " Добрый  день ! Вы  слушаете  еженедельный  подкаст  о  технологиях ."),
    ("onyx", " Сегодня  мы  обсудим  последние  новости  в  мире  ИИ ."),
    ("nova", " Начнём  с  обзора  новых  моделей  этой  недели ."),
]
for i, (voice, text) inenumerate(segments):
    response = client.audio.speech.create(
        model="tts-1-hd",
        voice=voice,
input=text,
        response_format="mp3",
    )
    response.stream_to_ le(f"segment_{i}.mp3")
Лучшие  практики
Устранение  неполадок
Пустой  или  битый  файл ?
400 на  формат ?
Модель  не  найдена ?
Голос  не  принят ?
Смотрите  также
Предыдущая
Аудио
Следующая
Распознавание  речи

---

## Распознавание речи

Главная/ Документация/ Распознавание  речи
Распознавание  речи
Аудио  в  текст  через  POST /audio/transcriptions. Multipart, совместимо  с  OpenAI
SDK — подмените  base_url.
POST https://api.aitunnel.ru/v1/audio/transcriptions  принимает  файл  в  multipart/form-data . В  OpenAI SDK
достаточно  указать  base_url https://api.aitunnel.ru/v1/ .
Только  multipart, не  JSON
JSON с  полем  input_audio  эндпоинт  не  принимает  — только  FormData с  файлом . SDK OpenAI сам  собирает
multipart.
Не  путать  с  аудио  в  чате
Чат  (/chat/completions , тип  input_audio ) — когда  модель  с  audio  во  входе  отвечает  на  вопросы  по  записи .
Подробнее : аудио. Этот  эндпоинт  — когда  нужен  просто  текст  транскрипции .
Поддерживаемые  модели
Актуальный  список  и  цены  — публичный  каталог :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/transcriptions
На  сайте :страница  моделей.
Каждая  запись  содержит  поля :
Поле Описание
provider Провайдер  модели
min_price_per_minute  / max_price_per_minute Ориентир  цены  за  минуту  аудио  в  рублях
duration_cost Цена  за  минуту , если  модель  тарифицируется  по  длительности
audio_input_cost  / prompt_cost  / completion_cost Цена  за  1 млн  токенов , если  модель  тарифицируется  по  токенам
supported_formats Расширения  файлов , которые  модель  принимает
supports_language_hint Принимает  ли  language
supports_diarization Умеет  ли  разделять  спикеров
supports_temperature Принимает  ли  temperature
Имя  в  запросе  — без  префикса  провайдера : whisper-1 , неopenai/whisper-1 . Префикс  provider/model обходит
каталог  и  уходит  напрямую  — см .OpenRouter.
Базовое  использование
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -F  le="@audio.mp3" \
  -F model="whisper-1" \
  -F language="ru"
Параметры  запроса
Запрос  — multipart/form-data .
Параметр Тип Обязательный Описание
file binary да Аудиофайл . Лимит  — 25 МБ
model string да Имя  из  каталога  или  provider/model
language string нет Код  ISO-639-1 (ru , en , …). Если  знаете  язык  — укажите
temperature number нет Сэмплинг  от  0  до  1 . Меньше  — стабильнее
response_format string нет По  умолчанию  json . Также  text
У  whisper-1  дополнительно  работают  форматы  OpenAI: verbose_json , srt , vtt  ( субтитры  и  таймстемпы ). У
gpt-4o-transcribe-diarize  —diarized_json  и  chunking_strategy . Остальные  поля  формы  у  этих  двух  моделей
тоже  уходят  провайдеру  (prompt  и  т . д .).
Формат  ответа
JSON
{
"text": " Привет , это  пример  распознанной  речи  через  AITUNNEL.",
"usage": {
"seconds": 9.2,
"input_tokens": 83,
"output_tokens": 30,
"total_tokens": 113,
"cost_rub": 0.18,
"balance": 1247.32
  }
}
Поле Описание
text Распознанный  текст
usage.seconds Длительность  входного  аудио  в  секундах  ( если  модель  её  отдаёт )
usage.input_tokens  / usage.output_tokens Токены , если  модель  тарифицируется  по  токенам
usage.cost_rub Стоимость  в  рублях
usage.balance Остаток  баланса  после  списания
Если  response_format  не  JSON ( например  text или  srt  у  whisper-1 ), тело  — сырой  текст , аcost_rub  и
balance  приходят  в  заголовках .
Поддерживаемые  форматы  аудио
Конкретный  список  — supported_formats  модели . Общий  набор :
Формат Расширение Когда
WAV .wav Максимальное  качество , без  сжатия
MP3 .mp3 , .mpga Компромисс  качество / размер
FLAC .flac Lossless- сжатие
M4A .m4a , .mp4 Запись  с  iPhone и  macOS
OGG .ogg , .oga Голосовые  сообщения
WebM .webm Запись  из  браузера  (MediaRecorder)
AAC .aac Стриминг  и  мобильные  приложения
Лимит  25 МБ
Максимальный  размер  файла  — 25 МБ. Для  длинных  записей  режьте  на  сегменты  по  5–10 минут  — быстрее  и
меньше  риск  таймаута . Несжатый  WAV заполняет  лимит  раньше , чем  MP3 или  Opus.
Примеры
Распознавание  со  спикер - диаризацией
Python
from openai import OpenAI
client = OpenAI(
    api_key="sk-aitunnel-xxx",
    base_url="https://api.aitunnel.ru/v1/",
)
withopen("meeting.mp3", "rb") as f:
    result = client.audio.transcriptions.create(
        model="gpt-4o-transcribe-diarize",
         le=f,
        response_format="diarized_json",
        chunking_strategy="auto",
        language="ru",
    )
print(result.text)
Бюджетная  массовая  транскрипция
whisper-large-v3-turbo  иqwen3-asr-flash-2026-02-10  — из  самых  дешёвых  в  каталоге :
Python
import glob
import os
from openai import OpenAI
client = OpenAI(
    api_key="sk-aitunnel-xxx",
    base_url="https://api.aitunnel.ru/v1/",
)
for path in glob.glob("recordings/*.mp3"):
withopen(path, "rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-large-v3-turbo",
             le=f,
            language="ru",
        )
    out_path = os.path.splitext(path)[0] + ".txt"
withopen(out_path, "w") as out:
        out.write(result.text)
Запись  из  браузера
MediaRecorder  обычно  отдаёт  webm  — его  можно  слать  как  есть , без  перекодирования :
JavaScript
const formData = new FormData();
formData.append(
" le",
new Blob([webmBuffer], { type: "audio/webm" }),
"recording.webm",
);
formData.append("model", "gpt-4o-mini-transcribe");
formData.append("language", "ru");
const res = await fetch("https://api.aitunnel.ru/v1/audio/transcriptions", {
method: "POST",
headers: { Authorization: "Bearer sk-aitunnel-xxx" },
body: formData,
});
const { text } = await res.json();
Как  выбрать  модель
Сценарий Модель Почему
Общая  транскрипция  файлов gpt-transcribe Высокая  точность
Голосовые  сообщения , диктовка whisper-large-v3-turbo Дешёвая  и  быстрая
Массовая  обработка qwen3-asr-flash-2026-02-10 Низкая  цена  за  секунду
Субтитры  / таймстемпы whisper-1 srt , vtt , verbose_json
Премиум - точность gpt-4o-transcribe На  базе  GPT-4o
Несколько  спикеров gpt-4o-transcribe-diarize Кто  что  сказал
Европейские  языки voxtral-mini-transcribe EN/ES/FR/DE/IT/PT/NL/HI
Много  языков  и  диалектов chirp-3 Google Chirp 3
Цены  смотрите  в  каталоге  — они  меняются .
Лучшие  практики
Устранение  неполадок
Пустая  или  кривая  транскрипция ?
400 про  Content-Type?
413 — файл  слишком  большой ?
Модель  не  найдена ?
Смотрите  также
Предыдущая
Озвучка  текста
Следующая
Вызов  инструментов

---

## Вызов инструментов

Главная/ Документация/ Вызов  инструментов
Вызов  инструментов
Модель  не  вызывает  ваши  функции  сама . Она  предлагает  вызов  (tool_calls),
вы  исполняете  его  у  себя  и  возвращаете  результат  сообщением  с  role: tool.
После  этого  модель  отвечает  человеку .
Работает  в  /chat/completions , /responses  и/messages . Есть  не  у  всех  моделей  — смотрите  страницу  модели .
tools в  каждом  запросе
Массив  tools  нужно  передавать  и  в  первом  вызове , и  когда  отдаёте  результаты . Иначе  схема  на  следующем
шаге  пропадёт .
Три  шага
Шаг  1:
JSON
{
"model": "claude-sonnet-4.6",
"messages": [
    { "role": "user", "content": " Какая  погода  в  Москве ?" }
  ],
"tools": [
    {
"type": "function",
"function": {
"name": "get_weather",
"description": " Текущая  погода  в  городе ",
"parameters": {
"type": "object",
"properties": {
"city": { "type": "string", "description": " Город , например  Москва " }
          },
"required": ["city"]
        }
      }
    }
  ]
}
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "claude-sonnet-4.6",
    "messages": [
      { "role": "user", "content": " Какая  погода  в  Москве ?" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": " Текущая  погода  в  городе ",
          "parameters": {
            "type": "object",
            "properties": {
              "city": { "type": "string", "description": " Город , например  Москва " }
            },
            "required": ["city"]
          }
        }
      }
    ]
  }'
Шаг  3 — тот  же  tools , плюс  история :
JSON
{
"model": "claude-sonnet-4.6",
"messages": [
    { "role": "user", "content": " Какая  погода  в  Москве ?" },
    {
"role": "assistant",
"content": null,
"tool_calls": [
        {
"id": "call_abc123",
"type": "function",
"function": {
"name": "get_weather",
"arguments": "{\"city\": \" Москва \"}"
          }
        }
      ]
    },
    {
"role": "tool",
"tool_call_id": "call_abc123",
"content": "{\"temp\": -3, \"conditions\": \" снег \"}"
    }
  ],
"tools": [
    {
"type": "function",
"function": {
"name": "get_weather",
"description": " Текущая  погода  в  городе ",
"parameters": {
"type": "object",
"properties": {
"city": { "type": "string" }
          },
"required": ["city"]
        }
      }
    }
  ]
}
Не  забудьте  положить  в  messages  ответ  ассистента  сtool_calls  — без  него  модель  не  поймёт , к  чему  относится
результат .
Агентский  цикл
Пока  модель  просит  инструменты  — исполняйте  и  спрашивайте  снова . Ограничьте  число  итераций .
Python
defcall_llm(msgs):
    resp = client.chat.completions.create(
        model="claude-sonnet-4.6",
        tools=tools,
        messages=msgs,
    )
    msgs.append(resp.choices[0].message)
return resp
defrun_tool(tool_call):
    name = tool_call.function.name
    args = json.loads(tool_call.function.arguments)
    result = TOOL_MAPPING[name](**args)
return {
"role": "tool",
"tool_call_id": tool_call.id,
"content": json.dumps(result, ensure_ascii=False),
    }
for _ inrange(10):
    resp = call_llm(messages)
    calls = resp.choices[0].message.tool_calls
ifnot calls:
break
for call in calls:
        messages.append(run_tool(call))
print(messages[-1].content)
tool_choice
Значение Смысл
auto Модель  сама  решает , звать  ли  инструмент  ( по
умолчанию )
none Не  звать
required Обязан  вызвать  хотя  бы  один
{ "type": "function", "function": { "name": "get_weather" } } Конкретная  функция
Параллельные  вызовы
По  умолчанию  модель  может  попросить  несколько  инструментов  сразу . Чтобы  по  одному :
JSON
{ "parallel_tool_calls": false }
Стриминг
С  stream: true  куски  tool_calls  приходят  вdelta.tool_calls . Соберите  их  доfinish_reason: "tool_calls" ,
потом  исполняйте .
Рассуждения  между  вызовами
Reasoning- модели  могут  думать  между  вызовами  инструментов . Это  больше  токенов  и  задержка . Когда  модель
вернула  tool_calls  вместе  с  reasoning_details ,отдайте  reasoning_details обратно  без  правок вместе  с
результатами  инструментов  — иначе  цепочка  мышления  рвётся . Подробнее :токены  рассуждений.
Поиск  в  сети  и  другие  вызовы , которые  исполняет  AITUNNEL, а  не  ваш  код  —серверные  инструменты.
Предыдущая
Распознавание  речи
Следующая
Обзор

---

## Структурированный вывод

Главная/ Документация/ Структурированный  вывод
Структурированный  вывод
response_format с  type: json_schema заставляет  модель  ответить  JSON по
вашей  схеме . Так  проще  парсить  ответ  и  меньше  выдуманных  полей .
Работает  в  /chat/completions  и  /responses . Есть  не  у  всех  моделей  — смотрите  страницу  модели . Если  модель
или  провайдер  схему  не  умеет , запрос  вернёт  ошибку .
Схема
JSON
{
"type": "json_schema",
"json_schema": {
"name": "weather",
"strict": true,
"schema": {
"type": "object",
"properties": {
"city": { "type": "string", "description": " Город " },
"temp_c": { "type": "number", "description": " Температура , °C" },
"conditions": { "type": "string", "description": " Кратко  про  погоду " }
      },
"required": ["city", "temp_c", "conditions"],
"additionalProperties": false
    }
  }
}
content  ответа  — строка  JSON:
JSON
{
"city": " Лондон ",
"temp_c": 18,
"conditions": " Переменная  облачность "
}
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "gpt-5.6-sol",
    "messages": [
      { "role": "user", "content": " Какая  погода  в  Лондоне ? Ответь  по  схеме ." }
    ],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "weather",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "city": { "type": "string", "description": " Город " },
            "temp_c": { "type": "number", "description": " Температура , °C" },
            "conditions": { "type": "string", "description": " Кратко  про  погоду " }
          },
          "required": ["city", "temp_c", "conditions"],
          "additionalProperties": false
        }
      }
    }
  }'
Как  писать  схему
Слабее , чем  схема : { "type": "json_object" }  — « просто  JSON», без  полей .
Стриминг
stream: true  вместе  со  схемой  отдаёт  частичный  JSON. Целый  объект  собирается , когда  стрим  закончился .
Ошибки
Предыдущая
Веб - поиск
Следующая
Токены  рассуждений

---

## Токены рассуждений

Главная/ Документация/ Токены  рассуждений
Токены  рассуждений
У  моделей  с  thinking API может  вернуть  токены  рассуждений  — цепочку
мыслей  до  ответа . Они  считаются  выходными  токенами  и  входят  в
usage.cost_rub.
По  умолчанию , если  модель  их  выдала , они  лежат  вmessage.reasoning  ( и  часто  вreasoning_details ). Часть
моделей  ( серия  OpenAI o) думает , но  текст  мыслей  не  отдаёт .
Работает  в  /chat/completions , /responses  и/messages . То  же  можно  сохранить  впресете. Поле  reasoning  не
входит  в  стандарт  OpenAI: в  Python — extra_body , в  TypeScript — @ts-expect-error .
Не  оба  сразу
Не  задавайте  effort  и  max_tokens одновременно .
Параметр  reasoning
JSON
{
"reasoning": {
"effort": "high",
"max_tokens": 2000,
"exclude": false,
"enabled": true
  }
}
Поле Смысл
effort max , xhigh , high , medium , low , minimal , none
max_tokens Жёсткий  бюджет  мыслей  (Claude, Gemini, часть  Qwen)
exclude Думать , но  не  класть  текст  в  ответ
enabled Включить  со  средним  усилием , если  не  задали  effort/max_tokens
effort: "none"  выключает  рассуждения . У  моделей , где  thinking обязателен , none  отклонят .
Если  модель  понимает  только  effort, max_tokens  переводится  в  ближайший  уровень . Если  только  бюджет  — effort
переводится  в  долю  отmax_tokens  ответа : max/xhigh ≈  95%, high ≈  80%, medium ≈  50%, low ≈  20%, minimal ≈  10%.
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "claude-sonnet-4.6",
    "max_tokens": 8000,
    "reasoning": { "effort": "high" },
    "messages": [
      { "role": "user", "content": " Что  больше : 9.11 или  9.9?" }
    ]
  }'
Бюджет  токенов
Для  Claude и  части  Gemini/Qwen:
JSON
{
"model": "claude-sonnet-4.6",
"max_tokens": 8000,
"reasoning": { "max_tokens": 2000 }
}
У  Claude минимум  бюджета  — 1024, максимум  — 128 000. max_tokens  ответа  должен  бытьстрого  больше бюджета
мыслей , иначе  не  останется  места  на  текст .
Скрыть  цепочку
JSON
{
"reasoning": { "effort": "high", "exclude": true }
}
Модель  всё  равно  тратит  reasoning- токены  ( и  вы  за  них  платите ), вcontent  их  не  будет .
Сохранить  между  ходами
Нужно , когда  модель  вызвала  инструмент  и  ждёт  результат : без  исходных  мыслей  она  не  продолжит  ту  же
цепочку .
Алиас  reasoning_content  = reasoning . Блокиreasoning_details  нельзя  переставлять  и  править .
JSON
{
"role": "assistant",
"content": null,
"tool_calls": [{ "id": "call_abc", "type": "function", "function": { "name": "get_weather", "arguments": "{\"city\": \" Москва \"}" } }],
"reasoning_details": [
    {
"type": "reasoning.text",
"text": " Нужна  погода , затем  посоветую  одежду .",
"format": "anthropic-claude-v1",
"index": 0
    }
  ]
}
См . также  вызов  инструментов.
GPT-5.6
Как  выглядит  ответ
Non-stream: choices[].message.reasoning  иreasoning_details . Stream: то  же  в  delta .
JSON
{
"choices": [
    {
"message": {
"role": "assistant",
"content": "9.9 больше .",
"reasoning": " Сравниваю  9.11 и  9.9 как  десятичные …",
"reasoning_details": [
          {
"type": "reasoning.text",
"text": "9.11 — это  9 + 11/100. 9.9 — это  9 + 9/10.",
"format": "anthropic-claude-v1",
"index": 0
          }
        ]
      }
    }
  ]
}
Типы  в  reasoning_details : reasoning.text , reasoning.summary , reasoning.encrypted . В  стриме  зашифрованное
может  прийти  как  [REDACTED] . Склеивайте  чанки  по  порядку .
В  usage  смотритеcompletion_tokens_details.reasoning_tokens  ( в  Responses —output_tokens_details ).
Claude
Только  объект  reasoning , не  суффикс:thinking  в  имени  модели .
Если  задан  effort , бюджет  ≈max(min(max_tokens * доля, 128000), 1024) . На  новых  Claude по  умолчанию  в  ответ
кладётся  краткое резюме  мыслей : токенов  в  usage  больше , чем  символов  вreasoning .
Gemini 3
effort  мапится  в  thinkingLevel : minimal / low / medium / high. xhigh  →  high . Сколько  токенов  съест  уровень
— решает  Google, точного  бюджета  нет .
reasoning.max_tokens  уходит  какthinkingBudget , но  Gemini 3 всё  равно  свернёт  его  в  уровень . Для  точного
бюджета  это  не  работает .
Устаревшее
include_reasoning: true  = reasoning: {} . include_reasoning: false  =reasoning: { "exclude": true } . Лучше
новый  объект .
Предыдущая
Структурированный  вывод
Следующая
RAG

---

## Лимиты

Главная/ Документация/ Лимиты
Лимиты
У  AITUNNEL нет  лимита  на  число  запросов . Можно  слать  столько , сколько
нужно  — без  RPM и  без  квоты  на  объём .
Запросы
Ограничений  по  частоте  и  количеству  запросов  нет .
Свободное  использование
Нет  лимитов  на  число  запросов , частоту  или  объём  данных  со  стороны  AITUNNEL.
Лимиты  провайдеров
У  OpenAI, Anthropic, Google и  других  провайдеров  свои  потолки . Ответ429 Too Many Requests  — это  их  лимит , не
наш . AITUNNEL такие  запросы  повторяет  сам . При  массовой  отправке  лучше  добавить  небольшую  паузу  между
запросами .
Если  модель  часто  упирается  в  429, задайтезапасные  модели.
Контекст
У  каждой  модели  свой  максимум  токенов  во  входе . Смотритекаталог и  страницу  модели .
Файлы
По  вопросам
Напишите  в  поддержку :support@aitunnel.ru
Предыдущая
Стриминг
Следующая
Параметры

---

## Запасные модели (fallback)

Главная/ Документация/ Запасные  модели  (fallback)
Запасные  модели  (fallback)
Если  основная  модель  не  ответила  — провайдер  лежит , включился  рейт - лимит
или  модель  временно  недоступна  — AITUNNEL сам  повторяет  запрос  в
следующую  модель  из  вашего  списка . Клиент  получает  один  обычный  ответ  и
ничего  не  знает  о  переключении .
Как  включить
Передайте  массив  models  вместо  model  — первая  модель  в  списке  становится  основной , остальные  пробуются
по  очереди , если  она  не  ответит . Отдельное  поле  model  при  этом  не  нужно .
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "models": ["claude-sonnet-4.6", "gpt-5.6-sol", "deepseek-v4-pro"],
    "max_tokens": 2000,
    "messages": [
      { "role": "user", "content": " Скажи  интересный  факт " }
    ]
  }'
Работает  в  /chat/completions , /responses  и/messages .
Официальные  SDK не  знают  про  models
Поле  models  не  входит  в  стандарт  OpenAI, поэтому  SDK его  не  типизируют : в  Python передавайте  через
extra_body , в  TypeScript — с  @ts-expect-error . Заодно  эти  SDK требуютmodel  — там  он  остаётся , но  роли  не
меняет . На  cURL и  любых  « сырых » HTTP- клиентах  ограничений  нет .
Правила  списка
Ставьте  первой  ту  модель , которую  действительно  хотите , а  следом  — более  дешёвую  или  более  стабильную
замену .
Когда  срабатывает  переключение
Переключаемся Не  переключаемся
Модель  не  найдена  или  недоступна Неверный  API- ключ  (401)
Рейт - лимит  провайдера  (429) Модель  запрещена  для  ключа  (403)
Ошибка  провайдера  (5xx) Недостаточно  средств  на  балансе
Обрыв  соединения  с  провайдером Исчерпан  бюджет  ключа
Провайдер  отклонил  запрос  ( модерация ) Запрос  заблокирован  защитой  данных  (PII)
Логика  простая : перебираем  модели  там , где  виновата  модель  или  провайдер . Если  проблема  в  ключе , балансе
или  самом  запросе , другая  модель  её  не  исправит  — возвращаем  ошибку  сразу .
Формат  Anthropic: fallbacks
В  Anthropic- совместимом  /messages  тот  же  механизм  доступен  в  родном  для  Anthropic формате  — массив
fallbacks . Он  принимается  и  в  /chat/completions  с  /responses , так  что  перенос  кода  между  эндпоинтами
ничего  не  ломает .
cURL TypeScript
curl https://api.aitunnel.ru/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "claude-sonnet-4.6",
    "max_tokens": 2000,
    "fallbacks": [
      { "model": "claude-opus-4.8" },
      { "model": "gpt-5.6-sol" }
    ],
    "messages": [
      { "role": "user", "content": " Скажи  интересный  факт " }
    ]
  }'
Списание  и  стриминг
Платите  только  за  успешную  попытку . Неудачные  попытки  не  тарифицируются  и  в  статистику  не  попадают .
В  поле  model  ответа  приходит  та  модель , которая  реально  ответила  — по  ней  же  считается  стоимость  и  строится
статистика  в  панели .
Переключение  только  до  начала  ответа
При  stream: true  запасная  модель  подхватит  запрос , только  если  поток  ещё  не  начался . Если  модель
отвалилась  на  середине  ответа , ошибка  вернётся  клиенту .
Ошибки
Запрос  отклоняется  с  HTTP 400, если :
Если  не  сработала  ни  одна  модель  из  списка , вернётся  ошибка  последней  попытки .
Вместе  с  пресетами
Пресет  и  models /fallbacks  в  одном  запросе  несовместимы : у  пресета  уже  есть  свой  список  моделей  и
параметры , подобранные  под  них . Такой  запрос  отклоняется  с  400 — чтобы  вы  не  думали , что  запасные  модели
работают , пока  на  деле  отрабатывает  список  пресета .
Поэтому  и  в  самом  models  имя  пресета  указывать  нельзя : там  ждут  названия  моделей , и  пресет  будет  выглядеть
как  несуществующая  модель . Если  запасные  модели  нужны  постоянно , заведитепресет и  вызывайте  только  его .
Если  у  ключа  включён  белый  список  моделей , в  нём  должны  быть  все  модели  из  models  — иначе  весь  запрос
отклоняется  с  403. См .API- ключи.
Предыдущая
Список  моделей
Следующая
Выбор  провайдера

---

## Выбор провайдера

Главная/ Документация/ Выбор  провайдера
Выбор  провайдера
Одна  и  та  же  модель  часто  крутится  у  нескольких  провайдеров : цена , скорость
и  задержка  у  них  разные . По  умолчанию  AITUNNEL выбирает  провайдера
автоматически  — по  загруженности . В  запросе  можно  попросить  самый
дешёвый , самый  быстрый  или  с  минимальной  задержкой .
На  странице  модели  это  видно  как  диапазон  цены . В  каталоге  указана  минимальная  ставка ; без  сортировки
запрос  может  уйти  к  более  загруженному  и  более  дорогому  провайдеру .
Как  задать
Объект  provider  в  теле  запроса , поле  sort .
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "claude-sonnet-4.6",
    "provider": { "sort": "price" },
    "messages": [
      { "role": "user", "content": " Скажи  интересный  факт " }
    ]
  }'
Работает  в  /chat/completions , /responses  и/messages . То  же  самое  можно  сохранить  впресете — клиенту  тогда
не  нужно  передавать  provider  в  каждом  запросе .
Официальные  SDK не  знают  про  provider
Поле  provider  не  входит  в  стандарт  OpenAI: в  Python передавайте  через  extra_body , в  TypeScript — с@ts-
expect-error . На  cURL и  любых  « сырых » HTTP- клиентах  ограничений  нет .
Значения  sort
Значение Что  выбираем
price Самый  дешёвый  провайдер
throughput Самый  высокий  throughput ( токенов  в  секунду )
latency Самая  низкая  задержка  до  первого  токена
Пока  sort  не  задан , действует  балансировка  по  загруженности : не  обязательно  самый  дешёвый  и  не  обязательно
самый  быстрый .
Если  задать  sort , балансировка  по  нагрузке  выключается  — провайдеры  пробуются  в  порядке  выбранного
критерия .
Когда  это  нужно
Списание  идёт  по  фактически  выбранному  провайдеру . Именно  поэтому  на  странице  модели  может  быть  « от  —
до ».
Вместе  с  запасными  моделями
provider.sort  выбирает  провайдеравнутри  одной  модели. Массив  models переключает  на  другую  модель, если
текущая  не  ответила . Это  разные  уровни : их  можно  сочетать . См .Запасные  модели.
Предыдущая
Запасные  модели
Следующая
OpenRouter

---

## Кеширование промпта

Главная/ Документация/ Кеширование  промпта
Кеширование  промпта
Повторяющийся  префикс  промпта  можно  не  тарифицировать  по  полной  цене .
У  части  моделей  это  происходит  само . У  Claude и  Qwen кэш  нужно  включить
через  cache_control.
Работает  в  /chat/completions , /responses  и/messages . На  прямых  маршрутах  отдельных  провайдеров
cache_control  игнорируется .
Скидка  на  чтение Поле  cache_discount  вкаталоге: 0.9  = 90% скидки , чтение  стоит  10% от  входной  цены
Запись У  Claude и  Qwen обычно  дороже  обычного  входа . Итог  —usage.cost_rub
Порог Промпт  короче  минимума  модели  не  кэшируется
Когда  само , когда  руками
Как Кто Что  делать
Само OpenAI, DeepSeek, Gemini, Grok, Kimi, GLM Держите  начало  сообщений  стабильным , меняйте  хвост
Руками Claude, Qwen Без  cache_control  кэша  не  будет
Явные  точки  тоже  можно  ставить  на  Gemini ( последняя  точка  в  запросе ) и  на  GPT-5.6+ через
prompt_cache_breakpoint .
Привязка  к  провайдеру
Кэш  живёт  у  конкретного  провайдера . После  запроса  с  кэшем  следующие  запросы  к  той  же  модели  стараются
уйти  туда  же .
По  умолчанию  диалог  определяется  по  хешу  первогоsystem /developer  и  первого  не - системного  сообщения .
Разные  диалоги  могут  уйти  к  разным  провайдерам ; один  и  тот  же  префикс  остаётся  тёплым .
Без  session_id  привязка  включается  после  первого  cache hit. С  session_id  — с  первого  успешного  запроса .
session_id
Явный  ключ  сессии  вместо  хеша  сообщений . Нужен  агентам , у  которых  начало  промпта  меняется , а  провайдер
должен  остаться  тем  же .
JSON
{
"model": "claude-sonnet-4.6",
"session_id": "my-agent-session-abc123",
"messages": [
    { "role": "user", "content": " Продолжим  разговор …" }
  ]
}
Как  проверить
В  каждом  ответе :
JSON
{
"usage": {
"prompt_tokens": 10339,
"completion_tokens": 60,
"total_tokens": 10399,
"prompt_tokens_details": {
"cached_tokens": 10318,
"cache_write_tokens": 0
    },
"cost_rub": 1.24
  }
}
В  Responses API те  же  числа  лежат  вusage.input_tokens_details .
OpenAI
Само , без  настроек . Минимум  промпта  — 1024 токена .
Явные  точки  (GPT 5.6 )
prompt_cache_breakpoint  на  текстовом  блоке  (text  в  Chat Completions, input_text  в  Responses) отмечает  конец
кэшируемого  префикса . prompt_cache_options.mode: "explicit"  отключает  автоматические  точки : кэшируется
только  то , что  пометили . ttl  — например  "30m" . Минимум  TTL кэшированного  префикса  — 30 минут .
Chat Completions:
JSON
{
"model": "gpt-5.6-sol",
"prompt_cache_key": "my-session-key",
"prompt_cache_options": {
"mode": "explicit",
"ttl": "30m"
  },
"messages": [
    {
"role": "user",
"content": [
        {
"type": "text",
"text": "<REUSABLE_PREFIX>",
"prompt_cache_breakpoint": { "mode": "explicit" }
        },
        { "type": "text", "text": "<TASK_SPECIFIC_SUFFIX>" }
      ]
    }
  ]
}
Responses:
JSON
{
"model": "gpt-5.6-sol",
"prompt_cache_key": "my-session-key",
"prompt_cache_options": {
"mode": "explicit",
"ttl": "30m"
  },
"input": [
    {
"role": "user",
"content": [
        {
"type": "input_text",
"text": "<REUSABLE_PREFIX>",
"prompt_cache_breakpoint": { "mode": "explicit" }
        },
        { "type": "input_text", "text": "<TASK_SPECIFIC_SUFFIX>" }
      ]
    }
  ]
}
Маркеры  взаимозаменяемы
Блок  с  Anthropic-style cache_control уходит  на  поддерживающую  GPT как  prompt_cache_breakpoint, и  наоборот
— на  Claude/Gemini как  cache_control на  5 минут . TTL не  переносится : ttl внутриcache_control до  GPT не
доезжает , prompt_cache_options остаётся  только  у  OpenAI.
Grok
Само , без  настроек . Запись  обычно  бесплатна , чтение  — поcache_discount .
Kimi
Само , без  настроек . Запись  обычно  бесплатна , чтение  — поcache_discount .
Qwen
Нужны  явные  точки : cache_control: { "type": "ephemeral" }  на  блоке , тот  же  синтаксис , что  у  Claude. TTL записи
— 5 минут . Snapshot- эндпоинты  часто  не  умеют . Есть  ли  кэш  у  конкретной  модели  — смотритеcache_discount  в
каталоге .
JSON
{
"model": "qwen3-max",
"messages": [
    {
"role": "user",
"content": [
        { "type": "text", "text": " Используй  справочник  ниже ." },
        {
"type": "text",
"text": " БОЛЬШОЙ  ТЕКСТ ",
"cache_control": { "type": "ephemeral" }
        },
        { "type": "text", "text": " Кратко  опиши  реализацию ." }
      ]
    }
  ]
}
Claude
Два  режима :
TTL Как  задать Запись  ( ориентир )
5 минут { "type": "ephemeral" } ~1.25× входа
1 час { "type": "ephemeral", "ttl": "1h" } ~2× входа
Чтение  — по  cache_discount  ( часто  90% скидки , то  есть  ~0.1× входа ). Часовой  TTL дороже  в  записи , но  на  длинной
сессии  не  приходится  переписывать  кэш  каждые  пять  минут .
Пороги  длины . Короче  — кэша  не  будет :
Минимум Модели
4096 токенов Claude Opus 4.5+, Claude Haiku 4.5
2048 токенов Claude Haiku 3.5
1024 токена Claude Sonnet 4 / 4.5 / 4.6, Claude Opus 4 / 4.1
Responses API
Работает  только  верхний  cache_control. Точки  на  блокахinput через  Responses не  ставятся  — для  точечного
кэша  используйте  Chat Completions, Messages или  OpenAI- маркерprompt_cache_breakpoint ( он  уйдёт  на  Claude
какcache_control на  5 минут , без  ttl).
В  Batch запросахcache_control  на  строках  пакета  работает  так  же , но  строки  одного  пакета  могут  идти
параллельно  и  в  любом  порядке : запись  одной  строки  не  обязана  быть  видна  другим . Чтобы  чтение  попало  в  кэш ,
ставьте  "ttl": "1h"  на  общий  префикс  и  переиспользуйте  его  в  следующих  пакетах  ( или  прогрейте  синхронным
запросом ).
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "claude-sonnet-4.6",
    "cache_control": { "type": "ephemeral" },
    "messages": [
      {
        "role": "system",
        "content": " Ты  историк . Ниже  большая  книга : …"
      },
      { "role": "user", "content": " Что  вызвало  крах ?" }
    ]
  }'
Официальные  SDK не  знают  про  cache_control
Поле  cache_control не  входит  в  стандарт  OpenAI: в  Python передавайте  через  extra_body, в  TypeScript — с@ts-
expect-error. На  cURL и  любых  « сырых » HTTP- клиентах  ограничений  нет .
Автоматическое  кэширование  с  TTL 1 час :
JSON
{
"model": "claude-sonnet-4.6",
"cache_control": { "type": "ephemeral", "ttl": "1h" },
"messages": [
    { "role": "system", "content": " Ты  полезный  ассистент ." },
    { "role": "user", "content": " В  чём  смысл  жизни ?" }
  ]
}
Явная  точка  на  system (5 минут ):
JSON
{
"model": "claude-sonnet-4.6",
"messages": [
    {
"role": "system",
"content": [
        {
"type": "text",
"text": " Ты  историк , изучающий  падение  Римской  империи . Ниже  справочник :"
        },
        {
"type": "text",
"text": " БОЛЬШОЙ  ТЕКСТ ",
"cache_control": { "type": "ephemeral" }
        }
      ]
    },
    {
"role": "user",
"content": [{ "type": "text", "text": " Что  вызвало  крах ?" }]
    }
  ]
}
Явная  точка  на  user (1 час ):
JSON
{
"model": "claude-sonnet-4.6",
"messages": [
    {
"role": "user",
"content": [
        { "type": "text", "text": " Учитывая  книгу  ниже :" },
        {
"type": "text",
"text": " БОЛЬШОЙ  ТЕКСТ ",
"cache_control": { "type": "ephemeral", "ttl": "1h" }
        },
        { "type": "text", "text": " Перечисли  персонажей ." }
      ]
    }
  ]
}
DeepSeek
Само , без  настроек . Запись  обычно  по  цене  обычного  входа , чтение  — поcache_discount .
GLM
Само , без  настроек . Чтение  — по  cache_discount . session_id  помогает  держаться  одного  кэша  в  длинном
диалоге .
Gemini
Неявный  кэш  ( как  у  OpenAI) — без  cache_control . TTL в  среднем  3–5 минут . Минимум  длины  обычно  1024–4096
токенов , зависит  от  модели . Начало  массива  сообщений  держите  стабильным , вариации  — в  хвосте .
Стабильный  префикс
Для  неявного  кэша  не  двигайте  начало  messages. Вопросы  и  динамический  контекст  — ближе  к  концу .
Явный  кэш  — cache_control  на  блоке , как  у  Claude. Создавать  и  удалять  кэш  руками , давать  ему  имя  и  TTL не
нужно : учитывается  последняя точка  в  запросе . Несколько  точек  безопасны  ( совместимость  с  Claude), для  Gemini
лишние  игнорируются .
systemInstruction неизменяем
У  Gemini одно  поле  systemInstruction. cache_control в  первом  system/developer кэширует
нормализованный  системный  промпт  целиком  и  не  оставляет  динамический  хвост  внутри  того  же  сообщения .
Динамику  кладите  в  следующее  user- сообщение .
System:
JSON
{
"model": "gemini-3.7- ash",
"messages": [
    {
"role": "system",
"content": [
        {
"type": "text",
"text": " Ты  историк . Ниже  справочная  книга :"
        },
        {
"type": "text",
"text": " БОЛЬШОЙ  ТЕКСТ ",
"cache_control": { "type": "ephemeral" }
        }
      ]
    },
    {
"role": "user",
"content": [{ "type": "text", "text": " Что  вызвало  крах ?" }]
    }
  ]
}
User:
JSON
{
"model": "gemini-3.7- ash",
"messages": [
    {
"role": "user",
"content": [
        { "type": "text", "text": " По  тексту  книги  ниже :" },
        {
"type": "text",
"text": " БОЛЬШОЙ  ТЕКСТ ",
"cache_control": { "type": "ephemeral" }
        },
        { "type": "text", "text": " Перечисли  главных  персонажей ." }
      ]
    }
  ]
}
Предыдущая
Уровни  обслуживания
Следующая
Справочник  API

---

## Защита данных (PII)

Главная/ Документация/ Защита  данных  (PII)
Защита  данных  (PII)
AITUNNEL сам  находит  персональные  данные  в  запросах  и  либо  подменяет  их
синтетикой  перед  отправкой  в  модель , либо  блокирует  запрос . В  коде
приложения  ничего  менять  не  нужно  — настройка  живёт  на  API- ключе .
Зачем
Модель  — внешний  сервис . Если  в  промпт  попали  реальные  персональные  данные , они  уходят  провайдеру . На
шлюзе  это  можно  отсечь : модель  не  видит  оригиналы , риски  по  152- ФЗ  ниже .
Текущие  настройки  ключа  — вGET /aitunnel/key , объект  pii .
Режимы
Маскировка — основной  режим . Найденные  значения  заменяются  синтетикой  того  же  формата : ИНН  с
контрольной  суммой , карта  с  алгоритмом  Луна . Запрос  уходит  в  модель  уже  подменённым . В  ответе  AITUNNEL
ставит  оригиналы  обратно . Клиент  видит  свои  данные , модель  — нет .
Блокировка — если  что - то  нашлось , запрос  до  модели  не  доходит . Клиент  получает  HTTP 400. Так  удобно  ловить
ошибки  в  сервисах , где  персональных  данных  в  промптах  быть  не  должно .
Маскировка
Модель  работает  с  синтетикой . Вам  возвращают  оригинал .
Вы
→ Перезвоните  +7 (900) 123-45-67
← Набираю  +7 (900) 123-45-67
AITUNNEL
+7 (900) 123-45-67 →
+7 (912) 458-33-01
в  ответе  оригинал  на  место
Модель
← Перезвоните
+7 (912) 458-33-01
→ Набираю  +7 (912) 458-33-01
Блокировка
Нашли  персональные  данные  — запрос  до  модели  не  доходит .
Вы
→ Паспорт  4509 123456
HTTP 400 · pii_blocked
AITUNNEL
стоп
модель  ничего  не  получает
JSON
{
"error": {
"message": "Request blocked: PII detected — passport, phone",
"type": "pii_blocked",
"code": "pii_blocked",
"param": null
  }
}
Какие  данные  ищутся
Тип Примеры
Email user@example.com
Телефон +7 (900) 123-45-67
Паспорт  РФ  / загран 4509 123456
СНИЛС 112-233-445 95
ИНН 10 или  12 цифр
ОГРН  / ОГРНИП 13 / 15 цифр
Банковская  карта алгоритм  Луна
JWT / API- ключ eyJ… , sk-… , ghp_…
Адрес ул . Ленина , д . 5
ФИО Иванов  Иван  Иванович , Иванов  И . И .
Одиночное  имя  без  отчества  (« Иван  Петров ») намеренно  не  считается  ФИО  — меньше  ложных  срабатываний .
Такие  случаи  можно  добавить  в  свой  словарь .
Как  включить
Свой  словарь
Для  значений , которые  стандартные  детекторы  не  ловят : внутренние  коды  клиентов , кодовые  имена . До  50 пар
« слово  →  замена ». Пустая  замена  — слово  просто  вырезается . Словарь  работает  вместе  с  выбранными  типами ; в
режиме  маскировки  замены  тоже  восстанавливаются  в  ответе .
Заголовки  ответа
Если  маскировка  сработала , в  ответе  будут  заголовки :
Заголовок Значение
X-AITunnel-Masked true
X-AITunnel-Masked-Types inn,phone,passport
Если  ничего  не  нашли  — заголовков  нет . Стриминг stream: true  поддерживается .
Ограничения
Что  не  покрыто
Иностранные  имена  и  зарубежные  документы  — детекторы  заточены  под  российские  форматы . Данные  в
картинках , аудио  и  PDF не  обрабатываются , только  текст  сообщений . Маппинг  « синтетика  →  оригинал » живёт
только  на  время  одного  запроса  и  сразу  уничтожается .
Предыдущая
OpenRouter
Следующая
Пресеты

---

## Пресеты

Главная/ Документация/ Пресеты
Пресеты
Пресет  — именованный  набор : модели , системный  промпт  и  параметры . В  API
вы  указываете  имя  пресета  в  поле  model, как  будто  это  обычная  модель .
AITUNNEL подставляет  настройки  до  отправки  запроса .
Как  вызвать
Имя  пресета  ставите  в  model . Код  клиента  не  меняется .
cURL Python JavaScript Go PHP
curl https://api.aitunnel.ru/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "support-bot",
    "messages": [
      { "role": "user", "content": " Как  вернуть  заказ ?" }
    ]
  }'
Работает  в  /chat/completions , /responses  и/messages .
Как  создать
На  аккаунт  — не  больше  50 пресетов .
Имя
Латиница , цифры , точка , дефис  и  подчёркивание . Без  пробелов  и  слешей . До  64 символов . Примеры : support-bot ,
cheap_coder , gpt5.fast .
Не  пересекайтесь  с  каталогом
Если  имя  совпадёт  с  моделью  из  каталога  — deepseek-v4-pro , auto  и  т . д . — запрос  уйдёт  в  эту  модель , а  не  в
пресет .
Модели  и  запасной  вариант
В  пресете  от  1 до  5 моделей , по  порядку . Первая  обрабатывает  запрос . Если  она  недоступна , AITUNNEL пробует
следующую .
Имеет  смысл  ставить  основную  модель  первой , а  дешевле  или  стабильнее  — следом .
Что  можно  сохранить
Пустое  поле  в  пресете  не  трогает  запрос . Заполненное  применяется  по  правилу  переопределения .
Параметр Зачем
Системный  промпт Роль  и  инструкции
temperature  / top_p Случайность  ответа  ( обычно  одно  из  двух )
frequency_penalty  / presence_penalty Повтор  токенов
top_k Ограничение  выбора  токенов
max_tokens Потолок  ответа
seed Повторяемость
verbosity Краткость  ответа  ( где  модель  это  умеет )
Рассуждения Включить , effort, лимит  токенов , скрыть  цепочку . См .токены  рассуждений
Веб - поиск Вставить  aitunnel:web_search . См .веб - поиск
Кеш  промпта cache_control : 5 минут  или  1 час . См .кеширование  промпта
Выбор  провайдера provider.sort : цена , throughput или  задержка . См .выбор  провайдера
Переопределение
В  панели  это  чекбокс  « Перезаписывать  параметры  клиента ». По  умолчанию  он  включён : значения  пресета
важнее, чем  то , что  пришло  в  запросе  — клиент  не  перебьёт  temperature или  системный  промпт .
Если  выключить , пресет  заполняет  только  пустые  поля  — клиент  может  задать  своё .
Модель  из  пресета  подставляется  всегда : в  запрос  уходит  первая  модель  из  списка . В  ответе  API в  поле  model
будет  уже  настоящее  имя  модели , не  имя  пресета .
API- ключи
Имя  пресета  можно  указать  в  белом  списке  моделей  ключа . Тогда  ключ  вызовет  только  этот  пресет  ( и  другие
имена  из  списка ), а  произвольную  модель  — нет . См .API- ключи.
Предыдущая
Защита  данных  (PII)
Следующая
Batch запросы

---

## Модерация

Главная/ Документация/ Модерация
Модерация
Классифицирует  текст  и  картинки  по  категориям  политики : ненависть ,
насилие , сексуальный  контент  и  другие . Формат  как  у  OpenAI Moderations.
POST https://api.aitunnel.ru/v1/moderations . Стриминга  нет .
Бесплатно
Модерация  не  списывает  баланс .
Это  не  защита  PII. PII маскирует  паспорта  и  телефоны  на  шлюзе . Модерация  отвечает , нарушает  ли  контент
правила .
Запрос
Обязательно  input : строка , массив  строк  или  мультимодальный  массив . model  можно  не  указывать  — будет
omni-moderation-latest .
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/moderations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "input": " Текст  для  проверки "
  }'
Несколько  текстов  — один  запрос , в  results  по  объекту  на  каждый :
Python JavaScript
result = client.moderations.create(
input=[" Первый  текст ", " Второй  текст ", " Третий  текст "],
)
for item in result.results:
print(item. agged, item.categories)
Ответ
flagged: true , если  сработала  хотя  бы  одна  категория .
TypeScript
type ModerationResponse = {
id: string;
  model: string;
  results: ModerationResult[];
};
type ModerationResult = {
 agged: boolean;
  categories: {
hate: boolean;
"hate/threatening": boolean;
    harassment: boolean;
"harassment/threatening": boolean;
"self-harm": boolean;
"self-harm/intent": boolean;
"self-harm/instructions": boolean;
    illicit: boolean;
"illicit/violent": boolean;
    sexual: boolean;
"sexual/minors": boolean;
    violence: boolean;
"violence/graphic": boolean;
  };
  category_scores: { [category: string]: number };
// Только  omni-moderation-latest: text / image по  каждой  категории
  category_applied_input_types?: {
    [category: string]: ("text" | "image")[];
  };
};
Пример :
JSON
{
"id": "modr-xxxxxxxxxxxx",
"model": "omni-moderation-latest",
"results": [
    {
" agged": false,
"categories": {
"hate": false,
"harassment": false,
"self-harm": false,
"sexual": false,
"violence": false
      },
"category_scores": {
"hate": 0.000012,
"harassment": 0.000045,
"self-harm": 0.000003,
"sexual": 0.000021,
"violence": 0.000015
      }
    }
  ]
}
Картинки
omni-moderation-latest  принимает  изображения  вместе  с  текстом . input  — массив  объектов  text  / image_url
(URL или  data:…;base64 ). В  ответеcategory_applied_input_types  показывает , что  сработало : текст  или  картинка .
cURL Python JavaScript
curl https://api.aitunnel.ru/v1/moderations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "omni-moderation-latest",
    "input": [
      { "type": "text", "text": " Текст  для  проверки " },
      { "type": "image_url", "image_url": { "url": "https://example.com/image.png" } }
    ]
  }'
Модель
Список  без  ключа :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/moderations
Обычно  хватает  omni-moderation-latest  — её  можно  не  указывать .
Предыдущая
Эмбеддинги
Следующая
Ранжирование

---

## Эмбеддинги

Главная/ Документация/ Эмбеддинги
Эмбеддинги
Эмбеддинг  — вектор , в  который  модель  сворачивает  текст  ( и  иногда
картинку ). Похожие  по  смыслу  фрагменты  оказываются  рядом : « кот » ближе  к
« котёнок », чем  к  « самолёт ».
POST https://api.aitunnel.ru/v1/embeddings  — OpenAI- совместимый  эндпоинт . Стриминга  нет : ответ  приходит
целиком .
Зачем
Запрос
Нужны  model  и  input  — строка  или  массив  строк .
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "text-embedding-3-small",
    "input": " Искусственный  интеллект  изменяет  мир  технологий "
  }'
Несколько  текстов  — один  запрос , дешевле  и  быстрее , чем  по  одному :
cURL Python JavaScript PHP
curl https://api.aitunnel.ru/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "text-embedding-3-small",
    "input": [
      " Машинное  обучение  — раздел  искусственного  интеллекта ",
      " Глубокое  обучение  использует  многослойные  нейросети ",
      "NLP позволяет  компьютерам  понимать  текст "
    ]
  }'
Поле Тип Смысл
encoding_format float  или  base64 Как  отдать  вектор . По  умолчанию  float
dimensions integer Укоротить  вектор , если  модель  умеет  ( например  text-embedding-3)
Ответ
JSON
{
"object": "list",
"data": [
    {
"object": "embedding",
"index": 0,
"embedding": [0.0023064255, -0.009327292]
    }
  ],
"model": "text-embedding-3-small",
"usage": {
"prompt_tokens": 12,
"total_tokens": 12,
"cost_rub": 0.01,
"balance": 950.5
  }
}
В  usage  — токены , cost_rub  иbalance  после  списания . Списывается  фактический  объём  входа , не  максимум
модели .
Картинки
У  части  моделей  во  входе  есть  image  — смотритеmodalities.input  вкаталоге. Тогда  input  — массив  объектов
с  content : text  иimage_url . URL или  data:…;base64 . Это  вектор  для  поиска , не  описание  картинки . Описание ,
OCR и  генерация  —картинки.
Пример  на  voyage-multimodal-3.5  ( текст  + картинка  в  одном  векторе ):
cURL Python JavaScript
curl https://api.aitunnel.ru/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-aitunnel-xxx" \
  -d '{
    "model": "voyage-multimodal-3.5",
    "input": [
      {
        "content": [
          {"type": "text", "text": " Деревянный  настил  через  зелёный  луг "},
          {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madiso
        ]
      }
    ]
  }'
Batch запросы
В  Batch запросах картинки  не  принимаются  — только  строки . Мультимодальный  вход  — синхронный
/embeddings .
Какие  модели
Актуальный  список  — группа  embeddings  вкаталоге и  в  публичном  API без  ключа :
cURL
curl https://api.aitunnel.ru/public/aitunnel/models/embeddings
Имена  для  поля  model : text-embedding-3-small , voyage-4 , qwen3-embedding-8b , gigachat-embeddings-2  и  другие .
Слаг provider/model  уходит  вOpenRouter.
Семантический  поиск
Python
import numpy as np
docs = [
"Python — язык  программирования ",
" Москва  — столица  России ",
" Нейросети  обучаются  на  данных ",
]
doc_res = client.embeddings.create(model="text-embedding-3-small", input=docs)
query_res = client.embeddings.create(
    model="text-embedding-3-small",
input=" Какой  язык  используется  для  ИИ ?",
)
query = query_res.data[0].embedding
defcosine(a, b):
    a, b = np.array(a), np.array(b)
return oat(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))
for doc, item inzip(docs, doc_res.data):
print(f"{cosine(query, item.embedding):.4f}{doc}")
Сравнивайте  косинусом , не  евклидовым  расстоянием : для  длинных  векторов  так  устойчивее .
Практика
402 на  эмбеддингах
До  запроса  прогноз  считается  по  максимуму  контекста  модели . Если  баланс  маленький  — это  не  фактическая
цена .FAQ.
Ограничения
Ошибки  — те  же  коды , что  у  остального  API:ошибки  и  отладка.
Предыдущая
Ошибки  и  отладка
Следующая
Модерация