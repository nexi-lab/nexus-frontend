import { createAccountsAPI } from '../api/accounts';
import { normalizeServerURL } from '../api/serverURL';

const ATTEMPT_KEY = 'nexus_google_login';

export function clearGoogleLogin() {
  sessionStorage.removeItem(ATTEMPT_KEY);
}

export async function startGoogleLogin(serverUrl: string) {
  serverUrl = normalizeServerURL(serverUrl);
  const { auth_url, state } = await createAccountsAPI(serverUrl).startGoogle();
  const target = new URL(auth_url);
  if (target.protocol !== 'https:') throw new Error('The server returned an invalid Google sign-in response.');
  sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ serverUrl, state }));
  for (const key of ['oauth_state', 'oauth_provider', 'oauth_code']) sessionStorage.removeItem(key);
  window.location.assign(target.href);
}

export function consumeGoogleLogin(state: string): string {
  const raw = sessionStorage.getItem(ATTEMPT_KEY);
  clearGoogleLogin();
  let attempt: { state?: string; serverUrl?: string } | null = null;
  try {
    attempt = JSON.parse(raw ?? 'null');
  } catch {
    // Invalid flow state requires a new authorization attempt.
  }
  if (!attempt?.serverUrl || attempt.state !== state) throw new Error('The sign-in state does not match this browser. Please start again.');
  return attempt.serverUrl;
}
