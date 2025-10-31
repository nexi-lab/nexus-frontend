import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import NexusAPIClient from '../api/client'

interface UserInfo {
  subject_type?: string
  subject_id?: string
  tenant_id?: string
  is_admin?: boolean
  user?: string
}

interface AuthContextType {
  apiKey: string | null
  isAuthenticated: boolean
  userInfo: UserInfo | null
  login: (apiKey: string) => Promise<UserInfo>
  logout: () => void
  apiClient: NexusAPIClient
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const API_KEY_STORAGE_KEY = 'nexus_api_key'
const USER_INFO_STORAGE_KEY = 'nexus_user_info'

// Get API URL from environment
const getApiURL = () => {
  const apiURL = (import.meta as any).env.VITE_API_URL !== undefined && (import.meta as any).env.VITE_API_URL !== ''
    ? (import.meta as any).env.VITE_API_URL
    : '' // Empty string means use same origin (Vite proxy in dev)
  return apiURL
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    // Try to load API key from localStorage only
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY)
    return storedKey || null
  })

  const [userInfo, setUserInfo] = useState<UserInfo | null>(() => {
    // Try to load user info from localStorage
    const storedInfo = localStorage.getItem(USER_INFO_STORAGE_KEY)
    return storedInfo ? JSON.parse(storedInfo) : null
  })

  const [apiClient, setApiClient] = useState<NexusAPIClient>(
    () => new NexusAPIClient(getApiURL(), apiKey || undefined)
  )

  // Update API client when API key changes
  useEffect(() => {
    const newClient = new NexusAPIClient(getApiURL(), apiKey || undefined)
    setApiClient(newClient)
  }, [apiKey])

  const login = async (newApiKey: string): Promise<UserInfo> => {
    // Create a temporary client with the new API key
    const tempClient = new NexusAPIClient(getApiURL(), newApiKey)

    // Validate the API key by calling whoami
    const whoamiResponse = await tempClient.whoami()

    if (!whoamiResponse.authenticated) {
      throw new Error('Authentication failed')
    }

    // Extract user info
    const newUserInfo: UserInfo = {
      subject_type: whoamiResponse.subject_type,
      subject_id: whoamiResponse.subject_id,
      tenant_id: whoamiResponse.tenant_id,
      is_admin: whoamiResponse.is_admin,
      user: whoamiResponse.user,
    }

    // Store API key and user info
    setApiKey(newApiKey)
    setUserInfo(newUserInfo)
    localStorage.setItem(API_KEY_STORAGE_KEY, newApiKey)
    localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(newUserInfo))

    return newUserInfo
  }

  const logout = () => {
    setApiKey(null)
    setUserInfo(null)
    localStorage.removeItem(API_KEY_STORAGE_KEY)
    localStorage.removeItem(USER_INFO_STORAGE_KEY)
  }

  const value: AuthContextType = {
    apiKey,
    isAuthenticated: !!apiKey,
    userInfo,
    login,
    logout,
    apiClient,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
