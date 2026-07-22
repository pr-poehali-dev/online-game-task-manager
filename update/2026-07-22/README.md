# Обновление: инструкция по патчам + адаптивная вёрстка

Два независимых улучшения интерфейса, выполненные сегодня.

---

## 1. Инструкция в разделе «Патчи»

Добавлен раскрывающийся блок-подсказка «Как работать с патчами» сразу
под заголовком раздела. По умолчанию свёрнут, чтобы не занимать место —
раскрывается по клику. Внутри:

- **Как залить патч для задачи** — пошаговая инструкция: выбрать
  сервер → выбрать задачу в списке → перетащить файл или папку на
  нужную корневую папку в дереве. Загруженные файлы сразу привязываются
  к выбранной задаче.
- **Привязка уже загруженных файлов к задаче** — как прикрепить/открепить
  ранее загруженный файл к задаче через иконку скрепки, которая
  появляется при наведении на файл в дереве (если сверху выбрана задача).
- **Скачивание** — как скачать отдельный файл или архивом все файлы
  конкретной задачи.

### Файл
```
src/pages/index/Patches.tsx
```
(входит также в список файлов раздела 2 ниже — копируется один раз)

---

## 2. Адаптивная вёрстка под широкие экраны

Раньше почти все разделы (база знаний, идеи, спринты, архив, FAQ,
кабинет, админка, окно задачи и т.д.) были искусственно ограничены по
ширине (768–896px), из-за чего на широких мониторах контент занимал
меньше половины экрана, а карточки статей базы знаний укладывались
только по 2 в ряд.

### Что изменилось
- **Карточки теперь адаптивно умножаются в ряд** (было максимум 2):
  - база знаний (список статей) — до 4 карточек в ряд на широких экранах;
  - «К рестарту» (карточки задач по серверам) — тоже до 4 в ряд.
- **Расширены узкие текстовые разделы** — статья базы знаний и её
  редактор, идеи (список/создание/просмотр), спринты, архив, патчноуты,
  патчи, FAQ, личный кабинет, админка, окно просмотра/создания задачи.
  Разделы с таблицами и картинками (статьи, идеи, описания задач)
  расширены сильнее всего, чтобы контент не сжимался.
- Мобильная и планшетная адаптивность не затронута — на маленьких
  экранах всё по-прежнему выстраивается в 1–2 колонки, расширение
  работает только на больших мониторах.

### Файлы для переноса
```
src/components/Faq.tsx
src/components/knowledge-base/ArticleEditor.tsx
src/components/knowledge-base/ArticleList.tsx
src/components/knowledge-base/ArticleView.tsx
src/pages/Admin.tsx
src/pages/Cabinet.tsx
src/pages/index/Archive.tsx
src/pages/index/Patches.tsx
src/pages/index/Patchnotes.tsx
src/pages/index/Restart.tsx
src/pages/index/Sprints.tsx
src/pages/index/ideas/IdeaDetail.tsx
src/pages/index/ideas/IdeasList.tsx
src/pages/index/shared.tsx
```

---

## Как перенести

```bash
cd /var/www/era   # корень вашего проекта на сервере

cp update/2026-07-22/src/components/Faq.tsx src/components/Faq.tsx
cp update/2026-07-22/src/components/knowledge-base/ArticleEditor.tsx src/components/knowledge-base/ArticleEditor.tsx
cp update/2026-07-22/src/components/knowledge-base/ArticleList.tsx src/components/knowledge-base/ArticleList.tsx
cp update/2026-07-22/src/components/knowledge-base/ArticleView.tsx src/components/knowledge-base/ArticleView.tsx
cp update/2026-07-22/src/pages/Admin.tsx src/pages/Admin.tsx
cp update/2026-07-22/src/pages/Cabinet.tsx src/pages/Cabinet.tsx
cp update/2026-07-22/src/pages/index/Archive.tsx src/pages/index/Archive.tsx
cp update/2026-07-22/src/pages/index/Patches.tsx src/pages/index/Patches.tsx
cp update/2026-07-22/src/pages/index/Patchnotes.tsx src/pages/index/Patchnotes.tsx
cp update/2026-07-22/src/pages/index/Restart.tsx src/pages/index/Restart.tsx
cp update/2026-07-22/src/pages/index/Sprints.tsx src/pages/index/Sprints.tsx
cp update/2026-07-22/src/pages/index/ideas/IdeaDetail.tsx src/pages/index/ideas/IdeaDetail.tsx
cp update/2026-07-22/src/pages/index/ideas/IdeasList.tsx src/pages/index/ideas/IdeasList.tsx
cp update/2026-07-22/src/pages/index/shared.tsx src/pages/index/shared.tsx

npm install
npm run build
```
Backend не менялся — перезапускать `era-backend` не требуется.

## Проверка после переноса
- Откройте раздел «Патчи» — под описанием должен появиться свёрнутый
  блок «Как работать с патчами» с иконкой информации; разверните его и
  проверьте инструкцию по загрузке/привязке/скачиванию файлов.
- Откройте базу знаний на широком экране (1280px+) — карточки статей
  должны выстраиваться в 3–4 колонки, а не в 2.
- Откройте «К рестарту» — карточки задач тоже должны занимать больше
  колонок на широком экране.
- Откройте любую статью базы знаний, идею или задачу с таблицей внутри
  описания — контент должен занимать заметно больше горизонтального
  места, чем раньше.
