import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import NexusAPIClient from '../api/client';

interface UserInfo {
  subject_type?: string;
  subject_id?: string;
  tenant_id?: string;
  is_admin?: boolean;
  user?: string;
}

interface AuthContextType {
  apiKey: string | null;
  isAuthenticated: boolean;
  userInfo: UserInfo | null;
  login: (apiKey: string) => Promise<UserInfo>;
  logout: () => void;
  apiClient: NexusAPIClient;
  updateConnection: (apiUrl: string, apiKey: string) => Promise<UserInfo>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_KEY_STORAGE_KEY = 'nexus_api_key';
const USER_INFO_STORAGE_KEY = 'nexus_user_info';
const API_URL_STORAGE_KEY = 'nexus_api_url';

// Get API URL from localStorage or environment
const getApiURL = () => {
  // First try localStorage (user-configured URL)
  const storedUrl = localStorage.getItem(API_URL_STORAGE_KEY);
  if (storedUrl) {
    return storedUrl;
  }

  // Fall back to environment variable
  const apiURL =
    (import.meta as any).env.VITE_NEXUS_API_URL !== undefined && (import.meta as any).env.VITE_NEXUS_API_URL !== ''
      ? (import.meta as any).env.VITE_NEXUS_API_URL
      : 'http://localhost:8080'; // Default to localhost:8080 if not configured
  return apiURL;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    // Try to load API key from localStorage only
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    return storedKey || null;
  });

  const [userInfo, setUserInfo] = useState<UserInfo | null>(() => {
    // Try to load user info from localStorage
    const storedInfo = localStorage.getItem(USER_INFO_STORAGE_KEY);
    return storedInfo ? JSON.parse(storedInfo) : null;
  });

  const [apiClient, setApiClient] = useState<NexusAPIClient>(() => new NexusAPIClient(getApiURL(), apiKey || undefined));

  // Update API client when API key changes
  useEffect(() => {
    const newClient = new NexusAPIClient(getApiURL(), apiKey || undefined);
    setApiClient(newClient);
  }, [apiKey]);

  const login = async (newApiKey: string): Promise<UserInfo> => {
    // Create a temporary client with the new API key
    const tempClient = new NexusAPIClient(getApiURL(), newApiKey);

    // Validate the API key by calling whoami
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

    // Store API key and user info
    setApiKey(newApiKey);
    setUserInfo(newUserInfo);
    localStorage.setItem(API_KEY_STORAGE_KEY, newApiKey);
    localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(newUserInfo));

    return newUserInfo;
  };

  const logout = async () => {
    if (!confirm('Are you sure you want to logout?')) {
      return;
    }
    try {
      setApiKey(null);
      setUserInfo(null);
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      localStorage.removeItem(USER_INFO_STORAGE_KEY);
    } catch (error) {
      console.error(error);
    }
  };

  const updateConnection = async (newApiUrl: string, newApiKey: string): Promise<UserInfo> => {
    // Create a temporary client with the new settings
    const tempClient = new NexusAPIClient(newApiUrl || undefined, newApiKey || undefined);

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
    localStorage.setItem(API_URL_STORAGE_KEY, newApiUrl);
    localStorage.setItem(API_KEY_STORAGE_KEY, newApiKey);
    localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(newUserInfo));

    // Update state
    setApiKey(newApiKey);
    setUserInfo(newUserInfo);
    // API client will be updated by the useEffect

    return newUserInfo;
  };

  const value: AuthContextType = {
    apiKey,
    isAuthenticated: !!apiKey,
    userInfo,
    login,
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
