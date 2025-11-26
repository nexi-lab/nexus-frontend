import type { FileInfo, GlobResult, GrepResult, ListResult, MountInfo } from '../types/file';
import type NexusAPIClient from './client';

// Helper function to find the mount point for a given path
// Only returns mount info if the path is EXACTLY a mount point (not files inside it)
function findMountForPath(path: string, mounts: MountInfo[]): { mountPoint: string; backendType: string } | null {
  for (const mount of mounts) {
    // Only match if path is exactly the mount point
    if (path === mount.mount_point) {
      return {
        mountPoint: mount.mount_point,
        backendType: mount.backend_type,
      };
    }
  }

  return null;
}

// Helper function to transform backend file data to frontend FileInfo
function transformFileInfo(file: any): FileInfo {
  // Handle string (just a path)
  if (typeof file === 'string') {
    const name = file.split('/').filter(Boolean).pop() || file;
    return {
      path: file,
      name,
      isDirectory: file.endsWith('/'),
      size: undefined,
      type: undefined,
    };
  }

  // Extract filename from path
  const pathParts = (file.path || '').split('/').filter(Boolean);
  const name = pathParts.pop() || file.path || 'unknown';

  // Heuristic to detect directory:
  // 1. Explicit is_directory field
  // 2. No size (directories typically don't have size)
  // 3. No etag (files have etags, directories don't)
  // 4. mime_type is null and no size (likely a directory)
  // 5. Path ends with /
  const isDirectory =
    file.is_directory ??
    file.isDirectory ??
    ((file.size === undefined && file.etag === undefined && file.mime_type === null) || file.path?.endsWith('/')) ??
    false;

  // Transform datetime objects if they exist
  const modified = file.modified_at?.data || file.modified_at || file.modified;
  const created = file.created_at?.data || file.created_at || file.created;

  return {
    path: file.path || file,
    name,
    size: file.size,
    type: file.mime_type || file.type,
    isDirectory,
    modified,
    created,
    accessed: file.accessed_at?.data || file.accessed_at || file.accessed,
  };
}

