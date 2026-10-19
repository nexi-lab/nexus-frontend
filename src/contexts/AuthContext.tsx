import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import NexusAPIClient, { AuthenticationError } from '../api/client';

interface UserInfo {
  subject_type?: string;
  subject_id?: string;
  tenant_id?: string;
  is_admin?: boolean;
  user?: string;
}

// User account information (for JWT authentication)
interface UserAccount {
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
}

interface AuthContextType {
  // API Key authentication (backend auth)
  apiUrl: string | null;
  apiKey: string | null;
  isAuthenticated: boolean;
  isResolvingIdentity: boolean;
  identityError: string | null;
  userInfo: UserInfo | null;
  login: (apiKey: string) => Promise<UserInfo>;
  logout: () => void;
  apiClient: NexusAPIClient | null;
  updateConnection: (apiUrl: string, apiKey: string) => Promise<UserInfo>;

  // User JWT authentication (user accounts)
  jwtToken: string | null;
  userAccount: UserAccount | null;
  isUserAuthenticated: boolean;
  userLogin: (identifier: string, password: string) => Promise<UserAccount>;
  completeUserLogin: (session: AuthenticatedUserSession) => UserAccount;
  userLogout: () => void;
  updateUserProfile: (displayName?: string, avatarUrl?: string) => Promise<UserAccount>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

interface AuthenticatedUserSession {
  token: string;
  user: Omit<UserAccount, 'api_key' | 'tenant_id'> & Partial<Pick<UserAccount, 'api_key' | 'tenant_id'>>;
  api_key?: string | null;
  tenant_id?: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_KEY_STORAGE_KEY = 'nexus_api_key';
const USER_INFO_STORAGE_KEY = 'nexus_user_info';
const API_URL_STORAGE_KEY = 'nexus_api_url';
const JWT_TOKEN_STORAGE_KEY = 'nexus_jwt_token';
const USER_ACCOUNT_STORAGE_KEY = 'nexus_user_account';

const clearStoredIdentity = () => {
  for (const key of [
    API_KEY_STORAGE_KEY,
    JWT_TOKEN_STORAGE_KEY,
    USER_ACCOUNT_STORAGE_KEY,
    USER_INFO_STORAGE_KEY,
    'nexus_user_api_key',
    'nexus_tenant_id',
    'nexus_last_oauth_debug',
    'nexus_last_oauth_error',
  ])
    localStorage.removeItem(key);
};

// Get API URL from localStorage or environment
const getApiURL = (): string | null => {
  // First try localStorage (user-configured URL)
  const storedUrl = localStorage.getItem(API_URL_STORAGE_KEY);
  if (storedUrl) {
    // Auto-upgrade HTTP to HTTPS for production deployments ONLY for non-localhost URLs
    // This fixes Mixed Content errors when frontend is served over HTTPS
    // BUT preserve localhost URLs exactly as entered (localhost doesn't have SSL)
    const isLocalhost = storedUrl.includes('localhost') || storedUrl.includes('127.0.0.1');
    if (storedUrl.startsWith('http://') && window.location.protocol === 'https:' && !isLocalhost) {
      const httpsUrl = storedUrl.replace('http://', 'https://');
      // Remove port 2026 if present (nginx handles this)
      const cleanedUrl = httpsUrl.replace(':2026', '');
      localStorage.setItem(API_URL_STORAGE_KEY, cleanedUrl);
      return cleanedUrl;
    }
    return storedUrl;
  }

  // In production, do NOT default to a specific backend.
  // The hosted frontend should work with any Nexus backend the user provides.
  // In dev, allow a local env default for convenience.
  if (import.meta.env.DEV) {
    const envUrl = import.meta.env.VITE_NEXUS_API_URL;
    if (envUrl && envUrl !== '') {
      return envUrl;
    }
  }

  // No default - return null if not configured
  return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiUrl, setApiUrl] = useState<string | null>(() => {
    // Initialize API URL from localStorage (no default)
    return getApiURL();
  });

  const [apiKey, setApiKey] = useState<string | null>(() => {
    // Try to load API key from localStorage only
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    return storedKey || null;
  });

  // User JWT authentication state
  const [jwtToken, setJwtToken] = useState<string | null>(() => {
    const storedToken = localStorage.getItem(JWT_TOKEN_STORAGE_KEY);
    return storedToken || null;
  });

  const [userAccount, setUserAccount] = useState<UserAccount | null>(() => {
    const storedAccount = localStorage.getItem(USER_ACCOUNT_STORAGE_KEY);
    try {
      return storedAccount ? JSON.parse(storedAccount) : null;
    } catch {
      localStorage.removeItem(USER_ACCOUNT_STORAGE_KEY);
      return null;
    }
  });

  const credential = userAccount?.api_key || jwtToken || apiKey;
  const apiClient = useMemo(() => (apiUrl ? new NexusAPIClient(apiUrl, credential || undefined) : null), [apiUrl, credential]);
  const [identity, setIdentity] = useState<{
    url: string;
    credential: string;
    info: UserInfo | null;
    error: string | null;
  } | null>(null);
  const resolved = identity?.url === apiUrl && identity?.credential === credential;
  const userInfo = resolved ? identity.info : null;
  const identityError = resolved ? identity.error : null;
  const isResolvingIdentity = !!apiClient && !!credential && !resolved;

