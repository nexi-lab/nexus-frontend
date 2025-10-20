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
