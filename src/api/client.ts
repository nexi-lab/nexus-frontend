import axios, { type AxiosInstance } from 'axios'
import type { RPCRequest, RPCResponse } from '../types/file'

class NexusAPIClient {
  private client: AxiosInstance
  private requestId = 0

  constructor(baseURL: string = 'http://localhost:8080', apiKey?: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
    })
  }

  private getNextId(): number {
    return ++this.requestId
  }

  // Helper to decode base64-encoded bytes from backend
  private decodeResult(result: any): any {
    // Handle bytes type with base64 data
    if (result && typeof result === 'object' && result.__type__ === 'bytes' && result.data) {
      try {
        // Decode base64 to Uint8Array (preserves binary data)
        const binaryString = atob(result.data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        return bytes
      } catch (e) {
        console.warn('Failed to decode base64 bytes:', e)
        return result.data
      }
    }

    // Handle nested objects
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const decoded: any = {}
      for (const key in result) {
        decoded[key] = this.decodeResult(result[key])
      }
      return decoded
    }

    // Handle arrays
    if (Array.isArray(result)) {
      return result.map(item => this.decodeResult(item))
    }

    return result
  }

  async call<T = any>(method: string, params: any = {}): Promise<T> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.getNextId(),
    }

    try {
      const response = await this.client.post<RPCResponse<T>>(
        `/api/nfs/${method}`,
        request
      )

      if (response.data.error) {
        throw new Error(
          `RPC Error ${response.data.error.code}: ${response.data.error.message}`
        )
      }

      // Decode bytes and other special types from backend
      const decodedResult = this.decodeResult(response.data.result)
      return decodedResult as T
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Network error: ${error.message}${
            error.response?.data ? ` - ${JSON.stringify(error.response.data)}` : ''
          }`
        )
      }
      throw error
    }
  }

  // Whoami endpoint - validates authentication and returns user info
  async whoami(): Promise<{
    authenticated: boolean
    subject_type?: string
    subject_id?: string
    tenant_id?: string
    is_admin?: boolean
    user?: string
  }> {
    try {
      const response = await this.client.get('/api/auth/whoami')
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid or missing API key')
        }
        throw new Error(
          `Authentication error: ${error.message}${
            error.response?.data?.message ? ` - ${error.response.data.message}` : ''
          }`
        )
      }
      throw error
    }
  }

  // Admin API - Create a new API key for a user
  async adminCreateKey(params: {
    user_id: string
    name: string
    is_admin?: boolean
    expires_days?: number | null
    tenant_id?: string
    subject_type?: string
    subject_id?: string
  }): Promise<{ api_key: string; key_id: string; user_id: string; name: string }> {
    return await this.call('admin_create_key', params)
  }

  // Admin API - List API keys
  async adminListKeys(params?: {
    user_id?: string
    tenant_id?: string
    is_admin?: boolean
    include_revoked?: boolean
    include_expired?: boolean
    limit?: number
    offset?: number
  }): Promise<{ keys: Array<any>; total: number; limit: number; offset: number }> {
    return await this.call('admin_list_keys', params || {})
  }

  // Admin API - Get API key details
  async adminGetKey(keyId: string): Promise<any> {
    return await this.call('admin_get_key', { key_id: keyId })
  }

  // Admin API - Revoke an API key
  async adminRevokeKey(keyId: string): Promise<{ success: boolean; key_id: string }> {
    return await this.call('admin_revoke_key', { key_id: keyId })
  }

  // Admin API - Update API key properties
  async adminUpdateKey(params: {
    key_id: string
    expires_days?: number
    is_admin?: boolean
    name?: string
  }): Promise<any> {
    return await this.call('admin_update_key', params)
  }

  // Workspace API - Register a new workspace
  async registerWorkspace(params: {
    path: string
    name?: string
    description?: string
    created_by?: string
  }): Promise<{
    path: string
    name: string | null
    description: string
    created_at: string
    created_by: string | null
    metadata: Record<string, any>
  }> {
    return await this.call('register_workspace', params)
  }

  // ReBAC API - Create a relationship tuple
  async rebacCreate(params: {
    subject: [string, string]
    relation: string
    object: [string, string]
    expires_at?: string
    tenant_id?: string
  }): Promise<string> {
    return await this.call('rebac_create', params)
  }

  // ReBAC API - List relationship tuples
  async rebacListTuples(params?: {
    subject?: [string, string]
    relation?: string
    object?: [string, string]
  }): Promise<Array<{
    tuple_id: string
    subject_type: string
    subject_id: string
    relation: string
    object_type: string
    object_id: string
    created_at: string | null
  }>> {
    return await this.call('rebac_list_tuples', params || {})
  }

  // ReBAC API - Delete a relationship tuple
  async rebacDelete(params: {
    tuple_id: string
  }): Promise<boolean> {
    return await this.call('rebac_delete', params)
  }
}

// Default client instance
// If VITE_API_URL is empty or not set, use empty string (works with Vite proxy in dev)
// Otherwise use the provided URL (for production or custom server location)
const apiURL = import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ''
  ? import.meta.env.VITE_API_URL
  : '' // Empty string means use same origin (Vite proxy in dev)

export const nexusAPI = new NexusAPIClient(
  apiURL,
  import.meta.env.VITE_API_KEY
)

export default NexusAPIClient