  // Resolve the current credential; responses for an older connection cannot win.
  useEffect(() => {
    let active = true;
    const fetchUserData = async () => {
      if (!credential || !apiUrl || !apiClient) return;
      try {
        const whoami = await apiClient.whoami();
        if (!active) return;
        if (!whoami.authenticated) throw new AuthenticationError();
        setIdentity({
          url: apiUrl,
          credential,
          error: null,
          info: {
            subject_type: whoami.subject_type,
            subject_id: whoami.subject_id,
            tenant_id: whoami.tenant_id,
            is_admin: whoami.is_admin,
            user: whoami.user || whoami.subject_id,
          },
        });
      } catch (error) {
        if (!active) return;
        if (error instanceof AuthenticationError) userLogout();
        else setIdentity({ url: apiUrl, credential, info: null, error: 'Unable to verify your Nexus connection. Please try again.' });
      }
    };
    fetchUserData();
    return () => {
      active = false;
    };
  }, [apiUrl, credential, apiClient]);

  const login = async (newApiKey: string): Promise<UserInfo> => {
    if (!apiUrl) {
      throw new Error('API URL is required. Please configure the Nexus server URL first.');
    }
    return updateConnection(apiUrl, newApiKey);
  };

  const logout = async () => {
    if (!confirm('Are you sure you want to logout?')) {
      return;
    }
    userLogout();
  };

  const updateConnection = async (newApiUrl: string, newApiKey: string): Promise<UserInfo> => {
    // Create a temporary client with the new settings
    const tempClient = new NexusAPIClient(newApiUrl || '', newApiKey || undefined);

    // Validate the connection by calling whoami
    const whoamiResponse = await tempClient.whoami();

    if (!whoamiResponse.authenticated) {
      throw new Error('Authentication failed');
    }

    // Extract user info
    const newUserInfo: UserInfo = {
      subject_type: whoamiResponse.subject_type,
      subject_id: whoamiResponse.subject_id,
      tenant_id: whoamiResponse.tenant_id,
      is_admin: whoamiResponse.is_admin,
      user: whoamiResponse.user,
    };

    // Store API URL, API key, and user info
    setJwtToken(null);
    setUserAccount(null);
    clearStoredIdentity();
    localStorage.setItem(API_URL_STORAGE_KEY, newApiUrl);
    localStorage.setItem(API_KEY_STORAGE_KEY, newApiKey);

    // Update state
    setApiUrl(newApiUrl);
    setApiKey(newApiKey);
    setIdentity({ url: newApiUrl, credential: newApiKey, info: newUserInfo, error: null });

    return newUserInfo;
  };

  // User authentication methods
  const completeUserLogin = (session: AuthenticatedUserSession): UserAccount => {
    const account: UserAccount = {
      ...session.user,
      api_key: 'api_key' in session ? (session.api_key ?? null) : (session.user.api_key ?? null),
      tenant_id: 'tenant_id' in session ? (session.tenant_id ?? null) : (session.user.tenant_id ?? null),
    };
    setApiKey(null);
    setIdentity(null);
    clearStoredIdentity();
    setJwtToken(session.token);
    setUserAccount(account);
    localStorage.setItem(JWT_TOKEN_STORAGE_KEY, session.token);
    localStorage.setItem(USER_ACCOUNT_STORAGE_KEY, JSON.stringify(account));
    return account;
  };

  const userLogin = async (identifier: string, password: string): Promise<UserAccount> => {
    if (!apiClient) {
      throw new Error('API URL is required. Please configure the Nexus server URL first.');
    }
    const response = await apiClient.authLogin({ identifier, password });

    return completeUserLogin(response);
  };

  const userLogout = () => {
    setApiKey(null);
    setJwtToken(null);
    setUserAccount(null);
    setIdentity(null);
    clearStoredIdentity();
  };

  const updateUserProfile = async (displayName?: string, avatarUrl?: string): Promise<UserAccount> => {
    if (!apiClient) {
      throw new Error('API URL is required. Please configure the Nexus server URL first.');
    }
    const updatedUser = await apiClient.authUpdateProfile({
      display_name: displayName,
      avatar_url: avatarUrl,
    });

    setUserAccount(updatedUser);
    localStorage.setItem(USER_ACCOUNT_STORAGE_KEY, JSON.stringify(updatedUser));

    return updatedUser;
  };

  const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
    if (!apiClient) {
      throw new Error('API URL is required. Please configure the Nexus server URL first.');
    }
    await apiClient.authChangePassword({
      current_password: oldPassword,
      new_password: newPassword,
    });
  };

  const deleteAccount = async (): Promise<void> => {
    if (!apiClient) {
      throw new Error('API URL is required. Please configure the Nexus server URL first.');
    }
    if (!userAccount) {
      throw new Error('No user account found');
    }

    // Call deprovision_user RPC method
    await apiClient.call('deprovision_user', {
      user_id: userAccount.user_id,
      tenant_id: userAccount.tenant_id,
      delete_user_record: true,
      force: false,
    });

    // Clear all local state and logout
    userLogout();
  };

  const value: AuthContextType = {
    // API Key authentication
    apiUrl,
    apiKey,
    isAuthenticated: !!userInfo && !!apiKey,
    isResolvingIdentity,
    identityError,
    userInfo,
    login,
    logout,
    apiClient,
    updateConnection,

    // User JWT authentication
    jwtToken,
    userAccount,
    isUserAuthenticated: !!userInfo && !!jwtToken && !!userAccount,
    userLogin,
    completeUserLogin,
    userLogout,
    updateUserProfile,
    changePassword,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
