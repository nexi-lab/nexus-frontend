export interface FileInfo {
  path: string
  name: string
  size?: number
  type?: string
  isDirectory: boolean
  created?: string
  modified?: string
  accessed?: string
}

export interface RPCRequest {
  jsonrpc: string
  method: string
  params: any
  id: string | number
}

export interface RPCResponse<T = any> {
  jsonrpc: string
  result?: T
  error?: {
    code: number
    message: string
    data?: any
  }
  id: string | number | null
}

export interface ListResult {
  files: FileInfo[]
}

export interface GlobResult {
  matches: string[]
}

export interface GrepMatch {
  file: string        // Backend returns "file" not "path"
  line: number        // Backend returns "line" not "line_number"
  content: string     // Backend returns "content" not "line"
  match: string
  source?: string     // Backend includes "source" field
}

export interface GrepResult {
  results: GrepMatch[]
}

export interface SearchResult {
  path: string
  name: string
  type: 'file' | 'directory'
  matches?: GrepMatch[]
}
