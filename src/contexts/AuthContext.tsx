import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import NexusAPIClient, { AuthenticationError } from '../api/client';
import { normalizeServerURL } from '../api/serverURL';
import type { NativeIdentity } from '../types/identity';

interface AuthContextType {
  // API Key authentication (backend auth)
  apiUrl: string | null;
  apiKey: string | null;
  isAuthenticated: boolean;
  isResolvingIdentity: boolean;
  identityError: string | null;
  userInfo: NativeIdentity | null;
  logout: () => void;
  apiClient: NexusAPIClient | null;
  updateConnection: (apiUrl: string, apiKey: string) => Promise<NativeIdentity>;
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

const getApiURL = (): string | null => {
  const storedUrl = localStorage.getItem(API_URL_STORAGE_KEY);
  const value = storedUrl || (import.meta.env.DEV ? import.meta.env.VITE_NEXUS_API_URL : null);
  if (!value) return null;
  try {
    const url = new URL(normalizeServerURL(value));
    const loopback = url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || /^127\./.test(url.hostname) || url.hostname === '[::1]';
    if (url.protocol === 'http:' && window.location.protocol === 'https:' && !loopback) {
      url.protocol = 'https:';
      if (url.port === '2026') url.port = '';
    }
    const normalized = normalizeServerURL(url.href);
    if (storedUrl && normalized !== storedUrl) localStorage.setItem(API_URL_STORAGE_KEY, normalized);
    return normalized;
  } catch {
    return null;
  }
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
    info: NativeIdentity | null;
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
        setIdentity({
          url: apiUrl,
          credential,
          error: null,
          info: whoami,
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

  const updateConnection = async (newApiUrl: string, newApiKey: string): Promise<NativeIdentity> => {
    // Create a temporary client with the new settings
    const tempClient = new NexusAPIClient(newApiUrl || '', newApiKey || undefined);
    const validatedUrl = tempClient.getBaseURL();

    // Validate the connection by calling whoami
    const whoamiResponse = await tempClient.whoami();

    const newUserInfo = whoamiResponse;

    // Store API URL, API key, and user info
    clearStoredIdentity();
    localStorage.setItem(API_URL_STORAGE_KEY, validatedUrl);
    localStorage.setItem(API_KEY_STORAGE_KEY, newApiKey);

    // Update state
    setApiUrl(validatedUrl);
    setApiKey(newApiKey);
    setIdentity({ url: validatedUrl, credential: newApiKey, info: newUserInfo, error: null });

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
