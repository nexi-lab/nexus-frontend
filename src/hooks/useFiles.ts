import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';

// Query keys
export const fileKeys = {
  all: ['files'] as const,
  lists: () => [...fileKeys.all, 'list'] as const,
  list: (path: string) => [...fileKeys.lists(), path] as const,
  file: (path: string) => [...fileKeys.all, 'file', path] as const,
  namespaces: () => [...fileKeys.all, 'namespaces'] as const,
  connectors: () => [...fileKeys.all, 'connectors'] as const,
};

// Hook to get the filesAPI with the authenticated client
function useFilesAPI() {
  const { apiClient } = useAuth();
  return useMemo(() => apiClient ? createFilesAPI(apiClient) : null, [apiClient]);
}

// Get available namespaces
export function useNamespaces(enabled = true) {
  const filesAPI = useFilesAPI();
  return useQuery({
    queryKey: fileKeys.namespaces(),
    queryFn: () => {
      if (!filesAPI) throw new Error('API client not initialized');
      return filesAPI.getAvailableNamespaces();
    },
    enabled: enabled && !!filesAPI,
    staleTime: 5 * 60 * 1000, // 5 minutes - namespaces don't change often
  });
}

// Get all connectors (global, fetched once)
export function useConnectors(enabled = true) {
  const filesAPI = useFilesAPI();
  return useQuery({
    queryKey: fileKeys.connectors(),
    queryFn: () => {
      if (!filesAPI) throw new Error('API client not initialized');
      return filesAPI.listConnectors();
    },
    enabled: enabled && !!filesAPI,
    staleTime: 30 * 1000, // 30 seconds - connectors don't change very often
  });
}

// List files in a directory
export function useFileList(path: string, enabled = true) {
  const filesAPI = useFilesAPI();
  return useQuery({
    queryKey: fileKeys.list(path),
    queryFn: () => {
      if (!filesAPI) throw new Error('API client not initialized');
      return filesAPI.list(path, { details: true });
    },
    enabled,
  });
}

// Read file contents
export function useFileContent(path: string, enabled = true) {
  const filesAPI = useFilesAPI();
  return useQuery({
    queryKey: fileKeys.file(path),
    queryFn: () => {
      if (!filesAPI) throw new Error('API client not initialized');
      return filesAPI.read(path);
    },
    enabled: enabled && !!filesAPI,
  });
}

// Create directory
export function useCreateDirectory() {
  const filesAPI = useFilesAPI();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ path }: { path: string }) => {
      if (!filesAPI) throw new Error('API client not initialized');
      return filesAPI.mkdir(path, { parents: true, exist_ok: false });
    },
    onSuccess: (_, { path }) => {
      // Invalidate parent directory
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: fileKeys.list(parentPath) });
    },
  });
}

// Upload file
export function useUploadFile() {
  const filesAPI = useFilesAPI();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string | ArrayBuffer }) => {
      if (!filesAPI) throw new Error('API client not initialized');
      return filesAPI.write(path, content);
    },
    onSuccess: (_, { path }) => {
      // Invalidate parent directory
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: fileKeys.list(parentPath) });
      // Invalidate file content to ensure fresh read
      queryClient.invalidateQueries({ queryKey: fileKeys.file(path) });
    },
  });
}

// Update file (similar to upload but specifically for updates)
export function useUpdateFile() {
  const filesAPI = useFilesAPI();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string | ArrayBuffer }) => {
      if (!filesAPI) throw new Error('API client not initialized');
      return filesAPI.write(path, content);
    },
    onSuccess: (_, { path }) => {
      // Invalidate file content to refresh the view
      queryClient.invalidateQueries({ queryKey: fileKeys.file(path) });
    },
  });
}

// Delete file or directory
export function useDeleteFile() {
  const filesAPI = useFilesAPI();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ path, isDirectory }: { path: string; isDirectory: boolean }) => {
      if (!filesAPI) throw new Error('API client not initialized');
      if (isDirectory) {
        await filesAPI.rmdir(path, true);
      } else {
        await filesAPI.delete(path);
      }
    },
    onSuccess: (_, { path }) => {
      // Invalidate parent directory
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: fileKeys.list(parentPath) });
      // Remove from cache
      queryClient.removeQueries({ queryKey: fileKeys.file(path) });
    },
  });
}

