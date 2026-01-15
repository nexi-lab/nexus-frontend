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
  apiUrl: string | null;
  apiKey: string | null;
  isAuthenticated: boolean;
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
  userRegister: (email: string, password: string, username?: string, displayName?: string) => Promise<UserAccount>;
  userLogout: () => void;
  updateUserProfile: (displayName?: string, avatarUrl?: string) => Promise<UserAccount>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_KEY_STORAGE_KEY = 'nexus_api_key';
const USER_INFO_STORAGE_KEY = 'nexus_user_info';
const API_URL_STORAGE_KEY = 'nexus_api_url';
const JWT_TOKEN_STORAGE_KEY = 'nexus_jwt_token';
const USER_ACCOUNT_STORAGE_KEY = 'nexus_user_account';

// Get API URL from localStorage or environment
const getApiURL = (): string | null => {
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

  // Fall back to environment variable if available
  const envUrl = (import.meta as any).env.VITE_NEXUS_API_URL;
  if (envUrl && envUrl !== '') {
    return envUrl;
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

  const [apiClient, setApiClient] = useState<NexusAPIClient | null>(() => {
    // Only create client if API URL is available
    if (!apiUrl) {
      return null;
    }
    const client = new NexusAPIClient(apiUrl, apiKey || undefined);
    // Prefer user's personal API key (permanent), fallback to JWT token
    if (userAccount?.api_key) {
      client.setAuthToken(userAccount.api_key);
    } else if (jwtToken) {
      client.setAuthToken(jwtToken);
    }
    return client;
  });

  // Update API client when API URL, API key, JWT token, or user account changes
  useEffect(() => {
    if (!apiUrl) {
      setApiClient(null);
      return;
    }
    const newClient = new NexusAPIClient(apiUrl, apiKey || undefined);
    // Prefer user's personal API key (permanent), fallback to JWT token
    if (userAccount?.api_key) {
      newClient.setAuthToken(userAccount.api_key);
    } else if (jwtToken) {
      newClient.setAuthToken(jwtToken);
    }
    setApiClient(newClient);
  }, [apiUrl, apiKey, jwtToken, userAccount]);

  // Fetch fresh user data from backend when app loads (if API key or JWT token exists)
  useEffect(() => {
    const fetchUserData = async () => {
      // If we have an API key, use it to get fresh user info
      if (apiKey && apiUrl) {
        try {
          const tempClient = new NexusAPIClient(apiUrl, apiKey);
          const whoamiData = await tempClient.whoami();

          if (whoamiData.authenticated) {
            const userInfoData: UserInfo = {
              subject_type: whoamiData.subject_type,
              subject_id: whoamiData.subject_id,
              tenant_id: whoamiData.tenant_id,
              is_admin: whoamiData.is_admin,
              user: whoamiData.user || whoamiData.subject_id,
            };
            setUserInfo(userInfoData);
            localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(userInfoData));
          }
        } catch (error) {
          console.error('Failed to fetch user data from API key:', error);
          // If API key is invalid/expired, clear auth state
          if ((error as any)?.response?.status === 401) {
            console.log('API key expired or invalid, clearing auth state');
            setApiKey(null);
            setUserInfo(null);
            localStorage.removeItem(API_KEY_STORAGE_KEY);
            localStorage.removeItem(USER_INFO_STORAGE_KEY);
          }
        }
        return; // Don't proceed to JWT check if we have API key
      }

      // If we have JWT token but no API key, fetch user data with JWT
      if (jwtToken && apiUrl) {
        try {
          // Create a temporary client with the JWT token
          const tempClient = new NexusAPIClient(apiUrl, undefined);
          tempClient.setAuthToken(jwtToken);

          // Fetch user info using whoami (simpler and more reliable than /auth/me)
          const whoamiData = await tempClient.whoami();

          // Set userInfo directly from whoami response
          if (whoamiData.authenticated) {
            const userInfoData: UserInfo = {
              subject_type: whoamiData.subject_type,
              subject_id: whoamiData.subject_id,
              tenant_id: whoamiData.tenant_id,
              is_admin: whoamiData.is_admin,
              user: whoamiData.user || whoamiData.subject_id,
            };
            setUserInfo(userInfoData);
            localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(userInfoData));

            // Keep userAccount in sync (for OAuth users who need email, display_name, etc.)
            // This is a simplified version - full account data comes from OAuth login response
            if (userAccount) {
              // Update tenant_id in userAccount from whoami (source of truth)
              const updatedAccount = {
                ...userAccount,
                tenant_id: whoamiData.tenant_id || null,
              };
              setUserAccount(updatedAccount);
              localStorage.setItem(USER_ACCOUNT_STORAGE_KEY, JSON.stringify(updatedAccount));
            }
          }
        } catch (error) {
          console.error('Failed to fetch user data:', error);
          // If token is invalid/expired, clear auth state
          if ((error as any)?.response?.status === 401) {
            console.log('JWT token expired or invalid, logging out');
            userLogout();
          }
        }
      }
    };

    fetchUserData();
  }, [apiUrl, apiKey, jwtToken]); // Re-run when API URL, API key, or JWT token changes

  // Sync userInfo from userAccount for OAuth users (when userAccount changes from login)
  // This ensures FileTree and other components that rely on userInfo work properly
  useEffect(() => {
    if (userAccount && !userInfo) {
      // Only set if userInfo is not already set (from fetchUserData above)
      const derivedUserInfo: UserInfo = {
        subject_type: 'user',
        subject_id: userAccount.user_id,
        tenant_id: userAccount.tenant_id || undefined,
        is_admin: userAccount.is_global_admin,
        user: userAccount.user_id,
      };
      setUserInfo(derivedUserInfo);
      localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(derivedUserInfo));
    }
  }, [userAccount, userInfo]);

  const login = async (newApiKey: string): Promise<UserInfo> => {
    if (!apiUrl) {
      throw new Error('API URL is required. Please configure the Nexus server URL first.');
    }
    // Create a temporary client with the new API key
    const tempClient = new NexusAPIClient(apiUrl, newApiKey);

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
    setApiUrl(newApiUrl);
    setApiKey(newApiKey);
    setUserInfo(newUserInfo);
    // API client will be updated by the useEffect

    return newUserInfo;
  };

  // User authentication methods
  const userLogin = async (identifier: string, password: string): Promise<UserAccount> => {
    if (!apiClient) {
      throw new Error('API URL is required. Please configure the Nexus server URL first.');
    }
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
    if (!apiClient) {
      throw new Error('API URL is required. Please configure the Nexus server URL first.');
    }
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
    if (apiClient) {
      apiClient.setAuthToken(token);
    }

    return newUserAccount;
  };

  const userLogout = () => {
    setJwtToken(null);
    setUserAccount(null);
    setUserInfo(null);
    localStorage.removeItem(JWT_TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_ACCOUNT_STORAGE_KEY);
    localStorage.removeItem(USER_INFO_STORAGE_KEY);
    localStorage.removeItem('nexus_user_api_key');
    localStorage.removeItem('nexus_tenant_id');
    if (apiClient) {
      apiClient.setAuthToken(null);
    }
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
      old_password: oldPassword,
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
