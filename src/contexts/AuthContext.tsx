import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import NexusAPIClient from '../api/client';

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
  apiKey: string | null;
  isAuthenticated: boolean;
  userInfo: UserInfo | null;
  login: (apiKey: string) => Promise<UserInfo>;
  logout: () => void;
  apiClient: NexusAPIClient;
  updateConnection: (apiUrl: string, apiKey: string) => Promise<UserInfo>;

  // User JWT authentication (user accounts)
  jwtToken: string | null;
  userAccount: UserAccount | null;
  isUserAuthenticated: boolean;
  userLogin: (identifier: string, password: string) => Promise<UserAccount>;
  userRegister: (email: string, password: string, username?: string, displayName?: string) => Promise<UserAccount>;
  userLogout: () => void;
  updateUserProfile: (displayName?: string, avatarUrl?: string) => Promise<UserAccount>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_KEY_STORAGE_KEY = 'nexus_api_key';
const USER_INFO_STORAGE_KEY = 'nexus_user_info';
const API_URL_STORAGE_KEY = 'nexus_api_url';
const JWT_TOKEN_STORAGE_KEY = 'nexus_jwt_token';
const USER_ACCOUNT_STORAGE_KEY = 'nexus_user_account';

// Get API URL from localStorage or environment
const getApiURL = () => {
  // First try localStorage (user-configured URL)
  const storedUrl = localStorage.getItem(API_URL_STORAGE_KEY);
  if (storedUrl) {
    // Auto-upgrade HTTP to HTTPS for production deployments
    // This fixes Mixed Content errors when frontend is served over HTTPS
    if (storedUrl.startsWith('http://') && window.location.protocol === 'https:') {
      const httpsUrl = storedUrl.replace('http://', 'https://');
      // Remove port 2026 if present (nginx handles this)
      const cleanedUrl = httpsUrl.replace(':2026', '');
      localStorage.setItem(API_URL_STORAGE_KEY, cleanedUrl);
      return cleanedUrl;
    }
    // If stored URL is an IP address but we have a domain in env, use the domain
    // This fixes ERR_CERT_COMMON_NAME_INVALID when SSL cert is for domain, not IP
    const envUrl = (import.meta as any).env.VITE_NEXUS_API_URL;
    if (envUrl && storedUrl.includes('34.182.34.94')) {
      localStorage.setItem(API_URL_STORAGE_KEY, envUrl);
      return envUrl;
    }
    return storedUrl;
  }

  // Fall back to environment variable
  const apiURL =
    (import.meta as any).env.VITE_NEXUS_API_URL !== undefined && (import.meta as any).env.VITE_NEXUS_API_URL !== ''
      ? (import.meta as any).env.VITE_NEXUS_API_URL
      : 'http://localhost:2026'; // Default to localhost:2026 if not configured
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

  // User JWT authentication state
  const [jwtToken, setJwtToken] = useState<string | null>(() => {
    const storedToken = localStorage.getItem(JWT_TOKEN_STORAGE_KEY);
    return storedToken || null;
  });

  const [userAccount, setUserAccount] = useState<UserAccount | null>(() => {
    const storedAccount = localStorage.getItem(USER_ACCOUNT_STORAGE_KEY);
    return storedAccount ? JSON.parse(storedAccount) : null;
  });

  const [apiClient, setApiClient] = useState<NexusAPIClient>(() => {
    const client = new NexusAPIClient(getApiURL(), apiKey || undefined);
    // Prefer user's personal API key (permanent), fallback to JWT token
    if (userAccount?.api_key) {
      client.setAuthToken(userAccount.api_key);
    } else if (jwtToken) {
      client.setAuthToken(jwtToken);
    }
    return client;
  });

  // Update API client when API key, JWT token, or user account changes
  useEffect(() => {
    const newClient = new NexusAPIClient(getApiURL(), apiKey || undefined);
    // Prefer user's personal API key (permanent), fallback to JWT token
    if (userAccount?.api_key) {
      newClient.setAuthToken(userAccount.api_key);
    } else if (jwtToken) {
      newClient.setAuthToken(jwtToken);
    }
    setApiClient(newClient);
  }, [apiKey, jwtToken, userAccount]);

  // Fetch fresh user data from backend when app loads (if JWT token exists)
  useEffect(() => {
    const fetchUserData = async () => {
      if (!jwtToken) {
        return;
      }

      try {
        // Create a temporary client with the JWT token
        const tempClient = new NexusAPIClient(getApiURL(), undefined);
        tempClient.setAuthToken(jwtToken);

        // Fetch fresh user data from backend
        const freshUserData = await tempClient.authGetMe();

        // Update user account with fresh data
        setUserAccount(freshUserData);
        localStorage.setItem(USER_ACCOUNT_STORAGE_KEY, JSON.stringify(freshUserData));
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        // If token is invalid/expired, clear auth state
        if ((error as any)?.response?.status === 401) {
          console.log('JWT token expired or invalid, logging out');
          userLogout();
        }
      }
    };

    fetchUserData();
  }, []); // Only run once on mount

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

  // User authentication methods
  const userLogin = async (identifier: string, password: string): Promise<UserAccount> => {
    const response = await apiClient.authLogin({ identifier, password });

    const newUserAccount: UserAccount = response.user;
    const token = response.token;

    // Store JWT token and user account
    setJwtToken(token);
    setUserAccount(newUserAccount);
    localStorage.setItem(JWT_TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_ACCOUNT_STORAGE_KEY, JSON.stringify(newUserAccount));

    // Update API client with new token
    apiClient.setAuthToken(token);

    return newUserAccount;
  };

  const userRegister = async (
    email: string,
    password: string,
    username?: string,
    displayName?: string
  ): Promise<UserAccount> => {
    const response = await apiClient.authRegister({
      email,
      password,
      username,
      display_name: displayName,
    });

    const newUserAccount: UserAccount = {
      user_id: response.user_id,
      email: response.email,
      username: response.username,
      display_name: response.display_name,
      avatar_url: null,
      primary_auth_method: 'password',
      is_global_admin: false,
      email_verified: false,
      api_key: null,
      tenant_id: null,
      created_at: new Date().toISOString(),
      last_login_at: null,
    };
    const token = response.token;

    // Store JWT token and user account
    setJwtToken(token);
    setUserAccount(newUserAccount);
    localStorage.setItem(JWT_TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_ACCOUNT_STORAGE_KEY, JSON.stringify(newUserAccount));

    // Update API client with new token
    apiClient.setAuthToken(token);

    return newUserAccount;
  };

  const userLogout = () => {
    setJwtToken(null);
    setUserAccount(null);
    localStorage.removeItem(JWT_TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_ACCOUNT_STORAGE_KEY);
    localStorage.removeItem('nexus_user_api_key');
    localStorage.removeItem('nexus_tenant_id');
    apiClient.setAuthToken(null);
  };

  const updateUserProfile = async (displayName?: string, avatarUrl?: string): Promise<UserAccount> => {
    const updatedUser = await apiClient.authUpdateProfile({
      display_name: displayName,
      avatar_url: avatarUrl,
    });

    setUserAccount(updatedUser);
    localStorage.setItem(USER_ACCOUNT_STORAGE_KEY, JSON.stringify(updatedUser));

    return updatedUser;
  };

  const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
    await apiClient.authChangePassword({
      old_password: oldPassword,
      new_password: newPassword,
    });
  };

  const value: AuthContextType = {
    // API Key authentication
    apiKey,
    isAuthenticated: !!apiKey,
    userInfo,
    login,
    logout,
    apiClient,
    updateConnection,

    // User JWT authentication
    jwtToken,
    userAccount,
    isUserAuthenticated: !!jwtToken && !!userAccount,
    userLogin,
    userRegister,
    userLogout,
    updateUserProfile,
    changePassword,
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
