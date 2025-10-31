import { useStream } from '@langchain/langgraph-sdk/react'
import type { Message } from '@langchain/langgraph-sdk'

interface UseLangGraphOptions {
  apiUrl?: string
  assistantId?: string
  apiKey?: string
  key?: number // Add key to force recreation
}

export type StateType = { messages: Message[] }

const useTypedStream = useStream<StateType>

export function useLangGraph(options: UseLangGraphOptions = {}) {
  const stream = useTypedStream({
    apiUrl: options.apiUrl || '',
    apiKey: options.apiKey || undefined,
    assistantId: options.assistantId || '',
    // Don't set threadId - let SDK manage it automatically
    // It will create a new thread on first submit and reuse it
    fetchStateHistory: false, // Don't fetch history to avoid errors
  })

  return {
    messages: stream.messages,
    isLoading: stream.isLoading,
    submit: stream.submit,
  }
}
