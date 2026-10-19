import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import NexusAPIClient, { AuthenticationError } from '../api/client';

interface UserInfo {
  subject_type?: string;
  subject_id?: string;
  tenant_id?: string;
  is_admin?: boolean;
  user?: string;
}

interface AuthContextType {
  // API Key authentication (backend auth)
  apiUrl: string | null;
  apiKey: string | null;
  isAuthenticated: boolean;
  isResolvingIdentity: boolean;
  identityError: string | null;
  userInfo: UserInfo | null;
  logout: () => void;
  apiClient: NexusAPIClient | null;
  updateConnection: (apiUrl: string, apiKey: string) => Promise<UserInfo>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_KEY_STORAGE_KEY = 'nexus_api_key';
const API_URL_STORAGE_KEY = 'nexus_api_url';
const OBSOLETE_IDENTITY_KEYS = [
  'nexus_jwt_token',
  'nexus_user_account',
  'nexus_user_info',
  'nexus_user_api_key',
  'nexus_tenant_id',
  'nexus_last_oauth_debug',
  'nexus_last_oauth_error',
];

const clearStoredIdentity = () => {
  for (const key of [API_KEY_STORAGE_KEY, ...OBSOLETE_IDENTITY_KEYS]) localStorage.removeItem(key);
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
  useEffect(() => {
    for (const key of OBSOLETE_IDENTITY_KEYS) localStorage.removeItem(key);
  }, []);
  const [apiUrl, setApiUrl] = useState<string | null>(() => {
    // Initialize API URL from localStorage (no default)
    return getApiURL();
  });

  const [apiKey, setApiKey] = useState<string | null>(() => {
    // Try to load API key from localStorage only
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    return storedKey || null;
  });

  const credential = apiKey;
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
        if (error instanceof AuthenticationError) logout();
        else setIdentity({ url: apiUrl, credential, info: null, error: 'Unable to verify your Nexus connection. Please try again.' });
      }
    };
    fetchUserData();
    return () => {
      active = false;
    };
  }, [apiUrl, credential, apiClient]);

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
    clearStoredIdentity();
    localStorage.setItem(API_URL_STORAGE_KEY, newApiUrl);
    localStorage.setItem(API_KEY_STORAGE_KEY, newApiKey);

    // Update state
    setApiUrl(newApiUrl);
    setApiKey(newApiKey);
    setIdentity({ url: newApiUrl, credential: newApiKey, info: newUserInfo, error: null });

    return newUserInfo;
  };

  const logout = () => {
    setApiKey(null);
    setIdentity(null);
    clearStoredIdentity();
  };

  const value: AuthContextType = {
    // API Key authentication
    apiUrl,
    apiKey,
    isAuthenticated: !!userInfo && !!apiKey,
    isResolvingIdentity,
    identityError,
    userInfo,
    logout,
    apiClient,
    updateConnection,
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
