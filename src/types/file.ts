export interface FileInfo {
  path: string;
  name: string;
  size?: number;
  type?: string;
  isDirectory: boolean;
  created?: string;
  modified?: string;
  accessed?: string;
}