// Rename file
export function useRenameFile() {
  const filesAPI = useFilesAPI();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      if (!filesAPI) throw new Error('API client not initialized');
      return filesAPI.rename(oldPath, newPath);
    },
    onSuccess: (_, { oldPath, newPath }) => {
      // Invalidate parent directories
      const oldParent = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/';
      const newParent = newPath.substring(0, newPath.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: fileKeys.list(oldParent) });
      if (oldParent !== newParent) {
        queryClient.invalidateQueries({ queryKey: fileKeys.list(newParent) });
      }
      // Remove old file from cache
      queryClient.removeQueries({ queryKey: fileKeys.file(oldPath) });
    },
  });
}

// Search files
export function useSearchFiles() {
  const filesAPI = useFilesAPI();
  return useMutation({
    mutationFn: async ({ query, searchType, path = '/' }: { query: string; searchType: 'glob' | 'grep'; path?: string }) => {
      if (!filesAPI) throw new Error('API client not initialized');
      if (searchType === 'glob') {
        return await filesAPI.glob(query, path);
      } else {
        return await filesAPI.grep(query, { path });
      }
    },
  });
}

// Create workspace (mkdir + register)
export function useCreateWorkspace() {
  const filesAPI = useFilesAPI();
  const { apiClient, userInfo } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ path, name, description }: { path: string; name?: string; description?: string }) => {
      if (!filesAPI) throw new Error('API client not initialized');
      if (!apiClient) throw new Error('API client not initialized');
      
      // Step 1: Create directory
      await filesAPI.mkdir(path, { parents: true, exist_ok: false });

      // Step 2: Register workspace (auto-grants ReBAC permissions)
      const workspace = await apiClient.registerWorkspace({
        path,
        name,
        description,
        created_by: userInfo?.subject_id || userInfo?.user,
      });

      return workspace;
    },
    onSuccess: (_, { path }) => {
      // Invalidate parent directory to show new workspace
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: fileKeys.list(parentPath) });
      // Invalidate root to refresh tree
      queryClient.invalidateQueries({ queryKey: fileKeys.list('/') });
    },
  });
}

// Register agent
export function useRegisterAgent() {
  const { apiClient, userInfo } = useAuth();
  const filesAPI = useFilesAPI();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      agentId,
      name,
      description,
      generateApiKey,
      config,
    }: {
      agentId: string;
      name: string;
      description?: string;
      generateApiKey?: boolean;
      config: {
        platform: string;
        endpoint_url: string;
        agent_id?: string;
        system_prompt: string;
        tools: string[];
      };
    }) => {
      if (!apiClient) throw new Error('API client not initialized');
      if (!filesAPI) throw new Error('API client not initialized');
      
      // Step 1: Register the agent
      const agent = await apiClient.registerAgent({
        agent_id: agentId,
        name,
        description,
        generate_api_key: generateApiKey,
      });

      // Step 2: Create agent folder as authenticated user
      // This ensures proper permission checks and ReBAC tuple creation
      // Use new namespace convention: /tenant:<tenant_id>/user:<user_id>/agent/<agent_id>
      const [userId, agentName] = agentId.split(',');
      const tenantId = userInfo?.tenant_id || 'default';
      if (userId && agentName) {
        const agentFolderPath = `/tenant:${tenantId}/user:${userId}/agent/${agentName}`;
        try {
          await filesAPI.mkdir(agentFolderPath, { parents: true, exist_ok: true });
          // Invalidate parent directories to show new folder
          queryClient.invalidateQueries({ queryKey: fileKeys.list(`/tenant:${tenantId}/user:${userId}/agent`) });
          queryClient.invalidateQueries({ queryKey: fileKeys.list(`/tenant:${tenantId}/user:${userId}`) });
        } catch (error) {
          console.error('Failed to create agent folder:', error);
          // Don't fail the entire operation if folder creation fails
        }

        // Step 3: Save agent config as YAML
        try {
          let yamlContent = `# Agent Configuration
platform: ${config.platform}
`;
          if (config.endpoint_url) {
            yamlContent += `endpoint_url: ${config.endpoint_url}\n`;
          }
          if (config.agent_id) {
            yamlContent += `agent_id: ${config.agent_id}\n`;
          }
          yamlContent += '\n';

          if (config.system_prompt) {
            yamlContent += `system_prompt: |
  ${config.system_prompt.split('\n').join('\n  ')}\n\n`;
          }

          if (config.tools && config.tools.length > 0) {
            yamlContent += `tools:
${config.tools.map((tool) => `  - ${tool}`).join('\n')}
`;
          }

          const encoder = new TextEncoder();
          const yamlBuffer = encoder.encode(yamlContent).buffer;
          await filesAPI.write(`${agentFolderPath}/config.yaml`, yamlBuffer);
        } catch (error) {
          console.error('Failed to save agent config:', error);
          // Don't fail the entire operation if config save fails
        }
      }

      return agent;
    },
  });
}
