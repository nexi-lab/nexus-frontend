import type { Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createFilesAPI } from '../api/files';

interface UseLangGraphOptions {
  apiUrl?: string;
  assistantId?: string;
  apiKey?: string; // LangGraph API key
  nexusApiKey?: string; // Nexus API key for tool calls
  nexusServerUrl?: string; // Nexus backend URL for tools
  threadId?: string;
  userId?: string;
  tenantId?: string;
  sandboxId?: string; // Sandbox ID for code execution
  openedFilePath?: string; // Currently opened file path in the editor
  workspacePath?: string; // Selected workspace path
  maxSteps?: number; // Maximum number of steps for agent execution (recursion limit)
  key?: number; // Add key to force recreation
  onThreadIdChange?: (threadId: string) => void;
  skillsFolderPath?: string; // Path to skills folder (default: /tenant:default/user:admin/skill)
}

export type StateType = { messages: Message[] };

const useTypedStream = useStream<StateType>;

// Helper function to fetch assigned skills from a folder
async function fetchAssignedSkills(
  apiClient: any,
  skillsFolderPath: string,
): Promise<Array<{ name: string; description: string; path: string }>> {
  try {
    const filesAPI = createFilesAPI(apiClient);
    
    // List all items in the skills folder
    const items = await filesAPI.list(skillsFolderPath, { details: true });
    
    // Filter for directories only
    const skillDirs = items.filter(item => item.isDirectory);
    
    // Fetch SKILL.md for each directory
    const skills = await Promise.all(
      skillDirs.map(async (dir) => {
        try {
          // Ensure path ends with / before appending SKILL.md
          const normalizedPath = dir.path.endsWith('/') ? dir.path : `${dir.path}/`;
          const skillMdPath = `${normalizedPath}SKILL.md`.replace(/\/+/g, '/');
          const skillMdContent = await filesAPI.read(skillMdPath);
          
          // Decode the content (it's a Uint8Array)
          const textDecoder = new TextDecoder('utf-8');
          const content = textDecoder.decode(skillMdContent);
          
          // Parse SKILL.md to extract name and description
          // SKILL.md format typically has:
          // # Skill Name
          // Description text...
          const lines = content.split('\n');
          let name = dir.name;
          let description = '';
          
          // Try to extract name from first heading
          const firstHeading = lines.find(line => line.startsWith('#'));
          if (firstHeading) {
            name = firstHeading.replace(/^#+\s*/, '').trim() || dir.name;
          }
          
          // Extract description (everything after the first heading, up to next heading or end)
          const firstHeadingIndex = lines.findIndex(line => line.startsWith('#'));
          if (firstHeadingIndex >= 0) {
            const descLines = lines.slice(firstHeadingIndex + 1);
            // Stop at next heading or empty line followed by heading
            let descEnd = descLines.length;
            for (let i = 0; i < descLines.length; i++) {
              if (descLines[i].startsWith('#')) {
                descEnd = i;
                break;
              }
            }
            description = descLines.slice(0, descEnd)
              .map(line => line.trim())
              .filter(line => line.length > 0)
              .join(' ')
              .substring(0, 500); // Limit description length
          }
          
          // Ensure path ends with /
          const skillPath = dir.path.endsWith('/') ? dir.path : `${dir.path}/`;
          
          return {
            name,
            description: description || `Skill: ${name}`,
            path: skillPath,
          };
        } catch (error) {
          console.warn(`Failed to read SKILL.md for ${dir.path}:`, error);
          // Return a basic skill entry even if SKILL.md can't be read
          return {
            name: dir.name,
            description: `Skill: ${dir.name}`,
            path: dir.path.endsWith('/') ? dir.path : `${dir.path}/`,
          };
        }
      })
    );
    
    return skills;
  } catch (error) {
    console.error('Failed to fetch assigned skills:', error);
    return [];
  }
}

export function useLangGraph(options: UseLangGraphOptions = {}) {
  const { apiClient } = useAuth();
  
  // Construct skills folder path dynamically from tenant and user IDs
  // Default to /tenant:<tenant_id>/user:<user_id>/skill if tenantId and userId are provided
  // Otherwise fall back to custom skillsFolderPath or default path
  const skillsFolderPath = options.skillsFolderPath || 
    (options.tenantId && options.userId 
      ? `/tenant:${options.tenantId}/user:${options.userId}/skill`
      : '/tenant:default/user:admin/skill');
  
  // Fetch assigned skills when component mounts or when skillsFolderPath changes
  const [assignedSkills, setAssignedSkills] = useState<Array<{ name: string; description: string; path: string }>>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  
  useEffect(() => {
    if (!apiClient) {
      console.log('[useLangGraph] No API client available, skipping skills fetch');
      setAssignedSkills([]);
      return;
    }
    
    console.log(`[useLangGraph] Fetching assigned skills from: ${skillsFolderPath}`);
    setSkillsLoading(true);
    fetchAssignedSkills(apiClient, skillsFolderPath)
      .then(skills => {
        console.log(`[useLangGraph] Loaded ${skills.length} assigned skills:`, skills.map(s => s.name));
        setAssignedSkills(skills);
        setSkillsLoading(false);
      })
      .catch(error => {
        console.error('[useLangGraph] Error loading assigned skills:', error);
        setAssignedSkills([]);
        setSkillsLoading(false);
      });
  }, [apiClient, skillsFolderPath]);
  
  // Debug logging
  console.log('useLangGraph called with:', {
    apiUrl: options.apiUrl,
    langgraphApiKey: options.apiKey ? `${options.apiKey.substring(0, 20)}...` : 'NOT SET',
    nexusApiKey: options.nexusApiKey ? `${options.nexusApiKey.substring(0, 20)}...` : 'NOT SET',
    nexusServerUrl: options.nexusServerUrl || 'NOT SET',
    assistantId: options.assistantId,
    sandboxId: options.sandboxId || 'NOT SET',
    openedFilePath: options.openedFilePath || 'NOT SET',
    workspacePath: options.workspacePath || 'NOT SET',
    assignedSkillsCount: assignedSkills.length,
  });

  const [currentThreadId, setCurrentThreadId] = useState<string | null>(options.threadId ?? null);

  useEffect(() => {
    setCurrentThreadId(options.threadId ?? null);
  }, [options.threadId]);

  const handleThreadIdChange = (newThreadId: string) => {
    setCurrentThreadId(newThreadId);
    options.onThreadIdChange?.(newThreadId);
  };

  const stream = useTypedStream({
    apiUrl: options.apiUrl || '',
    apiKey: options.apiKey || undefined, // SDK handles auth internally
    assistantId: options.assistantId || '',
    ...(currentThreadId != null ? { threadId: currentThreadId } : {}),
    onThreadId: handleThreadIdChange,
    fetchStateHistory: false, // Don't fetch history to avoid errors
    // Don't add Nexus-specific headers - LangGraph server rejects them with 403
  });

  // Wrap submit to automatically add metadata
  const submitWithMetadata = (input: any, submitOptions?: any) => {
    // Determine the correct Nexus server URL for LangGraph agent
    // If VITE_NEXUS_SERVER_URL is set to http://nexus:2026, use it (Docker environment)
    // Otherwise, use the provided nexusServerUrl (browser's perspective)
    const envNexusServerUrl = import.meta.env.VITE_NEXUS_SERVER_URL;
    const nexusServerUrlForAgent = envNexusServerUrl && envNexusServerUrl.includes('nexus:') 
      ? envNexusServerUrl 
      : options.nexusServerUrl;

    // Add Nexus API key, server URL, sandbox ID, opened file path, workspace path, and assigned skills to metadata for tool calls
    // ALWAYS include agent's API key if provided (from agent config file)
    const metadata = {
      ...submitOptions?.metadata,
      // Always add x_auth if nexusApiKey is provided (from agent config or user's key)
      ...(options.nexusApiKey ? { x_auth: `Bearer ${options.nexusApiKey}` } : {}),
      ...(nexusServerUrlForAgent && { nexus_server_url: nexusServerUrlForAgent }),
      ...(options.sandboxId && { sandbox_id: options.sandboxId }),
      ...(options.openedFilePath && { opened_file_path: options.openedFilePath }),
      ...(options.workspacePath && { workspace_path: options.workspacePath }),
      // Add assigned skills if available
      ...(assignedSkills.length > 0 && { assigned_skills: assignedSkills }),
    };
    
    // Debug logging for metadata
    if (assignedSkills.length > 0) {
      console.log(`[useLangGraph] Including ${assignedSkills.length} assigned skills in metadata:`, assignedSkills.map(s => s.name));
    } else {
      console.log('[useLangGraph] No assigned skills to include in metadata');
    }

    // Build config with recursion_limit (max steps) if specified
    // LangGraph SDK expects recursion_limit (snake_case) in the config object
    const config = {
      ...submitOptions?.config,
      ...(options.maxSteps && { recursion_limit: options.maxSteps }),
    };

    return stream.submit(input, {
      ...submitOptions,
      metadata,
      config,
    });
  };

  const getThreads = async (options: any) => {
    const threads = await stream.client.threads.search({
      offset: 0,
      limit: 1000,
      metadata: {
        ...options,
      },
    });
    return threads;
  };

  return {
    messages: stream.messages,
    isLoading: stream.isLoading,
    submit: submitWithMetadata,
    getThreads,
    threadId: currentThreadId,
    client: (stream as any).client, // Expose client for thread creation
    assignedSkills, // Expose assigned skills for debugging/inspection
    skillsLoading, // Expose loading state for skills
  };
}
