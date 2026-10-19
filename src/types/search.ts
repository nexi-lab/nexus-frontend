interface DiscoveryResult {
  truncated: boolean;
  error?: string;
}

export interface GlobResult extends DiscoveryResult {
  paths: string[];
}

export interface GrepMatch {
  path: string;
  line_number: number;
  line: string;
  before: string[];
  after: string[];
}

export interface GrepResult extends DiscoveryResult {
  matches: GrepMatch[];
}
