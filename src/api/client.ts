import axios, { type AxiosInstance } from 'axios';
import type { NativeIdentity } from '../types/identity';
import type { GlobResult, GrepResult } from '../types/search';
import { normalizeServerURL } from './serverURL';
import { isRecord, isStringPairs } from './validation';

interface NativeRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  responseType?: 'json' | 'arraybuffer';
  contentType?: 'application/octet-stream';
  timeout?: number;
}

export class NexusAPIError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'NexusAPIError';
    this.status = status;
  }
}

function errorMessage(value: unknown): string | undefined {
  if (value instanceof ArrayBuffer) {
    try {
      return errorMessage(JSON.parse(new TextDecoder().decode(value)));
    } catch {
      return undefined;
    }
  }
  if (isRecord(value) && typeof value.error === 'string') return value.error;
}

export class AuthenticationError extends Error {
  constructor(message = 'Invalid or missing API key. Please check your API key and try again.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class NexusAPIClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string, apiKey?: string) {
    this.baseURL = normalizeServerURL(baseURL);
    this.client = axios.create({ baseURL: this.baseURL, headers: { 'Content-Type': 'application/json' } });
    if (apiKey) this.client.defaults.headers.common.Authorization = `Bearer ${apiKey}`;
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          throw new AuthenticationError(
            error.config?.headers?.Authorization
              ? 'API key is invalid or expired. Please check your API key and try again.'
              : 'API key is missing. Please provide a valid API key to access this resource.',
          );
        }
        return Promise.reject(error);
      },
    );
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  async request<T>(path: `/v2/${string}`, options: NativeRequestOptions = {}): Promise<T> {
    try {
      const response = await this.client.request<T>({
        url: path,
        method: options.method,
        params: options.params,
        data: options.data,
        responseType: options.responseType,
        timeout: options.timeout,
        ...(options.contentType ? { headers: { 'Content-Type': options.contentType } } : {}),
      });
      const message = options.responseType === 'arraybuffer' ? undefined : errorMessage(response.data);
      if (message) throw new NexusAPIError(message, response.status);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const detail = errorMessage(error.response?.data) ?? (typeof error.response?.data === 'string' ? error.response.data : error.message);
        throw new NexusAPIError(detail, error.response?.status);
      }
      throw error;
    }
  }

  async health(): Promise<{ status: string; version?: string }> {
    const value = await this.request<unknown>('/v2/status', { timeout: 8000 });
    if (!isRecord(value) || typeof value.status !== 'string' || (value.version !== undefined && typeof value.version !== 'string')) {
      throw new NexusAPIError('The Nexus server returned an invalid status response.');
    }
    return { status: value.status, ...(value.version === undefined ? {} : { version: value.version }) };
  }

  async whoami(): Promise<NativeIdentity> {
    const value = await this.request<unknown>('/v2/auth/whoami', { timeout: 8000 });
    if (
      !isRecord(value) ||
      typeof value.subject_type !== 'string' ||
      !value.subject_type ||
      typeof value.subject_id !== 'string' ||
      !value.subject_id ||
      typeof value.user_id !== 'string' ||
      (value.agent_id !== null && typeof value.agent_id !== 'string') ||
      typeof value.is_admin !== 'boolean' ||
      typeof value.zone_id !== 'string' ||
      !isStringPairs(value.zone_perms)
    ) {
      throw new NexusAPIError('The Nexus server returned an invalid identity response.');
    }
    return {
      subject_type: value.subject_type,
      subject_id: value.subject_id,
      user_id: value.user_id,
      agent_id: value.agent_id,
      zone_id: value.zone_id,
      is_admin: value.is_admin,
      zone_perms: value.zone_perms,
    };
  }

  private discover<T extends GlobResult | GrepResult>(kind: 'glob' | 'grep', pattern: string, rootPath: string): Promise<T> {
    return this.request(`/v2/search/${kind}`, { method: 'POST', data: { pattern, root_path: rootPath, max_results: 100 }, timeout: 30000 });
  }
  glob(pattern: string, rootPath = '/'): Promise<GlobResult> {
    return this.discover('glob', pattern, rootPath);
  }
  grep(pattern: string, rootPath = '/'): Promise<GrepResult> {
    return this.discover('grep', pattern, rootPath);
  }
}

export default NexusAPIClient;
