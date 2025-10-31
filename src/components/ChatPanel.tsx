import { useState, useRef, useEffect } from 'react'
import { Send, Settings, X, Loader2, Plus } from 'lucide-react'
import { Button } from './ui/button'
import type { ChatConfig } from '../types/chat'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Input } from './ui/input'
import { useLangGraph } from '../hooks/useLangGraph'
import type { Message } from '@langchain/langgraph-sdk'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ToolCalls } from './ToolCalls'

interface ChatPanelProps {
  isOpen: boolean
  onClose: () => void
}

function getContentString(content: Message['content']): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((c: any) => {
        if (typeof c === 'string') return c
        if (c.type === 'text') return c.text || ''
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function MessageBubble({ message, allMessages }: { message: Message; allMessages: Message[] }) {
  const isUser = message.type === 'human'
  const content = getContentString(message.content)
  const aiMessage = message as any
  const hasToolCalls = !isUser && aiMessage.tool_calls && aiMessage.tool_calls.length > 0
  const isToolResult = message.type === 'tool'

  // Don't render tool result messages separately - they're shown in tool calls
  if (isToolResult) return null

  // Don't render if no content and no tool calls
  if (!content && !hasToolCalls) return null

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-blue-500' : 'bg-purple-500'
      }`}>
        {isUser ? (
          <span className="text-white text-xs">U</span>
        ) : (
          <span className="text-white text-xs">AI</span>
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        {content && (
          <div className={`rounded-lg p-3 ${
            isUser
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800'
          }`}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{content}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Tool Calls */}
        {hasToolCalls && (
          <ToolCalls toolCalls={aiMessage.tool_calls} messages={allMessages} />
        )}
      </div>
    </div>
  )
}

function ChatPanelContent({ config }: { config: ChatConfig }) {
  const [inputValue, setInputValue] = useState('')
  const [firstTokenReceived, setFirstTokenReceived] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevMessageLength = useRef(0)

  const stream = useLangGraph(config)
  const messages = stream.messages || []
  const isLoading = stream.isLoading

  // Track when first token is received
  useEffect(() => {
    if (messages.length !== prevMessageLength.current && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage.type === 'ai') {
        setFirstTokenReceived(true)
      }
    }
    prevMessageLength.current = messages.length
  }, [messages])

  // Reset firstTokenReceived when starting a new message
  useEffect(() => {
    if (isLoading && !firstTokenReceived) {
      // Still waiting for first token
    } else if (!isLoading) {
      setFirstTokenReceived(false)
    }
  }, [isLoading, firstTokenReceived])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-focus input on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  const handleSendMessage = () => {
    if (!inputValue.trim() || isLoading) return

    const messageContent = inputValue.trim()
    setInputValue('')

    // Submit message using LangGraph SDK
    stream.submit({
      messages: [
        {
          type: 'human',
          content: messageContent
        }
      ]
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const chatStarted = messages.length > 0

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {!chatStarted && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p className="text-lg mb-2">Welcome to NexusFS Chat!</p>
              <p className="text-sm">Ask me anything about your files or data.</p>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} allMessages={messages} />
        ))}
        {isLoading && !firstTokenReceived && (
          <div className="flex gap-3 mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-purple-500">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            </div>
            <div className="flex-1">
              <div className="rounded-lg p-3 bg-gray-100 dark:bg-gray-800">
                <p className="text-muted-foreground">Thinking...</p>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            className="flex-1 min-h-[60px] max-h-[200px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  )
}

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [config, setConfig] = useState<ChatConfig>({
    apiUrl: 'http://localhost:2024',
    assistantId: 'agent',
    apiKey: ''
  })
  const [showConfig, setShowConfig] = useState(false)
  const [chatKey, setChatKey] = useState(0) // Key to force recreation

  const handleNewChat = () => {
    console.log('New Chat clicked - current key:', chatKey)
    // Increment key to force complete remount of ChatPanelContent
    setChatKey(prev => {
      const newKey = prev + 1
      console.log('New chat key:', newKey)
      return newKey
    })
  }

  if (!isOpen) return null

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Header with New Chat button */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Chat Assistant</h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={handleNewChat}
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Dialog open={showConfig} onOpenChange={setShowConfig}>
            <DialogTrigger>
              <Button variant="ghost" size="icon" type="button" onClick={() => setShowConfig(true)}>
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Chat Configuration</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">API URL</label>
                  <Input
                    placeholder="http://localhost:2024"
                    value={config.apiUrl || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your LangGraph server URL
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assistant ID</label>
                  <Input
                    placeholder="agent"
                    value={config.assistantId || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, assistantId: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    The graph/assistant ID to use
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key (optional)</label>
                  <Input
                    type="password"
                    placeholder="sk-..."
                    value={config.apiKey || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank if not required
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="icon" type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Chat Content - key forces complete remount */}
      <ChatPanelContent key={chatKey} config={config} />
    </div>
  )
}
