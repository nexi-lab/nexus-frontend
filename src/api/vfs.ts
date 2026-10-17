import type { FileMetadata, WriteReceipt } from '../types/vfs';
import type NexusAPIClient from './client';

export function createVfsAPI(client: Pick<NexusAPIClient, 'request'>) {
  return {
    list: (path: string, recursive = false) => client.request<{ entries: FileMetadata[] }>('/v2/directories', { params: { path, recursive } }),
    metadata: (path: string) => client.request<FileMetadata>('/v2/files/metadata', { params: { path } }),
    async read(path: string): Promise<Uint8Array> {
      const data = await client.request<ArrayBuffer>('/v2/files', { params: { path }, responseType: 'arraybuffer' });
      return new Uint8Array(data);
    },
    write(path: string, content: string | ArrayBuffer) {
      const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      return client.request<WriteReceipt>('/v2/files', { method: 'PUT', params: { path }, data, contentType: 'application/octet-stream' });
    },
    delete: (path: string, recursive = false) => client.request<{ deleted: boolean }>('/v2/files', { method: 'DELETE', params: { path, recursive } }),
    mkdir: (path: string, options?: { parents?: boolean; exist_ok?: boolean }) =>
      client.request<{ hit: boolean }>('/v2/directories', {
        method: 'POST',
        data: { path, parents: options?.parents ?? true, exist_ok: options?.exist_ok ?? false },
      }),
    rename: (path: string, newPath: string) =>
      client.request<{ success: boolean; is_directory: boolean }>('/v2/files/rename', {
        method: 'POST',
        data: { path, new_path: newPath },
      }),
  };
}
