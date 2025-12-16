import type NexusAPIClient from '../api/client';
import { nexusAPI } from '../api/client';
import { createFilesAPI } from '../api/files';
import { generateResourceId, userPath, tenantPath } from './pathUtils';

/**
 * Create workspace with new convention path
 * IMPORTANT: Also creates ReBAC ownership tuple with atomicity handling
 * Uses the authenticated user's API key from apiClient, not from environment
 */
export async function createWorkspace(
  name: string,
  tenantId: string,
  userId: string,
  apiClient: NexusAPIClient,
  description?: string
): Promise<string> {
  const resourceId = generateResourceId('workspace', name);
  const path = userPath(tenantId, userId, 'workspace', resourceId);

  let workspaceCreated = false;
  try {
    // Step 1: Register workspace (backend will create the directory if it doesn't exist)
    // Uses authenticated user's API key from apiClient, not from environment
    await apiClient.registerWorkspace({
      path,
      name,
      description,
    });
    workspaceCreated = true;

    // Step 2: CRITICAL - Grant ownership via ReBAC
    await apiClient.rebacCreate({
      subject: ['user', userId],
      relation: 'owner-of',
      object: ['file', path],
      tenant_id: tenantId,
    });

    return path;
  } catch (error) {
    // CRITICAL: Cleanup workspace if it was created but ReBAC failed
    if (workspaceCreated) {
      try {
        await apiClient.unregisterWorkspace(path);
        console.error('Cleaned up workspace after ReBAC failure:', path);
      } catch (cleanupError) {
        console.error('CRITICAL: Failed to cleanup workspace after ReBAC failure:', path, cleanupError);
        // Log to monitoring system for manual intervention
      }
    }
    throw error;
  }
}

/**
 * Create connector with new convention path
 * Note: Uses save_mount to persist the connector configuration
 */
export async function createConnector(
  name: string,
  tenantId: string,
  backendType: string,
  backendConfig: Record<string, any>,
  priority?: number,
  readonly?: boolean,
  description?: string
): Promise<string> {
  const resourceId = generateResourceId('connector', name);
  const path = tenantPath(tenantId, 'connector', resourceId);

  // Use save_mount to persist the connector configuration
  await nexusAPI.call('save_mount', {
    mount_point: path,
    backend_type: backendType,
    backend_config: backendConfig,
    priority: priority ?? 10,
    readonly: readonly ?? false,
    description: description,
  });

  return path;
}

/**
 * Create resource file with new convention path
 * IMPORTANT: Also creates ReBAC ownership tuple with atomicity handling
 */
export async function createResource(
  name: string,
  tenantId: string,
  userId: string | null,
  content: string | Uint8Array
): Promise<string> {
  const resourceId = generateResourceId('resource', name);
  const path = userId
    ? userPath(tenantId, userId, 'resource', resourceId)
    : tenantPath(tenantId, 'resource', resourceId);

  const filesAPI = createFilesAPI(nexusAPI);
  let resourceCreated = false;
  try {
    // Step 1: Create resource
    await filesAPI.write(path, typeof content === 'string' ? content : content as unknown as ArrayBuffer);
    resourceCreated = true;

    // Step 2: CRITICAL - Grant ownership via ReBAC
    await nexusAPI.rebacCreate({
      subject: userId ? ['user', userId] : ['tenant', tenantId],
      relation: 'owner-of',
      object: ['file', path],
      tenant_id: tenantId,
    });

    return path;
  } catch (error) {
    // CRITICAL: Cleanup resource if it was created but ReBAC failed
    if (resourceCreated) {
      try {
        await filesAPI.delete(path);
        console.error('Cleaned up resource after ReBAC failure:', path);
      } catch (cleanupError) {
        console.error('CRITICAL: Failed to cleanup resource after ReBAC failure:', path, cleanupError);
        // Log to monitoring system for manual intervention
      }
    }
    throw error;
  }
}

/**
 * Delete resource and cleanup ReBAC tuples
 * IMPORTANT: Removes all ReBAC relationships for the resource
 */
export async function deleteResource(
  path: string
): Promise<void> {
  const filesAPI = createFilesAPI(nexusAPI);
  let resourceDeleted = false;
  try {
    // Step 1: Delete the resource
    await filesAPI.delete(path);
    resourceDeleted = true;

    // Step 2: Clean up ALL ReBAC tuples for this resource
    // Note: This requires a rebacListTuples with object filter
    const tuples = await nexusAPI.rebacListTuples({
      object: ['file', path],
    });

    for (const tuple of tuples) {
      await nexusAPI.rebacDelete({ tuple_id: tuple.tuple_id });
    }
  } catch (error) {
    // If resource was deleted but ReBAC cleanup failed, log for manual intervention
    if (resourceDeleted) {
      console.error('CRITICAL: Resource deleted but ReBAC cleanup failed:', path, error);
      // Log to monitoring system for manual intervention
    }
    throw error;
  }
}

/**
 * Delete workspace and cleanup ReBAC tuples
 * IMPORTANT: Removes all ReBAC relationships for the workspace
 * Uses the authenticated user's API key from apiClient, not from environment
 */
export async function deleteWorkspace(
  path: string,
  apiClient: NexusAPIClient
): Promise<void> {
  let workspaceDeleted = false;
  try {
    // Step 1: Unregister the workspace (uses authenticated user's API key from apiClient)
    await apiClient.unregisterWorkspace(path);
    workspaceDeleted = true;

    // Step 2: Clean up ALL ReBAC tuples for this workspace
    const tuples = await apiClient.rebacListTuples({
      object: ['file', path],
    });

    for (const tuple of tuples) {
      await apiClient.rebacDelete({ tuple_id: tuple.tuple_id });
    }
  } catch (error) {
    // If workspace was deleted but ReBAC cleanup failed, log for manual intervention
    if (workspaceDeleted) {
      console.error('CRITICAL: Workspace deleted but ReBAC cleanup failed:', path, error);
      // Log to monitoring system for manual intervention
    }
    throw error;
  }
}

