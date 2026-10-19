import axios from 'axios';

export function accountErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string') return error.response.data.detail;
  return error instanceof Error ? error.message : fallback;
}

export function createAccountsAPI(baseURL: string) {
  const client = axios.create({ baseURL, timeout: 15000 });
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
  };
}
