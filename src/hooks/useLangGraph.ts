import { useStream } from '@langchain/langgraph-sdk/react'
import type { Message } from '@langchain/langgraph-sdk'

interface UseLangGraphOptions {
  apiUrl?: string
  assistantId?: string
  apiKey?: string
  threadId?: string
  userId?: string
  tenantId?: string
  key?: number // Add key to force recreation
}

export type StateType = { messages: Message[] }

const useTypedStream = useStream<StateType>

export function useLangGraph(options: UseLangGraphOptions = {}) {
  const stream = useTypedStream({
    apiUrl: options.apiUrl || '',
    apiKey: options.apiKey || undefined,
    assistantId: options.assistantId || '',
    threadId: options.threadId, // Use provided thread ID
    fetchStateHistory: false, // Don't fetch history to avoid errors
    // Add defaultHeaders for HTTP-level authentication
    defaultHeaders: {
      ...(options.apiKey && { 'X-Api-Key': options.apiKey }),
      ...(options.userId && { 'X-User-Id': options.userId }),
      ...(options.tenantId && { 'X-Tenant-Id': options.tenantId }),
    },
  })

  // Wrap submit to automatically add metadata
  const submitWithMetadata = (
    input: any,
    submitOptions?: any
  ) => {
    const metadata = {
      ...(submitOptions?.metadata || {}),
      ...(options.apiKey && { x_auth: `Bearer ${options.apiKey}` }),
      ...(options.userId && { user_id: options.userId }),
      ...(options.tenantId && { tenant_id: options.tenantId }),
    }

    return stream.submit(input, {
      ...submitOptions,
      metadata,
    })
  }

  return {
    messages: stream.messages,
    isLoading: stream.isLoading,
    submit: submitWithMetadata,
    threadId: options.threadId || null, // Return what we passed in
    client: (stream as any).client, // Expose client for thread creation
  }
}