// Factory function to create filesAPI with a specific client
export function createFilesAPI(client: NexusAPIClient) {
  return {
    // List files in a directory
    async list(
      path: string,
      options?: {
        recursive?: boolean;
        details?: boolean;
        prefix?: string;
        show_parsed?: boolean;
      },
    ): Promise<FileInfo[]> {
      const params: any = {
        path,
        recursive: options?.recursive ?? false,
        details: options?.details ?? true,
      };

      // Only add optional params if they are defined
      if (options?.prefix !== undefined) {
        params.prefix = options.prefix;
      }
      if (options?.show_parsed !== undefined) {
        params.show_parsed = options.show_parsed;
      }

      const result = await client.call<ListResult>('list', params);

      // Transform backend response to frontend FileInfo format
      return result.files.map(file => transformFileInfo(file));
    },

    // Read file contents (returns Uint8Array for binary files)
    async read(path: string): Promise<Uint8Array> {
      return await client.call<Uint8Array>('read', { path });
    },

    // Write file contents
    async write(path: string, content: string | ArrayBuffer): Promise<void> {
      // Convert content to base64-encoded bytes format expected by server
      let base64Content: string;

      if (typeof content === 'string') {
        // Text content - encode as UTF-8 then base64
        base64Content = btoa(unescape(encodeURIComponent(content)));
      } else {
        // Binary content (ArrayBuffer) - convert to base64
        const bytes = new Uint8Array(content);
        const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
        base64Content = btoa(binary);
      }

      // Send in the format expected by RPC server: {"__type__": "bytes", "data": "base64..."}
      await client.call('write', {
        path,
        content: { __type__: 'bytes', data: base64Content },
      });
    },

    // Delete file or directory
    async delete(path: string): Promise<void> {
      await client.call('delete', { path });
    },

    // Check if file exists
    async exists(path: string): Promise<boolean> {
      const result = await client.call<{ exists: boolean }>('exists', { path });
      return result.exists;
    },

    // Create directory
    async mkdir(path: string, options?: { parents?: boolean; exist_ok?: boolean }): Promise<void> {
      await client.call('mkdir', {
        path,
        parents: options?.parents ?? true,
        exist_ok: options?.exist_ok ?? false,
      });
    },

    // Remove directory
    async rmdir(path: string, recursive?: boolean): Promise<void> {
      await client.call('rmdir', {
        path,
        recursive: recursive ?? false,
      });
    },

    // Check if path is a directory
    async isDirectory(path: string): Promise<boolean> {
      const result = await client.call<{ is_directory: boolean }>('is_directory', { path });
      return result.is_directory;
    },

    // Search files by pattern (glob)
    async glob(pattern: string, path?: string): Promise<string[]> {
      const result = await client.call<GlobResult>('glob', {
        pattern,
        path: path ?? '/',
      });
      return result.matches;
    },

    // Search file contents (grep)
    async grep(
      pattern: string,
      options?: {
        path?: string;
        file_pattern?: string;
        ignore_case?: boolean;
        max_results?: number;
      },
    ): Promise<GrepResult['results']> {
      const result = await client.call<GrepResult>('grep', {
        pattern,
        path: options?.path ?? '/',
        file_pattern: options?.file_pattern,
        ignore_case: options?.ignore_case ?? false,
        max_results: options?.max_results ?? 100,
      });
      return result.results;
    },

    // Rename/move file
    async rename(oldPath: string, newPath: string): Promise<void> {
      // Implement using read + write + delete
      const content = await this.read(oldPath);
      // Convert Uint8Array to ArrayBuffer for write
      await this.write(newPath, content.buffer as ArrayBuffer);
      await this.delete(oldPath);
    },

    // Get available namespaces
    async getAvailableNamespaces(): Promise<string[]> {
      const result = await client.call<{ namespaces: string[] }>('get_available_namespaces', {});
      return result.namespaces;
    },

    // List all active mounts
    async listMounts(): Promise<MountInfo[]> {
      const result = await client.call<MountInfo[]>('list_mounts', {});
      return result;
    },

    // List all saved mount configurations (from database)
    async listSavedMounts(): Promise<Array<{
      mount_point: string;
      backend_type: string;
      backend_config: Record<string, any>;
      priority: number;
      readonly: boolean;
      description?: string;
      owner_user_id?: string;
      tenant_id?: string;
      created_at?: string;
      updated_at?: string;
    }>> {
      const result = await client.call<Array<{
        mount_point: string;
        backend_type: string;
        backend_config: Record<string, any>;
        priority: number;
        readonly: boolean;
        description?: string;
        owner_user_id?: string;
        tenant_id?: string;
        created_at?: string;
        updated_at?: string;
      }>>('list_saved_mounts', {});
      return result;
    },

    // Load and activate a saved mount
    async loadMount(mount_point: string): Promise<string> {
      const result = await client.call<string>('load_mount', {
        mount_point,
      });
      return result;
    },

    // Sync mount metadata from connector backend
    async syncMount(mount_point: string, recursive: boolean = true, dry_run: boolean = false): Promise<{ files_scanned: number; files_updated: number; files_created: number; files_deleted: number; errors: number }> {
      const result = await client.call<{ files_scanned: number; files_updated: number; files_created: number; files_deleted: number; errors: number }>('sync_mount', {
        mount_point,
        recursive,
        dry_run,
      });
      return result;
    },

    // Delete a saved mount configuration
    async deleteSavedMount(mount_point: string): Promise<boolean> {
      const result = await client.call<boolean>('delete_saved_mount', {
        mount_point,
      });
      return result;
    },
  };
}

// Export helper function to enrich file info with mount data
export function enrichFileWithMount(file: FileInfo, mounts: MountInfo[]): FileInfo {
  const mountInfo = findMountForPath(file.path, mounts);
  if (mountInfo) {
    return {
      ...file,
      mountPoint: mountInfo.mountPoint,
      backendType: mountInfo.backendType,
    };
  }
  return file;
}
