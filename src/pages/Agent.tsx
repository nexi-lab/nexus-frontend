import { Bot, Calendar, Check, Copy, Eye, EyeOff, Info, MessageSquare, Plug, Plus, ArrowLeft, Trash2, Zap, Folder, Database, FileArchive, Pencil, Crown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n/useTranslation';
import { copyToClipboard } from '../utils';
import { PermissionInfoBox } from '../components/PermissionInfoBox';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';

interface Agent {
  agent_id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  has_api_key?: boolean;
  inherit_permissions?: boolean;
  skills?: string[]; // Skill names the agent has access to
  skillPermissions?: Record<string, 'viewer' | 'editor' | 'owner'>; // Permission level for each skill
  connectors?: string[]; // Connector mount points the agent has access to
  connectorPermissions?: Record<string, 'viewer' | 'editor' | 'owner'>; // Permission level for each connector
  workspaces?: string[]; // Workspace paths the agent has access to
  workspacePermissions?: Record<string, 'viewer' | 'editor' | 'owner'>; // Permission level for each workspace
  hasAllWorkspaces?: boolean; // Whether agent has access to all workspaces
  allWorkspacesPermission?: 'viewer' | 'editor' | 'owner'; // Permission level for all workspaces
  hasMemoryAccess?: boolean;
  memoryPermission?: 'viewer' | 'editor' | 'owner'; // Permission level for memory
  hasResourcesAccess?: boolean;
  resourcesPermission?: 'viewer' | 'editor' | 'owner'; // Permission level for resources
}

interface SandboxConnectionStatus {
  sandboxStatus: 'none' | 'creating' | 'created' | 'error';
  nexusStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  sandbox_id?: string;
  error?: string;
}

// Available platforms
const AVAILABLE_PLATFORMS = [
  { id: 'langgraph', name: 'LangGraph', description: 'LangGraph agent platform', enabled: true },
  { id: 'claude_adk', name: 'Claude ADK', description: 'Claude Agent SDK', enabled: false },
  { id: 'google_adk', name: 'Google ADK', description: 'Google Agent Development Kit', enabled: false },
  { id: 'crewai', name: 'CrewAI', description: 'CrewAI agent framework', enabled: false },
];

export function Agent() {
  const navigate = useNavigate();
  const { userInfo, apiClient, apiKey } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'list' | 'edit' | 'create'>('list');

  // Agent list state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  // Sandbox connection state (keyed by agent_id)
  const [sandboxConnections, setSandboxConnections] = useState<Record<string, SandboxConnectionStatus>>({});

  // Create agent state
  const [agentName, setAgentName] = useState('');
  const [description, setDescription] = useState('');
  const [generateApiKey, setGenerateApiKey] = useState(false);
  const [inheritPermissions, setInheritPermissions] = useState(false); // v0.5.1: Permission inheritance control
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Agent configuration state
  const [platform, setPlatform] = useState('langgraph');
  const [endpointUrl, setEndpointUrl] = useState('http://localhost:2024');
  const [langgraphAgentId, setLanggraphAgentId] = useState('agent');

  // Skills state
  const [skills, setSkills] = useState<Array<{name: string; description: string; tier: string; path: string}>>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);

  // Connectors state
  const [connectors, setConnectors] = useState<Array<{mount_point: string; backend_type: string}>>([]);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [connectorPermissions, setConnectorPermissions] = useState<Record<string, 'viewer' | 'editor' | 'owner'>>({});
  const [loadingConnectors, setLoadingConnectors] = useState(false);

  // Workspaces state
  const [workspaces, setWorkspaces] = useState<Array<{path: string; name: string | null; description: string}>>([]);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);
  const [workspacePermissions, setWorkspacePermissions] = useState<Record<string, 'viewer' | 'editor' | 'owner'>>({});
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [grantAllWorkspaces, setGrantAllWorkspaces] = useState(false);
  const [allWorkspacesPermission, setAllWorkspacesPermission] = useState<'viewer' | 'editor' | 'owner'>('viewer');

  // Directory access state (memory, resources)
  const [grantMemoryAccess, setGrantMemoryAccess] = useState(false);
  const [grantResourcesAccess, setGrantResourcesAccess] = useState(false);

  // Edit state
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  // Load agents on mount and when switching to list tab
  useEffect(() => {
    if (activeTab === 'list') {
      loadAgents();
    } else if (activeTab === 'create' || activeTab === 'edit') {
      loadSkills();
      loadConnectors();
      loadWorkspaces();
    }
  }, [activeTab]);

  const loadAgents = async () => {
    setLoadingAgents(true);
    setAgentError(null);
    try {
      const agentList = await apiClient.listAgents();

      // Load skills, connectors, workspaces, and directory access for each agent
      const agentsWithPermissions = await Promise.all(
        agentList.map(async (agent) => {
          // Fetch ReBAC tuples once per agent to avoid duplicate API calls
          const tuples = await apiClient.rebacListTuples({ subject: ['agent', agent.agent_id] });
          
          // Extract user ID and tenant ID for constructing full paths
          const userId = agent.agent_id.split(',')[0];
          const tenantId = userInfo?.tenant_id || 'default';
          
          // Use the same tuples for all permission checks
          const [skillData, connectorData, workspaceData, memoryAccess, resourcesAccess, allWorkspacesAccess] = await Promise.all([
            apiClient.getAgentSkills(agent.agent_id, tuples),
            apiClient.getAgentConnectors(agent.agent_id, tuples),
            apiClient.getAgentWorkspaces(agent.agent_id, tuples),
            apiClient.getDirectoryAccess(agent.agent_id, '/memory', tuples, tenantId, userId),
            apiClient.getDirectoryAccess(agent.agent_id, '/resource', tuples, tenantId, userId),
            apiClient.getAllWorkspacesAccess(agent.agent_id, tuples, tenantId),
          ]);

          // Extract skill names and permissions
          const skills = skillData.map(s => s.name);
          const skillPermissions = skillData.reduce((acc, s) => {
            acc[s.name] = s.permission;
            return acc;
          }, {} as Record<string, 'viewer' | 'editor' | 'owner'>);

          // Extract connector paths and permissions
          const connectors = connectorData.map(c => c.path);
          const connectorPermissions = connectorData.reduce((acc, c) => {
            acc[c.path] = c.permission;
            return acc;
          }, {} as Record<string, 'viewer' | 'editor' | 'owner'>);

          // Extract workspace paths and permissions
          const workspaces = workspaceData.map(w => w.path);
          const workspacePermissions = workspaceData.reduce((acc, w) => {
            acc[w.path] = w.permission;
            return acc;
          }, {} as Record<string, 'viewer' | 'editor' | 'owner'>);

          return {
            ...agent,
            skills,
            skillPermissions,
            connectors,
            connectorPermissions,
            workspaces,
            workspacePermissions,
            hasAllWorkspaces: allWorkspacesAccess.hasAccess,
            allWorkspacesPermission: allWorkspacesAccess.permission,
            hasMemoryAccess: memoryAccess.hasAccess,
            memoryPermission: memoryAccess.permission,
            hasResourcesAccess: resourcesAccess.hasAccess,
            resourcesPermission: resourcesAccess.permission,
          };
        })
      );

      setAgents(agentsWithPermissions);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoadingAgents(false);
    }
  };

  const loadSkills = async () => {
    setLoadingSkills(true);
    try {
      const result = await apiClient.skillsList();
      // Extract skills array from the result object, filtering out any without file_path
      const skillsArray = result.skills
        .filter(skill => skill.file_path)
        .map(skill => ({
          name: skill.name,
          description: skill.description,
          tier: skill.tier || 'free',
          // Use the directory path of the skill (parent directory of SKILL.md)
          path: skill.file_path!.substring(0, skill.file_path!.lastIndexOf('/'))
        }));
      setSkills(skillsArray);
    } catch (err) {
      console.error('Failed to load skills:', err);
      setSkills([]);
    } finally {
      setLoadingSkills(false);
    }
  };

  const loadConnectors = async () => {
    setLoadingConnectors(true);
    try {
      const mounts = await apiClient.listMounts();
      // Filter for connectors (new convention: /tenant:<tid>/user:<uid>/connector/<name> or old: /connectors/)
      const connectorMounts = mounts
        .filter(m => {
          const path = m.mount_point;
          // New convention: contains /connector/ (singular)
          // Old convention: starts with /connectors/ (plural) for backward compatibility
          return path.includes('/connector/') || path.startsWith('/connectors/');
        })
        .map(m => ({
          mount_point: m.mount_point,
          backend_type: m.backend_type,
        }));
      setConnectors(connectorMounts);
    } catch (err) {
      console.error('Failed to load connectors:', err);
      setConnectors([]);
    } finally {
      setLoadingConnectors(false);
    }
  };

  const loadWorkspaces = async () => {
    setLoadingWorkspaces(true);
    try {
      const workspaceList = await apiClient.listWorkspaces();
      const workspaceData = workspaceList.map(w => ({
        path: w.path,
        name: w.name,
        description: w.description,
      }));
      setWorkspaces(workspaceData);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      setWorkspaces([]);
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const toggleSkill = (skillName: string) => {
    setSelectedSkills((prev) => (prev.includes(skillName) ? prev.filter((name) => name !== skillName) : [...prev, skillName]));
  };

  const toggleConnector = (mountPoint: string) => {
    setSelectedConnectors((prev) => {
      if (prev.includes(mountPoint)) {
        // Remove connector
        const newSelected = prev.filter((mp) => mp !== mountPoint);
        // Also remove from permissions map
        setConnectorPermissions((perms) => {
          const newPerms = { ...perms };
          delete newPerms[mountPoint];
          return newPerms;
        });
        return newSelected;
      } else {
        // Add connector with default viewer permission
        setConnectorPermissions((perms) => ({ ...perms, [mountPoint]: 'viewer' }));
        return [...prev, mountPoint];
      }
    });
  };

  const setConnectorPermission = (mountPoint: string, permission: 'viewer' | 'editor' | 'owner') => {
    setConnectorPermissions((prev) => ({ ...prev, [mountPoint]: permission }));
  };

  const toggleWorkspace = (path: string) => {
    setSelectedWorkspaces((prev) => {
      if (prev.includes(path)) {
        // Remove workspace
        const newSelected = prev.filter((p) => p !== path);
        // Also remove from permissions map
        setWorkspacePermissions((perms) => {
          const newPerms = { ...perms };
          delete newPerms[path];
          return newPerms;
        });
        return newSelected;
      } else {
        // Add workspace with default viewer permission
        setWorkspacePermissions((perms) => ({ ...perms, [path]: 'viewer' }));
        return [...prev, path];
      }
    });
  };

  const setWorkspacePermission = (path: string, permission: 'viewer' | 'editor' | 'owner') => {
    setWorkspacePermissions((prev) => ({ ...prev, [path]: permission }));
  };

  const handleStartSandbox = async (agentId: string) => {
    // Check if Nexus is connected first
    const currentConnection = sandboxConnections[agentId];
    if (currentConnection?.nexusStatus !== 'connected') {
      setAgentError('Please connect to Nexus first.');
      return;
    }

    // Set creating status
    setSandboxConnections((prev) => ({
      ...prev,
      [agentId]: {
        sandboxStatus: 'creating',
        nexusStatus: prev[agentId]?.nexusStatus || 'disconnected',
      },
    }));

    try {
      // Use get_or_create pattern with status verification
      const sandboxName = agentId;

      // Select provider based on whether Nexus is running locally
      const provider = 'docker';

      console.log(`Getting or creating sandbox with name: ${sandboxName}, provider: ${provider}`);

      // Get or create sandbox with status verification
      const sandbox = await apiClient.sandboxGetOrCreate({
        name: sandboxName,
        ttl_minutes: 60,
        provider,
        verify_status: true, // Verify status with provider
      });

      const sandboxId = sandbox.sandbox_id;
      console.log(`Got sandbox: ${sandboxId}`);

      // Mount Nexus filesystem in the sandbox
      try {
        console.log(`Mounting Nexus in sandbox ${sandboxId}...`);
        const mountResult = await apiClient.sandboxConnect({
          sandbox_id: sandboxId,
          provider: sandbox.provider,
          mount_path: '/mnt/nexus',
          nexus_url: apiClient.getBaseURL(),
          nexus_api_key: apiKey || undefined,
        });

        if (mountResult.success) {
          console.log(`Successfully mounted Nexus at ${mountResult.mount_path}`);
        } else {
          console.warn(`Failed to mount Nexus in sandbox ${sandboxId}`);
        }
      } catch (mountErr) {
        console.error('Failed to mount Nexus:', mountErr);
        // Don't fail the entire operation if mount fails
      }

      // Success
      setSandboxConnections((prev) => ({
        ...prev,
        [agentId]: {
          sandboxStatus: 'created',
          nexusStatus: prev[agentId]?.nexusStatus || 'disconnected',
          sandbox_id: sandboxId,
        },
      }));
      console.log(`Successfully got/created sandbox ${sandboxId}`);
    } catch (err) {
      console.error('Failed to get/create sandbox:', err);
      setSandboxConnections((prev) => ({
        ...prev,
        [agentId]: {
          sandboxStatus: 'error',
          nexusStatus: prev[agentId]?.nexusStatus || 'disconnected',
          error: err instanceof Error ? err.message : 'Failed to get/create sandbox',
        },
      }));
    }
  };

  const handleConnectNexus = async (agentId: string) => {
    // Get Nexus API key from auth context
    if (!apiKey) {
      setAgentError('No Nexus API key found. Please log in again.');
      return;
    }

    // Set connecting status
    setSandboxConnections((prev) => ({
      ...prev,
      [agentId]: {
        sandboxStatus: prev[agentId]?.sandboxStatus || 'none',
        nexusStatus: 'connecting',
      },
    }));

    try {
      // Check Nexus connection by calling /health endpoint
      console.log(`Checking Nexus connection...`);
      const healthResult = await apiClient.health();

      if (healthResult.status === 'ok' || healthResult.status === 'healthy') {
        // Success - Nexus is healthy
        setSandboxConnections((prev) => ({
          ...prev,
          [agentId]: {
            ...prev[agentId],
            nexusStatus: 'connected',
          },
        }));
        console.log(`Successfully verified Nexus connection (status: ${healthResult.status})`);
      } else {
        // Unhealthy
        throw new Error(`Nexus server is unhealthy: ${healthResult.status}`);
      }
    } catch (err) {
      console.error('Failed to connect Nexus:', err);
      setSandboxConnections((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          nexusStatus: 'error',
          error: err instanceof Error ? err.message : 'Failed to connect Nexus',
        },
      }));
    }
  };


  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    if (!confirm(t('agent.deleteConfirm').replace('{name}', agentName))) {
      return;
    }

    try {
      await apiClient.deleteAgent(agentId);
      await loadAgents(); // Refresh list
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : t('agent.deleteFailed'));
    }
  };

  const handleEditAgent = async (agent: Agent) => {
    // Populate form with agent data
    const agentName = agent.agent_id.split(',')[1]; // Extract agent name from full ID
    setAgentName(agentName);
    setDescription(agent.description || '');
    setEditingAgentId(agent.agent_id);
    setSelectedSkills(agent.skills || []);
    setSelectedConnectors(agent.connectors || []);
    setConnectorPermissions(agent.connectorPermissions || {});
    setSelectedWorkspaces(agent.workspaces || []);
    setWorkspacePermissions(agent.workspacePermissions || {});
    setGrantAllWorkspaces(agent.hasAllWorkspaces || false);
    setAllWorkspacesPermission(agent.allWorkspacesPermission || 'viewer');
    setGrantMemoryAccess(agent.hasMemoryAccess || false);
    setGrantResourcesAccess(agent.hasResourcesAccess || false);

    // Fetch agent details to get metadata (endpoint_url, platform, etc.)
    try {
      const agentDetails = await apiClient.getAgent(agent.agent_id);
      if (agentDetails.endpoint_url) {
        setEndpointUrl(agentDetails.endpoint_url);
      } else {
        setEndpointUrl('http://localhost:2024'); // Default
      }
      if (agentDetails.platform) {
        setPlatform(agentDetails.platform);
      }
      if (agentDetails.config_agent_id) {
        setLanggraphAgentId(agentDetails.config_agent_id);
      }
    } catch (err) {
      console.error('Failed to fetch agent details:', err);
      // Use defaults if fetch fails
      setEndpointUrl('http://localhost:2024');
    }

    // Note: We can't change API key generation or inheritance for existing agents
    // These are only for new agent creation
    setGenerateApiKey(false);
    setInheritPermissions(false);

    // Switch to edit tab
    setActiveTab('edit');
  };

  // Unified helper: Update permissions for a resource type
  const updateResourcePermissions = async (
    tuples: Array<{tuple_id: string; object_type: string; object_id: string; relation: string}>,
    currentPaths: string[],
    selectedPaths: string[],
    currentPermissions: Record<string, 'viewer' | 'editor' | 'owner'>,
    selectedPermissions: Record<string, 'viewer' | 'editor' | 'owner'>,
    pathToObjectPath: (path: string) => string | null,
    getRelation: (permission: 'viewer' | 'editor' | 'owner') => string = (p) => p === 'editor' ? 'direct_editor' : 'direct_viewer'
  ) => {
    const pathsToAdd = selectedPaths.filter(p => !currentPaths.includes(p));
    const pathsToRemove = currentPaths.filter(p => !selectedPaths.includes(p));
    const pathsToUpdate = selectedPaths.filter(p =>
      currentPaths.includes(p) &&
      currentPermissions[p] !== selectedPermissions[p]
    );

    // Remove paths
    for (const path of pathsToRemove) {
      const objectPath = pathToObjectPath(path);
      if (objectPath) {
        const tuple = tuples.find(t => t.object_type === 'file' && t.object_id === objectPath);
        if (tuple) {
          await apiClient.rebacDelete({ tuple_id: tuple.tuple_id });
        }
      }
    }

    // Update permissions (if permission level changed)
    for (const path of pathsToUpdate) {
      const objectPath = pathToObjectPath(path);
      if (objectPath) {
        // Remove old permission
        const oldTuple = tuples.find(t => t.object_type === 'file' && t.object_id === objectPath);
        if (oldTuple) {
          await apiClient.rebacDelete({ tuple_id: oldTuple.tuple_id });
        }
        // Add new permission
        const relation = getRelation(selectedPermissions[path]);
        await apiClient.rebacCreate({
          subject: ['agent', editingAgentId!],
          relation,
          object: ['file', objectPath],
        });
      }
    }

    // Add new paths
    for (const path of pathsToAdd) {
      const objectPath = pathToObjectPath(path);
      if (objectPath) {
        const relation = getRelation(selectedPermissions[path] || 'viewer');
        await apiClient.rebacCreate({
          subject: ['agent', editingAgentId!],
          relation,
          object: ['file', objectPath],
        });
      }
    }
  };

  // Helper: Update simple resource access (no permission levels, just add/remove)
  const updateSimpleResourceAccess = async (
    tuples: Array<{tuple_id: string; object_type: string; object_id: string}>,
    currentItems: string[],
    selectedItems: string[],
    itemToPath: (item: string) => string | null,
    defaultRelation: string = 'direct_viewer'
  ) => {
    const itemsToAdd = selectedItems.filter(i => !currentItems.includes(i));
    const itemsToRemove = currentItems.filter(i => !selectedItems.includes(i));

    // Remove items
    for (const item of itemsToRemove) {
      const path = itemToPath(item);
      if (path) {
        const tuple = tuples.find(t => t.object_type === 'file' && t.object_id === path);
        if (tuple) {
          await apiClient.rebacDelete({ tuple_id: tuple.tuple_id });
        }
      }
    }

    // Add items
    for (const item of itemsToAdd) {
      const path = itemToPath(item);
      if (path) {
        await apiClient.rebacCreate({
          subject: ['agent', editingAgentId!],
          relation: defaultRelation,
          object: ['file', path],
        });
      }
    }
  };

  // Helper: Update single path permission (for special cases like all-workspaces)
  const updateSinglePathPermission = async (
    tuples: Array<{tuple_id: string; object_type: string; object_id: string}>,
    path: string,
    currentHasAccess: boolean,
    newHasAccess: boolean,
    currentPermission: 'viewer' | 'editor' | 'owner',
    newPermission: 'viewer' | 'editor' | 'owner',
    getRelation: (permission: 'viewer' | 'editor' | 'owner') => string = (p) => p === 'editor' ? 'direct_editor' : 'direct_viewer'
  ) => {
    if (currentHasAccess && !newHasAccess) {
      // Remove access
      const tuple = tuples.find(t => t.object_type === 'file' && t.object_id === path);
      if (tuple) {
        await apiClient.rebacDelete({ tuple_id: tuple.tuple_id });
      }
    } else if (!currentHasAccess && newHasAccess) {
      // Grant access
      const relation = getRelation(newPermission);
      await apiClient.rebacCreate({
        subject: ['agent', editingAgentId!],
        relation,
        object: ['file', path],
      });
    } else if (currentHasAccess && newHasAccess && currentPermission !== newPermission) {
      // Update permission level
      const oldTuple = tuples.find(t => t.object_type === 'file' && t.object_id === path);
      if (oldTuple) {
        await apiClient.rebacDelete({ tuple_id: oldTuple.tuple_id });
      }
      const relation = getRelation(newPermission);
      await apiClient.rebacCreate({
        subject: ['agent', editingAgentId!],
        relation,
        object: ['file', path],
      });
    }
  };

  const handleUpdateAgent = async () => {
    if (!editingAgentId) return;

    setIsRegistering(true);
    try {
      const agent = agents.find(a => a.agent_id === editingAgentId);
      if (!agent) {
        setError('Agent not found');
        return;
      }

      // Update agent metadata (endpoint_url, platform, etc.)
      try {
        const metadata: Record<string, any> = {
          platform,
          endpoint_url: endpointUrl.trim(),
        };
        if (langgraphAgentId.trim()) {
          metadata.agent_id = langgraphAgentId.trim();
        }
        
        // Update agent metadata by calling registerAgent with same agent_id
        await apiClient.registerAgent({
          agent_id: editingAgentId,
          name: agentName.trim(),
          description: description.trim(),
          generate_api_key: false, // Don't regenerate API key
          inherit_permissions: false, // Don't change inheritance
          metadata,
        });
      } catch (metadataErr) {
        console.error('Failed to update agent metadata:', metadataErr);
        // Continue with permission updates even if metadata update fails
      }

      // Get all ReBAC tuples for the agent
      const tuples = await apiClient.rebacListTuples({ subject: ['agent', editingAgentId] });

      // 1. Handle Skills (simple add/remove, no permission levels)
      await updateSimpleResourceAccess(
        tuples,
        agent.skills || [],
        selectedSkills,
        (skillName) => {
          const skill = skills.find(s => s.name === skillName);
          return skill?.path || null;
        }
      );

      // 2. Handle Connectors (with permission levels)
      await updateResourcePermissions(
        tuples,
        agent.connectors || [],
        selectedConnectors,
        agent.connectorPermissions || {},
        connectorPermissions,
        (mountPoint) => mountPoint
      );

      // 3. Handle Workspaces (with permission levels)
      await updateResourcePermissions(
        tuples,
        agent.workspaces || [],
        selectedWorkspaces,
        agent.workspacePermissions || {},
        workspacePermissions,
        (path) => path
      );

      // 3b. Handle All Workspaces Access (special case)
      // Use logged-in user's ID, not the agent's owner ID
      const loggedInUserId = userInfo?.user || userInfo?.subject_id;
      const tenantId = userInfo?.tenant_id || 'default';
      // Use new namespace convention: /tenant:<tenant_id>/user:<user_id>/workspace
      const workspaceRootPath = `/tenant:${tenantId}/user:${loggedInUserId}/workspace`;
      await updateSinglePathPermission(
        tuples,
        workspaceRootPath,
        agent.hasAllWorkspaces || false,
        grantAllWorkspaces,
        agent.allWorkspacesPermission || 'viewer',
        allWorkspacesPermission
      );

      // 4. Handle Directory Access (memory, resources) - simple add/remove
      // Use new namespace convention: /tenant:<tenant_id>/user:<user_id>/<directory>
      const directories = [
        { path: `/tenant:${tenantId}/user:${loggedInUserId}/memory`, current: agent.hasMemoryAccess || false, new: grantMemoryAccess },
        { path: `/tenant:${tenantId}/user:${loggedInUserId}/resource`, current: agent.hasResourcesAccess || false, new: grantResourcesAccess },
      ];

      for (const dir of directories) {
        await updateSinglePathPermission(
          tuples,
          dir.path,
          dir.current,
          dir.new,
          'viewer',
          'viewer'
        );
      }

      // Reset form and go back to list
      resetForm();
      await loadAgents();
      setActiveTab('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update agent');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // If in edit tab, handle update
    if (activeTab === 'edit' && editingAgentId) {
      return handleUpdateAgent();
    }

    // Otherwise, handle new agent creation
    if (!agentName.trim()) {
      setError('Agent name is required');
      return;
    }

    // Validate agent name (alphanumeric, underscores, hyphens only - NO commas)
    if (!/^[a-z0-9_-]+$/.test(agentName.trim())) {
      setError('Agent name must contain only lowercase letters, numbers, underscores, and hyphens');
      return;
    }

    // Check for commas explicitly
    if (agentName.includes(',')) {
      setError('Agent name cannot contain commas');
      return;
    }

    // Validate endpoint URL
    if (!endpointUrl.trim()) {
      setError('Endpoint URL is required');
      return;
    }

    // Validate endpoint URL format
    try {
      new URL(endpointUrl);
    } catch {
      setError('Invalid endpoint URL format');
      return;
    }

    // Get user_id and tenant_id from userInfo
    const userId = userInfo?.user || userInfo?.subject_id;
    if (!userId) {
      setError('Unable to determine user ID. Please log in again.');
      return;
    }
    const tenantId = userInfo?.tenant_id || 'default';

    // Compose full agent_id as <user_id>,<agent_name>
    const fullAgentId = `${userId},${agentName.trim()}`;

    setIsRegistering(true);

    try {
      // Build metadata with platform, endpoint_url, and agent_id
      const metadata: Record<string, any> = {
        platform,
        endpoint_url: endpointUrl.trim(),
      };

      // Add agent_id if specified
      if (langgraphAgentId.trim()) {
        metadata.agent_id = langgraphAgentId.trim();
      }

      const result = await apiClient.registerAgent({
        agent_id: fullAgentId,
        name: agentName.trim(),
        description: description.trim(),
        generate_api_key: generateApiKey,
        inherit_permissions: inheritPermissions, // v0.5.1: Pass inheritance flag
        metadata, // v0.5.1: Pass metadata
      });

      // Grant permissions for selected skills
      if (selectedSkills.length > 0) {
        // Get unique skill paths to grant permissions on
        const skillPathsToGrant = new Set<string>();

        for (const skillName of selectedSkills) {
          const skill = skills.find(s => s.name === skillName);
          if (skill) {
            // Only add the specific skill directory, not parent paths
            skillPathsToGrant.add(skill.path);
          }
        }

        // Grant permissions on specific skill directories only
        // NOTE: Use "file" object type with "direct_viewer" relation for READ permission
        // The file namespace maps "read" → ["viewer", "editor", "owner"]
        // And "viewer" → union of ["direct_viewer", "parent_viewer", "group_viewer"]
        for (const skillPath of skillPathsToGrant) {
          try {
            await apiClient.rebacCreate({
              subject: ['agent', fullAgentId],
              relation: 'direct_viewer',
              object: ['file', skillPath],
            });
            console.log(`Granted direct_viewer permission for: ${skillPath}`);
          } catch (grantErr) {
            console.error(`Failed to grant permission for ${skillPath}:`, grantErr);
            // Continue even if this fails - might already exist
          }
        }
      }

      // Grant permissions for selected connectors
      for (const mountPoint of selectedConnectors) {
        try {
          const relation = connectorPermissions[mountPoint] === 'editor' ? 'direct_editor' : 'direct_viewer';
          await apiClient.rebacCreate({
            subject: ['agent', fullAgentId],
            relation,
            object: ['file', mountPoint],
          });
          console.log(`Granted ${relation} permission for connector: ${mountPoint}`);
        } catch (grantErr) {
          console.error(`Failed to grant permission for ${mountPoint}:`, grantErr);
          // Continue even if this fails - might already exist
        }
      }

      // Grant permissions for selected workspaces
      for (const path of selectedWorkspaces) {
        try {
          const relation = workspacePermissions[path] === 'editor' ? 'direct_editor' : 'direct_viewer';
          await apiClient.rebacCreate({
            subject: ['agent', fullAgentId],
            relation,
            object: ['file', path],
          });
          console.log(`Granted ${relation} permission for workspace: ${path}`);
        } catch (grantErr) {
          console.error(`Failed to grant permission for ${path}:`, grantErr);
        }
      }

      // Grant all-workspaces access if requested
      if (grantAllWorkspaces) {
        try {
          // Use new namespace convention: /tenant:<tenant_id>/user:<user_id>/workspace
          const workspaceRootPath = `/tenant:${tenantId}/user:${userId}/workspace`;
          const relation = allWorkspacesPermission === 'editor' ? 'direct_editor' : 'direct_viewer';
          await apiClient.rebacCreate({
            subject: ['agent', fullAgentId],
            relation,
            object: ['file', workspaceRootPath],
          });
          console.log(`Granted ${relation} permission for all workspaces: ${workspaceRootPath}`);
        } catch (grantErr) {
          console.error('Failed to grant all-workspaces permission:', grantErr);
        }
      }

      // Grant directory access (memory, resources)
      // Use new namespace convention: /tenant:<tenant_id>/user:<user_id>/<directory>
      const directoryGrants = [
        { path: `/tenant:${tenantId}/user:${userId}/memory`, grant: grantMemoryAccess },
        { path: `/tenant:${tenantId}/user:${userId}/resource`, grant: grantResourcesAccess },
      ];

      for (const dir of directoryGrants) {
        if (dir.grant) {
          try {
            await apiClient.rebacCreate({
              subject: ['agent', fullAgentId],
              relation: 'direct_viewer',
              object: ['file', dir.path],
            });
            console.log(`Granted direct_viewer permission for directory: ${dir.path}`);
          } catch (grantErr) {
            console.error(`Failed to grant permission for ${dir.path}:`, grantErr);
            // Continue even if this fails - might already exist
          }
        }
      }

      // If API key was generated, show it
      if (result.api_key) {
        setNewApiKey(result.api_key);
      } else {
        // No API key - reset form and switch to list view
        resetForm();
        await loadAgents(); // Refresh the list
        setActiveTab('list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register agent');
    } finally {
      setIsRegistering(false);
    }
  };

  const resetForm = () => {
    setAgentName('');
    setDescription('');
    setGenerateApiKey(false);
    setNewApiKey(null);
    setShowApiKey(false);
    setCopied(false);
    setError(null);
    setPlatform('langgraph'); // Default to langgraph
    setEndpointUrl('http://localhost:2024');
    setLanggraphAgentId('agent'); // Default to 'agent'
    setSelectedSkills([]); // Clear selected skills
    setSelectedConnectors([]); // Clear selected connectors
    setConnectorPermissions({}); // Clear connector permissions
    setSelectedWorkspaces([]); // Clear selected workspaces
    setWorkspacePermissions({}); // Clear workspace permissions
    setGrantAllWorkspaces(false); // Clear all-workspaces flag
    setAllWorkspacesPermission('viewer'); // Reset all-workspaces permission
    setGrantMemoryAccess(false); // Reset memory access
    setGrantResourcesAccess(false); // Reset resources access
    setInheritPermissions(false); // Reset inheritance flag
    setEditingAgentId(null); // Clear editing agent ID
  };

  const handleCopyApiKey = async () => {
    if (!newApiKey) return;

    try {
      await copyToClipboard(newApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 12) {
      return '*'.repeat(key.length);
    }
    return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4);
  };

  // Extract agent name from full agent_id (user_id,agent_name)
  const getAgentDisplayName = (agentId: string) => {
    const parts = agentId.split(',');
    return parts.length === 2 ? parts[1] : agentId;
  };

  // Extract connector name from mount point for display
  // Handles both new convention (/tenant:<tid>/user:<uid>/connector/<name>) and old (/connectors/<name>)
  const getConnectorDisplayName = (mountPoint: string) => {
    // New convention: extract name from /tenant:<tid>/user:<uid>/connector/<name>
    if (mountPoint.includes('/connector/')) {
      const parts = mountPoint.split('/connector/');
      if (parts.length > 1) {
        return parts[1];
      }
    }
    // Old convention: strip /connectors/ prefix
    return mountPoint.replace(/^\/connectors\//, '');
  };

  // Extract workspace name from path for display
  // Handles both new convention (/tenant:<tid>/user:<uid>/workspace/<name>) and old format
  const getWorkspaceDisplayName = (workspacePath: string) => {
    // New convention: extract name from /tenant:<tid>/user:<uid>/workspace/<name>
    if (workspacePath.includes('/workspace/')) {
      const parts = workspacePath.split('/workspace/');
      if (parts.length > 1) {
        return parts[1];
      }
    }
    // Fallback: use last part of path
    return workspacePath.split('/').pop() || workspacePath;
  };

  // Render permission icon based on permission level
  const PermissionIcon = ({ permission }: { permission: 'viewer' | 'editor' | 'owner' }) => {
    if (permission === 'owner') {
      return <Crown className="h-2.5 w-2.5" />;
    } else if (permission === 'editor') {
      return <Pencil className="h-2.5 w-2.5" />;
    } else {
      return <Eye className="h-2.5 w-2.5" />;
    }
  };

  // Filter to only show user's agents
  const userAgents = agents.filter((agent) => {
    const userId = userInfo?.user || userInfo?.subject_id;
    return agent.user_id === userId;
  });

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to files">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Bot className="h-8 w-8" />
            <h1 className="text-2xl font-bold">{t('agent.title')}</h1>
          </div>
          <Button onClick={() => setActiveTab('create')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('agent.create')}
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Introduction */}
          <div className="mb-6">
            <p className="text-muted-foreground">
              {t('agent.description') || 'Manage your AI agents for delegation and multi-agent workflows. Agents inherit all your permissions.'}
            </p>
          </div>

          {/* Tabs */}
          <div className="mb-6 flex items-center gap-2 border-b">
            <Button
              variant="ghost"
              className={`rounded-none border-b-2 ${
                activeTab === 'list' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => setActiveTab('list')}
            >
              {t('agent.myAgents')} ({userAgents.length})
            </Button>
            <Button
              variant="ghost"
              className={`rounded-none border-b-2 ${
                activeTab === 'edit' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => setActiveTab('edit')}
              disabled={!editingAgentId}
            >
              <Bot className="h-4 w-4 mr-1" />
              {t('agent.edit')}
            </Button>
            <Button
              variant="ghost"
              className={`rounded-none border-b-2 ${
                activeTab === 'create' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => {
                if (!newApiKey) {
                  resetForm(); // Reset form when switching to create tab
                  setActiveTab('create');
                }
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('agent.create')}
            </Button>
          </div>

          {/* Tab Content */}
          {activeTab === 'list' ? (
            // Agent List View
            <div className="space-y-4">
              {agentError && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{agentError}</div>}

              {loadingAgents ? (
                <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
              ) : userAgents.length === 0 ? (
                <div className="text-center py-12">
                  <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-4">{t('agent.noAgents')}</p>
                  <Button onClick={() => setActiveTab('create')} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('agent.createFirst')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {userAgents.map((agent) => {
                    const agentName = getAgentDisplayName(agent.agent_id);
                    const connectionStatus = sandboxConnections[agent.agent_id] || {
                      sandboxStatus: 'none',
                      nexusStatus: 'disconnected',
                    };

                    // Determine sandbox status indicator color
                    const sandboxStatusColor = {
                      none: 'bg-gray-400',
                      creating: 'bg-yellow-400 animate-pulse',
                      created: 'bg-blue-500',
                      error: 'bg-red-500',
                    }[connectionStatus.sandboxStatus];

                    // Determine nexus connection status indicator color
                    const nexusStatusColor = {
                      disconnected: 'bg-gray-400',
                      connecting: 'bg-yellow-400 animate-pulse',
                      connected: 'bg-green-500',
                      error: 'bg-red-500',
                    }[connectionStatus.nexusStatus];


                    return (
                      <div key={agent.agent_id} className="border rounded-lg p-4 space-y-3">
                        {/* Agent Header */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Bot className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{agentName}</span>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {new Date(agent.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            {agent.description && <div className="text-sm text-muted-foreground mb-2">{agent.description}</div>}
                            
                            {/* Permission Information */}
                            {agent.has_api_key === false && agent.inherit_permissions === true && (
                              <PermissionInfoBox
                                variant="inherit-no-key"
                                title="Inherits all owner permissions"
                                description="This agent uses your credentials and has full access to all your resources."
                              />
                            )}
                            {agent.has_api_key === true && agent.inherit_permissions === true && (
                              <PermissionInfoBox
                                variant="inherit-with-key"
                                title="Has API key and inherits all owner permissions"
                                description="This agent can authenticate independently and has full access to all your resources."
                              />
                            )}
                            {agent.has_api_key === true && agent.inherit_permissions === false && (
                              <PermissionInfoBox
                                variant="key-no-inherit"
                                title="Has API key with zero permissions by default"
                                description="This agent can authenticate independently but has no access unless explicitly granted."
                              />
                            )}

                            {/* Compact Permissions Display */}
                            <div className="space-y-1.5 text-xs">
                              {/* Skills */}
                              {agent.skills && agent.skills.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <Zap className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <div className="flex flex-wrap gap-1">
                                    {agent.skills.map((skillName) => {
                                      const permission = agent.skillPermissions?.[skillName] || 'viewer';
                                      return (
                                        <span
                                          key={skillName}
                                          className="px-1.5 py-0.5 rounded flex items-center gap-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                        >
                                          <PermissionIcon permission={permission} />
                                          {skillName}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Connectors */}
                              {agent.connectors && agent.connectors.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <Plug className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <div className="flex flex-wrap gap-1">
                                    {agent.connectors.map((conn) => {
                                      const permission = agent.connectorPermissions?.[conn] || 'viewer';
                                      const displayName = getConnectorDisplayName(conn);
                                      const colorClass =
                                        permission === 'owner'
                                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                          : permission === 'editor'
                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
                                      return (
                                        <span
                                          key={conn}
                                          className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${colorClass}`}
                                        >
                                          <PermissionIcon permission={permission} />
                                          {displayName}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Workspaces */}
                              {((agent.workspaces && agent.workspaces.length > 0) || agent.hasAllWorkspaces) && (
                                <div className="flex items-center gap-2">
                                  <Folder className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <div className="flex flex-wrap gap-1">
                                    {agent.hasAllWorkspaces && (
                                      <span
                                        className={`px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                                          agent.allWorkspacesPermission === 'owner'
                                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                            : agent.allWorkspacesPermission === 'editor'
                                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                              : 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400'
                                        }`}
                                      >
                                        <PermissionIcon permission={agent.allWorkspacesPermission || 'viewer'} />
                                        {t('agent.all')}
                                      </span>
                                    )}
                                    {agent.workspaces?.map((ws) => {
                                      const permission = agent.workspacePermissions?.[ws] || 'viewer';
                                      const displayName = getWorkspaceDisplayName(ws);
                                      const colorClass =
                                        permission === 'owner'
                                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                          : permission === 'editor'
                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                            : 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400';
                                      return (
                                        <span
                                          key={ws}
                                          className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${colorClass}`}
                                        >
                                          <PermissionIcon permission={permission} />
                                          {displayName}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Directory Access (Memory, Resources) */}
                              {(agent.hasMemoryAccess || agent.hasResourcesAccess) && (
                                <div className="flex items-center gap-2">
                                  <Database className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <div className="flex flex-wrap gap-1">
                                    {agent.hasMemoryAccess && (
                                      <span className="px-1.5 py-0.5 rounded flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                        <PermissionIcon permission={agent.memoryPermission || 'viewer'} />
                                        {t('landing.memory')}
                                      </span>
                                    )}
                                    {agent.hasResourcesAccess && (
                                      <span className="px-1.5 py-0.5 rounded flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                        <PermissionIcon permission={agent.resourcesPermission || 'viewer'} />
                                        {t('agent.resource')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => navigate(`/?agent=${agent.agent_id}`)}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              {t('agent.useAgent')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditAgent(agent)}
                            >
                              <Bot className="h-4 w-4 mr-1" />
                              {t('agent.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAgent(agent.agent_id, agentName);
                              }}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Compact Connection Status - Clickable */}
                        <div className="border-t pt-2 flex items-center gap-3 text-xs">
                          {/* Nexus Status - Clickable */}
                          <button
                            onClick={() => {
                              if (connectionStatus.nexusStatus === 'disconnected' || connectionStatus.nexusStatus === 'error') {
                                handleConnectNexus(agent.agent_id);
                              }
                            }}
                            disabled={connectionStatus.nexusStatus === 'connecting' || connectionStatus.nexusStatus === 'connected'}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-accent ${
                              connectionStatus.nexusStatus === 'disconnected' || connectionStatus.nexusStatus === 'error'
                                ? 'cursor-pointer'
                                : 'cursor-default opacity-60'
                            }`}
                            title={
                              connectionStatus.nexusStatus === 'disconnected'
                                ? 'Click to connect'
                                : connectionStatus.nexusStatus === 'connecting'
                                  ? 'Connecting...'
                                  : connectionStatus.nexusStatus === 'connected'
                                    ? 'Connected'
                                    : 'Connection error - click to retry'
                            }
                          >
                            <div className={`h-2 w-2 rounded-full ${nexusStatusColor}`} />
                            <span className="text-muted-foreground">Nexus</span>
                          </button>

                          {/* Sandbox Status - Clickable */}
                          <button
                            onClick={() => {
                              if (
                                connectionStatus.nexusStatus === 'connected' &&
                                (connectionStatus.sandboxStatus === 'none' || connectionStatus.sandboxStatus === 'error')
                              ) {
                                handleStartSandbox(agent.agent_id);
                              }
                            }}
                            disabled={
                              connectionStatus.nexusStatus !== 'connected' ||
                              connectionStatus.sandboxStatus === 'creating' ||
                              connectionStatus.sandboxStatus === 'created'
                            }
                            className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-accent ${
                              connectionStatus.nexusStatus === 'connected' &&
                              (connectionStatus.sandboxStatus === 'none' || connectionStatus.sandboxStatus === 'error')
                                ? 'cursor-pointer'
                                : 'cursor-default opacity-60'
                            }`}
                            title={
                              connectionStatus.nexusStatus !== 'connected'
                                ? 'Connect Nexus first'
                                : connectionStatus.sandboxStatus === 'none'
                                  ? 'Click to start'
                                  : connectionStatus.sandboxStatus === 'creating'
                                    ? 'Starting...'
                                    : connectionStatus.sandboxStatus === 'created'
                                      ? `Running (${connectionStatus.sandbox_id})`
                                      : 'Sandbox error - click to retry'
                            }
                          >
                            <div className={`h-2 w-2 rounded-full ${sandboxStatusColor}`} />
                            <span className="text-muted-foreground">Sandbox</span>
                          </button>

                          {/* Error indicator */}
                          {connectionStatus.error && (
                            <span className="text-destructive flex-1 truncate" title={connectionStatus.error}>
                              ⚠ {connectionStatus.error}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm mt-4">
                <p className="text-blue-900 dark:text-blue-100">
                  <strong>How to use agents:</strong> Agents inherit all your permissions and can be used with the{' '}
                  <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">X-Agent-ID</code> header in API requests.
                </p>
              </div>
            </div>
          ) : newApiKey ? (
            // API Key Display View
            <div className="space-y-4">
              <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-orange-900 dark:text-orange-100 mb-1">Important: Save Your API Key</p>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      This is the only time the API key will be displayed. Make sure to copy and save it securely.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-muted p-3 rounded-lg font-mono text-sm break-all border border-border">
                    {showApiKey ? newApiKey : maskApiKey(newApiKey)}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={handleCopyApiKey} title="Copy to clipboard">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
                <p className="text-blue-900 dark:text-blue-100">
                  <strong>Note:</strong> This agent can authenticate using its own API key, or use the owner's credentials with the{' '}
                  <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">X-Agent-ID</code> header (recommended).
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  onClick={() => {
                    resetForm();
                    loadAgents();
                    setActiveTab('list');
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : activeTab === 'edit' ? (
            // Edit Agent Form
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                {/* Agent Name */}
                <div className="space-y-2">
                  <label htmlFor="agent-name" className="text-sm font-medium">
                    {t('agent.name')} *
                  </label>
                  <div className="flex items-center gap-0">
                    <span className="px-3 py-2 bg-muted text-muted-foreground border border-r-0 rounded-l-md font-mono text-sm">
                      {userInfo?.user || 'user'},
                    </span>
                    <Input
                      id="agent-name"
                      placeholder="data_analyst"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value.toLowerCase())}
                      disabled={true} // Always disabled in edit mode
                      className="font-mono rounded-l-none"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('agent.nameCannotChange')}</p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label htmlFor="agent-description" className="text-sm font-medium">
                    {t('agent.descriptionLabel')}
                  </label>
                  <Textarea
                    id="agent-description"
                    placeholder="A general assistant that helps with various tasks..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isRegistering}
                    rows={3}
                  />
                </div>

                {/* Endpoint URL */}
                <div className="space-y-2">
                  <label htmlFor="endpoint-url-edit" className="text-sm font-medium">
                    {t('agent.endpoint')} *
                  </label>
                  <Input
                    id="endpoint-url-edit"
                    placeholder="http://localhost:2024"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    disabled={isRegistering}
                  />
                  <p className="text-xs text-muted-foreground">Agent service endpoint URL</p>
                </div>

                {/* Agent Permission Mode Indicator */}
                {(() => {
                  const hasExplicitPermissions =
                    selectedSkills.length > 0 ||
                    selectedConnectors.length > 0 ||
                    selectedWorkspaces.length > 0 ||
                    grantAllWorkspaces ||
                    grantMemoryAccess ||
                    grantResourcesAccess;

                  if (!hasExplicitPermissions) {
                    return (
                      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-2">
                          <div className="font-medium text-blue-900 dark:text-blue-100">
                            {t('agent.inheritsOwner')}
                          </div>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            {t('agent.inheritsOwnerDesc')}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50/50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                      <Check className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <div className="font-medium text-green-900 dark:text-green-100">
                          {t('agent.explicitPermissions')}
                        </div>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          {t('agent.explicitPermissionsDesc')}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Skills Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('agent.skillsAccess')}</label>
                  {loadingSkills ? (
                    <div className="text-sm text-muted-foreground">{t('agent.loadingSkills')}</div>
                  ) : skills.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('agent.noSkillsAvailable')}</div>
                  ) : (
                    <div className="space-y-2 border rounded-lg p-3 bg-muted/50 max-h-64 overflow-y-auto">
                      {skills.map((skill) => (
                        <div key={skill.name} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            id={`skill-${skill.name}`}
                            checked={selectedSkills.includes(skill.name)}
                            onChange={() => toggleSkill(skill.name)}
                            disabled={isRegistering}
                            className="h-4 w-4 mt-0.5"
                          />
                          <label htmlFor={`skill-${skill.name}`} className="flex-1 cursor-pointer">
                            <div className="text-sm font-medium flex items-center gap-2">
                              {skill.name}
                              {skill.tier && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  skill.tier === 'pro' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                                  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}>
                                  {skill.tier}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{skill.description}</div>
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('agent.selectSkillsDesc')}
                  </p>
                </div>

                {/* Connectors Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Plug className="h-4 w-4" />
                    {t('agent.connectorsAccess')}
                  </label>
                  {loadingConnectors ? (
                    <div className="text-sm text-muted-foreground">{t('agent.loadingConnectors')}</div>
                  ) : connectors.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('agent.noConnectorsAvailable')}</div>
                  ) : (
                    <div className="space-y-2 border rounded-lg p-3 bg-muted/50 max-h-64 overflow-y-auto">
                      {connectors.map((connector) => (
                        <div key={connector.mount_point} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            id={`connector-${connector.mount_point}`}
                            checked={selectedConnectors.includes(connector.mount_point)}
                            onChange={() => toggleConnector(connector.mount_point)}
                            disabled={isRegistering}
                            className="h-4 w-4 mt-0.5"
                          />
                          <label htmlFor={`connector-${connector.mount_point}`} className="flex-1 cursor-pointer">
                            <div className="text-sm font-medium">{getConnectorDisplayName(connector.mount_point)}</div>
                            <div className="text-xs text-muted-foreground">{connector.backend_type}</div>
                          </label>
                          {selectedConnectors.includes(connector.mount_point) && (
                            <select
                              value={connectorPermissions[connector.mount_point] || 'viewer'}
                              onChange={(e) => setConnectorPermission(connector.mount_point, e.target.value as 'viewer' | 'editor')}
                              disabled={isRegistering}
                              className="text-xs px-2 py-1 border rounded bg-background"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="viewer">{t('agent.readOnly')}</option>
                              <option value="editor">{t('agent.readWrite')}</option>
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('agent.selectConnectorsDesc')}
                  </p>
                </div>

                {/* Workspaces Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    {t('agent.workspacesAccess')}
                  </label>

                  {/* All Workspaces Option */}
                  <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id="grant-all-workspaces"
                        checked={grantAllWorkspaces}
                        onChange={(e) => setGrantAllWorkspaces(e.target.checked)}
                        disabled={isRegistering}
                        className="h-4 w-4 mt-0.5"
                      />
                      <label htmlFor="grant-all-workspaces" className="flex-1 cursor-pointer">
                        <div className="text-sm font-medium">{t('agent.grantAllWorkspaces')}</div>
                        <div className="text-xs text-muted-foreground">{t('agent.allWorkspacesDesc')}</div>
                      </label>
                      {grantAllWorkspaces && (
                        <select
                          value={allWorkspacesPermission}
                          onChange={(e) => setAllWorkspacesPermission(e.target.value as 'viewer' | 'editor')}
                          disabled={isRegistering}
                          className="text-xs px-2 py-1 border rounded bg-background"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="viewer">Read-Only</option>
                          <option value="editor">Read-Write</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Individual Workspaces - Always shown */}
                  <div>
                    <label className="text-sm font-medium">{t('agent.individualWorkspaces')}</label>
                    {loadingWorkspaces ? (
                      <div className="text-sm text-muted-foreground mt-2">{t('agent.loadingWorkspaces')}</div>
                    ) : workspaces.length === 0 ? (
                      <div className="text-sm text-muted-foreground mt-2">{t('agent.noWorkspacesAvailable')}</div>
                    ) : (
                      <div className="space-y-2 border rounded-lg p-3 bg-muted/50 max-h-64 overflow-y-auto mt-2">
                        {workspaces.map((workspace) => (
                          <div key={workspace.path} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              id={`workspace-${workspace.path}`}
                              checked={selectedWorkspaces.includes(workspace.path)}
                              onChange={() => toggleWorkspace(workspace.path)}
                              disabled={isRegistering}
                              className="h-4 w-4 mt-0.5"
                            />
                            <label htmlFor={`workspace-${workspace.path}`} className="flex-1 cursor-pointer">
                              <div className="text-sm font-medium">{workspace.name || workspace.path}</div>
                              {workspace.description && (
                                <div className="text-xs text-muted-foreground">{workspace.description}</div>
                              )}
                            </label>
                            {selectedWorkspaces.includes(workspace.path) && (
                              <select
                                value={workspacePermissions[workspace.path] || 'viewer'}
                                onChange={(e) => setWorkspacePermission(workspace.path, e.target.value as 'viewer' | 'editor')}
                                disabled={isRegistering}
                                className="text-xs px-2 py-1 border rounded bg-background"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="viewer">Read-Only</option>
                                <option value="editor">Read-Write</option>
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {grantAllWorkspaces
                      ? t('agent.allWorkspacesEnabled')
                      : t('agent.grantBaseAccess')}
                  </p>
                </div>

                {/* Directory Access (Memory, Resources) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Directory Access</label>
                  <div className="space-y-2 border rounded-lg p-3 bg-muted/50">
                    {/* Memory Access */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="memory-access"
                        checked={grantMemoryAccess}
                        onChange={(e) => setGrantMemoryAccess(e.target.checked)}
                        disabled={isRegistering}
                        className="h-4 w-4"
                      />
                      <label htmlFor="memory-access" className="flex-1 cursor-pointer">
                        <div className="text-sm font-medium flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          Memory (/memory)
                        </div>
                        <div className="text-xs text-muted-foreground">Agent can access memory storage</div>
                      </label>
                    </div>

                    {/* Resources Access */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="resources-access"
                        checked={grantResourcesAccess}
                        onChange={(e) => setGrantResourcesAccess(e.target.checked)}
                        disabled={isRegistering}
                        className="h-4 w-4"
                      />
                      <label htmlFor="resources-access" className="flex-1 cursor-pointer">
                        <div className="text-sm font-medium flex items-center gap-2">
                          <FileArchive className="h-4 w-4" />
                          Resources (/resource)
                        </div>
                        <div className="text-xs text-muted-foreground">Agent can access resource files</div>
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('agent.grantDirectoryDesc')}
                  </p>
                </div>

                {error && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{error}</div>}

                {/* Submit Button */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetForm();
                      setActiveTab('list');
                    }}
                    disabled={isRegistering}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={isRegistering}>
                    {isRegistering ? t('common.loading') : t('common.save')}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            // Register New Agent Form
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                {/* Platform Selection */}
                {activeTab === 'create' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('agent.platform')} *</label>
                    <div className="grid grid-cols-2 gap-3">
                      {AVAILABLE_PLATFORMS.map((platformOption) => (
                        <button
                          key={platformOption.id}
                          type="button"
                          onClick={() => platformOption.enabled && setPlatform(platformOption.id)}
                          disabled={!platformOption.enabled || isRegistering}
                          className={`
                            relative p-4 border-2 rounded-lg text-left transition-all
                            ${platform === platformOption.id && platformOption.enabled
                              ? 'border-primary bg-primary/5'
                              : platformOption.enabled
                                ? 'border-border hover:border-primary/50 cursor-pointer'
                                : 'border-border bg-muted/50 cursor-not-allowed opacity-50'
                            }
                          `}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm mb-1">{platformOption.name}</h3>
                              <p className="text-xs text-muted-foreground">{platformOption.description}</p>
                            </div>
                            {platform === platformOption.id && platformOption.enabled && (
                              <Check className="h-5 w-5 text-primary flex-shrink-0" />
                            )}
                          </div>
                          {!platformOption.enabled && (
                            <span className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              Coming Soon
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agent Name */}
                <div className="space-y-2">
                  <label htmlFor="agent-name" className="text-sm font-medium">
                    {t('agent.name')} *
                  </label>
                  <div className="flex items-center gap-0">
                    <span className="px-3 py-2 bg-muted text-muted-foreground border border-r-0 rounded-l-md font-mono text-sm">
                      {userInfo?.user || 'user'},
                    </span>
                    <Input
                      id="agent-name"
                      placeholder={t('agent.namePlaceholder')}
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value.toLowerCase())}
                      disabled={isRegistering}
                      className="font-mono rounded-l-none"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('agent.nameDescription')}
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label htmlFor="agent-description" className="text-sm font-medium">
                    {t('agent.descriptionLabel')}
                  </label>
                  <Textarea
                    id="agent-description"
                    placeholder={t('agent.descriptionPlaceholder')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isRegistering}
                    rows={3}
                  />
                </div>

                {/* Endpoint URL */}
                <div className="space-y-2">
                  <label htmlFor="endpoint-url" className="text-sm font-medium">
                    {t('agent.endpoint')} *
                  </label>
                  <Input
                    id="endpoint-url"
                    placeholder="http://localhost:2024"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    disabled={isRegistering}
                  />
                  <p className="text-xs text-muted-foreground">Agent service endpoint URL</p>
                </div>

                {/* Agent ID */}
                <div className="space-y-2">
                  <label htmlFor="langgraph-agent-id" className="text-sm font-medium">
                    {t('agent.agentId')}
                  </label>
                  <Input
                    id="langgraph-agent-id"
                    placeholder="agent"
                    value={langgraphAgentId}
                    onChange={(e) => setLanggraphAgentId(e.target.value)}
                    disabled={isRegistering}
                  />
                  <p className="text-xs text-muted-foreground">{t('agent.agentIdDescription')}</p>
                </div>

                {/* Generate API Key Option */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="generate-api-key"
                        checked={generateApiKey}
                        onChange={(e) => setGenerateApiKey(e.target.checked)}
                        disabled={isRegistering}
                        className="h-4 w-4"
                      />
                      <label htmlFor="generate-api-key" className="text-sm font-medium">
                        {t('agent.generateApiKey')}
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      {generateApiKey ? (
                        <span className="text-orange-600 dark:text-orange-400">{t('agent.ownApiKey')}</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">{t('agent.recommendedAuth')}</span>
                      )}
                    </p>

                    {/* Inherit Permissions Option (only shown when API key is generated) */}
                    {generateApiKey && (
                      <div className="ml-6 mt-2 space-y-2 pl-4 border-l-2 border-gray-300 dark:border-gray-700">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="inherit-permissions"
                            checked={inheritPermissions}
                            onChange={(e) => setInheritPermissions(e.target.checked)}
                            disabled={isRegistering}
                            className="h-4 w-4"
                          />
                          <label htmlFor="inherit-permissions" className="text-sm font-medium">
                            {t('agent.inheritPermissionsDesc')}
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {inheritPermissions ? (
                            <span className="text-blue-600 dark:text-blue-400">{t('agent.inheritsAll')}</span>
                          ) : (
                            <span className="text-orange-600 dark:text-orange-400">{t('agent.zeroPermissions')}</span>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Skills Selection - Only show when API key is generated AND inheritance is disabled */}
                    {generateApiKey && !inheritPermissions && (
                      <div className="ml-6 mt-2 space-y-2 pl-4 border-l-2 border-gray-300 dark:border-gray-700">
                        <label className="text-sm font-medium">{t('agent.grantSkills')}</label>
                        {loadingSkills ? (
                          <div className="text-sm text-muted-foreground">{t('agent.loadingSkills')}</div>
                        ) : skills.length === 0 ? (
                          <div className="text-sm text-muted-foreground">{t('agent.noSkillsAvailable')}</div>
                        ) : (
                          <div className="space-y-2 border rounded-lg p-3 bg-muted/50 max-h-64 overflow-y-auto">
                            {skills.map((skill) => (
                              <div key={skill.name} className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  id={`skill-${skill.name}`}
                                  checked={selectedSkills.includes(skill.name)}
                                  onChange={() => toggleSkill(skill.name)}
                                  disabled={isRegistering}
                                  className="h-4 w-4 mt-0.5"
                                />
                                <label htmlFor={`skill-${skill.name}`} className="flex-1 cursor-pointer">
                                  <div className="text-sm font-medium flex items-center gap-2">
                                    {skill.name}
                                    {skill.tier && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                                        skill.tier === 'pro' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                                        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                      }`}>
                                        {skill.tier}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{skill.description}</div>
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t('agent.selectSkillsDesc')}
                        </p>

                        {/* Connectors Selection */}
                        <div className="mt-4">
                          <label className="text-sm font-medium flex items-center gap-2">
                            <Plug className="h-4 w-4" />
                            {t('agent.grantConnectors')}
                          </label>
                          {loadingConnectors ? (
                            <div className="text-sm text-muted-foreground mt-2">{t('agent.loadingConnectors')}</div>
                          ) : connectors.length === 0 ? (
                            <div className="text-sm text-muted-foreground mt-2">{t('agent.noConnectorsAvailable')}</div>
                          ) : (
                            <div className="space-y-2 border rounded-lg p-3 bg-muted/50 max-h-64 overflow-y-auto mt-2">
                              {connectors.map((connector) => (
                                <div key={connector.mount_point} className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    id={`create-connector-${connector.mount_point}`}
                                    checked={selectedConnectors.includes(connector.mount_point)}
                                    onChange={() => toggleConnector(connector.mount_point)}
                                    disabled={isRegistering}
                                    className="h-4 w-4 mt-0.5"
                                  />
                                  <label htmlFor={`create-connector-${connector.mount_point}`} className="flex-1 cursor-pointer">
                                    <div className="text-sm font-medium">{getConnectorDisplayName(connector.mount_point)}</div>
                                    <div className="text-xs text-muted-foreground">{connector.backend_type}</div>
                                  </label>
                                  {selectedConnectors.includes(connector.mount_point) && (
                                    <select
                                      value={connectorPermissions[connector.mount_point] || 'viewer'}
                                      onChange={(e) => setConnectorPermission(connector.mount_point, e.target.value as 'viewer' | 'editor')}
                                      disabled={isRegistering}
                                      className="text-xs px-2 py-1 border rounded bg-background"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="viewer">Read-Only</option>
                                      <option value="editor">Read-Write</option>
                                    </select>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            {t('agent.selectConnectorsDesc')}
                          </p>
                        </div>

                        {/* Workspaces Selection */}
                        <div className="mt-4">
                          <label className="text-sm font-medium flex items-center gap-2">
                            <Folder className="h-4 w-4" />
                            {t('agent.workspacesAccess')}
                          </label>

                          {/* All Workspaces Option */}
                          <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20 mt-2">
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                id="create-grant-all-workspaces"
                                checked={grantAllWorkspaces}
                                onChange={(e) => setGrantAllWorkspaces(e.target.checked)}
                                disabled={isRegistering}
                                className="h-4 w-4 mt-0.5"
                              />
                              <label htmlFor="create-grant-all-workspaces" className="flex-1 cursor-pointer">
                                <div className="text-sm font-medium">{t('agent.grantAllWorkspaces')}</div>
                                <div className="text-xs text-muted-foreground">{t('agent.allWorkspacesDesc')}</div>
                              </label>
                              {grantAllWorkspaces && (
                                <select
                                  value={allWorkspacesPermission}
                                  onChange={(e) => setAllWorkspacesPermission(e.target.value as 'viewer' | 'editor')}
                                  disabled={isRegistering}
                                  className="text-xs px-2 py-1 border rounded bg-background"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <option value="viewer">Read-Only</option>
                                  <option value="editor">Read-Write</option>
                                </select>
                              )}
                            </div>
                          </div>

                          {/* Individual Workspaces - Always shown */}
                          <div className="mt-2">
                            <label className="text-sm font-medium">{t('agent.individualWorkspaces')}</label>
                            {loadingWorkspaces ? (
                              <div className="text-sm text-muted-foreground mt-2">{t('agent.loadingWorkspaces')}</div>
                            ) : workspaces.length === 0 ? (
                              <div className="text-sm text-muted-foreground mt-2">{t('agent.noWorkspacesAvailable')}</div>
                            ) : (
                              <div className="space-y-2 border rounded-lg p-3 bg-muted/50 max-h-64 overflow-y-auto mt-2">
                                {workspaces.map((workspace) => (
                                  <div key={workspace.path} className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      id={`create-workspace-${workspace.path}`}
                                      checked={selectedWorkspaces.includes(workspace.path)}
                                      onChange={() => toggleWorkspace(workspace.path)}
                                      disabled={isRegistering}
                                      className="h-4 w-4 mt-0.5"
                                    />
                                    <label htmlFor={`create-workspace-${workspace.path}`} className="flex-1 cursor-pointer">
                                      <div className="text-sm font-medium">{workspace.name || workspace.path}</div>
                                      {workspace.description && (
                                        <div className="text-xs text-muted-foreground">{workspace.description}</div>
                                      )}
                                    </label>
                                    {selectedWorkspaces.includes(workspace.path) && (
                                      <select
                                        value={workspacePermissions[workspace.path] || 'viewer'}
                                        onChange={(e) => setWorkspacePermission(workspace.path, e.target.value as 'viewer' | 'editor')}
                                        disabled={isRegistering}
                                        className="text-xs px-2 py-1 border rounded bg-background"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <option value="viewer">Read-Only</option>
                                        <option value="editor">Read-Write</option>
                                      </select>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <p className="text-xs text-muted-foreground mt-2">
                            {grantAllWorkspaces
                              ? t('agent.allWorkspacesEnabled')
                              : t('agent.grantBaseAccess')}
                          </p>
                        </div>

                        {/* Directory Access */}
                        <div className="mt-4">
                          <label className="text-sm font-medium">{t('agent.grantDirectory')}</label>
                          <div className="space-y-2 border rounded-lg p-3 bg-muted/50 mt-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="create-memory-access"
                                checked={grantMemoryAccess}
                                onChange={(e) => setGrantMemoryAccess(e.target.checked)}
                                disabled={isRegistering}
                                className="h-4 w-4"
                              />
                              <label htmlFor="create-memory-access" className="flex-1 cursor-pointer">
                                <div className="text-sm font-medium flex items-center gap-2">
                                  <Database className="h-4 w-4" />
                                  {t('agent.memory')}
                                </div>
                                <div className="text-xs text-muted-foreground">{t('agent.memoryDesc')}</div>
                              </label>
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="create-resources-access"
                                checked={grantResourcesAccess}
                                onChange={(e) => setGrantResourcesAccess(e.target.checked)}
                                disabled={isRegistering}
                                className="h-4 w-4"
                              />
                              <label htmlFor="create-resources-access" className="flex-1 cursor-pointer">
                                <div className="text-sm font-medium flex items-center gap-2">
                                  <FileArchive className="h-4 w-4" />
                                  {t('agent.resources')}
                                </div>
                                <div className="text-xs text-muted-foreground">{t('agent.resourcesDesc')}</div>
                              </label>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {t('agent.grantDirectoryDesc')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                {/* Info Box */}
                <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                  <p className="font-medium">{t('agent.permissionModel')}</p>
                  <p className="text-muted-foreground">
                    {!generateApiKey ? (
                      t('agent.fullPermissionsAuto')
                    ) : inheritPermissions ? (
                      t('agent.fullPermissionsKey')
                    ) : (
                      t('agent.zeroPermissionsRec')
                    )}
                  </p>
                </div>

                {error && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{error}</div>}

                {/* Submit Button */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetForm();
                      setActiveTab('list');
                    }}
                    disabled={isRegistering}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={isRegistering}>
                    {isRegistering ? t('agent.registering') : t('agent.register')}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/20 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="font-medium">Nexus Hub</div>
          <div className="flex gap-3">
            <a href="https://github.com/nexi-lab/nexus" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Docs
            </a>
            <span>|</span>
            <a href="https://nexus.nexilab.co/health" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              API
            </a>
            <span>|</span>
            <a href="https://github.com/nexi-lab/nexus/issues" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Help
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
