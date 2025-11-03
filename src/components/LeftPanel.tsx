import { useQueryClient } from '@tanstack/react-query';
import { Bot, Brain, Building2, ChevronDown, ChevronRight, FolderTree, RefreshCw, Search, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fileKeys } from '../hooks/useFiles';
import type { FileInfo } from '../types/file';
import type { ContextMenuAction } from './FileContextMenu';
import { FileTree } from './FileTree';
import { SearchBar } from './SearchBar';

interface RegisteredMemory {
  path: string;
  name: string | null;
  description: string;
  created_at: string;
  created_by: string | null;
  metadata: Record<string, any>;
}

interface LeftPanelProps {
  currentPath: string;
  onPathChange: (path: string) => void;
  onFileSelect: (file: FileInfo) => void;
  onContextMenuAction?: (action: ContextMenuAction, file: FileInfo) => void;
  creatingNewItem?: { type: 'file' | 'folder'; parentPath: string } | null;
  onCreateItem?: (path: string, type: 'file' | 'folder') => void;
  onCancelCreate?: () => void;
  onOpenMemoryDialog?: () => void;
}

export function LeftPanel({
  currentPath,
  onPathChange,
  onFileSelect,
  onContextMenuAction,
  creatingNewItem,
  onCreateItem,
  onCancelCreate,
  onOpenMemoryDialog,
}: LeftPanelProps) {
  const { apiClient, userInfo } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'explorer' | 'search'>('explorer');
  const [searchFolderPath, setSearchFolderPath] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Memory state
  const [memories, setMemories] = useState<RegisteredMemory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    org: true,
    user: true,
    agent: true,
  });

  // Refresh file tree
  const handleRefreshFileTree = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate all file list queries to force refetch
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
    } finally {
      // Add a small delay for visual feedback
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleContextMenuAction = (action: ContextMenuAction, file: FileInfo) => {
    if (action === 'find-in-folder' && file.isDirectory) {
      // Switch to search tab and set the folder context
      setActiveTab('search');
      setSearchFolderPath(file.path);
    }
    // Pass all actions to parent
    onContextMenuAction?.(action, file);
  };

  // Load memories on mount
  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    setLoadingMemories(true);
    try {
      const memoryList = await apiClient.listRegisteredMemories();
      setMemories(memoryList);
    } catch (err) {
      console.error('Failed to load memories:', err);
      setMemories([]);
    } finally {
      setLoadingMemories(false);
    }
  };

  // Group memories by scope
  const groupedMemories = {
    org: memories.filter((m) => m.metadata?.scope === 'tenant'),
    user: memories.filter((m) => m.metadata?.scope === 'user'),
    agent: memories.filter((m) => {
      if (m.metadata?.scope !== 'agent') return false;
      // Only show agent-scoped memories for current user's agents
      const userId = userInfo?.user || userInfo?.subject_id;
      return m.metadata?.user_id === userId;
    }),
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <div className="w-80 border-r bg-muted/20 flex flex-col h-full">
      {/* Tab Header */}
      <div className="border-b bg-background/95 flex">
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'explorer'
              ? 'bg-background border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
          onClick={() => setActiveTab('explorer')}
        >
          <FolderTree className="h-4 w-4" />
          Explorer
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'search' ? 'bg-background border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
          onClick={() => setActiveTab('search')}
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'explorer' ? (
          <div className="h-full flex flex-col">
            {/* Refresh button for explorer */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
              <span className="text-xs font-medium text-muted-foreground">Files</span>
              <button
                onClick={handleRefreshFileTree}
                disabled={isRefreshing}
                className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-50"
                title="Refresh file tree"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground hover:text-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <FileTree
                currentPath={currentPath}
                onPathChange={(path) => {
                  onPathChange(path);
                  // When a directory is clicked in tree, we just navigate to it
                  // Don't select it for viewing
                }}
                onFileClick={onFileSelect}
                onContextMenuAction={handleContextMenuAction}
                creatingNewItem={creatingNewItem}
                onCreateItem={onCreateItem}
                onCancelCreate={onCancelCreate}
              />
            </div>
          </div>
        ) : (
          <SearchBar currentPath={searchFolderPath || currentPath} onFileSelect={onFileSelect} onContextMenuAction={handleContextMenuAction} />
        )}
      </div>

      {/* Memory Section */}
      <div className="border-t bg-background/95 max-h-[300px] flex flex-col">
        <div className="px-4 py-2 flex items-center gap-2 border-b">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Memories</span>
          {loadingMemories && <span className="text-xs text-muted-foreground">(loading...)</span>}
          <button onClick={onOpenMemoryDialog} className="ml-auto p-1 hover:bg-muted rounded transition-colors" title="Add Memory">
            <Brain className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {/* Org (Tenant) Group */}
          <div className="border-b">
            <button onClick={() => toggleGroup('org')} className="w-full px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors">
              {expandedGroups.org ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <Building2 className="h-3 w-3 text-blue-500" />
              <span className="text-xs font-medium">Organization</span>
              <span className="text-xs text-muted-foreground ml-auto">({groupedMemories.org.length})</span>
            </button>
            {expandedGroups.org && (
              <div className="bg-muted/20">
                {groupedMemories.org.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-muted-foreground italic">No organization memories</div>
                ) : (
                  groupedMemories.org.map((memory) => (
                    <div key={memory.path} className="px-4 py-1.5 hover:bg-muted/50 cursor-pointer" title={memory.description || memory.path}>
                      <div className="text-xs font-medium truncate">{memory.name || memory.path.split('/').pop()}</div>
                      {memory.description && <div className="text-xs text-muted-foreground truncate">{memory.description}</div>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* User Group */}
          <div className="border-b">
            <button onClick={() => toggleGroup('user')} className="w-full px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors">
              {expandedGroups.user ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <User className="h-3 w-3 text-green-500" />
              <span className="text-xs font-medium">User</span>
              <span className="text-xs text-muted-foreground ml-auto">({groupedMemories.user.length})</span>
            </button>
            {expandedGroups.user && (
              <div className="bg-muted/20">
                {groupedMemories.user.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-muted-foreground italic">No user memories</div>
                ) : (
                  groupedMemories.user.map((memory) => (
                    <div key={memory.path} className="px-4 py-1.5 hover:bg-muted/50 cursor-pointer" title={memory.description || memory.path}>
                      <div className="text-xs font-medium truncate">{memory.name || memory.path.split('/').pop()}</div>
                      {memory.description && <div className="text-xs text-muted-foreground truncate">{memory.description}</div>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Agent Group */}
          <div>
            <button onClick={() => toggleGroup('agent')} className="w-full px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors">
              {expandedGroups.agent ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <Bot className="h-3 w-3 text-purple-500" />
              <span className="text-xs font-medium">Agent</span>
              <span className="text-xs text-muted-foreground ml-auto">({groupedMemories.agent.length})</span>
            </button>
            {expandedGroups.agent && (
              <div className="bg-muted/20">
                {groupedMemories.agent.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-muted-foreground italic">No agent memories</div>
                ) : (
                  groupedMemories.agent.map((memory) => (
                    <div key={memory.path} className="px-4 py-1.5 hover:bg-muted/50 cursor-pointer" title={memory.description || memory.path}>
                      <div className="text-xs font-medium truncate">{memory.name || memory.path.split('/').pop()}</div>
                      <div className="flex items-center gap-2">
                        {memory.description && <div className="text-xs text-muted-foreground truncate flex-1">{memory.description}</div>}
                        {memory.metadata?.agent_id && (
                          <div className="text-xs text-purple-500 font-mono">
                            {memory.metadata.agent_id.includes(',') ? memory.metadata.agent_id.split(',')[1] : memory.metadata.agent_id}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
