import axios, { type AxiosInstance } from 'axios';
import type { RPCRequest, RPCResponse } from '../types/file';

// ReBAC tuple type
export type ReBACTuple = {
  tuple_id: string;
  subject_type: string;
  subject_id: string;
  relation: string;
  object_type: string;
  object_id: string;
  created_at: string | null;
};

// Custom error class for authentication errors
export class AuthenticationError extends Error {
  constructor(message: string = 'Invalid or missing API key. Please check your API key and try again.') {
    super(message);
    this.name = 'AuthenticationError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthenticationError);
    }
  }
}

class NexusAPIClient {
  private client: AxiosInstance;
  private requestId = 0;
  private baseURL: string;

  constructor(baseURL: string, apiKey?: string) {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
    });

    // Add response interceptor to catch 401 errors globally
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          // Check if API key is missing or invalid
          const hasApiKey = !!apiKey;
          const errorMessage = hasApiKey
            ? 'API key is invalid or expired. Please check your API key and try again.'
            : 'API key is missing. Please provide a valid API key to access this resource.';
          throw new AuthenticationError(errorMessage);
        }
        return Promise.reject(error);
      }
    );
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  private getNextId(): number {
    return ++this.requestId;
  }

  // Helper to decode base64-encoded bytes and datetime from backend
  private decodeResult(result: any): any {
    // Handle bytes type with base64 data (format: {__type__: 'bytes', data: '...'})
    if (result && typeof result === 'object' && result.__type__ === 'bytes' && result.data) {
      try {
        // Decode base64 to Uint8Array (preserves binary data)
        const binaryString = atob(result.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      } catch (e) {
        console.warn('Failed to decode base64 bytes:', e);
        return result.data;
      }
    }

    // Handle new bytes format (new format: {content: "base64", encoding: "base64"})
    if (result && typeof result === 'object' && result.encoding === 'base64' && result.content) {
      try {
        // Decode base64 to Uint8Array (preserves binary data)
        const binaryString = atob(result.content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      } catch (e) {
        console.warn('Failed to decode base64 bytes (new format):', e);
        return result.content;
      }
    }

    // Handle datetime type with ISO format string
    if (result && typeof result === 'object' && result.__type__ === 'datetime' && result.data) {
      try {
        // Return ISO string directly (JavaScript Date can parse it)
        return result.data;
      } catch (e) {
        console.warn('Failed to decode datetime:', e);
        return result.data;
      }
    }

    // Handle nested objects
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const decoded: any = {};
      for (const key in result) {
        decoded[key] = this.decodeResult(result[key]);
      }
      return decoded;
    }

    // Handle arrays
    if (Array.isArray(result)) {
      return result.map((item) => this.decodeResult(item));
    }

    return result;
  }

  async call<T = any>(method: string, params: any = {}): Promise<T> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.getNextId(),
    };

    try {
      const response = await this.client.post<RPCResponse<T>>(`/api/nfs/${method}`, request);

      if (response.data.error) {
        const err = response.data.error;
        const details = err.data ? ` - ${JSON.stringify(err.data)}` : '';
        throw new Error(`RPC Error ${err.code}: ${err.message}${details}`);
      }

      // Decode bytes and other special types from backend
      const decodedResult = this.decodeResult(response.data.result);
      return decodedResult as T;
    } catch (error) {
      // Re-throw AuthenticationError as-is (from interceptor)
      if (error instanceof AuthenticationError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        // Check for 401 status code
        if (error.response?.status === 401) {
          const hasApiKey = !!this.client.defaults.headers.common['Authorization'];
          const errorMessage = hasApiKey
            ? 'API key is invalid or expired. Please check your API key and try again.'
            : 'API key is missing. Please provide a valid API key to access this resource.';
          throw new AuthenticationError(errorMessage);
        }
        throw new Error(`Network error: ${error.message}${error.response?.data ? ` - ${JSON.stringify(error.response.data)}` : ''}`);
      }
      throw error;
    }
  }

  // Health endpoint - checks server status
  async health(): Promise<{
    status: string;
    version?: string;
  }> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      // Re-throw AuthenticationError as-is (from interceptor)
      if (error instanceof AuthenticationError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        // Check for 401 status code
        if (error.response?.status === 401) {
          const hasApiKey = !!this.client.defaults.headers.common['Authorization'];
          const errorMessage = hasApiKey
            ? 'API key is invalid or expired. Please check your API key and try again.'
            : 'API key is missing. Please provide a valid API key to access this resource.';
          throw new AuthenticationError(errorMessage);
        }
        throw new Error(
          `Health check failed: ${error.message}${
            error.response?.data ? ` - ${JSON.stringify(error.response.data)}` : ''
          }`
        );
      }
      throw error;
    }
  }

  // Whoami endpoint - validates authentication and returns user info
  async whoami(): Promise<{
    authenticated: boolean;
    subject_type?: string;
    subject_id?: string;
    tenant_id?: string;
    is_admin?: boolean;
    user?: string;
  }> {
    try {
      const response = await this.client.get('/api/auth/whoami');
      return response.data;
    } catch (error) {
      // Re-throw AuthenticationError as-is (from interceptor)
      if (error instanceof AuthenticationError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          const hasApiKey = !!this.client.defaults.headers.common['Authorization'];
          const errorMessage = hasApiKey
            ? 'API key is invalid or expired. Please check your API key and try again.'
            : 'API key is missing. Please provide a valid API key to access this resource.';
          throw new AuthenticationError(errorMessage);
        }
        throw new Error(`Authentication error: ${error.message}${error.response?.data?.message ? ` - ${error.response.data.message}` : ''}`);
      }
      throw error;
    }
  }

  // ===== User Authentication Methods =====

  /**
   * Register a new user account.
   *
   * @param params - Registration parameters
   * @returns User information and JWT token
   */
  async authRegister(params: {
    email: string;
    password: string;
    username?: string;
    display_name?: string;
  }): Promise<{
    user_id: string;
    email: string;
    username: string | null;
    display_name: string | null;
    token: string;
    message: string;
  }> {
    const response = await this.client.post('/auth/register', params);
    return response.data;
  }

  /**
   * Login with email/username and password.
   *
   * @param params - Login credentials
   * @returns User information and JWT token
   */
  async authLogin(params: {
    identifier: string; // email or username
    password: string;
  }): Promise<{
    token: string;
    user: {
      user_id: string;
      email: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      primary_auth_method: string;
      is_global_admin: boolean;
      email_verified: boolean;
      api_key: string | null;
      tenant_id: string | null;
      created_at: string;
      last_login_at: string | null;
    };
    message: string;
  }> {
    const response = await this.client.post('/auth/login', params);
    return response.data;
  }

  /**
   * Get current user profile.
   *
   * @returns Current user information
   */
  async authGetProfile(): Promise<{
    user_id: string;
    email: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    primary_auth_method: string;
    is_global_admin: boolean;
    email_verified: boolean;
    api_key: string | null;
    tenant_id: string | null;
    created_at: string;
    last_login_at: string | null;
  }> {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  /**
   * Update current user profile.
   *
   * @param params - Profile update parameters
   * @returns Updated user information
   */
  async authUpdateProfile(params: {
    display_name?: string;
    avatar_url?: string;
  }): Promise<{
    user_id: string;
    email: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    primary_auth_method: string;
    is_global_admin: boolean;
    email_verified: boolean;
    api_key: string | null;
    tenant_id: string | null;
    created_at: string;
    last_login_at: string | null;
  }> {
    const response = await this.client.patch('/auth/me', params);
    return response.data;
  }

  /**
   * Get current user information.
   *
   * @returns Current user account information
   */
  async authGetMe(): Promise<{
    user_id: string;
    email: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    primary_auth_method: string;
    is_global_admin: boolean;
    email_verified: boolean;
    api_key: string | null;
    tenant_id: string | null;
    created_at: string;
    last_login_at: string | null;
  }> {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  /**
   * Change user password.
   *
   * @param params - Password change parameters
   * @returns Success status
   */
  async authChangePassword(params: {
    old_password: string;
    new_password: string;
  }): Promise<{
    message: string;
    success: boolean;
  }> {
    const response = await this.client.post('/auth/change-password', params);
    return response.data;
  }

  /**
   * Update API client token (for use after login).
   *
   * @param token - JWT token
   */
  setAuthToken(token: string | null) {
    if (token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.client.defaults.headers.common['Authorization'];
    }
  }

  /**
   * Get Google OAuth authorization URL.
   */
  async authGoogleAuthorize(): Promise<{
    auth_url: string;
    state: string;
    message: string;
  }> {
    const response = await this.client.get('/auth/oauth/google/authorize');
    return response.data;
  }

  /**
   * Check OAuth user and get confirmation data if new user.
   */
  async authOAuthCheck(params: {
    provider: string;
    code: string;
    state: string;
  }): Promise<
    | {
        needs_confirmation: false;
        token: string;
        user: {
          user_id: string;
          email: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          primary_auth_method: string;
          is_global_admin: boolean;
          email_verified: boolean;
          created_at: string;
          last_login_at: string | null;
        };
        is_new_user: boolean;
        api_key: string | null;
        tenant_id: string | null;
        message: string;
      }
    | {
        needs_confirmation: true;
        pending_token: string;
        user_info: {
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          oauth_provider: string;
          oauth_code: string;
          oauth_state: string | null;
        };
        tenant_info: {
          tenant_id: string;
          name: string;
          domain: string | null;
          description: string | null;
          is_personal: boolean;
          can_edit_name: boolean;
        };
        message: string;
      }
  > {
    const response = await this.client.post('/auth/oauth/check', params);
    return response.data;
  }

  /**
   * Confirm OAuth user registration after reviewing info.
   */
  async authOAuthConfirm(params: {
    pending_token: string;
    tenant_name?: string | null;
    tenant_slug?: string | null;
  }): Promise<{
    token: string;
    user: {
      user_id: string;
      email: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      primary_auth_method: string;
      is_global_admin: boolean;
      email_verified: boolean;
      created_at: string;
      last_login_at: string | null;
    };
    is_new_user: boolean;
    api_key: string | null;
    tenant_id: string | null;
    message: string;
  }> {
    const response = await this.client.post('/auth/oauth/confirm', params);
    return response.data;
  }

  /**
   * Handle OAuth callback.
   */
  async authOAuthCallback(params: {
    provider: string;
    code: string;
    state: string;
  }): Promise<{
    token: string;
    user: {
      user_id: string;
      email: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      primary_auth_method: string;
      is_global_admin: boolean;
      email_verified: boolean;
      created_at: string;
      last_login_at: string | null;
    };
    is_new_user: boolean;
    api_key: string | null;
    tenant_id: string | null;
    message: string;
  }> {
    const response = await this.client.post('/auth/oauth/callback', params);
    return response.data;
  }

  // Admin API - Create a new API key for a user
  async adminCreateKey(params: {
    tenant_id: string;
    name: string;
    user_id?: string;
    is_admin?: boolean;
    expires_days?: number | null;
    subject_type?: string;
    subject_id?: string;
  }): Promise<{ api_key: string; key_id: string; user_id: string; name: string }> {
    return await this.call('admin_create_key', params);
  }

  // Admin API - List API keys
  async adminListKeys(params?: {
    user_id?: string;
    tenant_id?: string;
    is_admin?: boolean;
    include_revoked?: boolean;
    include_expired?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ keys: Array<any>; total: number; limit: number; offset: number }> {
    return await this.call('admin_list_keys', params || {});
  }

  // Admin API - Get API key details
  async adminGetKey(keyId: string): Promise<any> {
    return await this.call('admin_get_key', { key_id: keyId });
  }

  // Admin API - Revoke an API key
  async adminRevokeKey(keyId: string): Promise<{ success: boolean; key_id: string }> {
    return await this.call('admin_revoke_key', { key_id: keyId });
  }

  // Admin API - Update API key properties
  async adminUpdateKey(params: { key_id: string; expires_days?: number; is_admin?: boolean; name?: string }): Promise<any> {
    return await this.call('admin_update_key', params);
  }

  // Workspace API - Register a new workspace
  async registerWorkspace(params: { path: string; name?: string; description?: string; created_by?: string }): Promise<{
    path: string;
    name: string | null;
    description: string;
    created_at: string;
    created_by: string | null;
    metadata: Record<string, any>;
  }> {
    return await this.call('register_workspace', params);
  }

  // Workspace API - List all workspaces
  async listWorkspaces(): Promise<
    Array<{
      path: string;
      name: string | null;
      description: string;
      created_at: string;
      created_by: string | null;
      metadata: Record<string, any>;
    }>
  > {
    return await this.call('list_workspaces', {});
  }

  // Workspace API - Unregister a workspace
  async unregisterWorkspace(path: string): Promise<boolean> {
    return await this.call('unregister_workspace', { path });
  }

  // Workspace API - Get workspace info
  async getWorkspaceInfo(path: string): Promise<{
    path: string;
    name: string | null;
    description: string;
    created_at: string;
    created_by: string | null;
    metadata: Record<string, any>;
  } | null> {
    return await this.call('get_workspace_info', { path });
  }

  // Agent API - Register a new agent
  async registerAgent(params: {
    agent_id: string;
    name: string;
    description?: string;
    generate_api_key?: boolean;
    inherit_permissions?: boolean; // v0.5.1: Permission inheritance control
    metadata?: Record<string, any>; // v0.5.1: Optional metadata (platform, endpoint_url, etc.)
  }): Promise<{
    agent_id: string;
    user_id: string;
    name: string;
    description?: string;
    api_key?: string;
    created_at: string;
  }> {
    return await this.call('register_agent', params);
  }

  // Agent API - Update existing agent configuration
  async updateAgent(params: {
    agent_id: string;
    name?: string;
    description?: string;
    metadata?: Record<string, any>; // Optional metadata (platform, endpoint_url, agent_id, etc.)
  }): Promise<{
    agent_id: string;
    user_id: string;
    name: string;
    description?: string;
    metadata: Record<string, any>;
    config_path: string;
  }> {
    return await this.call('update_agent', params);
  }

  // Agent API - List all agents
  async listAgents(): Promise<
    Array<{
      agent_id: string;
      user_id: string;
      name: string;
      created_at: string;
    }>
  > {
    return await this.call('list_agents', {});
  }

  // Agent API - Get agent details
  async getAgent(agentId: string): Promise<{
    agent_id: string;
    user_id: string;
    name: string;
    created_at: string;
    description?: string;
    has_api_key?: boolean;
    inherit_permissions?: boolean;
    api_key?: string; // API key from config.yaml if agent has one
    platform?: string; // From config.yaml
    endpoint_url?: string; // From config.yaml
    config_agent_id?: string; // agent_id from config.yaml (to avoid confusion with agent_id)
    system_prompt?: string; // From config.yaml
    tools?: string[]; // From config.yaml
  }> {
    return await this.call('get_agent', { agent_id: agentId });
  }

  // Agent API - Delete agent
  async deleteAgent(agentId: string): Promise<boolean> {
    return await this.call('delete_agent', { agent_id: agentId });
  }

  // Sandbox API - Create a new sandbox
  async sandboxCreate(params: {
    name: string;
    ttl_minutes?: number;
    template_id?: string;
    provider?: string;
  }): Promise<{
    sandbox_id: string;
    name: string;
    user_id: string;
    agent_id: string | null;
    tenant_id: string;
    provider: string;
    template_id: string | null;
    status: string;
    created_at: string;
    last_active_at: string;
    ttl_minutes: number;
    expires_at: string | null;
  }> {
    return await this.call('sandbox_create', params);
  }

  // Sandbox API - Connect to user-managed sandbox
  async sandboxConnect(params: {
    sandbox_id: string;
    provider?: string;
    sandbox_api_key?: string;
    mount_path?: string;
    nexus_url?: string;
    nexus_api_key?: string;
  }): Promise<{
    success: boolean;
    sandbox_id: string;
    provider: string;
    mount_path: string;
    mounted_at: string;
  }> {
    return await this.call('sandbox_connect', params);
  }

  // Sandbox API - Disconnect from user-managed sandbox
  async sandboxDisconnect(params: {
    sandbox_id: string;
    provider?: string;
    sandbox_api_key?: string;
  }): Promise<{
    success: boolean;
    sandbox_id: string;
    provider: string;
    unmounted_at: string;
  }> {
    return await this.call('sandbox_disconnect', params);
  }

  // Sandbox API - List sandboxes
  async sandboxList(params?: {
    verify_status?: boolean;
    user_id?: string;
    tenant_id?: string;
    agent_id?: string;
    status?: string;
  }): Promise<{
    sandboxes: Array<{
      sandbox_id: string;
      name: string;
      user_id: string;
      agent_id: string | null;
      tenant_id: string;
      provider: string;
      template_id: string | null;
      status: string;
      created_at: string;
      last_active_at: string;
      paused_at: string | null;
      stopped_at: string | null;
      ttl_minutes: number;
      expires_at: string | null;
      uptime_seconds: number;
      verified?: boolean;
      provider_status?: string;
    }>;
  }> {
    return await this.call('sandbox_list', params || {});
  }

  // Sandbox API - Get sandbox status
  async sandboxStatus(sandbox_id: string): Promise<{
    sandbox_id: string;
    name: string;
    user_id: string;
    agent_id: string | null;
    tenant_id: string;
    provider: string;
    template_id: string | null;
    status: string;
    created_at: string;
    last_active_at: string;
    paused_at: string | null;
    stopped_at: string | null;
    ttl_minutes: number;
    expires_at: string | null;
    uptime_seconds: number;
  }> {
    return await this.call('sandbox_status', { sandbox_id });
  }

  // Sandbox API - Run code in sandbox
  async sandboxRun(params: {
    sandbox_id: string;
    language: string;
    code: string;
    timeout?: number;
  }): Promise<{
    stdout: string;
    stderr: string;
    exit_code: number;
    execution_time: number;
  }> {
    return await this.call('sandbox_run', params);
  }

  // Sandbox API - Pause sandbox
  async sandboxPause(sandbox_id: string): Promise<{
    sandbox_id: string;
    name: string;
    status: string;
    paused_at: string;
  }> {
    return await this.call('sandbox_pause', { sandbox_id });
  }

  // Sandbox API - Resume sandbox
  async sandboxResume(sandbox_id: string): Promise<{
    sandbox_id: string;
    name: string;
    status: string;
    last_active_at: string;
  }> {
    return await this.call('sandbox_resume', { sandbox_id });
  }

  // Sandbox API - Stop sandbox
  async sandboxStop(sandbox_id: string): Promise<{
    sandbox_id: string;
    name: string;
    status: string;
    stopped_at: string;
  }> {
    return await this.call('sandbox_stop', { sandbox_id });
  }

  // Sandbox API - Get or create sandbox
  async sandboxGetOrCreate(params: {
    name: string;
    ttl_minutes?: number;
    provider?: string;
    template_id?: string;
    verify_status?: boolean;
  }): Promise<{
    sandbox_id: string;
    name: string;
    user_id: string;
    agent_id: string | null;
    tenant_id: string;
    provider: string;
    template_id: string | null;
    status: string;
    created_at: string;
    last_active_at: string;
    ttl_minutes: number;
    expires_at: string | null;
  }> {
    return await this.call('sandbox_get_or_create', params);
  }

  // ReBAC API - Create a relationship tuple
  async rebacCreate(params: {
    subject: [string, string];
    relation: string;
    object: [string, string];
    expires_at?: string;
    tenant_id?: string;
  }): Promise<string> {
    return await this.call('rebac_create', params);
  }

  // ReBAC API - List relationship tuples
  async rebacListTuples(params?: { subject?: [string, string]; relation?: string; object?: [string, string] }): Promise<ReBACTuple[]> {
    return await this.call('rebac_list_tuples', params || {});
  }

  // ReBAC API - Delete a relationship tuple
  async rebacDelete(params: { tuple_id: string }): Promise<boolean> {
    return await this.call('rebac_delete', params);
  }

  // Permission mapping: ReBAC relation to permission level
  private readonly PERMISSION_MAP: Record<string, 'viewer' | 'editor' | 'owner'> = {
    'direct_owner': 'owner',
    'parent_owner': 'owner',
    'direct_editor': 'editor',
    'parent_editor': 'editor',
    'direct_viewer': 'viewer',
    'parent_viewer': 'viewer',
  };

  private getPermissionLevel(relation: string): 'viewer' | 'editor' | 'owner' {
    return this.PERMISSION_MAP[relation] || 'viewer';
  }

  // Generic helper: Get agent resource access with permissions
  private async getAgentResourceAccess<T>(
    agentId: string,
    resourceFetcher: () => Promise<T[]>,
    pathExtractor: (resource: T) => string,
    pathFilter?: (path: string) => boolean,
    nameExtractor?: (resource: T) => string | null,
    tuples?: ReBACTuple[]
  ): Promise<Array<{name?: string; path: string; permission: 'viewer' | 'editor' | 'owner'}>> {
    try {
      // Get all available resources
      const resources = await resourceFetcher();
      
      // Build path to resource mapping
      const pathToResource = new Map<string, T>();
      const validPaths = new Set<string>();
      
      for (const resource of resources) {
        const path = pathExtractor(resource);
        if (path && (!pathFilter || pathFilter(path))) {
          validPaths.add(path);
          pathToResource.set(path, resource);
        }
      }

      // Check ReBAC permissions to find which resources this agent has access to
      // Use provided tuples if available, otherwise fetch them
      const permissionTuples = tuples || await this.rebacListTuples({ subject: ['agent', agentId] });

      // Extract resources and their permission levels from granted permissions
      const grantedResources: Array<{name?: string; path: string; permission: 'viewer' | 'editor' | 'owner'}> = [];
      
      for (const tuple of permissionTuples) {
        if (tuple.object_type === 'file' && validPaths.has(tuple.object_id)) {
          const resource = pathToResource.get(tuple.object_id);
          if (resource) {
            const permission = this.getPermissionLevel(tuple.relation);
            const name = nameExtractor ? nameExtractor(resource) : null;

            grantedResources.push({ 
              name: name || undefined, 
              path: tuple.object_id, 
              permission: permission as 'viewer' | 'editor' | 'owner' 
            });
          }
        }
      }

      // Deduplicate by path (or name if available), preferring highest permission level
      const resourceMap = new Map<string, {name?: string; path: string; permission: 'viewer' | 'editor' | 'owner'}>();
      const permissionPriority = { viewer: 1, editor: 2, owner: 3 };

      for (const resource of grantedResources) {
        const key = resource.name || resource.path;
        const existing = resourceMap.get(key);
        if (!existing || permissionPriority[resource.permission] > permissionPriority[existing.permission]) {
          resourceMap.set(key, resource);
        }
      }

      return Array.from(resourceMap.values());
    } catch (err) {
      console.error('Failed to get agent resource access:', err);
      return [];
    }
  }

  // Helper: Get skill names and permissions granted to an agent
  async getAgentSkills(
    agentId: string,
    tuples?: ReBACTuple[]
  ): Promise<Array<{name: string; permission: 'viewer' | 'editor' | 'owner'}>> {
    const result = await this.getAgentResourceAccess<{name: string; file_path?: string}>(
      agentId,
      async () => {
        const skillsResult = await this.skillsList();
        return skillsResult.skills.filter(s => s.file_path);
      },
      (skill) => skill.file_path ? skill.file_path.substring(0, skill.file_path.lastIndexOf('/')) : '',
      (path) => path.startsWith('/skills/') || path.includes('/skill/'), // Support both old (/skills/) and new (/skill/) namespace
      (skill) => skill.name,
      tuples
    );
    
    // Filter to ensure we have names and return in the expected format
    return result
      .filter(r => r.name)
      .map(r => ({ name: r.name!, permission: r.permission }));
  }

  // List all mounts
  async listMounts(): Promise<Array<{
    mount_point: string;
    priority: number;
    readonly: boolean;
    backend_type: string;
  }>> {
    const result = await this.call('list_mounts', {});
    return result as Array<{
      mount_point: string;
      priority: number;
      readonly: boolean;
      backend_type: string;
    }>;
  }

  // Helper: Get connector mount points and permissions granted to an agent
  async getAgentConnectors(
    agentId: string,
    tuples?: ReBACTuple[]
  ): Promise<Array<{path: string; permission: 'viewer' | 'editor' | 'owner'}>> {
    const result = await this.getAgentResourceAccess<{mount_point: string}>(
      agentId,
      async () => {
        const mounts = await this.listMounts();
        // Filter for connectors: new convention (/tenant:<tid>/user:<uid>/connector/<name>) or old (/connectors/)
        return mounts.filter(m => {
          const path = m.mount_point;
          return path.includes('/connector/') || path.startsWith('/connectors/');
        });
      },
      (mount) => mount.mount_point,
      (path) => path.includes('/connector/') || path.startsWith('/connectors/'),
      undefined,
      tuples
    );
    
    return result.map(r => ({ path: r.path, permission: r.permission }));
  }

  // Helper: Get workspace paths and permissions granted to an agent
  async getAgentWorkspaces(
    agentId: string,
    tuples?: ReBACTuple[]
  ): Promise<Array<{path: string; permission: 'viewer' | 'editor' | 'owner'}>> {
    const result = await this.getAgentResourceAccess(
      agentId,
      async () => await this.listWorkspaces(),
      (workspace) => workspace.path,
      undefined,
      undefined,
      tuples
    );
    
    return result.map(r => ({ path: r.path, permission: r.permission }));
  }

  // Helper: Check if agent has access to a directory (memory, resources) and return permission level
  async getDirectoryAccess(
    agentId: string,
    directory: string,
    tuples?: ReBACTuple[],
    tenantId?: string,
    userId?: string
  ): Promise<{ hasAccess: boolean; permission?: 'viewer' | 'editor' | 'owner' }> {
    try {
      // Use provided tuples if available, otherwise fetch them
      const permissionTuples = tuples || await this.rebacListTuples({ subject: ['agent', agentId] });
      
      // Construct the full path based on the new namespace convention
      let fullPath: string;
      if (tenantId && userId) {
        // New convention: /tenant:<tenant_id>/user:<user_id>/<directory>
        // Remove leading slash from directory if present
        const dirName = directory.startsWith('/') ? directory.substring(1) : directory;
        fullPath = `/tenant:${tenantId}/user:${userId}/${dirName}`;
      } else {
        // Fallback to old convention or direct path
        fullPath = directory;
      }
      
      const tuple = permissionTuples.find(t => t.object_type === 'file' && t.object_id === fullPath);

      if (tuple) {
        const permission = this.getPermissionLevel(tuple.relation);
        return { hasAccess: true, permission: permission as 'viewer' | 'editor' | 'owner' };
      }

      return { hasAccess: false };
    } catch (err) {
      console.error(`Failed to check directory access for ${directory}:`, err);
      return { hasAccess: false };
    }
  }

  // Backward compatibility: Keep old method name
  async hasDirectoryAccess(agentId: string, directory: string): Promise<boolean> {
    const result = await this.getDirectoryAccess(agentId, directory);
    return result.hasAccess;
  }

  // Helper: Check if agent has access to all workspaces and return permission level
  async getAllWorkspacesAccess(
    agentId: string,
    tuples?: ReBACTuple[],
    tenantId?: string
  ): Promise<{ hasAccess: boolean; permission?: 'viewer' | 'editor' | 'owner' }> {
    try {
      // Use provided tuples if available, otherwise fetch them
      const permissionTuples = tuples || await this.rebacListTuples({ subject: ['agent', agentId] });

      // Extract user_id from agent_id (format: "user_id,agent_name")
      const userId = agentId.split(',')[0];

      // Check new convention path first: /tenant:<tenant_id>/user:<user_id>/workspace
      const newWorkspaceRootPath = tenantId ? `/tenant:${tenantId}/user:${userId}/workspace` : null;
      // Fall back to old convention: /workspace/<user_id>
      const oldWorkspaceRootPath = `/workspace/${userId}`;

      // Find tuple for workspace root (try new convention first, then old)
      let workspaceTuple = newWorkspaceRootPath
        ? permissionTuples.find(t => t.object_type === 'file' && t.object_id === newWorkspaceRootPath)
        : undefined;

      if (!workspaceTuple) {
        workspaceTuple = permissionTuples.find(t => t.object_type === 'file' && t.object_id === oldWorkspaceRootPath);
      }

      if (workspaceTuple) {
        const permission = this.getPermissionLevel(workspaceTuple.relation);
        return { hasAccess: true, permission: permission as 'viewer' | 'editor' | 'owner' };
      }

      return { hasAccess: false };
    } catch (err) {
      console.error('Failed to check all workspaces access:', err);
      return { hasAccess: false };
    }
  }

  // Version History API - List all versions of a file
  async listVersions(path: string): Promise<
    Array<{
      version: number;
      content_hash: string;
      size: number;
      mime_type: string;
      created_at: string;
      created_by: string | null;
      change_reason: string | null;
      source_type: string | null;
      parent_version_id: number | null;
    }>
  > {
    return await this.call('list_versions', { path });
  }

  // Version History API - Get a specific version of a file
  async getVersion(path: string, version: number): Promise<Uint8Array> {
    return await this.call('get_version', { path, version });
  }

  // Version History API - Rollback file to a previous version
  async rollback(path: string, version: number): Promise<void> {
    return await this.call('rollback', { path, version });
  }

  // Memory Path Registration API - Register a memory path
  async registerMemory(params: { path: string; name?: string; description?: string; created_by?: string; metadata?: Record<string, any> }): Promise<{
    path: string;
    name: string | null;
    description: string;
    created_at: string;
    created_by: string | null;
    metadata: Record<string, any>;
  }> {
    return await this.call('register_memory', params);
  }

  // Memory Path Registration API - List registered memory paths
  async listRegisteredMemories(): Promise<
    Array<{
      path: string;
      name: string | null;
      description: string;
      created_at: string;
      created_by: string | null;
      metadata: Record<string, any>;
    }>
  > {
    return await this.call('list_registered_memories', {});
  }

  // Memory Path Registration API - Unregister a memory path
  async unregisterMemory(path: string): Promise<boolean> {
    return await this.call('unregister_memory', { path });
  }

  // Memory Path Registration API - Get memory path info
  async getMemoryInfo(path: string): Promise<{
    path: string;
    name: string | null;
    description: string;
    created_at: string;
    created_by: string | null;
    metadata: Record<string, any>;
  } | null> {
    return await this.call('get_memory_info', { path });
  }

  // Memory API - Store a memory record
  async storeMemory(params: {
    content: string;
    scope?: string;
    memory_type?: string;
    importance?: number;
    namespace?: string;
    path_key?: string;
    state?: string;
    tags?: string[];
  }): Promise<{ memory_id: string }> {
    return await this.call('store_memory', params);
  }

  // Memory API - List memory records
  async listMemoryRecords(params?: { scope?: string; memory_type?: string; limit?: number }): Promise<{
    memories: Array<{
      memory_id: string;
      content_hash: string;
      tenant_id: string | null;
      user_id: string | null;
      agent_id: string | null;
      scope: string;
      visibility: string;
      memory_type: string | null;
      importance: number | null;
      created_at: string | null;
      updated_at: string | null;
    }>;
  }> {
    return await this.call('list_memories', params || {});
  }

  // Memory API - Query memory records
  async queryMemoryRecords(params?: { scope?: string; memory_type?: string; state?: string | null; limit?: number }): Promise<{
    memories: Array<{
      memory_id: string;
      content: string;
      content_hash: string;
      tenant_id: string | null;
      user_id: string | null;
      agent_id: string | null;
      scope: string;
      visibility: string;
      memory_type: string | null;
      importance: number | null;
      state: string | null;
      namespace: string | null;
      path_key: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>;
  }> {
    return await this.call('query_memories', params || {});
  }

  // Memory API - Delete a memory record
  async deleteMemory(memory_id: string): Promise<{ deleted: boolean }> {
    return await this.call('delete_memory', { memory_id });
  }

  // Memory API - Approve/activate a memory record
  async approveMemory(memory_id: string): Promise<{ approved: boolean }> {
    return await this.call('approve_memory', { memory_id });
  }

  // Memory API - Deactivate a memory record
  async deactivateMemory(memory_id: string): Promise<{ deactivated: boolean }> {
    return await this.call('deactivate_memory', { memory_id });
  }

  // Memory API - Update a memory record
  async updateMemory(params: { memory_id: string; content?: string; importance?: number }): Promise<{
    memory: {
      memory_id: string;
      content: string;
      content_hash: string;
      tenant_id: string | null;
      user_id: string | null;
      agent_id: string | null;
      scope: string;
      visibility: string;
      memory_type: string | null;
      importance: number | null;
      state: string | null;
      namespace: string | null;
      path_key: string | null;
      created_at: string | null;
      updated_at: string | null;
    };
  }> {
    return await this.call('update_memory', params);
  }

  // ===== OAuth Methods =====

  /**
   * List all available OAuth providers from configuration.
   *
   * @returns List of provider information
   */
  async oauthListProviders(): Promise<Array<{
    name: string;
    display_name: string;
    scopes: string[];
    requires_pkce: boolean;
    icon_url?: string;
    metadata: Record<string, any>;
  }>> {
    return await this.call('oauth_list_providers', {});
  }

  /**
   * Get OAuth authorization URL for Google Drive.
   *
   * @param redirectUri - OAuth redirect URI (default: http://localhost:5173/oauth/callback)
   * @returns Authorization URL and state token
   */
  async oauthGetDriveAuthUrl(redirectUri?: string): Promise<{
    url: string;
    state: string;
  }> {
    return await this.call('oauth_get_auth_url', {
      provider: 'google-drive',
      redirect_uri: redirectUri || 'http://localhost:5173/oauth/callback',
    });
  }

  /**
   * Get OAuth authorization URL for Gmail.
   *
   * @param redirectUri - OAuth redirect URI (default: http://localhost:5173/oauth/callback)
   * @returns Authorization URL and state token
   */
  async oauthGetGmailAuthUrl(redirectUri?: string): Promise<{
    url: string;
    state: string;
  }> {
    return await this.call('oauth_get_auth_url', {
      provider: 'gmail',
      redirect_uri: redirectUri || 'http://localhost:5173/oauth/callback',
    });
  }

  /**
   * Get OAuth authorization URL for Google Cloud Storage.
   *
   * @param redirectUri - OAuth redirect URI (default: http://localhost:5173/oauth/callback)
   * @returns Authorization URL and state token
   */
  async oauthGetCloudStorageAuthUrl(redirectUri?: string): Promise<{
    url: string;
    state: string;
  }> {
    return await this.call('oauth_get_auth_url', {
      provider: 'google-cloud-storage',
      redirect_uri: redirectUri || 'http://localhost:5173/oauth/callback',
    });
  }

  /**
   * Exchange OAuth authorization code for tokens and store credentials.
   *
   * @param provider - OAuth provider name (e.g., "google")
   * @param code - Authorization code from OAuth callback
   * @param userEmail - User email address for credential storage
   * @param state - CSRF state token (optional, for validation)
   * @param redirectUri - OAuth redirect URI (must match authorization request)
   * @returns Credential information
   */
  async oauthExchangeCode(params: {
    provider: string;
    code: string;
    user_email?: string; // Optional: will be fetched from provider if not provided
    state?: string;
    redirect_uri?: string;
  }): Promise<{
    credential_id: string;
    user_email: string;
    expires_at: string | null;
    success: boolean;
  }> {
    return await this.call('oauth_exchange_code', {
      provider: params.provider,
      code: params.code,
      ...(params.user_email && { user_email: params.user_email }),
      state: params.state,
      redirect_uri: params.redirect_uri || 'http://localhost:5173/oauth/callback',
    });
  }

  /**
   * List all OAuth credentials for the current user.
   *
   * @param provider - Optional provider filter (e.g., "google")
   * @param includeRevoked - Include revoked credentials (default: false)
   * @returns List of OAuth credentials
   */
  async oauthListCredentials(params?: {
    provider?: string;
    include_revoked?: boolean;
  }): Promise<Array<{
    credential_id: string;
    provider: string;
    user_email: string;
    user_id?: string | null; // Nexus user identity (for permission checks)
    scopes: string[];
    expires_at: string | null;
    created_at: string | null;
    last_used_at: string | null;
    revoked: boolean;
  }>> {
    return await this.call('oauth_list_credentials', params || {});
  }

  /**
   * Revoke an OAuth credential.
   *
   * @param provider - OAuth provider name (e.g., "google")
   * @param userEmail - User email address
   * @returns Success status
   */
  async oauthRevokeCredential(params: {
    provider: string;
    user_email: string;
  }): Promise<{
    success: boolean;
  }> {
    return await this.call('oauth_revoke_credential', params);
  }

  /**
   * Test if an OAuth credential is valid and can be refreshed.
   *
   * @param provider - OAuth provider name (e.g., "google")
   * @param userEmail - User email address
   * @returns Credential validity status
   */
  async oauthTestCredential(params: {
    provider: string;
    user_email: string;
  }): Promise<{
    valid: boolean;
    refreshed?: boolean;
    expires_at?: string;
    error?: string;
  }> {
    return await this.call('oauth_test_credential', params);
  }

  // ===== Skills Methods =====

  /**
   * List all skills.
   *
   * @param params - Optional parameters
   * @returns Skills list with metadata
   */
  async skillsList(params?: {
    tier?: string;
    include_metadata?: boolean;
  }): Promise<{
    skills: Array<{
      name: string;
      description: string;
      version?: string;
      author?: string;
      tier?: string;
      file_path?: string;
      created_at?: string;
      modified_at?: string;
      requires?: string[];
    }>;
    count: number;
  }> {
    return await this.call('skills_list', params || {});
  }

  /**
   * Discover skills with permission-based filtering and pagination.
   *
   * @param params - Discovery parameters
   * @returns Skills list with permission info and pagination metadata
   */
  async skillsDiscover(params?: {
    filter?: 'all' | 'owned' | 'subscribed' | 'shared' | 'public';
    offset?: number;
    limit?: number;
    include_total?: boolean;
  }): Promise<{
    skills: Array<{
      path: string;
      name: string;
      description: string;
      owner: string;
      is_subscribed: boolean;
      is_public: boolean;
      version?: string;
      tags?: string[];
    }>;
    count: number;
    offset: number;
    limit: number;
    total_count: number;
    has_more: boolean;
  }> {
    return await this.call('skills_discover', params || {});
  }

  /**
   * Subscribe to a skill.
   */
  async skillsSubscribe(params: {
    skill_path: string;
  }): Promise<{
    success: boolean;
    skill_path: string;
  }> {
    return await this.call('skills_subscribe', params);
  }

  /**
   * Unsubscribe from a skill.
   */
  async skillsUnsubscribe(params: {
    skill_path: string;
  }): Promise<{
    success: boolean;
    skill_path: string;
  }> {
    return await this.call('skills_unsubscribe', params);
  }

  /**
   * Get detailed skill information.
   *
   * @param params - Skill query parameters
   * @returns Skill information
   */
  async skillsInfo(params: {
    skill_name: string;
  }): Promise<{
    name: string;
    description: string;
    version?: string;
    author?: string;
    tier?: string;
    file_path?: string;
    content?: string;
    requires?: string[];
    created_at?: string;
    modified_at?: string;
  }> {
    return await this.call('skills_info', params);
  }

  /**
   * Import skill from ZIP package.
   *
   * @param params - Import parameters
   * @returns Import result with imported skills
   */
  async skillsImport(params: {
    zip_data: string; // Base64 encoded
    tier?: 'personal' | 'tenant' | 'user' | 'system'; // 'user' and 'system' for backward compatibility
    allow_overwrite?: boolean;
  }): Promise<{
    imported_skills: string[];
    skill_paths: string[];
    tier: string;
  }> {
    return await this.call('skills_import', params);
  }

  /**
   * Validate skill ZIP package without importing.
   *
   * @param params - Validation parameters
   * @returns Validation result with errors and warnings
   */
  async skillsValidateZip(params: {
    zip_data: string; // Base64 encoded
  }): Promise<{
    valid: boolean;
    skills_found: string[];
    errors: string[];
    warnings: string[];
  }> {
    return await this.call('skills_validate_zip', params);
  }

  /**
   * Export skill to ZIP package.
   *
   * @param params - Export parameters
   * @returns ZIP data (base64 encoded) and metadata
   */
  async skillsExport(params: {
    skill_name: string;
    format?: 'generic' | 'claude';
    include_dependencies?: boolean;
  }): Promise<{
    skill_name: string;
    zip_data: string; // Base64 encoded
    size_bytes: number;
    format: string;
  }> {
    return await this.call('skills_export', params);
  }

  // ===== User Provisioning Methods =====

  /**
   * Provision user resources (workspace, agents, skills, etc.)
   *
   * @param params - Provisioning parameters
   * @returns Provisioned resources information
   */
  async provisionUser(params: {
    user_id: string;
    email: string;
    display_name?: string;
    tenant_id?: string;
    create_api_key?: boolean;
    create_agents?: boolean;
    import_skills?: boolean;
  }): Promise<{
    user_id: string;
    tenant_id: string;
    api_key: string | null;
    workspace_path: string;
    agent_paths: string[];
    skill_paths: string[];
    created_resources: {
      user: boolean;
      tenant: boolean;
      directories: string[];
      workspace: string;
      agents: string[];
      skills: string[];
    };
  }> {
    return await this.call('provision_user', params);
  }

  /**
   * Deprovision user and remove all their resources.
   *
   * @param params - Deprovisioning parameters
   * @returns Success status
   */
  async deprovisionUser(params: {
    user_id: string;
    tenant_id?: string;
    delete_user_record?: boolean;
    force?: boolean;
  }): Promise<{
    user_id: string;
    tenant_id: string;
    deleted_resources: {
      directories: string[];
      workspaces: number;
      agents: number;
      skills: number;
      api_keys: number;
    };
  }> {
    return await this.call('deprovision_user', params);
  }
}

export default NexusAPIClient;
