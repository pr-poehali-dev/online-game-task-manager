import { AI_URL, authHeaders } from './shared';
import type { AiAttachment } from './AiTypes';

// Порог, с которого файл грузится КУСОЧКАМИ, а не одним запросом: одиночный HTTP-запрос к
// облачной функции физически ограничен ~3.5 МБ на уровне прокси платформы (тело запроса больше
// этого лимита отклоняется с 413 ещё до того, как код функции начинает выполняться) — это нельзя
// изменить настройками. Порог ниже фактического лимита с запасом на base64-раздутие (+33%) и
// служебные поля JSON.
const CHUNK_THRESHOLD = 2 * 1024 * 1024; // 2 МБ
const CHUNK_SIZE = 1.5 * 1024 * 1024; // 1.5 МБ на кусок — тот же размер, что в разделе "Патчи"

export const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200 МБ — синхронизировано с backend/ai/index.py MAX_UPLOAD_SIZE

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

async function postJson(body: Record<string, unknown>): Promise<Record<string, unknown> & { error?: string; message?: string }> {
  const res = await fetch(AI_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { code: data.error, message: data.message });
  return data;
}

// Загружает файл в чат раздела "AI" — маленькие файлы (< CHUNK_THRESHOLD) одним запросом
// (action=upload_attachment), файлы покрупнее — кусочками по CHUNK_SIZE (action=file_init/
// file_chunk/file_complete, тот же паттерн, что uploadFileInChunks в patchesApi.ts). onProgress —
// доля загруженного (0..1), вызывается только при кусочной загрузке.
// kind — куда файл попадёт в разделе "Мои файлы": 'upload' (обычное вложение в чат) или
// 'template' (загруженный бланк документа). Оба типа расходуют личный лимит файлов сотрудника.
export async function uploadAiAttachment(
  file: File,
  onProgress?: (fraction: number) => void,
  kind: 'upload' | 'template' = 'upload'
): Promise<AiAttachment> {
  if (file.size <= CHUNK_THRESHOLD) {
    const dataUrl = await blobToBase64(file);
    const data = await postJson({ action: 'upload_attachment', data: dataUrl, name: file.name, contentType: file.type, kind });
    return data.attachment as AiAttachment;
  }

  const init = await postJson({ action: 'file_init', name: file.name, contentType: file.type, kind, size: file.size });
  const fileId = init.fileId as string;
  const totalParts = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  try {
    for (let i = 0; i < totalParts; i++) {
      const slice = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
      const b64 = await blobToBase64(slice);
      await postJson({ action: 'file_chunk', fileId, partNumber: i, data: b64 });
      onProgress?.((i + 1) / totalParts);
    }
    const data = await postJson({ action: 'file_complete', fileId, totalParts });
    return data.attachment as AiAttachment;
  } catch (err) {
    postJson({ action: 'file_abort', fileId, totalParts }).catch(() => {});
    throw err;
  }
}
