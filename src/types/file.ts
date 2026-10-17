export interface FileInfo {
  path: string;
  name: string;
  size?: number;
  type?: string;
  isDirectory: boolean;
  created?: string;
  modified?: string;
  accessed?: string;
  connectorPath?: string;   // Connector path (e.g., "/cloud/my-bucket")
  backendType?: string;     // Backend type (e.g., "GCSConnectorBackend", "LocalBackend")
}

export interface ConnectorInfo {
  mount_point: string;
  priority: number;
  readonly: boolean;
  backend_type: string;
}

export interface RPCRequest {
  jsonrpc: string;
  method: string;
  params: any;
  id: string | number;
}

export interface RPCResponse<T = any> {
  jsonrpc: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number | null;
}

export interface ListResult {
  files: FileInfo[];
}

export interface NamespacesResult {
  namespaces: string[];
}
