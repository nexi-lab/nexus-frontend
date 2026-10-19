import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { isWithinPath } from '../utils/vfsPaths';

// Query keys
export const fileKeys = {
  all: ['files'] as const,
  lists: () => [...fileKeys.all, 'list'] as const,
  list: (path: string) => [...fileKeys.lists(), path] as const,
  file: (path: string) => [...fileKeys.all, 'file', path] as const,
};

// Hook to get the filesAPI with the authenticated client
function useFilesAPI() {
  const { apiClient } = useAuth();
  return useMemo(() => (apiClient ? createFilesAPI(apiClient) : null), [apiClient]);
}

// List files in a directory
export function useFileList(path: string, enabled = true) {
  const filesAPI = useFilesAPI();
  return useQuery({
    queryKey: fileKeys.list(path),
    queryFn: () => {
      if (!filesAPI) throw new Error('API client not initialized');
      return filesAPI.list(path);
    },
    enabled,
  });
}

// Read file contents
export function useFileContent(path: string, enabled = true) {
  const filesAPI = useFilesAPI();
  return useQuery({
    queryKey: fileKeys.file(path),
    staleTime: 0,
    gcTime: 0,
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
      const parent = path.substring(0, path.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: fileKeys.list(parent) });
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
      await filesAPI.delete(path, isDirectory);
    },
    onSuccess: (_, { path }) => {
      // Invalidate parent directory
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: fileKeys.list(parentPath) });
      // Remove from cache
      queryClient.removeQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === 'files' && ['file', 'list'].includes(queryKey[1] as string) && typeof queryKey[2] === 'string' && isWithinPath(queryKey[2], path),
      });
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
      queryClient.removeQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === 'files' && ['file', 'list'].includes(queryKey[1] as string) && typeof queryKey[2] === 'string' && isWithinPath(queryKey[2], oldPath),
      });
      queryClient.invalidateQueries({ queryKey: fileKeys.file(newPath) });
    },
  });
}

// Search files
export function useSearchFiles() {
  const { apiClient } = useAuth();
  const mutation = useMutation({
    mutationFn: async ({ query, searchType, path = '/' }: { query: string; searchType: 'glob' | 'grep'; path?: string }) => {
      if (!apiClient) throw new Error('API client not initialized');
      if (searchType === 'glob') {
        return await apiClient.glob(query, path);
      } else {
        return await apiClient.grep(query, path);
      }
    },
  });
  const { reset } = mutation;
  useEffect(() => reset(), [apiClient, reset]);
  return mutation;
}
