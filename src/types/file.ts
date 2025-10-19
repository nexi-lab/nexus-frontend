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
  path: string
  line_number: number
  line: string
  match: string
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
