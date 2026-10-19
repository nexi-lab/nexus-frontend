import type { FileMetadata, WriteReceipt } from '../types/vfs';
import type NexusAPIClient from './client';
import { NexusAPIError } from './client';
import { isRecord } from './validation';

const unsigned = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown) => value === null || (typeof value === 'number' && Number.isSafeInteger(value));

function isMetadata(value: unknown): value is FileMetadata {
  return (
    isRecord(value) &&
    ['path', 'mime_type', 'zone_id', 'owner_id'].every((field) => typeof value[field] === 'string') &&
    typeof value.is_directory === 'boolean' &&
    unsigned(value.size) &&
    unsigned(value.version) &&
    unsigned(value.gen) &&
    timestamp(value.created_at_ms) &&
    timestamp(value.modified_at_ms)
  );
}

function checked<T>(value: unknown, valid: (value: unknown) => value is T): T {
  if (!valid(value)) throw new NexusAPIError('The Nexus server returned an invalid file response.');
  return value;
}

export function createVfsAPI(client: Pick<NexusAPIClient, 'request'>) {
  return {
    async list(path: string, recursive = false) {
      return checked(
        await client.request<unknown>('/v2/directories', { params: { path, recursive } }),
        (value): value is { entries: FileMetadata[] } => isRecord(value) && Array.isArray(value.entries) && value.entries.every(isMetadata),
      );
    },
    async metadata(path: string): Promise<FileMetadata> {
      return checked(await client.request<unknown>('/v2/files/metadata', { params: { path } }), isMetadata);
    },
    async read(path: string): Promise<Uint8Array> {
      const data = await client.request<ArrayBuffer>('/v2/files', { params: { path }, responseType: 'arraybuffer' });
      return new Uint8Array(data);
    },
    async write(path: string, content: string | ArrayBuffer): Promise<WriteReceipt> {
      const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      return checked(
        await client.request<unknown>('/v2/files', { method: 'PUT', params: { path }, data, contentType: 'application/octet-stream' }),
        (value): value is WriteReceipt => isRecord(value) && unsigned(value.size) && unsigned(value.gen) && typeof value.content_id === 'string',
      );
    },
    async delete(path: string, recursive = false) {
      return checked(
        await client.request<unknown>('/v2/files', { method: 'DELETE', params: { path, recursive } }),
        (value): value is { deleted: boolean } => isRecord(value) && typeof value.deleted === 'boolean',
      );
    },
    async mkdir(path: string, options?: { parents?: boolean; exist_ok?: boolean }) {
      return checked(
        await client.request<unknown>('/v2/directories', {
          method: 'POST',
          data: { path, parents: options?.parents ?? true, exist_ok: options?.exist_ok ?? false },
        }),
        (value): value is { hit: boolean } => isRecord(value) && typeof value.hit === 'boolean',
      );
    },
    async rename(path: string, newPath: string) {
      return checked(
        await client.request<unknown>('/v2/files/rename', {
          method: 'POST',
          data: { path, new_path: newPath },
        }),
        (value): value is { success: true; is_directory: boolean } => isRecord(value) && value.success === true && typeof value.is_directory === 'boolean',
      );
    },
  };
}
