import type { Message } from '@langchain/langgraph-sdk';
import { Bot, ChevronDown, ChevronUp, Info, Loader2, Plus, Send, Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { useRegisterAgent } from '../hooks/useFiles';
import { useLangGraph } from '../hooks/useLangGraph';
import type { ChatConfig } from '../types/chat';
import { AgentManagementDialog } from './AgentManagementDialog';
import { ToolCalls } from './ToolCalls';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedAgentId?: string;
}

interface Agent {
  agent_id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface AgentConfig {
  platform: string;
  endpoint_url?: string;
  agent_id?: string;
  api_key?: string;
  system_prompt?: string;
  tools?: string[];
}

function getContentString(content: Message['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((c: any) => {
        if (typeof c === 'string') return c;
        if (c.type === 'text') return c.text || '';
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function MessageBubble({ message, allMessages }: { message: Message; allMessages: Message[] }) {
  const isUser = message.type === 'human';
  const content = getContentString(message.content);
  const aiMessage = message as any;
  const hasToolCalls = !isUser && aiMessage.tool_calls && aiMessage.tool_calls.length > 0;
  const isToolResult = message.type === 'tool';

  // Don't render tool result messages separately - they're shown in tool calls
  if (isToolResult) return null;

  // Don't render if no content and no tool calls
  if (!content && !hasToolCalls) return null;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-500' : 'bg-purple-500'}`}>
        {isUser ? <span className="text-white text-xs">U</span> : <span className="text-white text-xs">AI</span>}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        {content && (
          <div className={`rounded-lg p-3 ${isUser ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{content}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Tool Calls */}
        {hasToolCalls && <ToolCalls toolCalls={aiMessage.tool_calls} messages={allMessages} />}
      </div>
    </div>
  );
}

function ChatPanelContent({
  config,
  onThreadCreated,
  selectedAgentId,
  filesAPI,
  userInfo: _userInfo,
}: {
  config: ChatConfig;
  onThreadCreated: (threadId: string) => void;
  selectedAgentId: string;
  filesAPI: any;
  userInfo: any;
}) {
  const [inputValue, setInputValue] = useState('');
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [metadataCreated, setMetadataCreated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessageLength = useRef(0);

  const stream = useLangGraph(config);
  const messages = stream.messages || [];
  const isLoading = stream.isLoading;
  const threadId = stream.threadId;
  const chatStarted = messages.length > 0;

  // Create thread when component mounts (if no thread ID exists)
  useEffect(() => {
    async function createThread() {
      // Only create thread if agent is selected and no thread exists
      if (!config.threadId && stream.client && selectedAgentId) {
        try {
          const thread = await stream.client.threads.create();
          console.log('Created thread:', thread);
          onThreadCreated(thread.thread_id);
          setMetadataCreated(false); // Reset metadata flag for new thread
        } catch (error) {
          console.error('Failed to create thread:', error);
        }
      }
    }
    createThread();
  }, [config.threadId, stream.client, onThreadCreated, selectedAgentId]);

  // Reset metadata flag when thread changes
  useEffect(() => {
    setMetadataCreated(false);
  }, [threadId]);

  // Track when first token is received
  useEffect(() => {
    if (messages.length !== prevMessageLength.current && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.type === 'ai') {
        setFirstTokenReceived(true);
      }
    }
    prevMessageLength.current = messages.length;
  }, [messages]);

  // Reset firstTokenReceived when starting a new message
  useEffect(() => {
    if (isLoading && !firstTokenReceived) {
      // Still waiting for first token
    } else if (!isLoading) {
      setFirstTokenReceived(false);
    }
  }, [isLoading, firstTokenReceived]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Create thread metadata when first message is sent
  const createThreadMetadata = async (threadId: string, firstMessage: string) => {
    if (!selectedAgentId || !threadId) return;

    try {
      const [userId, agentName] = selectedAgentId.split(',');
      if (!userId || !agentName) return;

      // Ensure the threads directory exists
      const threadsDir = `/agent/${userId}/${agentName}/threads`;
      const threadDir = `${threadsDir}/${threadId}`;

      try {
        await filesAPI.mkdir(threadDir, { parents: true, exist_ok: true });
      } catch (mkdirError) {
        console.error('Failed to create thread directory:', mkdirError);
        // Continue anyway, maybe it already exists
      }

      const metadataPath = `${threadDir}/.metadata`;

      // Extract first 5 words for title
      const words = firstMessage.trim().split(/\s+/);
      const title = words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '');

      // Create metadata JSON
      const metadata = {
        created_time: new Date().toISOString(),
        title: title,
      };

      const encoder = new TextEncoder();
      const metadataBuffer = encoder.encode(JSON.stringify(metadata, null, 2)).buffer;
      await filesAPI.write(metadataPath, metadataBuffer);

      setMetadataCreated(true);
      console.log('Thread metadata created:', metadataPath, metadata);
    } catch (error) {
      console.error('Failed to create thread metadata:', error);
      // Don't fail the message send if metadata creation fails
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const messageContent = inputValue.trim();
    setInputValue('');

    // Create metadata on first message
    if (!metadataCreated && threadId) {
      await createThreadMetadata(threadId, messageContent);
    }

    // Submit message using LangGraph SDK
    stream.submit({
      messages: [
        {
          type: 'human',
          content: messageContent,
        },
      ],
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Connection Info Panel */}
      {chatStarted && (
        <div className="border-b bg-muted/30">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
            type="button"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              <span>Connection Info</span>
            </div>
            {showInfo ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {showInfo && (
            <div className="px-4 pb-3 space-y-2 text-xs font-mono">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground min-w-[80px]">LangGraph:</span>
                <span className="text-foreground break-all">{config.apiUrl || 'null'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground min-w-[80px]">Agent ID:</span>
                <span className="text-foreground">{config.assistantId || 'null'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground min-w-[80px]">Thread ID:</span>
                <span className="text-foreground break-all">{threadId || 'null'}</span>
              </div>
            </div>
          )}
        </div>
      )}

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
          <Button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading} size="icon" className="self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

export function ChatPanel({ isOpen, onClose, initialSelectedAgentId }: ChatPanelProps) {
  const { apiKey, userInfo, apiClient } = useAuth();
  const filesAPI = createFilesAPI(apiClient);
  const registerAgentMutation = useRegisterAgent();

  const [config, setConfig] = useState<ChatConfig>({
    apiUrl: 'http://localhost:2024',
    assistantId: 'agent',
    apiKey: apiKey || '', // Will be LangGraph key for LangGraph agents
    nexusApiKey: apiKey || '', // Nexus API key for tool calls
    nexusServerUrl: import.meta.env.VITE_API_URL || 'http://localhost:8080', // Nexus backend URL
    threadId: undefined, // Start with no thread
    userId: userInfo?.subject_id || '',
    tenantId: userInfo?.tenant_id || '',
  });
  const [showConfig, setShowConfig] = useState(false);
  const [chatKey, setChatKey] = useState(0); // Key to force recreation

  // Agent management state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentManagementDialogOpen, setAgentManagementDialogOpen] = useState(false);

  // Load agents when panel opens
  useEffect(() => {
    if (isOpen) {
      loadAgents();
    }
  }, [isOpen]);

  // Select agent when initialSelectedAgentId is provided
  useEffect(() => {
    if (initialSelectedAgentId && agents.length > 0) {
      handleAgentSelect(initialSelectedAgentId);
    }
  }, [initialSelectedAgentId, agents]);

  const loadAgents = async () => {
    setLoadingAgents(true);
    try {
      const agentList = await apiClient.listAgents();

      // Filter to only show agents owned by current user
      const userId = userInfo?.user || userInfo?.subject_id;
      const userAgents = userId ? agentList.filter((agent) => agent.user_id === userId) : agentList;

      setAgents(userAgents);

      // Auto-select first agent if available
      if (userAgents.length > 0 && !selectedAgentId) {
        handleAgentSelect(userAgents[0].agent_id);
      }
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoadingAgents(false);
    }
  };

  // Load agent configuration when selected
  const handleAgentSelect = async (agentId: string) => {
    if (!agentId) {
      setSelectedAgentId('');
      return;
    }

    try {
      // Parse agent_id to get path: /agent/<user_id>/<agent_name>
      // agent_id format: <user_id>,<agent_name>
      // folder path: /agent/<user_id>/<agent_name>
      const [userId, agentName] = agentId.split(',');
      if (!userId || !agentName) {
        console.error('Invalid agent_id format:', agentId);
        return;
      }

      const configPath = `/agent/${userId}/${agentName}/config.yaml`;

      // Read YAML config
      const yamlContent = await filesAPI.read(configPath);
      const yamlText = new TextDecoder().decode(yamlContent as Uint8Array);

      // Parse YAML (simple parsing - production should use a YAML library)
      const agentConfig = parseSimpleYaml(yamlText);
      console.log('Loaded agent config:', { agentId, platform: agentConfig.platform, config: agentConfig });

      // Update chat config based on agent platform
      if (agentConfig.platform === 'langgraph') {
        if (!agentConfig.endpoint_url) {
          console.error('LangGraph agent missing endpoint_url in config');
          return;
        }

        // For LangGraph: use endpoint_url and optional agent_id from YAML
        // API key: use config.yaml value if provided, otherwise use environment variable
        const langgraphApiKey = agentConfig.api_key || import.meta.env.VITE_LANGGRAPH_API_KEY || '';
        setConfig((prev) => ({
          ...prev,
          apiUrl: agentConfig.endpoint_url,
          assistantId: agentConfig.agent_id || 'agent', // LangGraph graph/assistant ID
          apiKey: langgraphApiKey, // LangGraph API key from config or environment
        }));
        console.log('Configured LangGraph agent:', {
          apiUrl: agentConfig.endpoint_url,
          assistantId: agentConfig.agent_id || 'agent',
          apiKey: langgraphApiKey ? `${langgraphApiKey.substring(0, 10)}...` : 'not set',
          apiKeyLength: langgraphApiKey.length,
          apiKeySource: agentConfig.api_key ? 'config.yaml' : 'environment',
          envVarCheck: import.meta.env.VITE_LANGGRAPH_API_KEY ? 'set' : 'NOT SET',
        });
      } else if (agentConfig.platform === 'nexus') {
        // Nexus agents - use default endpoint and full agent_id
        setConfig((prev) => ({
          ...prev,
          apiUrl: 'http://localhost:2024',
          assistantId: agentId, // Use full agent_id (<user_id>,<agent_name>)
        }));
        console.log('Configured Nexus agent:', {
          apiUrl: 'http://localhost:2024',
          assistantId: agentId,
        });
      }

      // Only set selectedAgentId AFTER config is successfully loaded
      setSelectedAgentId(agentId);
    } catch (err) {
      console.error('Failed to load agent config:', err);
      // Don't set selectedAgentId if config loading failed
    }
  };

  // Simple YAML parser for our config format
  const parseSimpleYaml = (yaml: string): AgentConfig => {
    const config: AgentConfig = { platform: 'nexus' };
    const lines = yaml.split('\n');

    for (const line of lines) {
      if (line.startsWith('platform:')) {
        const parts = line.split(':');
        config.platform = parts.slice(1).join(':').trim();
      } else if (line.startsWith('endpoint_url:')) {
        // Handle URLs which contain colons (e.g., http://localhost:2024)
        const parts = line.split(':');
        config.endpoint_url = parts.slice(1).join(':').trim();
      } else if (line.startsWith('agent_id:')) {
        const parts = line.split(':');
        config.agent_id = parts.slice(1).join(':').trim();
      } else if (line.startsWith('api_key:')) {
        const parts = line.split(':');
        config.api_key = parts.slice(1).join(':').trim();
      }
    }

    return config;
  };

  // Update config when auth changes
  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      nexusApiKey: apiKey || prev.nexusApiKey, // Update Nexus key only
      userId: userInfo?.subject_id || prev.userId,
      tenantId: userInfo?.tenant_id || prev.tenantId,
    }));
  }, [apiKey, userInfo]);

  const handleThreadCreated = (threadId: string) => {
    console.log('Thread created with ID:', threadId);
    setConfig((prev) => ({ ...prev, threadId }));
  };

  const handleNewChat = () => {
    console.log('New Chat clicked - current key:', chatKey);
    // Clear thread ID and increment key to force complete remount
    setConfig((prev) => ({ ...prev, threadId: undefined }));
    setChatKey((prev) => prev + 1);
  };

  const handleRegisterAgent = async (
    agentId: string,
    name: string,
    description: string,
    generateApiKey: boolean,
    config: {
      platform: string;
      endpoint_url: string;
      agent_id?: string;
      system_prompt: string;
      tools: string[];
    },
  ) => {
    const result = await registerAgentMutation.mutateAsync({
      agentId,
      name,
      description: description || undefined,
      generateApiKey,
      config,
    });
    // Reload agents after registration
    await loadAgents();
    return result;
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Header with Agent Selector and Controls */}
      <div className="flex flex-col gap-3 p-4 border-b">
        {/* Title and Settings */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Chat Assistant</h2>
          <div className="flex gap-2">
            <Dialog open={showConfig} onOpenChange={setShowConfig}>
              <DialogTrigger>
                <Button variant="ghost" size="icon" type="button">
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
                      onChange={(e) => setConfig((prev) => ({ ...prev, apiUrl: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Your LangGraph server URL</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Assistant ID</label>
                    <Input
                      placeholder="agent"
                      value={config.assistantId || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, assistantId: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">The graph/assistant ID to use</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key (optional)</label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={config.apiKey || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Leave blank if not required</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">User ID (optional)</label>
                    <Input placeholder="user-123" value={config.userId || ''} onChange={(e) => setConfig((prev) => ({ ...prev, userId: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">User identifier for authentication</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tenant ID (optional)</label>
                    <Input
                      placeholder="tenant-123"
                      value={config.tenantId || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, tenantId: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Tenant/organization identifier</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="ghost" size="icon" type="button" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Agent Selector and New Chat */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            {agents.length === 0 && !loadingAgents ? (
              <button
                onClick={() => setAgentManagementDialogOpen(true)}
                className="flex items-center gap-2 p-2 border rounded-md bg-muted/20 hover:bg-muted/40 transition-colors w-full cursor-pointer"
                type="button"
              >
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No agents - Register one to start</span>
              </button>
            ) : (
              <Select value={selectedAgentId} onValueChange={handleAgentSelect} disabled={loadingAgents}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingAgents ? 'Loading agents...' : 'Select an agent'}>
                    {selectedAgentId ? (
                      <div className="flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5" />
                        <span className="truncate">{selectedAgentId.split(',')[1] || selectedAgentId}</span>
                      </div>
                    ) : (
                      'Select an agent'
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => {
                    const agentName = agent.agent_id.split(',')[1] || agent.agent_id;
                    return (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        <div className="flex items-center gap-2">
                          <Bot className="h-3.5 w-3.5" />
                          <span>{agentName}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button variant="outline" size="sm" type="button" onClick={handleNewChat} title="New Chat">
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
      </div>

      {/* Agent Management Dialog */}
      <AgentManagementDialog
        open={agentManagementDialogOpen}
        onOpenChange={setAgentManagementDialogOpen}
        onRegisterAgent={handleRegisterAgent}
        onAgentSelect={handleAgentSelect}
      />

      {/* Chat Content - key forces complete remount */}
      {selectedAgentId ? (
        <ChatPanelContent
          key={chatKey}
          config={config}
          onThreadCreated={handleThreadCreated}
          selectedAgentId={selectedAgentId}
          filesAPI={filesAPI}
          userInfo={userInfo}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-muted-foreground">
            {loadingAgents ? (
              <>
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                <p>Loading agents...</p>
              </>
            ) : (
              <>
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Please select an agent to start chatting</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
