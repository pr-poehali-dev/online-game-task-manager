import { useState } from 'react';
import Icon from '@/components/ui/icon';

export default function PatchesHelp() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
      <button
        onClick={() => setShowHelp((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
      >
        <Icon name="ChevronRight" size={16} className={`text-muted-foreground shrink-0 transition-transform ${showHelp ? 'rotate-90' : ''}`} />
        <Icon name="Info" size={15} className="text-primary shrink-0" />
        <span className="text-sm font-medium flex-1">Как работать с патчами</span>
      </button>
      {showHelp && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60 text-sm text-muted-foreground space-y-3">
          <div>
            <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
              <Icon name="Upload" size={13} /> Как залить патч для задачи
            </p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Вверху выберите нужный сервер (C4x1, HFx3 old, HF new) — у каждого своё дерево файлов.</li>
              <li>В выпадающем списке «Без выбранной задачи» выберите задачу, к которой относится патч.</li>
              <li>Перетащите файл или целую папку прямо на нужную папку в дереве ниже — можно как на корневую (например «System» или «data»), так и на любую вложенную папку внутри неё. Структура вложенных папок сохранится автоматически, а все загруженные файлы сразу привяжутся к выбранной задаче.</li>
            </ol>
            <p className="mt-1.5">
              Загружать и удалять файлы могут только администраторы и участники с правом полного
              редактирования задач.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
              <Icon name="Paperclip" size={13} /> Привязка уже загруженных файлов к задаче
            </p>
            <p>
              Если файл уже был загружен без выбранной задачи (или относится ещё к одной): выберите
              задачу в списке сверху, наведите курсор на нужный файл в дереве и нажмите появившуюся
              иконку скрепки — она прикрепит или открепит файл от выбранной задачи. Один файл может
              относиться сразу к нескольким задачам.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
              <Icon name="Download" size={13} /> Скачивание
            </p>
            <p>
              Отдельный файл скачивается иконкой скачивания рядом с ним. Если выбрана задача —
              кнопка «Скачать файлы задачи» соберёт архив (zip) сразу из всех файлов, привязанных
              к этой задаче. Кнопка «Скачать всё» рядом с названием сервера собирает архив
              вообще из всего дерева файлов этого сервера.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
              <Icon name="CheckSquare" size={13} /> Массовое удаление
            </p>
            <p>
              Кнопка «Выбрать файлы» рядом со «Скачать всё» включает режим с чекбоксами у каждого
              файла — отметьте нужные и нажмите «Удалить выбранное», чтобы удалить их разом.
              Доступно тем, у кого есть право удаления файлов патчей.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
              <Icon name="FolderPlus" size={13} /> Свои папки
            </p>
            <p>
              Кроме стандартных корневых папок (animations, data, l2text, maps, staticmeshes,
              System, System_eng, systextures, textures) можно создать свою — кнопкой «+» справа
              от названия сервера. Наведите курсор на любую корневую папку и нажмите иконку
              карандаша, чтобы задать ей своё отображаемое название — меняется только вид в
              дереве, реальный путь к файлам остаётся прежним. Удалить пользовательскую папку
              можно только когда она пустая.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
              <Icon name="FileText" size={13} /> Редактирование .dat-файлов
            </p>
            <p>
              Рядом с текстовыми .dat-файлами клиента (названия и описания предметов, скиллов,
              нпс и т.д.) появляется иконка редактирования — открывает поиск, просмотр и правку
              записей файла прямо в браузере, без стороннего софта. Изменять записи могут
              администраторы и участники с правом полного редактирования задач.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1 flex items-center gap-1.5">
              <Icon name="UploadCloud" size={13} /> Заливка в лаунчер
            </p>
            <p>
              Если для сервера настроены пути лаунчера («Управление проектом → Серверы» и
              «Служебные ключи»), у каждого файла появляются круглые кнопки «Б» (быстрое
              обновление) и «П» (полное обновление) — заливают файл на сервер лаунчера. Цвет
              кнопки показывает статус: серый — не заливался, оранжевый — залита актуальная версия,
              жёлтый — версия на хостинге устарела. Кнопка «Сверить с лаунчером» над деревом
              читает реальный XML-реестр на хостинге и обновляет статусы под факт — полезно, если
              файлы заливали в обход приложения (например вручную по FTP).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}