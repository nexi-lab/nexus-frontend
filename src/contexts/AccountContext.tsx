import { isAxiosError } from 'axios';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { type AccountLogin, accountErrorMessage, createAccountsAPI, type UserProfile } from '../api/accounts';
import { normalizeServerURL } from '../api/serverURL';

interface Credentials {
  serverUrl: string;
  token: string;
}

interface AccountContextValue {
  account: UserProfile | null;
  serverUrl: string | null;
  resolving: boolean;
  error: string | null;
  completeLogin: (serverUrl: string, login: AccountLogin) => void;
  logout: () => void;
  updateProfile: (displayName: string) => Promise<void>;
  changePassword: (current: string, replacement: string) => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);
const SESSION_KEY = 'nexus_account_session';

function restoredCredentials(): Credentials | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    if (saved && typeof saved.serverUrl === 'string' && typeof saved.token === 'string' && saved.token) {
      return { serverUrl: normalizeServerURL(saved.serverUrl), token: saved.token };
    }
  } catch {
    // An unreadable browser session requires a fresh sign-in.
  }
  sessionStorage.removeItem(SESSION_KEY);
  return null;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState(restoredCredentials);
  const current = useRef(credentials);
  const [profile, setProfile] = useState<{ credentials: Credentials; user: UserProfile } | null>(null);
  const [failure, setFailure] = useState<{ credentials: Credentials; message: string } | null>(null);
  const resolved = profile?.credentials === credentials;

  const logout = () => {
    current.current = null;
    setCredentials(null);
    setProfile(null);
    setFailure(null);
    sessionStorage.removeItem(SESSION_KEY);
  };

  useEffect(() => {
    if (!credentials || resolved) return;
    let active = true;
    createAccountsAPI(credentials.serverUrl, credentials.token)
      .profile()
      .then((user) => {
        if (active && current.current === credentials) setProfile({ credentials, user });
      })
      .catch((error) => {
        if (!active || current.current !== credentials) return;
        if (isAxiosError(error) && error.response?.status === 401) logout();
        else setFailure({ credentials, message: accountErrorMessage(error, 'Unable to load your account.') });
      });
    return () => {
      active = false;
    };
  }, [credentials]);

  const completeLogin = (serverUrl: string, login: AccountLogin) => {
    const next = { serverUrl: normalizeServerURL(serverUrl), token: login.token };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    current.current = next;
    setCredentials(next);
    setProfile({ credentials: next, user: login.user });
    setFailure(null);
  };

  const updateProfile = async (displayName: string) => {
    const expected = current.current;
    if (!expected) throw new Error('Please sign in to your account.');
    const user = await createAccountsAPI(expected.serverUrl, expected.token).updateProfile(displayName);
    if (current.current === expected) setProfile({ credentials: expected, user });
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    const expected = current.current;
    if (!expected) throw new Error('Please sign in to your account.');
    await createAccountsAPI(expected.serverUrl, expected.token).changePassword(oldPassword, newPassword);
  };

  return (
    <AccountContext.Provider
      value={{
        account: resolved ? profile.user : null,
        serverUrl: credentials?.serverUrl ?? null,
        resolving: !!credentials && !resolved && failure?.credentials !== credentials,
        error: failure?.credentials === credentials ? failure.message : null,
        completeLogin,
        logout,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount requires an AccountProvider');
  return value;
}
