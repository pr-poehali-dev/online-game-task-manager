export const PATCH_ROOTS = [
  'animations', 'data', 'l2text', 'maps', 'staticmeshes',
  'System', 'System_eng', 'systextures', 'textures',
];

export interface PatchFile {
  id: number;
  path: string;
  size: number;
  url: string;
  updatedAt: string | null;
  taskIds: string[];
}

export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: Map<string, TreeNode>;
  file?: PatchFile;
}

export function fmtSize(bytes: number) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function buildTree(files: PatchFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isFile: false, children: new Map() };
  for (const rootName of PATCH_ROOTS) {
    root.children.set(rootName, { name: rootName, path: rootName, isFile: false, children: new Map() });
  }
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path, isFile: isLast, children: new Map() };
        node.children.set(part, child);
      }
      if (isLast) child.file = f;
      node = child;
    }
  }
  return root;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

export interface DroppedFile {
  path: string;
  file: File;
}

function readEntry(entry: FileSystemEntry, prefix: string, out: DroppedFile[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file((file) => {
        out.push({ path: `${prefix}${entry.name}`, file });
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const entries: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries(async (batch) => {
          if (batch.length === 0) {
            await Promise.all(entries.map((e) => readEntry(e, `${prefix}${entry.name}/`, out)));
            resolve();
            return;
          }
          entries.push(...batch);
          readBatch();
        }, () => resolve());
      };
      readBatch();
    } else {
      resolve();
    }
  });
}

export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length > 0) {
    await Promise.all(entries.map((e) => readEntry(e, '', out)));
    return out;
  }
  // Фолбэк для браузеров без Entries API — берём файлы плоско
  Array.from(dataTransfer.files || []).forEach((file) => {
    out.push({ path: file.name, file });
  });
  return out;
}
