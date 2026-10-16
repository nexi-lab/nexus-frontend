import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OAuthConfirmation from './OAuthConfirmation';
import NexusAPIClient from '../api/client';

type ConfirmationData = ComponentProps<typeof OAuthConfirmation>['confirmationData'];

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { apiClient, completeUserLogin } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error' | 'confirmation'>('processing');
  const [message, setMessage] = useState('Processing OAuth callback...');
  const [confirmationData, setConfirmationData] = useState<ConfirmationData | null>(null);
  const [provider] = useState(() => sessionStorage.getItem('oauth_provider'));
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;
    const inPopup = window.opener && !window.opener.closed;

    const completeCallback = async () => {
      try {
        const error = searchParams.get('error');
        if (error) throw new Error(`OAuth error: ${error}`);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        if (!code || !state) throw new Error('Missing authorization code or state parameter');
        if (sessionStorage.getItem('oauth_state') !== state) {
          throw new Error('The sign-in state does not match this browser. Please start again.');
        }
        if (!apiClient) throw new Error('Please configure your Nexus server before signing in.');

        if (provider) {
          setMessage('Connecting your integration...');
          const result = await apiClient.oauthExchangeCode({
            provider,
            code,
            state,
            redirect_uri: `${window.location.origin}/oauth/callback`,
          });
          if (!result.success) throw new Error('Failed to exchange authorization code');
          for (const key of ['oauth_code', 'oauth_state', 'oauth_provider']) sessionStorage.removeItem(key);
          setStatus('success');
          setMessage('Successfully connected!');
          if (inPopup) {
            window.opener.postMessage({ type: 'oauth_success', provider }, window.location.origin);
            setTimeout(() => window.close(), 1000);
          } else {
            navigate('/integration', { replace: true });
          }
          return;
        }

        setMessage('Signing in with Google...');
        const response = await new NexusAPIClient(apiClient.getBaseURL()).authOAuthCheck({ provider: 'google', code, state });
        if (response.needs_confirmation) {
          setConfirmationData(response);
          setStatus('confirmation');
          return;
        }
        completeUserLogin(response);
        sessionStorage.removeItem('oauth_state');
        navigate('/', { replace: true });
      } catch (error: any) {
        const detail = error.response?.data?.detail || error.message || 'Unknown error';
        setStatus('error');
        setMessage(`Failed to sign in: ${detail}`);
        if (inPopup) {
          window.opener.postMessage({ type: 'oauth_error', error: detail }, window.location.origin);
          setTimeout(() => window.close(), 2000);
        }
      }
    };
    void completeCallback();
  }, [searchParams, navigate, apiClient, completeUserLogin, provider]);

  if (status === 'confirmation' && confirmationData) return <OAuthConfirmation confirmationData={confirmationData} />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-xl shadow-lg text-center">
        {status === 'processing' && <Loader2 className="mx-auto h-12 w-12 text-blue-500 animate-spin" />}
        {status === 'success' && <CheckCircle className="mx-auto h-12 w-12 text-green-500" />}
        {status === 'error' && <XCircle className="mx-auto h-12 w-12 text-red-500" />}
        <h2 className="text-2xl font-bold text-gray-900">{status === 'processing' ? 'Processing...' : status === 'error' ? 'Error' : 'Success!'}</h2>
        <p role={status === 'error' ? 'alert' : 'status'} className="text-sm text-gray-600">
          {message}
        </p>
        {status === 'error' && (
          <button type="button" onClick={() => navigate(provider ? '/integration' : '/login')}>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
