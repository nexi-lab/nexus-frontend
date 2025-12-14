import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { apiClient } = useAuth();
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
      // If in popup, notify parent and close
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'oauth_error', error }, window.location.origin);
        setTimeout(() => window.close(), 2000);
      } else {
        setTimeout(() => navigate('/integrations'), 3000);
      }
      return;
    }

    // Validate we have the required parameters
    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization code or state parameter');
      // If in popup, notify parent and close
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'oauth_error', error: 'Missing code or state' }, window.location.origin);
        setTimeout(() => window.close(), 2000);
      } else {
        setTimeout(() => navigate('/integrations'), 3000);
      }
      return;
    }

    // Get provider from sessionStorage (stored when auth URL was generated)
    const provider = sessionStorage.getItem('oauth_provider');
    if (!provider) {
      setStatus('error');
      setMessage('Missing provider information. Please try connecting again.');
      // If in popup, notify parent and close
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'oauth_error', error: 'Missing provider' }, window.location.origin);
        setTimeout(() => window.close(), 2000);
      } else {
        setTimeout(() => navigate('/integrations'), 3000);
      }
      return;
    }

    // Automatically exchange the code and store credentials
    const exchangeCode = async () => {
      try {
        setStatus('processing');
        setMessage('Exchanging authorization code...');

        // Exchange code - email will be fetched automatically from provider
        const result = await apiClient.oauthExchangeCode({
          provider,
          code,
          state,
          // user_email is optional - backend will fetch it from provider
        });

        if (result.success) {
          // Clear sessionStorage
          sessionStorage.removeItem('oauth_code');
          sessionStorage.removeItem('oauth_state');
          sessionStorage.removeItem('oauth_provider');

          setStatus('success');
          setMessage(`Successfully connected! Closing window...`);

          // If opened in a popup, notify parent and close
          if (window.opener && !window.opener.closed) {
            // Notify parent window that OAuth completed successfully
            window.opener.postMessage({ type: 'oauth_success', provider }, window.location.origin);
            // Close the popup after a short delay
            setTimeout(() => {
              window.close();
            }, 1000);
          } else {
            // Not in a popup, redirect normally
            setTimeout(() => {
              navigate('/integrations?oauth_callback=true');
            }, 1500);
          }
        } else {
          throw new Error('Failed to exchange authorization code');
        }
      } catch (error: any) {
        console.error('Failed to exchange OAuth code:', error);
        setStatus('error');
        setMessage(`Failed to complete setup: ${error.message || 'Unknown error'}`);
        // If in popup, notify parent and close
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'oauth_error', error: error.message || 'Unknown error' }, window.location.origin);
          setTimeout(() => window.close(), 2000);
        } else {
          setTimeout(() => navigate('/integrations'), 3000);
        }
      }
    };

    exchangeCode();
  }, [searchParams, navigate, apiClient]);

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
