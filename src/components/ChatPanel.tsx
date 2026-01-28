import type { Message, Thread } from '@langchain/langgraph-sdk';
import { Bot, Box, ChevronDown, ChevronRight, ChevronUp, Folder, History, Info, Loader2, Plus, Send, Settings, Square, Wifi, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { useRegisterAgent } from '../hooks/useFiles';
import { useLangGraph } from '../hooks/useLangGraph';
import type { ChatConfig } from '../types/chat';
import { AgentManagementDialog } from './AgentManagementDialog';
import { ConnectionManagementDialog } from './ConnectionManagementDialog';
import ThreadsHistoryPanel from './ThreadsHistoryPanel';
import { ToolCalls } from './ToolCalls';
import { WorkspaceManagementDialog } from './WorkspaceManagementDialog';
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
  has_api_key?: boolean;
  inherit_permissions?: boolean;
}

interface Workspace {
  path: string;
  name: string | null;
  description: string;
  created_at: string;
  created_by: string | null;
  metadata: Record<string, any>;
}

interface AgentConfig {
  platform: string;
  endpoint_url?: string;
  agent_id?: string;
  api_key?: string;
  system_prompt?: string;
  tools?: string[];
}

function parseContent(content: Message['content']): { text: string; thinkingBlocks: string[] } {
  const thinkingBlocks: string[] = [];
  const textParts: string[] = [];

  if (typeof content === 'string') {
    return { text: content, thinkingBlocks: [] };
  }
  if (Array.isArray(content)) {
    content.forEach((c: any) => {
      if (typeof c === 'string') {
        textParts.push(c);
      } else if (c.type === 'thinking' && c.thinking) {
        thinkingBlocks.push(c.thinking);
      } else if (c.type === 'text' && c.text) {
        textParts.push(c.text);
      }
    });
  }
  return { text: textParts.filter(Boolean).join('\n'), thinkingBlocks };
}

