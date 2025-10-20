import { nexusAPI } from './client'
import type { ListResult, GlobResult, GrepResult, FileInfo } from '../types/file'

// Helper function to transform backend file data to frontend FileInfo
function transformFileInfo(file: any): FileInfo {
  // Handle string (just a path)
  if (typeof file === 'string') {
    const name = file.split('/').filter(Boolean).pop() || file
    return {
      path: file,
      name,
      isDirectory: file.endsWith('/'),
      size: undefined,
      type: undefined,
    }
  }

  // Extract filename from path
  const pathParts = (file.path || '').split('/').filter(Boolean)
  const name = pathParts.pop() || file.path || 'unknown'

  // Heuristic to detect directory:
  // 1. Explicit is_directory field
  // 2. No size (directories typically don't have size)
  // 3. No etag (files have etags, directories don't)
  // 4. mime_type is null and no size (likely a directory)
  // 5. Path ends with /
  const isDirectory =
    file.is_directory ??
    file.isDirectory ??
    ((file.size === undefined && file.etag === undefined && file.mime_type === null) ||
      file.path?.endsWith('/')) ??
    false

  // Transform datetime objects if they exist
  const modified = file.modified_at?.data || file.modified_at || file.modified
  const created = file.created_at?.data || file.created_at || file.created

  return {
    path: file.path || file,
    name,
    size: file.size,
    type: file.mime_type || file.type,
    isDirectory,
    modified,
    created,
    accessed: file.accessed_at?.data || file.accessed_at || file.accessed,
  }
}

export const filesAPI = {
  // List files in a directory
  async list(
    path: string,
    options?: {
      recursive?: boolean
      details?: boolean
      prefix?: string
    }
  ): Promise<FileInfo[]> {
    const result = await nexusAPI.call<ListResult>('list', {
      path,
      recursive: options?.recursive ?? false,
      details: options?.details ?? true,
      prefix: options?.prefix,
    })

    // Transform backend response to frontend FileInfo format
    return result.files.map(transformFileInfo)
  },

  // Read file contents (returns Uint8Array for binary files)
  async read(path: string): Promise<Uint8Array> {
    return await nexusAPI.call<Uint8Array>('read', { path })
  },

  // Write file contents
  async write(path: string, content: string | ArrayBuffer): Promise<void> {
    // Convert content to base64-encoded bytes format expected by server
    let base64Content: string

    if (typeof content === 'string') {
      // Text content - encode as UTF-8 then base64
      base64Content = btoa(unescape(encodeURIComponent(content)))
    } else {
      // Binary content (ArrayBuffer) - convert to base64
      const bytes = new Uint8Array(content)
      const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '')
      base64Content = btoa(binary)
    }

    // Send in the format expected by RPC server: {"__type__": "bytes", "data": "base64..."}
    await nexusAPI.call('write', {
      path,
      content: { __type__: 'bytes', data: base64Content }
    })
  },

  // Delete file or directory
  async delete(path: string): Promise<void> {
    await nexusAPI.call('delete', { path })
  },

  // Check if file exists
  async exists(path: string): Promise<boolean> {
    const result = await nexusAPI.call<{ exists: boolean }>('exists', { path })
    return result.exists
  },

  // Create directory
  async mkdir(
    path: string,
    options?: { parents?: boolean; exist_ok?: boolean }
  ): Promise<void> {
    await nexusAPI.call('mkdir', {
      path,
      parents: options?.parents ?? true,
      exist_ok: options?.exist_ok ?? false,
    })
  },

  // Remove directory
  async rmdir(path: string, recursive?: boolean): Promise<void> {
    await nexusAPI.call('rmdir', {
      path,
      recursive: recursive ?? false,
    })
  },

  // Check if path is a directory
  async isDirectory(path: string): Promise<boolean> {
    const result = await nexusAPI.call<{ is_directory: boolean }>(
      'is_directory',
      { path }
    )
    return result.is_directory
  },

  // Search files by pattern (glob)
  async glob(pattern: string, path?: string): Promise<string[]> {
    const result = await nexusAPI.call<GlobResult>('glob', {
      pattern,
      path: path ?? '/',
    })
    return result.matches
  },

  // Search file contents (grep)
  async grep(
    pattern: string,
    options?: {
      path?: string
      file_pattern?: string
      ignore_case?: boolean
      max_results?: number
    }
  ): Promise<GrepResult['results']> {
    const result = await nexusAPI.call<GrepResult>('grep', {
      pattern,
      path: options?.path ?? '/',
      file_pattern: options?.file_pattern,
      ignore_case: options?.ignore_case ?? false,
      max_results: options?.max_results ?? 100,
    })
    return result.results
  },

  // Rename/move file
  async rename(oldPath: string, newPath: string): Promise<void> {
    // Implement using read + write + delete
    const content = await this.read(oldPath)
    // Convert Uint8Array to ArrayBuffer for write
    await this.write(newPath, content.buffer as ArrayBuffer)
    await this.delete(oldPath)
  },
}
