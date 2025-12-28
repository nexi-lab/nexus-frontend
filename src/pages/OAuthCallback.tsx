import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OAuthConfirmation from './OAuthConfirmation';
import NexusAPIClient from '../api/client';

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
  const { apiClient, isUserAuthenticated, jwtToken } = useAuth();
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
      const userAccount = {
        ...response.user,
        api_key: response.api_key, // Include API key in userAccount object
        tenant_id: response.tenant_id, // Include tenant ID in userAccount object
      };

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

    // Get provider from sessionStorage (stored when auth URL was generated for integrations)
    const provider = sessionStorage.getItem('oauth_provider');

    // Check if this is user authentication (Google SSO login) or backend integration
    // User auth flow ONLY sets oauth_state (no oauth_provider)
    // Integration flow sets BOTH oauth_state AND oauth_provider
    const userAuthState = sessionStorage.getItem('oauth_state');
    const isUserAuth = userAuthState === state && !provider;

    console.log('[OAuth] Flow detection:', {
      hasProvider: !!provider,
      provider,
      hasUserAuthState: !!userAuthState,
      stateMatch: userAuthState === state,
      isUserAuth,
      isPopup: !!(window.opener && !window.opener.closed),
    });

    if (isUserAuth) {
      // Handle user authentication callback
      console.log('[OAuth] Routing to user authentication handler');
      handleUserAuthCallback(code, state);
      return;
    }

    console.log('[OAuth] Routing to integration flow handler');

    // Continue with integration flow
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

        // CRITICAL: For popup windows, create a fresh API client with auth token
        // The popup is a fresh React app load with a race condition - AuthContext might not
        // have finished initializing. Create a new client instead of relying on AuthContext.
        const isPopup = window.opener && !window.opener.closed;

        let clientToUse = apiClient;

        if (isPopup) {
          // In popup: Create fresh API client with auth token from localStorage
          const storedToken = localStorage.getItem('nexus_jwt_token');
          const storedApiKey = localStorage.getItem('nexus_user_api_key');
          const userAccount = localStorage.getItem('nexus_user_account');

          console.log('[OAuth Popup] Debug - Auth token sources:', {
            hasStoredToken: !!storedToken,
            hasStoredApiKey: !!storedApiKey,
            hasUserAccount: !!userAccount,
            storedTokenPrefix: storedToken?.substring(0, 10),
            storedApiKeyPrefix: storedApiKey?.substring(0, 10),
          });

          // Try to get API key from user account first (most reliable)
          let authToken = null;
          if (userAccount) {
            try {
              const parsed = JSON.parse(userAccount);
              authToken = parsed.api_key || null;
              console.log('[OAuth Popup] Extracted API key from user account:', authToken?.substring(0, 10));
            } catch (e) {
              console.warn('Failed to parse user account:', e);
            }
          }

          // Fallback chain: user account API key > stored API key > JWT token
          if (!authToken && storedApiKey) {
            authToken = storedApiKey;
            console.log('[OAuth Popup] Using stored API key');
          }
          if (!authToken && storedToken) {
            authToken = storedToken;
            console.log('[OAuth Popup] Using JWT token');
          }

          console.log('[OAuth Popup] Final auth token:', {
            hasToken: !!authToken,
            tokenPrefix: authToken?.substring(0, 10),
            tokenLength: authToken?.length,
          });

          if (!authToken) {
            // No auth in popup - close popup and show error in parent
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({
                type: 'oauth_error',
                error: 'Authentication required. Please log in first.'
              }, window.location.origin);
              setTimeout(() => window.close(), 2000);
            }
            throw new Error('Authentication required. Please log in first.');
          }

          // Create fresh API client with auth token pre-set
          const apiUrl = (import.meta as any).env.VITE_NEXUS_API_URL || 'http://localhost:2026';
          console.log('[OAuth Popup] Creating fresh API client with URL:', apiUrl);

          // IMPORTANT: Pass the token directly to constructor instead of calling setAuthToken
          // This ensures the token is available in the interceptor closure
          clientToUse = new NexusAPIClient(apiUrl, authToken);
          console.log('[OAuth Popup] Created API client with auth token');
        }

        console.log('[OAuth Popup] Calling oauthExchangeCode with:', { provider, hasCode: !!code, hasState: !!state });

        // Exchange code - email will be fetched automatically from provider
        const result = await clientToUse.oauthExchangeCode({
          provider,
          code,
          state,
          // user_email is optional - backend will fetch it from provider
        });

        console.log('[OAuth Popup] oauthExchangeCode response:', {
          success: result.success,
          credentialId: result.credential_id,
          userEmail: result.user_email,
          expiresAt: result.expires_at,
        });

        // Save debug info to localStorage so we can check it later
        const debugInfo = {
          timestamp: new Date().toISOString(),
          provider,
          success: result.success,
          credentialId: result.credential_id,
          userEmail: result.user_email,
          expiresAt: result.expires_at,
        };
        localStorage.setItem('nexus_last_oauth_debug', JSON.stringify(debugInfo));
        console.log('[OAuth Popup] Debug info saved to localStorage as nexus_last_oauth_debug');

        if (result.success) {
          // Clear sessionStorage
          sessionStorage.removeItem('oauth_code');
          sessionStorage.removeItem('oauth_state');
          sessionStorage.removeItem('oauth_provider');

          setStatus('success');
          setMessage(`Successfully connected! Closing window...`);

          // If opened in a popup, notify parent and close
          if (window.opener && !window.opener.closed) {
            console.log('[OAuth Popup] Notifying parent window of success');
            // Notify parent window that OAuth completed successfully
            window.opener.postMessage({ type: 'oauth_success', provider }, window.location.origin);
            // Close the popup after a brief delay
            setTimeout(() => {
              console.log('[OAuth Popup] Closing popup window');
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

        // Save error debug info to localStorage
        const errorDebugInfo = {
          timestamp: new Date().toISOString(),
          provider,
          error: error.message || 'Unknown error',
          errorType: error.name,
          response: error.response?.data,
          isAuthError: error.name === 'AuthenticationError',
        };
        localStorage.setItem('nexus_last_oauth_error', JSON.stringify(errorDebugInfo));
        console.log('[OAuth Popup] Error debug info saved to localStorage as nexus_last_oauth_error');

        setStatus('error');
        setMessage(`Failed to complete setup: ${error.message || 'Unknown error'}`);
        // If in popup, notify parent and close
        if (window.opener && !window.opener.closed) {
          console.log('[OAuth Popup] Notifying parent window of error');
          window.opener.postMessage({ type: 'oauth_error', error: error.message || 'Unknown error' }, window.location.origin);
          // Brief delay for error cases to see the error message
          setTimeout(() => {
            console.log('[OAuth Popup] Closing popup window (error case)');
            window.close();
          }, 2000);
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
