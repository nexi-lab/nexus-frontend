export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
}

export interface ChatConfig {
  apiUrl?: string;
  assistantId?: string;
  apiKey?: string; // LangGraph API key for authentication
  nexusApiKey?: string; // Nexus API key for tool calls
  nexusServerUrl?: string; // Nexus backend URL for tools
  threadId?: string;
  userId?: string;
  tenantId?: string;
  sandboxId?: string;
  sandboxStatus?: 'running' | 'paused' | 'stopped' | 'unknown';
  sandboxProvider?: string;
  sandboxExpiresAt?: string;
  openedFilePath?: string; // Currently opened file path in the editor
  maxSteps?: number; // Maximum number of steps for agent execution (recursion limit)
  workspacePath?: string; // Selected workspace path
  workspaceName?: string; // Selected workspace name for display
}
