import type { Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';
import { useEffect, useRef, useState } from 'react';
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
  // Model selection
  llmProvider?: 'openai' | 'anthropic' | 'gemini';
  llmTier?: 'pro' | 'flash';
  enableThinking?: boolean;
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
  const [isStopped, setIsStopped] = useState(false);
  const wasManuallyStoppedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentSubmissionRef = useRef<Promise<any> | null>(null);
  const shouldIgnoreUpdatesRef = useRef(false);
  const activeFetchRequestsRef = useRef<Set<AbortController>>(new Set());
  const currentRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    setCurrentThreadId(options.threadId ?? null);
    // Reset stopped state when thread changes
    setIsStopped(false);
    wasManuallyStoppedRef.current = false;
    shouldIgnoreUpdatesRef.current = false;
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

  // Intercept fetch to track and cancel LangGraph API requests
  useEffect(() => {
    const originalFetch = window.fetch;
    const langgraphApiUrl = options.apiUrl || '';
    
    // Only intercept if we have an API URL
    if (!langgraphApiUrl) return;
    
    window.fetch = async (...args) => {
      const [url, init] = args;
      const urlString = typeof url === 'string' ? url : url.toString();
      
      // Check if this is a request to the LangGraph API
      if (urlString.includes(langgraphApiUrl) || urlString.startsWith(langgraphApiUrl)) {
        // Create abort controller for this request
        const controller = new AbortController();
        activeFetchRequestsRef.current.add(controller);
        
        // Also link to the main abort controller if it exists
        // This ensures that when we abort abortControllerRef, all requests are cancelled
        const mainAbortSignal = abortControllerRef.current?.signal;
        
        // Merge signals: existing signal + our controller + main abort controller
        const existingSignal = init?.signal;
        let mergedSignal: AbortSignal;
        
        if (existingSignal || mainAbortSignal) {
          const merged = new AbortController();
          
          // Listen to all signals and abort merged when any is aborted
          if (existingSignal) {
            existingSignal.addEventListener('abort', () => merged.abort());
          }
          controller.signal.addEventListener('abort', () => merged.abort());
          if (mainAbortSignal) {
            mainAbortSignal.addEventListener('abort', () => {
              controller.abort(); // Abort our controller, which will trigger merged abort
              merged.abort();
            });
          }
          
          mergedSignal = merged.signal;
        } else {
          mergedSignal = controller.signal;
        }
        
        try {
          const response = await originalFetch(url, {
            ...init,
            signal: mergedSignal,
          });
          return response;
        } catch (error: any) {
          // If aborted, re-throw as AbortError
          if (error?.name === 'AbortError' || controller.signal.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError');
          }
          throw error;
        } finally {
          // Remove from active requests when done
          activeFetchRequestsRef.current.delete(controller);
        }
      }
      
      // For non-LangGraph requests, use original fetch
      return originalFetch(...args);
    };
    
    // Cleanup: restore original fetch
    return () => {
      window.fetch = originalFetch;
    };
  }, [options.apiUrl]);

  // Track run ID from stream updates
  useEffect(() => {
    const streamAny = stream as any;
    // Try to extract run ID from stream state or events
    if (streamAny._state?.currentRunId) {
      currentRunIdRef.current = streamAny._state.currentRunId;
    } else if (streamAny.runId) {
      currentRunIdRef.current = streamAny.runId;
    }
  }, [stream.isLoading, stream.messages]);

  // Reset stopped state when loading completes naturally (not when manually stopped)
  useEffect(() => {
    if (!stream.isLoading) {
      if (wasManuallyStoppedRef.current) {
        // User manually stopped, keep stopped state true
        setIsStopped(true);
      } else {
        // Stream completed naturally, reset stopped state
        setIsStopped(false);
        currentRunIdRef.current = null;
      }
    }
  }, [stream.isLoading]);

  // Stop the current streaming operation
  const stop = async () => {
    console.log('[useLangGraph] Stop called, aborting active requests...');
    
    // Set flag to ignore further updates
    shouldIgnoreUpdatesRef.current = true;
    
    // First, try to cancel the run via LangGraph client API to clean up incomplete tool calls
    // According to LangGraph SDK docs: client.runs.cancel(threadId, runId, wait?, action?, options?)
    // action can be "interrupt" (default) or "rollback" (deletes run and checkpoints)
    // Using "rollback" helps ensure incomplete tool calls are cleaned up
    try {
      const streamAny = stream as any;
      const client = streamAny.client;
      
      if (client && currentThreadId && currentRunIdRef.current) {
        console.log(`[useLangGraph] Attempting to cancel run: ${currentRunIdRef.current} in thread: ${currentThreadId}`);
        
        try {
          // Use the official LangGraph SDK cancel API
          // Signature: cancel(threadId: string, runId: string, wait?: boolean, action?: "interrupt" | "rollback")
          if (client.runs && typeof client.runs.cancel === 'function') {
            // Use "rollback" action to delete the run and checkpoints, cleaning up incomplete tool calls
            await client.runs.cancel(currentThreadId, currentRunIdRef.current, false, 'rollback');
            console.log('[useLangGraph] Successfully cancelled run via client.runs.cancel with rollback');
          } else {
            console.warn('[useLangGraph] client.runs.cancel is not available');
          }
        } catch (cancelError: any) {
          console.warn('[useLangGraph] Could not cancel run via client API:', cancelError);
          // If rollback fails, try interrupt as fallback
          if (client.runs && typeof client.runs.cancel === 'function') {
            try {
              await client.runs.cancel(currentThreadId, currentRunIdRef.current, false, 'interrupt');
              console.log('[useLangGraph] Cancelled run with interrupt action as fallback');
            } catch (interruptError) {
              console.warn('[useLangGraph] Could not cancel run with interrupt either:', interruptError);
            }
          }
        }
      } else {
        console.warn('[useLangGraph] Missing client, threadId, or runId for cancellation:', {
          hasClient: !!client,
          threadId: currentThreadId,
          runId: currentRunIdRef.current,
        });
      }
      
      // Also try to access internal state and cancel runs (fallback)
      if (streamAny._state) {
        const state = streamAny._state;
        if (state.currentRunId && client && currentThreadId) {
          try {
            if (client.runs && typeof client.runs.cancel === 'function') {
              await client.runs.cancel(currentThreadId, state.currentRunId, false, 'rollback');
              console.log('[useLangGraph] Cancelled run from internal state');
            }
          } catch (err) {
            console.warn('[useLangGraph] Could not cancel run from state:', err);
          }
        }
      }
    } catch (error) {
      console.warn('[useLangGraph] Error attempting to cancel run:', error);
    }
    
    // First, abort the main abort controller - this will cascade to all linked requests
    if (abortControllerRef.current) {
      console.log('[useLangGraph] Aborting main abort controller');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Also directly abort all active fetch requests to LangGraph API
    // This ensures we catch any requests that weren't linked to the main controller
    const requestCount = activeFetchRequestsRef.current.size;
    activeFetchRequestsRef.current.forEach((controller) => {
      try {
        controller.abort();
        console.log('[useLangGraph] Aborted fetch request');
      } catch (error) {
        console.warn('[useLangGraph] Error aborting request:', error);
      }
    });
    activeFetchRequestsRef.current.clear();
    
    console.log(`[useLangGraph] Aborted ${requestCount} active fetch request(s)`);
    
    // Try to access and cancel the stream's internal fetch if possible
    try {
      const streamAny = stream as any;
      
      // Try various possible cancellation methods
      if (streamAny.client) {
        // Try cancel method
        if (typeof streamAny.client.cancel === 'function') {
          streamAny.client.cancel();
        }
      }
      
      // Try to access internal abort controllers
      if (streamAny._abortController) {
        streamAny._abortController.abort();
      }
      if (streamAny.abortController) {
        streamAny.abortController.abort();
      }
      if (streamAny.controller) {
        streamAny.controller.abort();
      }
    } catch (error) {
      console.warn('[useLangGraph] Could not access stream cancellation methods:', error);
    }
    
    wasManuallyStoppedRef.current = true;
    setIsStopped(true);
    currentRunIdRef.current = null; // Clear run ID
    console.log('[useLangGraph] Streaming stopped by user');
  };


  // Helper to check if there are incomplete tool calls in messages
  const hasIncompleteToolCalls = (messages: Message[]): boolean => {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i] as any;
      if (msg.type === 'ai' && msg.tool_calls && msg.tool_calls.length > 0) {
        // Check if the next message has tool results for all tool calls
        const toolCallIds = new Set(msg.tool_calls.map((tc: any) => tc.id || tc.tool_call_id));
        const nextMsg = messages[i + 1];
        
        if (!nextMsg || nextMsg.type !== 'tool') {
          // No tool result message immediately after - incomplete!
          return true;
        }
        
        // Check if all tool calls have results
        let foundResults = 0;
        for (let j = i + 1; j < messages.length && messages[j].type === 'tool'; j++) {
          const toolMsg = messages[j] as any;
          if (toolCallIds.has(toolMsg.tool_call_id)) {
            foundResults++;
          }
        }
        
        if (foundResults < toolCallIds.size) {
          // Not all tool calls have results - incomplete!
          return true;
        }
      }
    }
    return false;
  };

  // Wrap submit to automatically add metadata
  const submitWithMetadata = async (input: any, submitOptions?: any) => {
    // If we're resuming after a stop, check for incomplete tool calls
    if (wasManuallyStoppedRef.current && currentThreadId) {
      console.log('[useLangGraph] Resuming after stop - checking for incomplete tool calls...');
      
      const currentMessages = stream.messages || [];
      if (hasIncompleteToolCalls(currentMessages)) {
        console.warn('[useLangGraph] Detected incomplete tool calls in thread. Starting new thread to avoid error.');
        // Start a new thread to avoid the tool_use/tool_result error
        setCurrentThreadId(null);
        // Wait a bit for the state to update
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        // Try one more time to cancel the run with rollback
        try {
          const streamAny = stream as any;
          const client = streamAny.client;
          
          if (client && currentRunIdRef.current) {
            try {
              if (client.runs && typeof client.runs.cancel === 'function') {
                await client.runs.cancel(currentThreadId, currentRunIdRef.current, true, 'rollback');
                console.log('[useLangGraph] Cancelled incomplete run before resuming');
              }
            } catch (cancelError) {
              console.warn('[useLangGraph] Could not cancel run before resume:', cancelError);
            }
          }
        } catch (error) {
          console.warn('[useLangGraph] Error during pre-resume cleanup:', error);
        }
      }
    }
    
    // Reset stopped state when submitting a new message
    wasManuallyStoppedRef.current = false;
    setIsStopped(false);
    shouldIgnoreUpdatesRef.current = false;
    
    // Clear any previous active requests
    activeFetchRequestsRef.current.forEach((controller) => {
      try {
        controller.abort();
      } catch (error) {
        // Ignore errors when aborting
      }
    });
    activeFetchRequestsRef.current.clear();
    
    // Create new AbortController for this submission
    abortControllerRef.current = new AbortController();
    
    // Try to pass abort signal to submit options if SDK supports it
    const submitOptionsWithAbort = {
      ...submitOptions,
      ...(abortControllerRef.current && { signal: abortControllerRef.current.signal }),
    };
    
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
      // Add model selection if provided
      ...(options.llmProvider && { llm_provider: options.llmProvider }),
      ...(options.llmTier && { llm_tier: options.llmTier }),
      ...(options.enableThinking !== undefined && { enable_thinking: options.enableThinking }),
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

    // Store the submission promise
    const submissionPromise = stream.submit(input, {
      ...submitOptionsWithAbort,
      metadata,
      config,
    });
    
    currentSubmissionRef.current = submissionPromise;
    
    // Handle potential tool_use/tool_result errors by retrying with a new thread
    const wrappedPromise = submissionPromise.catch(async (error: any) => {
      // If we get a tool_use/tool_result error and we were resuming after a stop,
      // automatically start a new thread and retry
      if (error?.message?.includes('tool_use') && error?.message?.includes('tool_result')) {
        console.log('[useLangGraph] Got tool_use/tool_result error, starting new thread and retrying...');
        setCurrentThreadId(null);
        // Wait for thread ID to clear, then retry
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Retry with new thread
        const retryPromise = stream.submit(input, {
          ...submitOptionsWithAbort,
          metadata,
          config,
        });
        
        currentSubmissionRef.current = retryPromise;
        retryPromise.finally(() => {
          currentSubmissionRef.current = null;
          abortControllerRef.current = null;
        });
        
        return retryPromise;
      }
      
      // Re-throw if it's not the tool_use/tool_result error
      throw error;
    });
    
    // Clean up when submission completes
    wrappedPromise.finally(() => {
      currentSubmissionRef.current = null;
      abortControllerRef.current = null;
    });

    return wrappedPromise;
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
    isStopped, // Expose stopped state
    stop, // Expose stop function
    submit: submitWithMetadata,
    getThreads,
    threadId: currentThreadId,
    client: (stream as any).client, // Expose client for thread creation
    assignedSkills, // Expose assigned skills for debugging/inspection
    skillsLoading, // Expose loading state for skills
  };
}
