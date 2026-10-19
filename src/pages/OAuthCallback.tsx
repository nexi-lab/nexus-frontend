import { Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountErrorMessage, createAccountsAPI } from '../api/accounts';
import { clearGoogleLogin, consumeGoogleLogin } from '../auth/google';
import { useAccount } from '../contexts/AccountContext';

export default function OAuthCallback() {
  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const navigate = useNavigate();
  const { completeLogin } = useAccount();
  const [error, setError] = useState('');
  const processed = useRef(false);
  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    const finish = async () => {
      try {
        const error = searchParams.get('error');
        if (error) throw new Error(`OAuth error: ${error}`);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        if (!code || !state) throw new Error('Missing authorization code or state parameter');
        const server = consumeGoogleLogin(state);
        const response = await createAccountsAPI(server).finishGoogle(code, state);
        completeLogin(server, response);
        navigate('/account', { replace: true });
      } catch (error) {
        setError(`Failed to sign in: ${accountErrorMessage(error, 'Unknown error')}`);
      } finally {
        clearGoogleLogin();
      }
    };
    void finish();
  }, [searchParams, navigate, completeLogin]);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="space-y-4 rounded border p-8 text-center">
        {error ? <XCircle className="mx-auto h-12 w-12 text-red-500" /> : <Loader2 className="mx-auto h-12 w-12 animate-spin" />}
        <h1 className="text-2xl font-bold">{error ? 'Error' : 'Signing in with Google...'}</h1>
        <p role={error ? 'alert' : 'status'}>{error || 'Processing OAuth callback...'}</p>
        {error && (
          <button type="button" onClick={() => navigate('/login')}>
            Back
          </button>
        )}
      </div>
    </main>
  );
}
