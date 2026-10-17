import type { ConnectorInfo, FileInfo } from '../types/file';
import type { FileMetadata } from '../types/vfs';
import { NexusAPIError } from './client';
import { createVfsAPI } from './vfs';
import type NexusAPIClient from './client';

// Helper function to find the connector for a given path
// Only returns connector info if the path is EXACTLY a connector path (not files inside it)
function findConnectorForPath(path: string, connectors: ConnectorInfo[]): { connectorPath: string; backendType: string } | null {
  for (const connector of connectors) {
    // Only match if path is exactly the connector path
    if (path === connector.mount_point) {
      return {
        connectorPath: connector.mount_point,
        backendType: connector.backend_type,
      };
    }
  }

  return null;
}

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

// Factory function to create filesAPI with a specific client
export function createFilesAPI(client: NexusAPIClient) {
  const vfs = createVfsAPI(client);
  const metadata = async (path: string): Promise<FileMetadata | null> => {
    try { return await vfs.metadata(path); }
    catch (error) {
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

    // Get available namespaces
    async getAvailableNamespaces(): Promise<string[]> {
      const result = await client.call<{ namespaces: string[] }>('get_available_namespaces', {});
      return result.namespaces;
    },

    // List all active connectors
    async listConnectors(): Promise<ConnectorInfo[]> {
      const result = await client.call<ConnectorInfo[]>('list_mounts', {});
      return result;
    },

    // List all saved connector configurations (from database)
    async listSavedConnectors(): Promise<Array<{
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

    // Load and activate a saved connector
    async loadConnector(mount_point: string): Promise<string> {
      const result = await client.call<string>('load_mount', {
        mount_point,
      });
      return result;
    },

    // Sync connector metadata from connector backend
    async syncConnector(
      mount_point: string,
      recursive: boolean = true,
      dry_run: boolean = false,
    ): Promise<{ files_scanned: number; files_updated: number; files_created: number; files_deleted: number; errors: number }> {
      const result = await client.call<{ files_scanned: number; files_updated: number; files_created: number; files_deleted: number; errors: number }>('sync_mount', {
        mount_point,
        recursive,
        dry_run,
      });
      return result;
    },

    // Delete a saved connector configuration
    async deleteSavedConnector(mount_point: string): Promise<boolean> {
      const result = await client.call<boolean>('delete_saved_mount', {
        mount_point,
      });
      return result;
    },

    // Delete connector completely (bundled operation - deactivate, delete directory, delete config)
    async deleteConnector(
      mount_point: string,
      options?: {
        revoke_oauth?: boolean;
        provider?: string;
        user_email?: string;
      }
    ): Promise<{
      removed: boolean;
      directory_deleted: boolean;
      config_deleted: boolean;
      oauth_revoked: boolean;
      errors: string[];
      warnings: string[];
    }> {
      const result = await client.call<{
        removed: boolean;
        directory_deleted: boolean;
        config_deleted: boolean;
        oauth_revoked: boolean;
        errors: string[];
        warnings: string[];
      }>('delete_connector', {
        mount_point,
        revoke_oauth: options?.revoke_oauth ?? false,
        provider: options?.provider,
        user_email: options?.user_email,
      });
      return result;
    },
  };
}

// Export helper function to enrich file info with connector data
export function enrichFileWithConnector(file: FileInfo, connectors: ConnectorInfo[]): FileInfo {
  const connectorInfo = findConnectorForPath(file.path, connectors);
  if (connectorInfo) {
    return {
      ...file,
      connectorPath: connectorInfo.connectorPath,
      backendType: connectorInfo.backendType,
    };
  }
  return file;
}
