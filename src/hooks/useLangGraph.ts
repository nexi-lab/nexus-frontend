import type { Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';

interface UseLangGraphOptions {
  apiUrl?: string;
  assistantId?: string;
  apiKey?: string; // LangGraph API key
  nexusApiKey?: string; // Nexus API key for tool calls
  nexusServerUrl?: string; // Nexus backend URL for tools
  threadId?: string;
  userId?: string;
  tenantId?: string;
  sandboxId?: string; // Sandbox ID for code execution
  openedFilePath?: string; // Currently opened file path in the editor
  key?: number; // Add key to force recreation
}

export type StateType = { messages: Message[] };

const useTypedStream = useStream<StateType>;

export function useLangGraph(options: UseLangGraphOptions = {}) {
  // Debug logging
  console.log('useLangGraph called with:', {
    apiUrl: options.apiUrl,
    langgraphApiKey: options.apiKey ? `${options.apiKey.substring(0, 20)}...` : 'NOT SET',
    nexusApiKey: options.nexusApiKey ? `${options.nexusApiKey.substring(0, 20)}...` : 'NOT SET',
    nexusServerUrl: options.nexusServerUrl || 'NOT SET',
    assistantId: options.assistantId,
    sandboxId: options.sandboxId || 'NOT SET',
    openedFilePath: options.openedFilePath || 'NOT SET',
  });

  const stream = useTypedStream({
    apiUrl: options.apiUrl || '',
    apiKey: options.apiKey || undefined, // SDK handles auth internally
    assistantId: options.assistantId || '',
    threadId: options.threadId, // Use provided thread ID
    fetchStateHistory: false, // Don't fetch history to avoid errors
    // Don't add Nexus-specific headers - LangGraph server rejects them with 403
  });

  // Wrap submit to automatically add metadata
  const submitWithMetadata = (input: any, submitOptions?: any) => {
    // Add Nexus API key, server URL, sandbox ID, and opened file path to metadata for tool calls
    const metadata = {
      ...submitOptions?.metadata,
      ...(options.nexusApiKey && { x_auth: `Bearer ${options.nexusApiKey}` }),
      ...(options.nexusServerUrl && { nexus_server_url: options.nexusServerUrl }),
      ...(options.sandboxId && { sandbox_id: options.sandboxId }),
      ...(options.openedFilePath && { opened_file_path: options.openedFilePath }),
    };

    return stream.submit(input, {
      ...submitOptions,
      metadata,
    });
  };

  return {
    messages: stream.messages,
    isLoading: stream.isLoading,
    submit: submitWithMetadata,
    threadId: options.threadId || null, // Return what we passed in
    client: (stream as any).client, // Expose client for thread creation
  };
}
