import type { FileInfo } from '../types/file';
import type { FileMetadata } from '../types/vfs';
import type NexusAPIClient from './client';
import { NexusAPIError } from './client';
import { createVfsAPI } from './vfs';

function fileInfo(file: FileMetadata): FileInfo {
  return {
    path: file.path,
    name: file.path.split('/').filter(Boolean).pop() || file.path,
    isDirectory: file.is_directory,
    size: file.size,
    type: file.mime_type || undefined,
    created: file.created_at_ms === null ? undefined : new Date(file.created_at_ms).toISOString(),
    modified: file.modified_at_ms === null ? undefined : new Date(file.modified_at_ms).toISOString(),
  };
}

export function createFilesAPI(client: NexusAPIClient) {
  const vfs = createVfsAPI(client);
  const metadata = async (path: string): Promise<FileMetadata | null> => {
    try {
      return await vfs.metadata(path);
    } catch (error) {
      if (error instanceof NexusAPIError && error.status === 404) return null;
      throw error;
    }
  };
  return {
    async list(path: string, options?: { recursive?: boolean }): Promise<FileInfo[]> {
      return (await vfs.list(path, options?.recursive)).entries.map(fileInfo);
    },
    read: vfs.read,
    async write(path: string, content: string | ArrayBuffer): Promise<void> {
      await vfs.write(path, content);
    },
    async delete(path: string, recursive = false): Promise<void> {
      await vfs.delete(path, recursive);
    },
    async exists(path: string): Promise<boolean> {
      return (await metadata(path)) !== null;
    },
    async mkdir(path: string, options?: { parents?: boolean; exist_ok?: boolean }): Promise<void> {
      await vfs.mkdir(path, options);
    },
    async isDirectory(path: string): Promise<boolean> {
      return (await metadata(path))?.is_directory ?? false;
    },
    async rename(oldPath: string, newPath: string): Promise<void> {
      await vfs.rename(oldPath, newPath);
    },
  };
}
