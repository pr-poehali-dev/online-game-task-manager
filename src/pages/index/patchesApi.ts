import { PATCHES_URL, authHeaders } from './shared';
import type { ServerId } from './shared';
import { blobToBase64 } from './patchesUtils';

export const CHUNK_SIZE = 1.5 * 1024 * 1024; // 1.5 МБ — одиночный запрос к серверу ограничен ~3 МБ

export async function postJson(body: Record<string, unknown>, signal?: AbortSignal) {
  const res = await fetch(PATCHES_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { code: data.error });
  return data;
}

export interface UploadQueueItem {
  path: string;
  file: File;
}

export async function uploadFileInChunks(
  server: ServerId,
  path: string,
  file: File,
  taskId: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void
) {
  const init = await postJson({ action: 'file_init', server, path, taskId: taskId || null }, signal);
  const fileId = init.fileId as string;
  const totalParts = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  try {
    for (let i = 0; i < totalParts; i++) {
      const slice = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
      const b64 = await blobToBase64(slice);
      await postJson({ action: 'file_chunk', fileId, partNumber: i, data: b64 }, signal);
      onProgress((i + 1) / totalParts);
    }
    await postJson({ action: 'file_complete', fileId, totalParts }, signal);
  } catch (err) {
    postJson({ action: 'file_abort', fileId, totalParts }).catch(() => {});
    throw err;
  }
}
