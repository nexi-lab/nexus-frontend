import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { filesAPI } from '../api/files'

// Query keys
export const fileKeys = {
  all: ['files'] as const,
  lists: () => [...fileKeys.all, 'list'] as const,
  list: (path: string) => [...fileKeys.lists(), path] as const,
  file: (path: string) => [...fileKeys.all, 'file', path] as const,
}

// List files in a directory
export function useFileList(path: string, enabled = true) {
  return useQuery({
    queryKey: fileKeys.list(path),
    queryFn: () => filesAPI.list(path, { details: true }),
    enabled,
  })
}

// Read file contents
export function useFileContent(path: string, enabled = true) {
  return useQuery({
    queryKey: fileKeys.file(path),
    queryFn: () => filesAPI.read(path),
    enabled,
  })
}

// Create directory
export function useCreateDirectory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path }: { path: string }) =>
      filesAPI.mkdir(path, { parents: true, exist_ok: false }),
    onSuccess: (_, { path }) => {
      // Invalidate parent directory
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/'
      queryClient.invalidateQueries({ queryKey: fileKeys.list(parentPath) })
    },
  })
}

// Upload file
export function useUploadFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string | ArrayBuffer }) =>
      filesAPI.write(path, content),
    onSuccess: (_, { path }) => {
      // Invalidate parent directory
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/'
      queryClient.invalidateQueries({ queryKey: fileKeys.list(parentPath) })
      // Invalidate file content to ensure fresh read
      queryClient.invalidateQueries({ queryKey: fileKeys.file(path) })
    },
  })
}

// Update file (similar to upload but specifically for updates)
export function useUpdateFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string | ArrayBuffer }) =>
      filesAPI.write(path, content),
    onSuccess: (_, { path }) => {
      // Invalidate file content to refresh the view
      queryClient.invalidateQueries({ queryKey: fileKeys.file(path) })
    },
  })
}

// Delete file or directory
export function useDeleteFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ path, isDirectory }: { path: string; isDirectory: boolean }) => {
      if (isDirectory) {
        await filesAPI.rmdir(path, true)
      } else {
        await filesAPI.delete(path)
      }
    },
    onSuccess: (_, { path }) => {
      // Invalidate parent directory
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/'
      queryClient.invalidateQueries({ queryKey: fileKeys.list(parentPath) })
      // Remove from cache
      queryClient.removeQueries({ queryKey: fileKeys.file(path) })
    },
  })
}

// Rename file
export function useRenameFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) =>
      filesAPI.rename(oldPath, newPath),
    onSuccess: (_, { oldPath, newPath }) => {
      // Invalidate parent directories
      const oldParent = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/'
      const newParent = newPath.substring(0, newPath.lastIndexOf('/')) || '/'
      queryClient.invalidateQueries({ queryKey: fileKeys.list(oldParent) })
      if (oldParent !== newParent) {
        queryClient.invalidateQueries({ queryKey: fileKeys.list(newParent) })
      }
      // Remove old file from cache
      queryClient.removeQueries({ queryKey: fileKeys.file(oldPath) })
    },
  })
}

// Search files
export function useSearchFiles() {
  return useMutation({
    mutationFn: async ({
      query,
      searchType,
      path = '/',
    }: {
      query: string
      searchType: 'glob' | 'grep'
      path?: string
    }) => {
      if (searchType === 'glob') {
        return await filesAPI.glob(query, path)
      } else {
        return await filesAPI.grep(query, { path })
      }
    },
  })
}
