import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OAuthConfirmation from './OAuthConfirmation';

type ConfirmationData = {
  pending_token: string;
  user_info: {
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    oauth_provider: string;
    oauth_code: string;
    oauth_state: string | null;
  };
  tenant_info: {
    tenant_id: string;
    name: string;
    domain: string | null;
    description: string | null;
    is_personal: boolean;
    can_edit_name: boolean;
  };
};

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { apiClient } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error' | 'confirmation'>('processing');
  const [message, setMessage] = useState('Processing OAuth callback...');
  const [confirmationData, setConfirmationData] = useState<ConfirmationData | null>(null);

  // Prevent double-calling in React StrictMode (development)
  const hasProcessedRef = useRef(false);

  const handleUserAuthCallback = async (code: string, state: string) => {
    try {
      setStatus('processing');
      setMessage('Signing in with Google...');

      // Use the new check endpoint to see if user needs confirmation
      const response = await apiClient.authOAuthCheck({
        provider: 'google',
        code,
        state,
      });

      // Check if confirmation is needed
      if (response.needs_confirmation) {
        // New user - show confirmation page
        setStatus('confirmation');
        setConfirmationData({
          pending_token: response.pending_token,
          user_info: response.user_info,
          tenant_info: response.tenant_info,
        });
        return;
      }

      // Existing user - complete login immediately
      const token = response.token;
      const userAccount = response.user;

      localStorage.setItem('nexus_jwt_token', token);
      localStorage.setItem('nexus_user_account', JSON.stringify(userAccount));

      // Store API key and tenant ID (for both new and existing users)
      if (response.api_key) {
        localStorage.setItem('nexus_user_api_key', response.api_key);
      }
      if (response.tenant_id) {
        localStorage.setItem('nexus_tenant_id', response.tenant_id);
      }

      // Clear sessionStorage
      sessionStorage.removeItem('oauth_state');

      setStatus('success');
      setMessage('Successfully signed in! Redirecting...');

      // Redirect to home page - the auth context will pick up the token from localStorage
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    } catch (error: any) {
      console.error('Failed to complete Google sign-in:', error);
      setStatus('error');
      setMessage(`Failed to sign in: ${error.response?.data?.detail || error.message || 'Unknown error'}`);
      setTimeout(() => navigate('/login'), 3000);
    }
  };

  useEffect(() => {
    // Prevent double-calling in React 18 StrictMode
    if (hasProcessedRef.current) {
      return;
    }
    hasProcessedRef.current = true;

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
        // Check if this is user auth or backend integration
        const isUserAuth = sessionStorage.getItem('oauth_state');
        setTimeout(() => navigate(isUserAuth ? '/login' : '/integrations'), 3000);
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
        const isUserAuth = sessionStorage.getItem('oauth_state');
        setTimeout(() => navigate(isUserAuth ? '/login' : '/integrations'), 3000);
      }
      return;
    }

    // Check if this is user authentication (Google SSO login) or backend integration
    const userAuthState = sessionStorage.getItem('oauth_state');
    const isUserAuth = userAuthState === state;

    if (isUserAuth) {
      // Handle user authentication callback
      handleUserAuthCallback(code, state);
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

  // Show confirmation page for new users
  if (status === 'confirmation' && confirmationData) {
    return <OAuthConfirmation confirmationData={confirmationData} />;
  }

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
