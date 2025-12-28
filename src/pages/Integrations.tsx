import { ArrowLeft, Link2, Plus, Loader2, CheckCircle2, Trash2, Play } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import OAuthSetupDialog from '../components/OAuthSetupDialog';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

interface OAuthProvider {
  name: string;
  display_name: string;
  scopes: string[];
  requires_pkce: boolean;
  icon_url?: string;
  metadata: Record<string, any>;
}

interface OAuthCredential {
  credential_id: string;
  provider: string;
  user_email: string;
  user_id?: string | null; // Nexus user identity (for permission checks)
  scopes: string[];
  expires_at: string | null;
  created_at: string | null;
  last_used_at: string | null;
  revoked: boolean;
}

export function IntegrationsPanel({
  embedded = false,
  urlCleanupPath = '/integrations',
}: {
  embedded?: boolean;
  urlCleanupPath?: string;
}) {
  const { apiClient, userInfo } = useAuth();
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [credentials, setCredentials] = useState<OAuthCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  // Get current user's user_id (preferred) or user (fallback)
  const currentUserId = userInfo?.subject_id || userInfo?.user || null;

  useEffect(() => {
    loadProvidersAndCredentials();

    // Reload credentials if we just completed an OAuth flow
    // (OAuthCallback will have already exchanged the code and stored credentials)
    const oauthCallback = new URLSearchParams(window.location.search).get('oauth_callback');
    if (oauthCallback === 'true') {
      // Reload to show the new credential
      loadProvidersAndCredentials();
      // Clean up URL
      if (!embedded) {
        window.history.replaceState({}, '', urlCleanupPath);
      }
    }

    // Listen for OAuth completion messages from popup window
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data.type === 'oauth_success') {
        const provider = event.data.provider;
        console.log('[Integrations] OAuth success for provider:', provider);
        toast.success(`Successfully connected ${provider}!`);
        // Reload credentials to show the new connection
        loadProvidersAndCredentials();
      } else if (event.data.type === 'oauth_error') {
        const error = event.data.error;
        console.error('[Integrations] OAuth error:', error);
        toast.error(`Failed to connect: ${error}`);
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const loadProvidersAndCredentials = async () => {
    setLoading(true);
    try {
      const [providersData, credentialsData] = await Promise.all([
        apiClient.oauthListProviders(),
        apiClient.oauthListCredentials({ include_revoked: false }),
      ]);
      setProviders(providersData || []);
      // Backend already filters credentials by user_id from context (API key)
      // So we can trust the returned credentials belong to the current user
      setCredentials(credentialsData || []);
    } catch (error: any) {
      console.error('Failed to load providers:', error);
      toast.error(`Failed to load integrations: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getConnectedCredential = (providerName: string): OAuthCredential | null => {
    if (!currentUserId) return null;
    return (
      credentials.find((cred) => {
        if (cred.provider !== providerName || cred.revoked) return false;
        // Match by user_id (preferred) or user_email (fallback)
        if (cred.user_id) {
          return cred.user_id === currentUserId;
        }
        return cred.user_email === currentUserId;
      }) || null
    );
  };

  const handleConnectProvider = async (providerName: string) => {
    setSelectedProvider(providerName);
    
    // For both new connections and reconnections, immediately get auth URL and open it
    try {
      setLoading(true);
      // Use dynamic redirect URI based on current origin
      const redirectUri = `${window.location.origin}/oauth/callback`;
      const result = await apiClient.call<{ url: string; state: string }>('oauth_get_auth_url', {
        provider: providerName,
        redirect_uri: redirectUri,
      });
      
      // Store provider and state for callback handling
      sessionStorage.setItem('oauth_provider', providerName);
      sessionStorage.setItem('oauth_state', result.state);
      
      // Open authorization URL in a new window
      window.open(result.url, '_blank', 'width=600,height=700');
      
      toast.success('Authorization page opened. Please complete the authorization.');
    } catch (error: any) {
      toast.error(`Failed to start OAuth flow: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectProvider = async (providerName: string) => {
    const credential = getConnectedCredential(providerName);
    if (!credential) {
      toast.error('No credential found to disconnect');
      return;
    }

    if (!confirm(`Are you sure you want to disconnect ${credential.user_email} from ${providerName}?`)) {
      return;
    }

    try {
      setLoading(true);
      await apiClient.oauthRevokeCredential({
        provider: providerName,
        user_email: credential.user_email,
      });
      
      toast.success('Successfully disconnected');
      // Reload credentials to update UI
      await loadProvidersAndCredentials();
    } catch (error: any) {
      toast.error(`Failed to disconnect: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestCredential = async (providerName: string) => {
    const credential = getConnectedCredential(providerName);
    if (!credential) {
      toast.error('No credential found to test');
      return;
    }

    try {
      setTestingProvider(providerName);
      toast.info(`Testing credential for ${providerName}...`);
      
      const result = await apiClient.oauthTestCredential({
        provider: providerName,
        user_email: credential.user_email,
      });
      
      if (result.valid) {
        toast.success(
          `Credential is valid${result.refreshed ? ' (token was refreshed)' : ''}`,
          {
            description: result.expires_at
              ? `Expires: ${new Date(result.expires_at).toLocaleString()}`
              : undefined,
          }
        );
        // Reload credentials to update expiration info
        await loadProvidersAndCredentials();
      } else {
        toast.error(
          `Credential is invalid`,
          {
            description: result.error || 'The credential could not be validated',
          }
        );
      }
    } catch (error: any) {
      toast.error(`Failed to test credential: ${error.message}`);
    } finally {
      setTestingProvider(null);
    }
  };

  return (
    <>
      {/* Available Integrations */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Integrations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {credentials.length > 0
              ? `${credentials.length} connection${credentials.length !== 1 ? 's' : ''} configured`
              : 'Connect these services to extend Nexus functionality'}
          </p>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading integrations...</span>
            </div>
          ) : providers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No integrations available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map((provider) => {
                const credential = getConnectedCredential(provider.name);
                const isConnected = !!credential;
                const connectedEmail = credential?.user_email || null;
                const isExpired = credential?.expires_at ? new Date(credential.expires_at) < new Date() : false;

                return (
                  <div
                    key={provider.name}
                    className={`rounded-lg border p-4 hover:bg-muted/50 transition-colors ${
                      isConnected && !isExpired
                        ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20'
                        : isExpired
                          ? 'border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20'
                          : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {provider.icon_url && (
                          <img
                            src={provider.icon_url}
                            alt={provider.display_name}
                            className="w-6 h-6 flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <h3 className="font-semibold truncate">{provider.display_name}</h3>
                      </div>
                      {isConnected ? (
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1 flex-shrink-0 ${
                            isExpired
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200'
                              : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {isExpired ? 'Expired' : 'Connected'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 flex-shrink-0">
                          Not Connected
                        </span>
                      )}
                    </div>

                    {connectedEmail && (
                      <div className="mb-2">
                        <p className="text-xs text-muted-foreground truncate">{connectedEmail}</p>
                        {credential?.expires_at && (
                          <p className={`text-xs mt-1 ${isExpired ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                            {isExpired ? 'Expired - Reconnect required' : `Expires: ${new Date(credential.expires_at).toLocaleDateString()}`}
                          </p>
                        )}
                      </div>
                    )}

                    {provider.requires_pkce && !isConnected && (
                      <p className="text-xs text-muted-foreground mb-3">Requires PKCE authentication</p>
                    )}

                    <div className="flex items-center gap-2">
                      {isConnected && !isExpired ? (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleTestCredential(provider.name)}
                            disabled={loading || testingProvider === provider.name}
                          >
                            {testingProvider === provider.name ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Testing...
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-2" />
                                Test Connection
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDisconnectProvider(provider.name)}
                            disabled={loading || testingProvider === provider.name}
                            title="Disconnect"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full"
                          onClick={() => handleConnectProvider(provider.name)}
                          disabled={loading}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Connect
                        </Button>
                      )}
                      {isConnected && isExpired && (
                        <Button variant="default" size="sm" className="flex-1" onClick={() => handleConnectProvider(provider.name)} disabled={loading}>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Reconnect
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* OAuth Setup Dialog */}
      <OAuthSetupDialog
        open={oauthDialogOpen}
        onOpenChange={setOauthDialogOpen}
        provider={selectedProvider}
        onSuccess={() => {
          loadProvidersAndCredentials();
        }}
      />
    </>
  );
}

export function Integrations() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to files">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Link2 className="h-8 w-8" />
            <h1 className="text-2xl font-bold">Integrations</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Introduction */}
          <div className="mb-6">
            <p className="text-muted-foreground">
              Manage your OAuth integrations to connect external services with Nexus. Configure and monitor your connected accounts.
            </p>
          </div>

          <IntegrationsPanel embedded={false} urlCleanupPath="/integrations" />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/20 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="font-medium">Nexus Hub</div>
          <div className="flex gap-3">
            <a href="https://github.com/nexi-lab/nexus" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Docs
            </a>
            <span>|</span>
            <a href="https://nexus.nexilab.co/health" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              API
            </a>
            <span>|</span>
            <a href="https://github.com/nexi-lab/nexus/issues" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Help
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

