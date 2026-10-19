import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { accountErrorMessage, createAccountsAPI } from '../api/accounts';
import { useAuth } from '../contexts/AuthContext';

export default function VerifyEmail() {
  const { apiUrl } = useAuth();
  const [serverUrl, setServerUrl] = useState(apiUrl ?? '');
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await createAccountsAPI(serverUrl.trim()).verifyEmail(token);
      setVerified(true);
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
      ) : !token ? (
        <p role="alert">Open the verification link from your email.</p>
      ) : (
        <form onSubmit={verify} className="space-y-4">
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
          <button type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify email'}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
