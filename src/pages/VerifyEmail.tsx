import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { accountErrorMessage, createAccountsAPI } from '../api/accounts';
import { useAuth } from '../contexts/AuthContext';

export default function VerifyEmail() {
  const { apiUrl } = useAuth();
  const [serverUrl, setServerUrl] = useState(apiUrl ?? '');
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [email, setEmail] = useState('');
  const [requested, setRequested] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setRequested(false);
    try {
      const accounts = createAccountsAPI(serverUrl.trim());
      if (token) {
        await accounts.verifyEmail(token);
        setVerified(true);
        setToken('');
      } else {
        await accounts.requestVerification(email.trim());
        setRequested(true);
      }
    } catch (err) {
      setError(accountErrorMessage(err, 'Email verification failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-2xl font-bold">Verify your email</h1>
      {verified ? (
        <output>Email verified successfully.</output>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!token && !requested && !error && <p role="alert">Open the verification link from your email.</p>}
          <p>Confirm the Nexus server that created your account.</p>
          <label htmlFor="verification-server">Nexus Server URL</label>
          <input
            id="verification-server"
            type="url"
            required
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="w-full rounded-md border p-2"
          />
          {!token && (
            <>
              <label htmlFor="verification-email">Email</label>
              <input
                id="verification-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border p-2"
              />
            </>
          )}
          <button type="submit" disabled={loading}>
            {loading ? 'Submitting...' : token ? 'Verify email' : 'Send verification email'}
          </button>
          {token && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setToken('');
                setError('');
              }}
            >
              Request a new verification email
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          {requested && <output>Verification request accepted. Check your inbox.</output>}
        </form>
      )}
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