// Collapsible thinking block component
function ThinkingBlock({ thinking }: { thinking: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
        type="button"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span className="font-medium">Extended Thinking</span>
      </button>
      {isExpanded && (
        <div className="mt-2 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md">
          <div className="text-sm text-purple-900 dark:text-purple-100 whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-[400px] overflow-y-auto">
            {thinking}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, allMessages }: { message: Message; allMessages: Message[] }) {
  const isUser = message.type === 'human';
  const { text: content, thinkingBlocks } = parseContent(message.content);
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
        {/* Thinking Blocks - show before content for AI messages */}
        {!isUser && thinkingBlocks.length > 0 && (
          <div className="w-full">
            {thinkingBlocks.map((thinking, index) => (
              <ThinkingBlock key={index} thinking={thinking} />
            ))}
          </div>
        )}
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

        {/* Tool Calls - full width, break out of max-w constraint */}
        {hasToolCalls && (
          <div className="w-full max-w-none -mx-4 px-4">
            <ToolCalls toolCalls={aiMessage.tool_calls} messages={allMessages} />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPanelContent({
  config,
  selectedAgentId,
  filesAPI,
  userInfo: _userInfo,
  onThreadIdChange,
  onConfigChange,
}: {
  config: ChatConfig;
  selectedAgentId: string;
  filesAPI: any;
  userInfo: any;
  onThreadIdChange?: (threadId: string) => void;
  onConfigChange?: (config: ChatConfig | ((prev: ChatConfig) => ChatConfig)) => void;
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

  const stream = useLangGraph({ ...config, onThreadIdChange });
  const messages = stream.messages || [];
  const isLoading = stream.isLoading;
  const isStopped = stream.isStopped || false;
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
      // Use new namespace convention for threads directory
      const tenantId = _userInfo?.tenant_id || 'default';
      const threadsDir = `/tenant:${tenantId}/user:${userId}/agent/${agentName}/threads`;
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

  const handleStopStreaming = () => {
    if (stream.stop) {
      stream.stop();
      console.log('[ChatPanel] Streaming stopped');
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
          user_id: _userInfo.user,
          selectedAgentId,
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

      {/* Model Selector Panel */}
      <div className="border-t px-4 py-2 bg-muted/20">
        <div className="flex flex-wrap items-center gap-4">
          {/* Provider Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Provider:</span>
            <div className="flex gap-1">
              <Button
                variant={config.llmProvider === 'gemini' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onConfigChange?.((prev) => ({ ...prev, llmProvider: 'gemini' }))}
                className="h-7 px-3 text-xs"
              >
                Gemini
              </Button>
              <Button
                variant={config.llmProvider === 'anthropic' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onConfigChange?.((prev) => ({ ...prev, llmProvider: 'anthropic' }))}
                className="h-7 px-3 text-xs"
              >
                Claude
              </Button>
              <Button
                variant={config.llmProvider === 'openai' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onConfigChange?.((prev) => ({ ...prev, llmProvider: 'openai' }))}
                className="h-7 px-3 text-xs"
              >
                GPT
              </Button>
            </div>
          </div>

          {/* Tier Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Tier:</span>
            <div className="flex gap-1">
              <Button
                variant={config.llmTier === 'flash' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onConfigChange?.((prev) => ({ ...prev, llmTier: 'flash' }))}
                className="h-7 px-3 text-xs"
              >
                Flash
              </Button>
              <Button
                variant={config.llmTier === 'pro' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onConfigChange?.((prev) => ({ ...prev, llmTier: 'pro' }))}
                className="h-7 px-3 text-xs"
              >
                Pro
              </Button>
            </div>
          </div>

          {/* Extended Thinking Toggle */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableThinking ?? true}
                onChange={(e) => onConfigChange?.((prev) => ({ ...prev, enableThinking: e.target.checked }))}
                className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
              />
              <span className="text-xs text-muted-foreground">Extended Thinking</span>
            </label>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="border-t p-4">
        {isStopped && (
          <div className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200">
              <Info className="h-4 w-4" />
              <span>Streaming was stopped. You can continue the conversation from here.</span>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStopped ? "Continue the conversation... (Shift+Enter for new line)" : "Type your message... (Shift+Enter for new line)"}
            className="flex-1 min-h-[60px] max-h-[200px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
          />
          {isLoading ? (
            <Button onClick={handleStopStreaming} size="icon" className="self-end" variant="destructive" title="Stop streaming">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading} size="icon" className="self-end">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export function ChatPanel({ isOpen, onClose, initialSelectedAgentId, openedFilePath }: ChatPanelProps) {
  const { apiKey, apiUrl, userInfo, apiClient, userAccount } = useAuth();
  // User's personal API key: prefer userAccount.api_key (OAuth users), fallback to apiKey (direct API key auth)
  const userPersonalApiKey = userAccount?.api_key || apiKey || '';
  // filesAPI always uses user's API key from AuthContext (not agent's key)
  const filesAPI = apiClient ? createFilesAPI(apiClient) : null;
  const registerAgentMutation = useRegisterAgent();

  // Get Nexus server URL from context, env - required, no default
  // Always use the user-selected backend URL (do not hardcode a default backend in production)
  const nexusServerUrl = apiUrl || null;

  const [config, setConfig] = useState<ChatConfig>({
    apiUrl: 'http://localhost:2024',
    assistantId: 'agent',
    apiKey: apiKey || '', // Will be LangGraph key for LangGraph agents
    nexusApiKey: apiKey || '', // Nexus API key for tool calls
    nexusServerUrl: nexusServerUrl || '', // Nexus backend URL for LangGraph to connect (required, no default)
    sandboxId: undefined, // Sandbox ID for code execution
    threadId: undefined, // Start with no thread
    userId: userInfo?.subject_id || '',
    tenantId: userInfo?.tenant_id || '',
    openedFilePath: openedFilePath, // Currently opened file path
    maxSteps: 100, // Default maximum steps for agent execution
    // Model selection defaults
    llmProvider: 'gemini',
    llmTier: 'flash',
    enableThinking: true,
  });

  const [showConfig, setShowConfig] = useState(false);
  const [chatKey, setChatKey] = useState(0); // Key to force recreation

  // Agent management state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedAgentApiKey, setSelectedAgentApiKey] = useState<string>(''); // Agent's API key from backend config
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentManagementDialogOpen, setAgentManagementDialogOpen] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [agentConnectionStatus, setAgentConnectionStatus] = useState<'connected' | 'disconnected' | 'checking' | null>(null);
  const [sandboxDialogOpen, setSandboxDialogOpen] = useState(false);
  const [isOpenHistory, setIsOpenHistory] = useState(false);
  const [sandboxConnecting, setSandboxConnecting] = useState(false);
  const [sandboxConnectStatus, setSandboxConnectStatus] = useState<string>('');

  // Workspace management state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string>('');
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceManagementDialogOpen, setWorkspaceManagementDialogOpen] = useState(false);

  // Load agents and workspaces when panel opens
  useEffect(() => {
    if (isOpen) {
      loadAgents();
      loadWorkspaces();
    }
  }, [isOpen]);

  // Select agent when initialSelectedAgentId is provided
  useEffect(() => {
    if (initialSelectedAgentId && agents.length > 0) {
      handleAgentSelect(initialSelectedAgentId);
    }
  }, [initialSelectedAgentId, agents]);

  // Auto-select workspace based on smart default logic
  useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspacePath) {
      // Try to load last-used workspace from localStorage
      const lastUsedWorkspace = localStorage.getItem('chat_last_used_workspace');

      if (lastUsedWorkspace && workspaces.some(ws => ws.path === lastUsedWorkspace)) {
        // Use last-used workspace if it still exists
        handleWorkspaceSelect(lastUsedWorkspace);
      } else if (workspaces.length === 1) {
        // Auto-select if only one workspace
        handleWorkspaceSelect(workspaces[0].path);
      }
      // Otherwise, leave empty and show prompt
    }
  }, [workspaces]);

  const loadAgents = async () => {
    if (!apiClient) return;
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

  const loadWorkspaces = async () => {
    if (!apiClient) return;
    setLoadingWorkspaces(true);
    try {
      const workspaceList = await apiClient.listWorkspaces();

      // Filter to only show workspaces owned by current user
      const userId = userInfo?.user || userInfo?.subject_id;
      const tenantId = userInfo?.tenant_id || 'default';

      const userWorkspaces = workspaceList.filter((ws) => {
        // Support both old and new path conventions
        return ws.path.startsWith(`/workspace/${userId}/`) ||
               ws.path.includes(`/tenant:${tenantId}/user:${userId}/workspace/`);
      });

      setWorkspaces(userWorkspaces);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const handleWorkspaceSelect = (workspacePath: string) => {
    if (!workspacePath) {
      setSelectedWorkspacePath('');
      setConfig((prev) => ({
        ...prev,
        workspacePath: undefined,
        workspaceName: undefined,
      }));
      return;
    }

    const workspace = workspaces.find(ws => ws.path === workspacePath);
    setSelectedWorkspacePath(workspacePath);

    // Update config with workspace info
    setConfig((prev) => ({
      ...prev,
      workspacePath: workspacePath,
      workspaceName: workspace?.name || workspacePath.split('/').pop() || 'Unknown',
    }));

    // Save to localStorage for persistence
    localStorage.setItem('chat_last_used_workspace', workspacePath);
  };

  const handleCreateWorkspace = async (path: string, name: string, description: string) => {
    if (!apiClient) throw new Error('API client not initialized');
    try {
      await apiClient.registerWorkspace({
        path,
        name,
        description,
        created_by: userInfo?.subject_id,
      });
      // Reload workspaces after creation
      await loadWorkspaces();
      // Auto-select the newly created workspace
      handleWorkspaceSelect(path);
    } catch (err) {
      console.error('Failed to create workspace:', err);
      throw err;
    }
  };

  // Test agent connection with its API key
  const testAgentConnection = async (agentApiKey: string) => {
    if (!apiClient) return;
    setAgentConnectionStatus('checking');
    try {
      // Create a temporary client with the agent's API key
      const { default: NexusAPIClient } = await import('../api/client');
      const baseUrl = apiClient.getBaseURL();
      const tempClient = new NexusAPIClient(baseUrl || '', agentApiKey);

      // Test connection with whoami
      const result = await tempClient.whoami();

      if (result.authenticated) {
        setAgentConnectionStatus('connected');
        console.log('Agent connection successful:', result);
      } else {
        setAgentConnectionStatus('disconnected');
        console.error('Agent authentication failed');
      }
    } catch (error) {
      setAgentConnectionStatus('disconnected');
      console.error('Agent connection failed:', error);
    }
  };

  // Load agent configuration when selected
  const handleAgentSelect = async (agentId: string) => {
    if (!agentId) {
      setSelectedAgentId('');
      return;
    }
    if (!apiClient) return;

    try {
      // Use get_agent API to get all agent information including API key and config
      const agentInfo = await apiClient.getAgent(agentId);
      if (!agentInfo) {
        console.error('Agent not found:', agentId);
        return;
      }

      // Normalize API key - treat "NOT SET" as undefined
      const normalizedAgentApiKey = agentInfo.api_key && agentInfo.api_key !== 'NOT SET' ? agentInfo.api_key : undefined;

      // Extract config fields from agentInfo (these are read from config.yaml by backend)
      // Type assertion needed because getAgent returns optional fields
      const agentConfig: AgentConfig = {
        platform: agentInfo.platform || 'nexus',
        endpoint_url: agentInfo.endpoint_url,
        agent_id: agentInfo.config_agent_id, // LangGraph assistant/graph ID from config (not the full agent_id)
        api_key: agentInfo.api_key, // API key from config file (if agent has one)
        system_prompt: agentInfo.system_prompt,
        tools: agentInfo.tools,
      };

      // Check if agent has a sandbox (name matches agent_id)
      let sandboxId: string | undefined;
      try {
        const sandboxResponse = await apiClient.sandboxList({ verify_status: true, status: 'active' });
        const agentSandbox = sandboxResponse.sandboxes.find((sb) => sb.name === agentId);
        if (agentSandbox) {
          sandboxId = agentSandbox.sandbox_id;

          // Store sandbox details in config
          const sandboxStatus = agentSandbox.status as 'running' | 'paused' | 'stopped' | 'unknown';
          const sandboxProvider = agentSandbox.provider;
          const sandboxExpiresAt = agentSandbox.expires_at ?? undefined;

          // Check if sandbox is expired
          if (sandboxExpiresAt) {
            const expiresAt = new Date(sandboxExpiresAt);
            const now = new Date();
            if (expiresAt <= now) {
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

        // For LangGraph agents:
        // - apiKey: LangGraph Cloud API key (from environment)
        // - nexusApiKey: Agent's Nexus API key (from get_agent response, for tool calls)
        //   ALWAYS use agent's API key if available, otherwise fall back to user's API key
        //   NOTE: This is ONLY for LangGraph tool calls, NOT for frontend file operations
        //   Frontend (FileTree, etc.) always uses the user's API key from AuthContext
        const langgraphApiKey = import.meta.env.VITE_LANGGRAPH_API_KEY || '';

        // Use agent's API key from backend config directly
        // Use normalized API key (already checked for "NOT SET" above)
        const nexusApiKey = normalizedAgentApiKey || userPersonalApiKey;

        // Use config_agent_id from config file (LangGraph graph/assistant ID)
        // Fall back to 'agent' if not specified in config
        // IMPORTANT: Do NOT use agentInfo.agent_id (full format like "admin,UntrustedAgent")
        // Only use config_agent_id from the config file, or default to 'agent'
        const langgraphAssistantId = agentInfo.config_agent_id || 'agent';

        setConfig((prev) => {
          return {
            ...prev,
            apiUrl: agentConfig.endpoint_url,
            assistantId: langgraphAssistantId, // LangGraph graph/assistant ID from config
            apiKey: langgraphApiKey, // LangGraph Cloud API key
            nexusApiKey: nexusApiKey, // Nexus API key for tool calls
            sandboxId, // Add sandbox_id (undefined if expired)
          };
        });
      } else if (agentConfig.platform === 'nexus') {
        // Nexus agents - use default endpoint and full agent_id
        // Use agent's API key from backend config, fallback to user's API key
        // Use normalized API key (already checked for "NOT SET" above)
        const nexusApiKey = normalizedAgentApiKey || userPersonalApiKey;

        setConfig((prev) => ({
          ...prev,
          apiUrl: 'http://localhost:2024',
          assistantId: agentId, // Use full agent_id (<user_id>,<agent_name>)
          nexusApiKey: nexusApiKey, // Nexus API key for tool calls
          sandboxId, // Add sandbox_id
        }));
      }

      // Only set selectedAgentId AFTER config is successfully loaded
      setSelectedAgentId(agentId);
      // Store the agent's API key from backend config (for Connection Settings dialog)
      // Use normalized API key (already checked for "NOT SET" above)
      setSelectedAgentApiKey(normalizedAgentApiKey || '');

      // Test agent connection with its API key from backend
      const testApiKey = normalizedAgentApiKey || userPersonalApiKey;
      if (testApiKey) {
        await testAgentConnection(testApiKey);
      } else {
        setAgentConnectionStatus('disconnected');
      }
    } catch (err) {
      console.error('Failed to load agent config:', err);
      setAgentConnectionStatus('disconnected');
      // Don't set selectedAgentId if config loading failed
    }
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
    if (!config.sandboxId || !selectedAgentId || !apiClient) {
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

  const handleThreadIdChange = (newThreadId: string) => {
    setConfig((prev) => {
      if (prev.threadId === newThreadId) {
        return prev;
      }
      return { ...prev, threadId: newThreadId };
    });
  };

  const handlePauseSandbox = async () => {
    if (!config.sandboxId || !apiClient) return;

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
    if (!config.sandboxId || !apiClient) return;

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
    if (!config.sandboxId || !apiClient) return;

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

  const handleStartSandbox = async () => {
    // Check if we have a selected agent
    if (!selectedAgentId) {
      alert('Please select an agent first.');
      return;
    }
    if (!apiClient) {
      alert('API client not initialized');
      return;
    }

    setSandboxConnecting(true);
    setSandboxConnectStatus('Initializing sandbox...');

    try {
      // Use get_or_create pattern with status verification (same as Agent Management)
      // Use selectedAgentId as sandbox name (exactly like Agent Management uses agentId)
      // Format: <user_id>,<agent_name>
      const sandboxName = selectedAgentId;

      // Select provider based on whether Nexus is running locally
      const baseURL = apiClient.getBaseURL();
      const isLocalhost = baseURL.includes('localhost') || baseURL.includes('127.0.0.1');
      const provider = isLocalhost ? 'docker' : 'e2b';

      console.log(`[ChatPanel] Getting or creating sandbox with name: ${sandboxName}, provider: ${provider}`);
      setSandboxConnectStatus(`Creating sandbox with ${provider} provider...`);

      // Get or create sandbox with status verification
      const sandbox = await apiClient.sandboxGetOrCreate({
        name: sandboxName,
        ttl_minutes: 60,
        provider,
        verify_status: true, // Verify status with provider
      });

      const sandboxId = sandbox.sandbox_id;
      console.log(`[ChatPanel] Got sandbox: ${sandboxId}`);
      setSandboxConnectStatus('Mounting Nexus filesystem...');

      // Mount Nexus filesystem in the sandbox - this is CRITICAL
      console.log(`[ChatPanel] Mounting Nexus in sandbox ${sandboxId}...`);
      const mountResult = await apiClient.sandboxConnect({
        sandbox_id: sandboxId,
        provider: sandbox.provider,
        mount_path: '/mnt/nexus',
        nexus_url: apiClient.getBaseURL(),
        nexus_api_key: config.nexusApiKey || config.apiKey || undefined,
      });

      // Check if mount was successful
      if (!mountResult.success) {
        console.error(`[ChatPanel] Failed to mount Nexus in sandbox ${sandboxId}`);
        setSandboxConnectStatus('Mount failed, cleaning up...');

        // Clean up: stop the sandbox since mount failed
        try {
          console.log(`[ChatPanel] Stopping sandbox ${sandboxId} due to mount failure...`);
          await apiClient.sandboxStop(sandboxId);
          console.log(`[ChatPanel] Sandbox ${sandboxId} stopped`);
        } catch (stopErr) {
          console.error('[ChatPanel] Failed to stop sandbox after mount failure:', stopErr);
        }

        throw new Error('Failed to mount Nexus filesystem in sandbox');
      }

      console.log(`[ChatPanel] Successfully mounted Nexus at ${mountResult.mount_path}`);
      setSandboxConnectStatus('Connected successfully!');

      // Update config with new sandbox info
      setConfig((prev) => ({
        ...prev,
        sandboxId: sandbox.sandbox_id,
        sandboxStatus: (sandbox.status === 'running' || sandbox.status === 'paused' || sandbox.status === 'stopped' || sandbox.status === 'unknown'
          ? sandbox.status
          : 'unknown') as 'running' | 'paused' | 'stopped' | 'unknown',
        sandboxProvider: sandbox.provider,
        sandboxExpiresAt: sandbox.expires_at || undefined,
      }));

      console.log(`[ChatPanel] Successfully got/created sandbox ${sandboxId}`);

      // Show success message for 2 seconds then close dialog
      setTimeout(() => {
        setSandboxConnecting(false);
        setSandboxConnectStatus('');
        setSandboxDialogOpen(false);
      }, 2000);
    } catch (err) {
      console.error('[ChatPanel] Failed to get/create sandbox:', err);
      setSandboxConnectStatus('Failed: ' + (err instanceof Error ? err.message : String(err)));
      setSandboxConnecting(false);
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
    setIsOpenHistory(true);
  };

  const onThreadClick = (thread: Thread<any>) => {
    setSelectedAgentId(thread.metadata?.selectedAgentId as string);
    setConfig((prev) => ({ ...prev, threadId: thread.thread_id }));
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full border-l bg-background relative">
      {isOpenHistory && (
        <ThreadsHistoryPanel isOpen={isOpenHistory} onClose={() => setIsOpenHistory(false)} config={config} onThreadClick={onThreadClick} userInfo={userInfo} />
      )}
      {/* Header with Agent Selector and Controls */}
      <div className="flex flex-col gap-3 p-4 border-b">
        {/* Title and Controls */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Chat Assistant</h2>
          <div className="flex gap-2">
            {/* Connection Settings (Per-Agent) */}
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setConnectionDialogOpen(true)}
              disabled={!selectedAgentId}
              title={
                !selectedAgentId
                  ? 'Select an agent first'
                  : agentConnectionStatus === 'connected'
                  ? 'Agent connected to Nexus'
                  : agentConnectionStatus === 'disconnected'
                  ? 'Agent connection failed'
                  : 'View agent Nexus connection'
              }
            >
              {agentConnectionStatus === 'checking' ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : agentConnectionStatus === 'connected' ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : agentConnectionStatus === 'disconnected' ? (
                <WifiOff className="h-4 w-4 text-red-500" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
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

        {/* Workspace Selector */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Select value={selectedWorkspacePath} onValueChange={handleWorkspaceSelect} disabled={loadingWorkspaces}>
              <SelectTrigger>
                <SelectValue placeholder={loadingWorkspaces ? 'Loading workspaces...' : 'Select a workspace'}>
                  {selectedWorkspacePath ? (
                    <div className="flex items-center gap-2">
                      <Folder className="h-3.5 w-3.5" />
                      <span className="truncate">
                        {workspaces.find(ws => ws.path === selectedWorkspacePath)?.name || selectedWorkspacePath.split('/').pop()}
                      </span>
                    </div>
                  ) : (
                    'Select a workspace'
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.path} value={workspace.path}>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Folder className="h-3.5 w-3.5" />
                        <span>{workspace.name || workspace.path.split('/').pop()}</span>
                      </div>
                      {workspace.description && (
                        <span className="text-xs text-muted-foreground pl-5">{workspace.description}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
                <div className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground border-t mt-1 pt-2"
                     onClick={(e) => {
                       e.preventDefault();
                       setWorkspaceManagementDialogOpen(true);
                     }}>
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  <span className="font-medium">Add Workspace</span>
                </div>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Agent Selector and New Chat */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
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
              <>
                <div className="flex-1">
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
                </div>
              </>
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

      {/* Connection Management Dialog - View agent Nexus connection settings */}
      <ConnectionManagementDialog
        open={connectionDialogOpen}
        onOpenChange={setConnectionDialogOpen}
        selectedAgentId={selectedAgentId}
        agentApiKey={selectedAgentApiKey}
      />

      {/* Workspace Management Dialog */}
      <WorkspaceManagementDialog
        open={workspaceManagementDialogOpen}
        onOpenChange={(open) => {
          setWorkspaceManagementDialogOpen(open);
          // Reload workspaces when dialog closes
          if (!open) {
            loadWorkspaces();
          }
        }}
        onCreateWorkspace={handleCreateWorkspace}
      />

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
            {!config.sandboxId && !sandboxConnecting && (
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                To use a sandbox, click the "Start Sandbox" button below to create a new sandbox environment.
              </div>
            )}
            {sandboxConnecting && (
              <div className="text-sm bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">{sandboxConnectStatus}</p>
                  </div>
                </div>
              </div>
            )}
            {config.sandboxId && config.sandboxStatus === 'stopped' && !sandboxConnecting && (
              <div className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md">
                This sandbox has been stopped. Restart it from the Agent Management dialog.
              </div>
            )}
            {config.sandboxId && config.sandboxStatus === 'paused' && !sandboxConnecting && (
              <div className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md">
                This sandbox is paused. Resume it to continue using it.
              </div>
            )}
          </div>
          {!config.sandboxId && !sandboxConnecting ? (
            <DialogFooter>
              <Button onClick={handleStartSandbox}>
                Start Sandbox
              </Button>
            </DialogFooter>
          ) : sandboxConnecting ? (
            <DialogFooter>
              <Button disabled>
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Connecting...</span>
                </div>
              </Button>
            </DialogFooter>
          ) : (
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Steps</label>
              <Input
                type="number"
                placeholder="100"
                value={config.maxSteps || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, maxSteps: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
              />
              <p className="text-xs text-muted-foreground">Maximum number of steps the agent can execute (default: 100)</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat Content - key forces complete remount */}
      {selectedAgentId && selectedWorkspacePath ? (
        <ChatPanelContent
          key={chatKey}
          config={config}
          selectedAgentId={selectedAgentId}
          filesAPI={filesAPI}
          userInfo={userInfo}
          onThreadIdChange={handleThreadIdChange}
          onConfigChange={setConfig}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-muted-foreground">
            {loadingAgents || loadingWorkspaces ? (
              <>
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                <p>Loading {loadingWorkspaces ? 'workspaces' : 'agents'}...</p>
              </>
            ) : !selectedWorkspacePath ? (
              <>
                <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="font-medium mb-1">Please select a workspace</p>
                <p className="text-sm">Choose a workspace from the dropdown above to start chatting</p>
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
