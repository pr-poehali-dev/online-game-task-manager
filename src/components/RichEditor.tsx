import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Underline } from '@tiptap/extension-underline';
import { useState, useRef } from 'react';
import Icon from '@/components/ui/icon';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onImageUpload?: (file: File) => Promise<string>;
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-7 w-7 flex items-center justify-center rounded-md text-sm transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;
}

export default function RichEditor({ content, onChange, placeholder, onImageUpload }: Props) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [imgDialogOpen, setImgDialogOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: placeholder ?? 'Опишите задачу подробнее...' }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Image.configure({ inline: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  function insertLink() {
    if (!linkUrl) return;
    const label = linkText || linkUrl;
    const hasSelection = !editor!.state.selection.empty;
    if (hasSelection) {
      editor!.chain().focus().setLink({ href: linkUrl }).run();
    } else {
      editor!.chain().focus().insertContent(`<a href="${linkUrl}">${label}</a>`).run();
    }
    setLinkUrl('');
    setLinkText('');
    setLinkDialogOpen(false);
  }

  function insertImage() {
    if (!imgUrl) return;
    editor!.chain().focus().setImage({ src: imgUrl }).run();
    setImgUrl('');
    setImgDialogOpen(false);
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImageUpload) return;
    setUploading(true);
    try {
      const url = await onImageUpload(file);
      if (url) editor!.chain().focus().setImage({ src: url }).run();
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  }

  function insertTable() {
    editor!.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-secondary/60 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="rounded-xl border border-border bg-secondary/20 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-card/60">
        <ToolBtn title="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong className="text-xs font-bold">B</strong>
        </ToolBtn>
        <ToolBtn title="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em className="text-xs">I</em>
        </ToolBtn>
        <ToolBtn title="Подчёркивание" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <span className="text-xs underline">U</span>
        </ToolBtn>
        <ToolBtn title="Зачёркивание" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <span className="text-xs line-through">S</span>
        </ToolBtn>

        <Divider />

        <ToolBtn title="Заголовок H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <span className="text-xs font-semibold">H2</span>
        </ToolBtn>
        <ToolBtn title="Заголовок H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <span className="text-xs font-semibold">H3</span>
        </ToolBtn>

        <Divider />

        <ToolBtn title="Маркированный список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <Icon name="List" size={14} />
        </ToolBtn>
        <ToolBtn title="Нумерованный список" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <Icon name="ListOrdered" size={14} />
        </ToolBtn>
        <ToolBtn title="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Icon name="Quote" size={14} />
        </ToolBtn>
        <ToolBtn title="Код" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Icon name="Code" size={14} />
        </ToolBtn>

        <Divider />

        <ToolBtn title="Ссылка" active={editor.isActive('link')} onClick={() => { setLinkUrl(editor.getAttributes('link').href || ''); setLinkDialogOpen(true); }}>
          <Icon name="Link" size={14} />
        </ToolBtn>
        <ToolBtn title="Изображение по ссылке" active={false} onClick={() => setImgDialogOpen(true)}>
          <Icon name="Image" size={14} />
        </ToolBtn>
        {onImageUpload && (
          <ToolBtn title="Загрузить изображение" active={false} onClick={() => fileInputRef.current?.click()}>
            <Icon name={uploading ? 'Loader2' : 'ImagePlus'} size={14} />
          </ToolBtn>
        )}
        <ToolBtn title="Таблица" active={false} onClick={insertTable}>
          <Icon name="Table" size={14} />
        </ToolBtn>

        {editor.isActive('table') && (
          <>
            <Divider />
            <ToolBtn title="Добавить строку ниже" active={false} onClick={() => editor.chain().focus().addRowAfter().run()}>
              <Icon name="PlusSquare" size={13} />
            </ToolBtn>
            <ToolBtn title="Добавить колонку справа" active={false} onClick={() => editor.chain().focus().addColumnAfter().run()}>
              <Icon name="Columns" size={13} />
            </ToolBtn>
            <ToolBtn title="Удалить строку" active={false} onClick={() => editor.chain().focus().deleteRow().run()}>
              <Icon name="Minus" size={13} />
            </ToolBtn>
            <ToolBtn title="Удалить таблицу" active={false} onClick={() => editor.chain().focus().deleteTable().run()}>
              <Icon name="Trash2" size={13} />
            </ToolBtn>
          </>
        )}

        <div className="ml-auto flex gap-0.5">
          <ToolBtn title="Отменить" active={false} onClick={() => editor.chain().focus().undo().run()}>
            <Icon name="Undo2" size={13} />
          </ToolBtn>
          <ToolBtn title="Повторить" active={false} onClick={() => editor.chain().focus().redo().run()}>
            <Icon name="Redo2" size={13} />
          </ToolBtn>
        </div>
      </div>

      {/* Editor area */}
      <div className="tiptap-editor max-h-72 overflow-y-auto scrollbar-thin">
        <EditorContent editor={editor} />
      </div>

      {/* Link dialog */}
      {linkDialogOpen && (
        <div className="border-t border-border px-3 py-3 bg-card/80 flex flex-col gap-2 animate-fade-in">
          <div className="text-xs text-muted-foreground font-medium mb-0.5 flex items-center gap-1.5">
            <Icon name="Link" size={12} />
            Вставить ссылку
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && insertLink()}
              placeholder="https://... или #тикет-1234"
              className={inputCls + ' flex-1'}
            />
            <input
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && insertLink()}
              placeholder="Текст ссылки (необязательно)"
              className={inputCls + ' flex-1'}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { if (editor.isActive('link')) editor.chain().focus().unsetLink().run(); setLinkDialogOpen(false); }} className="text-xs text-muted-foreground hover:text-foreground">
              {editor.isActive('link') ? 'Удалить ссылку' : 'Отмена'}
            </button>
            <button onClick={insertLink} className="ml-auto text-xs font-medium text-primary hover:opacity-80 transition-opacity">
              Вставить
            </button>
          </div>
        </div>
      )}

      {/* Image dialog */}
      {imgDialogOpen && (
        <div className="border-t border-border px-3 py-3 bg-card/80 flex flex-col gap-2 animate-fade-in">
          <div className="text-xs text-muted-foreground font-medium mb-0.5 flex items-center gap-1.5">
            <Icon name="Image" size={12} />
            Вставить изображение по URL
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              value={imgUrl}
              onChange={(e) => setImgUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && insertImage()}
              placeholder="https://example.com/image.png"
              className={inputCls + ' flex-1'}
            />
            <button onClick={insertImage} className="px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              Вставить
            </button>
            <button onClick={() => setImgDialogOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-2">
              Отмена
            </button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePicked} />
    </div>
  );
}