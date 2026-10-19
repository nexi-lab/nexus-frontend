export interface FileMetadata {
  path: string;
  size: number;
  mime_type: string;
  is_directory: boolean;
  version: number;
  gen: number;
  zone_id: string;
  created_at_ms: number | null;
  modified_at_ms: number | null;
  owner_id: string;
}

export interface WriteReceipt {
  size: number;
  gen: number;
  content_id: string;
}
