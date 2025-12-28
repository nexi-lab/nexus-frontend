import type { Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';
import { useEffect, useState } from 'react';

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
  workspacePath?: string; // Selected workspace path
  maxSteps?: number; // Maximum number of steps for agent execution (recursion limit)
  key?: number; // Add key to force recreation
  onThreadIdChange?: (threadId: string) => void;
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
    workspacePath: options.workspacePath || 'NOT SET',
  });

  const [currentThreadId, setCurrentThreadId] = useState<string | null>(options.threadId ?? null);

  useEffect(() => {
    setCurrentThreadId(options.threadId ?? null);
  }, [options.threadId]);

  const handleThreadIdChange = (newThreadId: string) => {
    setCurrentThreadId(newThreadId);
    options.onThreadIdChange?.(newThreadId);
  };

  const stream = useTypedStream({
    apiUrl: options.apiUrl || '',
    apiKey: options.apiKey || undefined, // SDK handles auth internally
    assistantId: options.assistantId || '',
    ...(currentThreadId != null ? { threadId: currentThreadId } : {}),
    onThreadId: handleThreadIdChange,
    fetchStateHistory: false, // Don't fetch history to avoid errors
    // Don't add Nexus-specific headers - LangGraph server rejects them with 403
  });

  // Wrap submit to automatically add metadata
  const submitWithMetadata = (input: any, submitOptions?: any) => {
    // Add Nexus API key, server URL, sandbox ID, opened file path, and workspace path to metadata for tool calls
    // ALWAYS include agent's API key if provided (from agent config file)
    const metadata = {
      ...submitOptions?.metadata,
      // Always add x_auth if nexusApiKey is provided (from agent config or user's key)
      ...(options.nexusApiKey ? { x_auth: `Bearer ${options.nexusApiKey}` } : {}),
      ...(options.nexusServerUrl && { nexus_server_url: options.nexusServerUrl }),
      ...(options.sandboxId && { sandbox_id: options.sandboxId }),
      ...(options.openedFilePath && { opened_file_path: options.openedFilePath }),
      ...(options.workspacePath && { workspace_path: options.workspacePath }),
    };

    // Build config with recursion_limit (max steps) if specified
    // LangGraph SDK expects recursion_limit (snake_case) in the config object
    const config = {
      ...submitOptions?.config,
      ...(options.maxSteps && { recursion_limit: options.maxSteps }),
    };

    return stream.submit(input, {
      ...submitOptions,
      metadata,
      config,
    });
  };

  const getThreads = async (options: any) => {
    const threads = await stream.client.threads.search({
      offset: 0,
      limit: 1000,
      metadata: {
        ...options,
      },
    });
    return threads;
  };

  return {
    messages: stream.messages,
    isLoading: stream.isLoading,
    submit: submitWithMetadata,
    getThreads,
    threadId: currentThreadId,
    client: (stream as any).client, // Expose client for thread creation
  };
}
