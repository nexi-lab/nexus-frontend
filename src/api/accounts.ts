import axios, { type AxiosResponse } from 'axios';
import { normalizeServerURL } from './serverURL';

export interface UserProfile {
  user_id: string;
  email?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  primary_auth_method: string;
  is_global_admin: boolean;
  email_verified: boolean;
  zone_id?: string | null;
  created_at: string;
  last_login_at?: string | null;
}

export interface AccountLogin {
  token: string;
  user: UserProfile;
}

const invalidResponse = () => new Error('The Nexus server returned an invalid account response.');
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function jsonResponse(response: AxiosResponse, status = 200): unknown {
  const contentType = response.headers['content-type'];
  if (response.status !== status || typeof contentType !== 'string' || contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json')
    throw invalidResponse();
  return response.data;
}

function userProfile(value: unknown): UserProfile {
  if (
    !record(value) ||
    typeof value.user_id !== 'string' ||
    !value.user_id ||
    typeof value.primary_auth_method !== 'string' ||
    !value.primary_auth_method ||
    typeof value.created_at !== 'string' ||
    !value.created_at ||
    typeof value.is_global_admin !== 'boolean' ||
    typeof value.email_verified !== 'boolean'
  )
    throw invalidResponse();
  for (const field of ['email', 'username', 'display_name', 'avatar_url', 'zone_id', 'last_login_at']) {
    if (value[field] != null && typeof value[field] !== 'string') throw invalidResponse();
  }
  return value as unknown as UserProfile;
}

function accountLogin(value: unknown): AccountLogin {
  if (!record(value) || typeof value.token !== 'string' || !value.token) throw invalidResponse();
  return { token: value.token, user: userProfile(value.user) };
}

function accountMessage(value: unknown): void {
  if (!record(value) || typeof value.message !== 'string' || !value.message) throw invalidResponse();
}

export function accountErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string') return error.response.data.detail;
  return error instanceof Error ? error.message : fallback;
}

export function createAccountsAPI(baseURL: string, token?: string) {
  const client = axios.create({ baseURL: normalizeServerURL(baseURL), timeout: 15000 });
  const authenticated = () => {
    if (!token) throw new Error('Please sign in to your account.');
    return { headers: { Authorization: `Bearer ${token}` } };
  };
  return {
    async register(params: { email: string; password: string; username?: string; display_name?: string }): Promise<void> {
      userProfile(jsonResponse(await client.post('/auth/register', params), 201));
    },
    async requestVerification(email: string): Promise<void> {
      accountMessage(jsonResponse(await client.post('/auth/request-verification', { email }), 202));
    },
    async verifyEmail(token: string): Promise<void> {
      accountMessage(jsonResponse(await client.post('/auth/verify-email', { token })));
    },
    async login(identifier: string, password: string): Promise<AccountLogin> {
      return accountLogin(jsonResponse(await client.post('/auth/login', { identifier, password })));
    },
    async profile(): Promise<UserProfile> {
      return userProfile(jsonResponse(await client.get('/auth/me', authenticated())));
    },
    async updateProfile(display_name: string): Promise<UserProfile> {
      return userProfile(jsonResponse(await client.patch('/auth/me', { display_name }, authenticated())));
    },
    async changePassword(current_password: string, new_password: string): Promise<void> {
      const result = jsonResponse(await client.post('/auth/change-password', { current_password, new_password }, authenticated()));
      if (!record(result) || result.success !== true) throw invalidResponse();
    },
    async deleteAccount(): Promise<void> {
      accountMessage(jsonResponse(await client.delete('/auth/me', authenticated())));
    },
    async startGoogle(): Promise<{ auth_url: string; state: string }> {
      const result = jsonResponse(await client.get('/auth/oauth/google/authorize', { withCredentials: true }));
      if (!record(result) || typeof result.auth_url !== 'string' || typeof result.state !== 'string' || !result.state) throw invalidResponse();
      return { auth_url: result.auth_url, state: result.state };
    },
    async finishGoogle(code: string, state: string): Promise<AccountLogin> {
      return accountLogin(jsonResponse(await client.post('/auth/oauth/google/callback', { code, state }, { withCredentials: true })));
    },
  };
}
