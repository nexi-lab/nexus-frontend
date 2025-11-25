import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, RefreshCw, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import OAuthSetupDialog from './OAuthSetupDialog';

interface OAuthProvider {
  name: string;
  display_name: string;
  icon_url?: string;
}

interface OAuthCredential {
  credential_id: string;
  provider: string;
  user_email: string;
  scopes: string[];
  expires_at: string | null;
  created_at: string | null;
  last_used_at: string | null;
  revoked: boolean;
}

interface OAuthStatusPanelProps {
  className?: string;
}

export default function OAuthStatusPanel({ className }: OAuthStatusPanelProps) {
  const { apiClient } = useAuth();
  const [credentials, setCredentials] = useState<OAuthCredential[]>([]);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [_refreshing, _setRefreshing] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
  const [_reAuthEmail, setReAuthEmail] = useState<string>('');
  const [expanded, setExpanded] = useState(true);

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const [creds, providerList] = await Promise.all([
        apiClient.oauthListCredentials({
          include_revoked: false,
        }),
        apiClient.oauthListProviders(),
      ]);
      setCredentials(creds || []);
      setProviders(providerList || []);
    } catch (error: any) {
      console.error('Failed to load OAuth credentials:', error);
      toast.error(`Failed to load credentials: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
    // Refresh every 60 seconds to update expiry status
    const interval = setInterval(loadCredentials, 60000);
    return () => clearInterval(interval);
  }, []);

  const isExpired = (expiresAt: string | null): boolean => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const getExpiryStatus = (expiresAt: string | null) => {
    if (!expiresAt) {
      return { label: 'No expiry', color: 'text-gray-500', badge: 'bg-gray-100 text-gray-700' };
    }

    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const hoursUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilExpiry < 0) {
      return {
        label: `Expired ${formatDistanceToNow(expiryDate, { addSuffix: true })}`,
        color: 'text-red-600',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100'
      };
    } else if (hoursUntilExpiry < 24) {
      return {
        label: `Expires ${formatDistanceToNow(expiryDate, { addSuffix: true })}`,
        color: 'text-orange-600',
        badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-100'
      };
    } else {
      return {
        label: `Expires ${formatDistanceToNow(expiryDate, { addSuffix: true })}`,
        color: 'text-green-600',
        badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100'
      };
    }
  };

  const handleReAuthenticate = (userEmail: string) => {
    setReAuthEmail(userEmail);
    setOauthDialogOpen(true);
  };

  const handleRevoke = async (provider: string, userEmail: string, credentialId: string) => {
    if (!confirm(`Are you sure you want to revoke OAuth credentials for ${userEmail}?`)) {
      return;
    }

    setRevoking(credentialId);
    try {
      await apiClient.oauthRevokeCredential({ provider, user_email: userEmail });
      toast.success(`Revoked credentials for ${userEmail}`);
      await loadCredentials();
    } catch (error: any) {
      toast.error(`Failed to revoke credentials: ${error.message}`);
    } finally {
      setRevoking(null);
    }
  };

  const handleRefresh = async () => {
    await loadCredentials();
    toast.success('Credentials refreshed');
  };

  const getProviderIcon = (providerName: string) => {
    const provider = providers.find((p) => p.name === providerName);
    if (provider?.icon_url) {
      return (
        <img
          src={provider.icon_url}
          alt={provider.display_name}
          className="w-5 h-5"
          onError={(e) => {
            // Hide broken images
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className={`rounded-lg border bg-card p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading OAuth credentials...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`rounded-lg border bg-card ${className}`}>
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">OAuth Connections</h3>
              {credentials.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                  {credentials.length}
                </span>
              )}
            </div>
            {credentials.some(c => isExpired(c.expires_at)) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100">
                <AlertCircle className="h-3 w-3" />
                Action Required
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleRefresh();
              }}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>

        {/* Content */}
        {expanded && (
          <div className="p-4">
            {credentials.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-4">
                  No OAuth connections configured
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReAuthEmail('');
                    setOauthDialogOpen(true);
                  }}
                >
                  Add Google Drive Connection
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {credentials.map((cred) => {
                  const expiryStatus = getExpiryStatus(cred.expires_at);
                  const expired = isExpired(cred.expires_at);

                  return (
                    <div
                      key={cred.credential_id}
                      className={`rounded-lg border p-4 transition-all ${
                        expired
                          ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                          : 'bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          {/* Provider Icon */}
                          <div className="mt-1">{getProviderIcon(cred.provider)}</div>

                          {/* Credential Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-sm truncate">{cred.user_email}</p>
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-md ${expiryStatus.badge}`}
                              >
                                {expired ? (
                                  <span className="flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Expired
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Active
                                  </span>
                                )}
                              </span>
                            </div>

                            <div className="space-y-1">
                              <p className={`text-xs ${expiryStatus.color}`}>
                                {expiryStatus.label}
                              </p>
                              {cred.last_used_at && (
                                <p className="text-xs text-muted-foreground">
                                  Last used: {formatDistanceToNow(new Date(cred.last_used_at), { addSuffix: true })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {expired && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleReAuthenticate(cred.user_email)}
                              disabled={_refreshing === cred.credential_id}
                              className="whitespace-nowrap"
                            >
                              {_refreshing === cred.credential_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                  Re-authenticate
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevoke(cred.provider, cred.user_email, cred.credential_id)}
                            disabled={revoking === cred.credential_id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-950"
                          >
                            {revoking === cred.credential_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* OAuth Setup Dialog for Re-authentication */}
      <OAuthSetupDialog
        open={oauthDialogOpen}
        onOpenChange={setOauthDialogOpen}
        onSuccess={() => {
          loadCredentials();
          setReAuthEmail('');
        }}
      />
    </>
  );
}
