import type { Message } from '@langchain/langgraph-sdk';
import { Bot, Box, ChevronDown, ChevronUp, History, Info, Loader2, Plus, Send, Settings, Wifi, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getUniqueId } from '@/utils';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { useRegisterAgent } from '../hooks/useFiles';
import { useLangGraph } from '../hooks/useLangGraph';
import type { ChatConfig } from '../types/chat';
import { AgentManagementDialog } from './AgentManagementDialog';
import { ConnectionManagementDialog } from './ConnectionManagementDialog';
import { ToolCalls } from './ToolCalls';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedAgentId?: string;
  openedFilePath?: string;
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
  selectedAgentId,
  filesAPI,
  userInfo: _userInfo,
}: {
  config: ChatConfig;
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

  console.log('[ChatPanelContent] Rendering with config:', {
    sandboxId: config.sandboxId,
    sandboxIdType: typeof config.sandboxId,
    sandboxIdIsTruthy: !!config.sandboxId,
    apiUrl: config.apiUrl,
    assistantId: config.assistantId,
  });

  const stream = useLangGraph(config);
  const messages = stream.messages || [];
  const isLoading = stream.isLoading;
  const threadId = stream.threadId;
  const chatStarted = messages.length > 0;

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
    stream.submit(
      {
        messages: [
          {
            type: 'human',
            content: messageContent,
          },
        ],
      },
      {
        metadata: {
          unique_id: getUniqueId(),
        },
      },
    );
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
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground min-w-[80px]">Sandbox ID:</span>
                <span className={`text-foreground ${config.sandboxId ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {config.sandboxId || 'not configured'}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground min-w-[80px]">Nexus:</span>
                <span className="text-foreground break-all">{config.nexusServerUrl || 'null'}</span>
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

export function ChatPanel({ isOpen, onClose, initialSelectedAgentId, openedFilePath }: ChatPanelProps) {
  const { apiKey, userInfo, apiClient, isAuthenticated } = useAuth();
  const filesAPI = createFilesAPI(apiClient);
  const registerAgentMutation = useRegisterAgent();

  const [config, setConfig] = useState<ChatConfig>({
    apiUrl: 'http://localhost:2024',
    assistantId: 'agent',
    apiKey: apiKey || '', // Will be LangGraph key for LangGraph agents
    nexusApiKey: apiKey || '', // Nexus API key for tool calls
    nexusServerUrl: import.meta.env.VITE_NEXUS_SERVER_URL || import.meta.env.VITE_API_URL || 'http://localhost:8080', // Nexus backend URL for LangGraph to connect
    sandboxId: undefined, // Sandbox ID for code execution
    threadId: undefined, // Start with no thread
    userId: userInfo?.subject_id || '',
    tenantId: userInfo?.tenant_id || '',
    openedFilePath: openedFilePath, // Currently opened file path
  });
  const [showConfig, setShowConfig] = useState(false);
  const [chatKey, setChatKey] = useState(0); // Key to force recreation

  // Agent management state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentManagementDialogOpen, setAgentManagementDialogOpen] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [sandboxDialogOpen, setSandboxDialogOpen] = useState(false);
  const stream = useLangGraph(config);

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

      // Check if agent has a sandbox (name matches agent_id)
      let sandboxId: string | undefined;
      try {
        const sandboxResponse = await apiClient.sandboxList({ verify_status: true, status: 'active' });
        console.log('[ChatPanel] All sandboxes from API:', {
          count: sandboxResponse.sandboxes.length,
          sandboxes: sandboxResponse.sandboxes.map((sb) => ({
            sandbox_id: sb.sandbox_id,
            name: sb.name,
            status: sb.status,
            provider: sb.provider,
          })),
          lookingForName: agentId,
        });

        const agentSandbox = sandboxResponse.sandboxes.find((sb) => sb.name === agentId);
        if (agentSandbox) {
          sandboxId = agentSandbox.sandbox_id;
          console.log('[ChatPanel] Found sandbox for agent:', {
            agentId,
            sandboxId,
            provider: agentSandbox.provider,
            status: agentSandbox.status,
            expiresAt: agentSandbox.expires_at,
          });

          // Store sandbox details in config
          const sandboxStatus = agentSandbox.status as 'running' | 'paused' | 'stopped' | 'unknown';
          const sandboxProvider = agentSandbox.provider;
          const sandboxExpiresAt = agentSandbox.expires_at ?? undefined;

          // Check if sandbox is expired
          if (sandboxExpiresAt) {
            const expiresAt = new Date(sandboxExpiresAt);
            const now = new Date();
            if (expiresAt <= now) {
              console.log('[ChatPanel] Sandbox has expired, marking as stopped');
              // Don't use expired sandbox
              sandboxId = undefined;
            } else {
              // Store sandbox info
              setConfig((prev) => ({
                ...prev,
                sandboxStatus,
                sandboxProvider,
                sandboxExpiresAt,
              }));
            }
          } else {
            // No expiration, store sandbox info
            setConfig((prev) => ({
              ...prev,
              sandboxStatus,
              sandboxProvider,
              sandboxExpiresAt,
            }));
          }
        } else {
          console.log('[ChatPanel] No sandbox found for agent:', agentId);
          console.log(
            '[ChatPanel] Available sandbox names:',
            sandboxResponse.sandboxes.map((sb) => sb.name),
          );
        }
      } catch (sandboxErr) {
        console.error('[ChatPanel] Failed to check for sandbox:', sandboxErr);
        // Continue without sandbox_id
      }

      // Update chat config based on agent platform
      if (agentConfig.platform === 'langgraph') {
        if (!agentConfig.endpoint_url) {
          console.error('LangGraph agent missing endpoint_url in config');
          return;
        }

        // For LangGraph: use endpoint_url and optional agent_id from YAML
        // API key: use config.yaml value if provided, otherwise use environment variable
        const langgraphApiKey = agentConfig.api_key || import.meta.env.VITE_LANGGRAPH_API_KEY || '';

        console.log('[ChatPanel] Setting config with sandboxId:', {
          sandboxId,
          sandboxIdType: typeof sandboxId,
          sandboxIdIsTruthy: !!sandboxId,
        });

        setConfig((prev) => {
          const newConfig = {
            ...prev,
            apiUrl: agentConfig.endpoint_url,
            assistantId: agentConfig.agent_id || 'agent', // LangGraph graph/assistant ID
            apiKey: langgraphApiKey, // LangGraph API key from config or environment
            sandboxId, // Add sandbox_id (undefined if expired)
          };
          console.log('[ChatPanel] New config after setConfig:', {
            sandboxId: newConfig.sandboxId,
            sandboxIdType: typeof newConfig.sandboxId,
          });
          return newConfig;
        });

        console.log('Configured LangGraph agent:', {
          apiUrl: agentConfig.endpoint_url,
          assistantId: agentConfig.agent_id || 'agent',
          apiKey: langgraphApiKey ? `${langgraphApiKey.substring(0, 10)}...` : 'not set',
          apiKeyLength: langgraphApiKey.length,
          apiKeySource: agentConfig.api_key ? 'config.yaml' : 'environment',
          envVarCheck: import.meta.env.VITE_LANGGRAPH_API_KEY ? 'set' : 'NOT SET',
          sandboxId: sandboxId || 'not set',
        });
      } else if (agentConfig.platform === 'nexus') {
        // Nexus agents - use default endpoint and full agent_id
        setConfig((prev) => ({
          ...prev,
          apiUrl: 'http://localhost:2024',
          assistantId: agentId, // Use full agent_id (<user_id>,<agent_name>)
          sandboxId, // Add sandbox_id
        }));
        console.log('Configured Nexus agent:', {
          apiUrl: 'http://localhost:2024',
          assistantId: agentId,
          sandboxId: sandboxId || 'not set',
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

  // Update config when opened file changes
  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      openedFilePath: openedFilePath,
    }));
  }, [openedFilePath]);

  // Poll sandbox status periodically if sandbox exists
  useEffect(() => {
    if (!config.sandboxId || !selectedAgentId) {
      return;
    }

    const checkSandboxStatus = async () => {
      try {
        const sandboxResponse = await apiClient.sandboxList({ verify_status: true, status: 'active' });
        const agentSandbox = sandboxResponse.sandboxes.find((sb) => sb.name === selectedAgentId);

        if (agentSandbox) {
          const sandboxStatus = agentSandbox.status as 'running' | 'paused' | 'stopped' | 'unknown';
          const sandboxExpiresAt = agentSandbox.expires_at;

          // Check if sandbox is expired
          if (sandboxExpiresAt) {
            const expiresAt = new Date(sandboxExpiresAt);
            const now = new Date();
            if (expiresAt <= now) {
              console.log('[ChatPanel] Sandbox has expired during polling');
              // Clear sandbox ID
              setConfig((prev) => ({
                ...prev,
                sandboxId: undefined,
                sandboxStatus: 'stopped',
              }));
              return;
            }
          }

          // Update status if changed
          if (config.sandboxStatus !== sandboxStatus) {
            console.log('[ChatPanel] Sandbox status updated:', {
              oldStatus: config.sandboxStatus,
              newStatus: sandboxStatus,
            });
            setConfig((prev) => ({
              ...prev,
              sandboxStatus,
            }));
          }
        } else {
          // Sandbox no longer exists
          console.log('[ChatPanel] Sandbox no longer exists');
          setConfig((prev) => ({
            ...prev,
            sandboxId: undefined,
            sandboxStatus: 'stopped',
          }));
        }
      } catch (err) {
        console.error('[ChatPanel] Failed to poll sandbox status:', err);
      }
    };

    // Poll every 30 seconds
    const intervalId = setInterval(checkSandboxStatus, 30000);

    // Cleanup on unmount or when sandbox ID changes
    return () => clearInterval(intervalId);
  }, [config.sandboxId, selectedAgentId, apiClient]);

  const handleNewChat = () => {
    console.log('New Chat clicked - current key:', chatKey);
    // Clear thread ID and increment key to force complete remount
    setConfig((prev) => ({ ...prev, threadId: undefined }));
    setChatKey((prev) => prev + 1);
  };

  const handlePauseSandbox = async () => {
    if (!config.sandboxId) return;

    try {
      await apiClient.sandboxPause(config.sandboxId);
      console.log('[ChatPanel] Sandbox paused:', config.sandboxId);

      // Update status immediately
      setConfig((prev) => ({ ...prev, sandboxStatus: 'paused' }));
    } catch (err) {
      console.error('[ChatPanel] Failed to pause sandbox:', err);
      alert('Failed to pause sandbox: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleResumeSandbox = async () => {
    if (!config.sandboxId) return;

    try {
      await apiClient.sandboxResume(config.sandboxId);
      console.log('[ChatPanel] Sandbox resumed:', config.sandboxId);

      // Update status immediately
      setConfig((prev) => ({ ...prev, sandboxStatus: 'running' }));
    } catch (err) {
      console.error('[ChatPanel] Failed to resume sandbox:', err);
      alert('Failed to resume sandbox: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleStopSandbox = async () => {
    if (!config.sandboxId) return;

    if (!confirm('Are you sure you want to stop this sandbox? You will need to create a new one to continue.')) {
      return;
    }

    try {
      await apiClient.sandboxStop(config.sandboxId);
      console.log('[ChatPanel] Sandbox stopped:', config.sandboxId);

      // Clear sandbox info
      setConfig((prev) => ({
        ...prev,
        sandboxId: undefined,
        sandboxStatus: 'stopped',
        sandboxProvider: undefined,
        sandboxExpiresAt: undefined,
      }));
    } catch (err) {
      console.error('[ChatPanel] Failed to stop sandbox:', err);
      alert('Failed to stop sandbox: ' + (err instanceof Error ? err.message : String(err)));
    }
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

  const onOpenHistory = () => {
    console.log('Open history clicked');
    stream.getThreads();
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Header with Agent Selector and Controls */}
      <div className="flex flex-col gap-3 p-4 border-b">
        {/* Title and Controls */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Chat Assistant</h2>
          <div className="flex gap-2">
            {/* Connection Status Indicator */}
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setConnectionDialogOpen(true)}
              title={isAuthenticated ? 'Connected to Nexus' : 'Not connected'}
            >
              {isAuthenticated ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
            </Button>
            {/* Sandbox Status Indicator */}
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setSandboxDialogOpen(true)}
              title={config.sandboxId ? `Sandbox: ${config.sandboxStatus || 'unknown'}` : 'No sandbox configured'}
            >
              {config.sandboxId ? (
                config.sandboxStatus === 'running' ? (
                  <Box className="h-4 w-4 text-green-500" />
                ) : config.sandboxStatus === 'paused' ? (
                  <Box className="h-4 w-4 text-yellow-500" />
                ) : config.sandboxStatus === 'stopped' ? (
                  <Box className="h-4 w-4 text-red-500" />
                ) : (
                  <Box className="h-4 w-4 text-blue-500" />
                )
              ) : (
                <Box className="h-4 w-4 text-gray-400" />
              )}
            </Button>
            <Button variant="ghost" size="icon" type="button" onClick={onOpenHistory}>
              <History className="h-4 w-4" />
            </Button>
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
        onOpenChange={(open) => {
          setAgentManagementDialogOpen(open);
          // Reload agent config when dialog closes to pick up any sandbox changes
          if (!open && selectedAgentId) {
            handleAgentSelect(selectedAgentId);
          }
        }}
        onRegisterAgent={handleRegisterAgent}
        onAgentSelect={handleAgentSelect}
      />

      {/* Connection Management Dialog */}
      <ConnectionManagementDialog open={connectionDialogOpen} onOpenChange={setConnectionDialogOpen} />

      {/* Sandbox Status Dialog */}
      <Dialog open={sandboxDialogOpen} onOpenChange={setSandboxDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sandbox Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <span
                  className={`text-sm font-semibold ${
                    config.sandboxStatus === 'running'
                      ? 'text-green-600 dark:text-green-400'
                      : config.sandboxStatus === 'paused'
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : config.sandboxStatus === 'stopped'
                          ? 'text-red-600 dark:text-red-400'
                          : config.sandboxId
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {config.sandboxStatus
                    ? config.sandboxStatus.charAt(0).toUpperCase() + config.sandboxStatus.slice(1)
                    : config.sandboxId
                      ? 'Unknown'
                      : 'Not Configured'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm font-medium">Sandbox ID:</span>
                <span className="text-sm text-muted-foreground font-mono break-all text-right max-w-[200px]">{config.sandboxId || 'None'}</span>
              </div>
              {config.sandboxId && (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-sm font-medium">Provider:</span>
                    <span className="text-sm text-muted-foreground">{config.sandboxProvider || 'Auto-selected'}</span>
                  </div>
                  {config.sandboxExpiresAt && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-sm font-medium">Expires:</span>
                      <span className="text-sm text-muted-foreground">{new Date(config.sandboxExpiresAt).toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            {!config.sandboxId && (
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                To use a sandbox, click the "Start Sandbox" button in the Agent Management dialog.
              </div>
            )}
            {config.sandboxId && config.sandboxStatus === 'stopped' && (
              <div className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md">
                This sandbox has been stopped. Restart it from the Agent Management dialog.
              </div>
            )}
            {config.sandboxId && config.sandboxStatus === 'paused' && (
              <div className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md">
                This sandbox is paused. Resume it to continue using it.
              </div>
            )}
          </div>
          {config.sandboxId && (
            <DialogFooter className="flex gap-2">
              {config.sandboxStatus === 'running' && (
                <Button variant="outline" onClick={handlePauseSandbox}>
                  Pause Sandbox
                </Button>
              )}
              {config.sandboxStatus === 'paused' && (
                <Button variant="outline" onClick={handleResumeSandbox}>
                  Resume Sandbox
                </Button>
              )}
              {(config.sandboxStatus === 'running' || config.sandboxStatus === 'paused') && (
                <Button variant="destructive" onClick={handleStopSandbox}>
                  Stop Sandbox
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Chat Configuration Dialog */}
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
              <Input placeholder="agent" value={config.assistantId || ''} onChange={(e) => setConfig((prev) => ({ ...prev, assistantId: e.target.value }))} />
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
              <Input placeholder="tenant-123" value={config.tenantId || ''} onChange={(e) => setConfig((prev) => ({ ...prev, tenantId: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Tenant/organization identifier</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat Content - key forces complete remount */}
      {selectedAgentId ? (
        <ChatPanelContent key={chatKey} config={config} selectedAgentId={selectedAgentId} filesAPI={filesAPI} userInfo={userInfo} />
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
