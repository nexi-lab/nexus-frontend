import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing OAuth callback...');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth error
    if (error) {
      setStatus('error');
      setMessage(`OAuth error: ${error}`);
      setTimeout(() => navigate('/'), 3000);
      return;
    }

    // Validate we have the required parameters
    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization code or state parameter');
      setTimeout(() => navigate('/'), 3000);
      return;
    }

    // Store the code and state in sessionStorage for the OAuth dialog to pick up
    sessionStorage.setItem('oauth_code', code);
    sessionStorage.setItem('oauth_state', state);

    setStatus('success');
    setMessage('Authorization successful! Redirecting...');

    // Redirect back to the main app after a short delay
    setTimeout(() => {
      navigate('/', { state: { oauthCallback: true } });
    }, 1500);
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          {status === 'processing' && (
            <>
              <Loader2 className="mx-auto h-12 w-12 text-blue-500 animate-spin" />
              <h2 className="mt-6 text-2xl font-bold text-gray-900">Processing...</h2>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <h2 className="mt-6 text-2xl font-bold text-gray-900">Success!</h2>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-red-500" />
              <h2 className="mt-6 text-2xl font-bold text-gray-900">Error</h2>
            </>
          )}
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        </div>
      </div>
    </div>
  );
}
