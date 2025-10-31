import { useStream } from '@langchain/langgraph-sdk/react'
import type { Message } from '@langchain/langgraph-sdk'

interface UseLangGraphOptions {
  apiUrl?: string
  assistantId?: string
  apiKey?: string
  threadId?: string
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
  })

  return {
    messages: stream.messages,
    isLoading: stream.isLoading,
    submit: stream.submit,
    threadId: options.threadId || null, // Return what we passed in
    client: (stream as any).client, // Expose client for thread creation
  }
}
