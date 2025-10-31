export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  status?: 'sending' | 'sent' | 'error'
}

export interface ChatConfig {
  apiUrl?: string
  assistantId?: string
  apiKey?: string
}
