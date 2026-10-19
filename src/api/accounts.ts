import axios from 'axios';

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

export function accountErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string') return error.response.data.detail;
  return error instanceof Error ? error.message : fallback;
}

export function createAccountsAPI(baseURL: string, token?: string) {
  const client = axios.create({ baseURL, timeout: 15000 });
  const authenticated = () => {
    if (!token) throw new Error('Please sign in to your account.');
    return { headers: { Authorization: `Bearer ${token}` } };
  };
  return {
    async register(params: { email: string; password: string; username?: string; display_name?: string }): Promise<void> {
      await client.post('/auth/register', params);
    },
    async requestVerification(email: string): Promise<void> {
      await client.post('/auth/request-verification', { email });
    },
    async verifyEmail(token: string): Promise<void> {
      await client.post('/auth/verify-email', { token });
    },
    async login(identifier: string, password: string): Promise<AccountLogin> {
      return (await client.post('/auth/login', { identifier, password })).data;
    },
    async profile(): Promise<UserProfile> {
      return (await client.get('/auth/me', authenticated())).data;
    },
    async updateProfile(display_name: string): Promise<UserProfile> {
      return (await client.patch('/auth/me', { display_name }, authenticated())).data;
    },
    async changePassword(current_password: string, new_password: string): Promise<void> {
      await client.post('/auth/change-password', { current_password, new_password }, authenticated());
    },
    async startGoogle(): Promise<{ auth_url: string; state: string }> {
      return (await client.get('/auth/oauth/google/authorize', { withCredentials: true })).data;
    },
    async finishGoogle(code: string, state: string): Promise<AccountLogin> {
      return (await client.post('/auth/oauth/google/callback', { code, state }, { withCredentials: true })).data;
    },
  };
}
