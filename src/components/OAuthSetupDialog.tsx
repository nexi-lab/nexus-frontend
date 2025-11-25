import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { copyToClipboard } from '@/utils';

interface OAuthSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (userEmail: string) => void;
  provider?: string; // Provider name (e.g., 'google-drive', 'gmail', 'microsoft-onedrive', 'x')
}

export default function OAuthSetupDialog({ open, onOpenChange, onSuccess, provider: initialProvider }: OAuthSetupDialogProps) {
  const { apiClient } = useAuth();
  const [step, setStep] = useState<'email' | 'authorize' | 'code' | 'success'>('email');
  const [userEmail, setUserEmail] = useState('');
  const [rootFolder, setRootFolder] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [authState, setAuthState] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerName, setProviderName] = useState<string>(initialProvider || '');
  const [providerDisplayName, setProviderDisplayName] = useState<string>('');

  // Load provider info when provider changes
  useEffect(() => {
    if (initialProvider) {
      setProviderName(initialProvider);
      loadProviderInfo(initialProvider);
    }
  }, [initialProvider]);

  const loadProviderInfo = async (provider: string) => {
    try {
      const providers = await apiClient.oauthListProviders();
      const providerInfo = providers.find((p) => p.name === provider);
      if (providerInfo) {
        setProviderDisplayName(providerInfo.display_name);
      }
    } catch (error) {
      console.error('Failed to load provider info:', error);
    }
  };

  // Check for OAuth callback data when dialog opens
  useEffect(() => {
    if (open) {
      const oauthCode = sessionStorage.getItem('oauth_code');
      const oauthState = sessionStorage.getItem('oauth_state');
      const storedProvider = sessionStorage.getItem('oauth_provider');

      if (oauthCode && oauthState && storedProvider) {
        // Auto-fill the code and state
        setAuthCode(oauthCode);
        setAuthState(oauthState);
        
        // Set provider if not already set
        if (!providerName && storedProvider) {
          setProviderName(storedProvider);
          loadProviderInfo(storedProvider);
        }

        // Go directly to code step - user just needs to enter email
        setStep('code');
        toast.info('Authorization successful! Please enter your email to complete setup.');
      } else if (!providerName && initialProvider) {
        // Normal flow - set provider from prop
        setProviderName(initialProvider);
        loadProviderInfo(initialProvider);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProvider]);


  const handleGetAuthUrl = async () => {
    if (!userEmail || !userEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!providerName) {
      toast.error('Please select a provider');
      return;
    }

    setLoading(true);
    try {
      // First, check if the user already has OAuth credentials
      const credentials = await apiClient.oauthListCredentials({ provider: providerName });

      // Check if this user already has valid (non-revoked) credentials
      const existingCredential = credentials?.find(
        (cred) => cred.user_email === userEmail && !cred.revoked
      );

      if (existingCredential) {
        // User already has credentials - skip OAuth and create mount directly (only for Google Drive)
        toast.success(`Using existing ${providerDisplayName || providerName} credentials`);
        if (providerName === 'google-drive') {
          await createMount();
        } else {
          setStep('success');
          setTimeout(() => {
            onSuccess?.(userEmail);
            handleClose();
          }, 2000);
        }
        return;
      }

      // If we already have an auth code (from OAuth callback), exchange it
      if (authCode && authState) {
        await handleExchangeCode();
        return;
      }

      // No credentials exist - proceed with OAuth flow
      const result = await apiClient.call<{ url: string; state: string }>('oauth_get_auth_url', {
        provider: providerName,
        redirect_uri: 'http://localhost:5173/oauth/callback',
      });
      
      setAuthUrl(result.url);
      setAuthState(result.state);
      
      // Store state in sessionStorage for callback handling
      sessionStorage.setItem('oauth_state', result.state);
      sessionStorage.setItem('oauth_provider', providerName);
      sessionStorage.setItem('oauth_user_email', userEmail);
      
      // Automatically open the authorization URL in a new window
      window.open(result.url, '_blank', 'width=600,height=700');
      
      // Move to code step and show instructions
      setStep('code');
      toast.success('Authorization page opened in a new window. Please complete the authorization and paste the code below.');
    } catch (error: any) {
      toast.error(`Failed to get authorization URL: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const createMount = async () => {
    // Generate a clean mount point from the email
    const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const mountPoint = `/mnt/gdrive/${sanitizedEmail}`;

    try {
      // Create mount point directories if they don't exist
      try {
        // First ensure /mnt exists
        await apiClient.call('mkdir', { path: '/mnt' });
      } catch (err: any) {
        // Ignore if already exists or permission denied
        if (!err.message?.includes('already exists') && !err.message?.includes('permission')) {
          console.warn('Failed to create /mnt:', err);
        }
      }

      try {
        // Then create /mnt/gdrive
        await apiClient.call('mkdir', { path: '/mnt/gdrive' });
      } catch (err: any) {
        // Ignore if already exists or permission denied
        if (!err.message?.includes('already exists') && !err.message?.includes('permission')) {
          console.warn('Failed to create /mnt/gdrive:', err);
        }
      }

      try {
        // Finally create the user-specific mount point
        await apiClient.call('mkdir', { path: mountPoint });
      } catch (err: any) {
        // Ignore if already exists or permission denied
        if (!err.message?.includes('already exists') && !err.message?.includes('permission')) {
          throw new Error(`Failed to create mount directory: ${err.message}`);
        }
      }

      // Get the database URL from the backend config
      // For Docker deployment, this should be the PostgreSQL URL
      const dbPath = 'postgresql://postgres:nexus@postgres:5432/nexus';

      const mountParams = {
        mount_point: mountPoint,
        backend_type: 'gdrive_connector',
        backend_config: {
          token_manager_db: dbPath,
          user_email: userEmail,
          root_folder: rootFolder || 'nexus-data',
          use_shared_drives: false,
          provider: 'google',
        },
        priority: 10,
        readonly: false,
        description: `Google Drive for ${userEmail}`,
      };

      // Save the mount configuration
      await apiClient.call('save_mount', mountParams);

      // Load (activate) the mount
      await apiClient.call('load_mount', { mount_point: mountPoint });

      // Sync the mount to import existing files
      const syncResult = await apiClient.call<{
        files_found?: number;
        files_added?: number;
        files_updated?: number;
        files_scanned?: number;
        files_created?: number;
        errors: number;
      }>('sync_mount', { mount_point: mountPoint });

      toast.success(
        `Google Drive mounted at ${mountPoint}! Found ${syncResult.files_scanned || syncResult.files_found || 0} files.`
      );

      setStep('success');

      // Call success callback after a brief delay
      setTimeout(() => {
        onSuccess?.(userEmail);
        handleClose();
      }, 2000);
    } catch (mountError: any) {
      console.error('Mount creation failed:', mountError);
      toast.error(`Failed to create mount: ${mountError.message}`);
      throw mountError;
    }
  };

  const handleCopyUrl = async () => {
    try {
      await copyToClipboard(authUrl);
      toast.success('Authorization URL copied to clipboard');
    } catch (err) {
      console.error('Failed to copy URL:', err);
      toast.error('Failed to copy URL to clipboard');
    }
  };

  const handleOpenUrl = () => {
    window.open(authUrl, '_blank');
    setStep('code');
  };

  const handleExchangeCode = async () => {
    if (!authCode) {
      toast.error('Please enter the authorization code');
      return;
    }

    if (!providerName) {
      toast.error('Provider not selected');
      return;
    }

    if (!userEmail || !userEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const result = await apiClient.oauthExchangeCode({
        provider: providerName,
        code: authCode,
        user_email: userEmail,
        state: authState,
      });

      if (result.success) {
        // Clear sessionStorage
        sessionStorage.removeItem('oauth_code');
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('oauth_provider');
        sessionStorage.removeItem('oauth_user_email');

        toast.success('OAuth credentials stored successfully!');

        // Automatically create and mount Google Drive (only for google-drive provider)
        if (providerName === 'google-drive') {
          toast.info('Creating Google Drive mount...');
          try {
            await createMount();
          } catch (mountError: any) {
            console.error('Mount creation failed:', mountError);
            // Still show success for OAuth, but note mount failed
            setStep('success');
          }
        } else {
          // For other providers, just show success
          setStep('success');
          setTimeout(() => {
            onSuccess?.(userEmail);
            handleClose();
          }, 2000);
        }
      } else {
        toast.error('Failed to complete OAuth setup');
      }
    } catch (error: any) {
      toast.error(`Failed to exchange authorization code: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset state
    setStep('email');
    setUserEmail('');
    setRootFolder('');
    setAuthUrl('');
    setAuthState('');
    setAuthCode('');
    setLoading(false);
    setProviderName(initialProvider || '');
    setProviderDisplayName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Setup OAuth Connection</DialogTitle>
          <DialogDescription>
            {providerDisplayName || providerName
              ? `Connect your ${providerDisplayName || providerName} account to Nexus.`
              : 'Connect your account to Nexus for seamless access to external services.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Step 1: Enter Email (only shown for reconnection) */}
          {step === 'email' && (
            <div className="space-y-4">
              {!providerName && (
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-950 p-4 border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Please select a provider from the Integrations page.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="userEmail" className="text-sm font-medium">
                  Account Email <span className="text-red-500">*</span>
                </label>
                <Input
                  id="userEmail"
                  type="email"
                  placeholder="your-email@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleGetAuthUrl()}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  This will be used to identify your OAuth credentials.
                </p>
              </div>

              {providerName === 'google-drive' && (
                <div className="space-y-2">
                  <label htmlFor="rootFolder" className="text-sm font-medium">
                    Root Folder in Google Drive
                  </label>
                  <Input
                    id="rootFolder"
                    type="text"
                    placeholder="nexus-data (default)"
                    value={rootFolder}
                    onChange={(e) => setRootFolder(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleGetAuthUrl()}
                  />
                  <p className="text-xs text-muted-foreground">
                    The folder in your Google Drive to mount. Leave empty for default (nexus-data).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Authorize */}
          {step === 'authorize' && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4">
                <p className="text-sm font-medium mb-2">Authorization URL:</p>
                <div className="flex gap-2">
                  <Input
                    value={authUrl}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyUrl}
                    title="Copy URL"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Click the button below to open the authorization page in a new tab.
                  You'll need to grant Nexus permission to access your {providerDisplayName || providerName} account.
                </p>
                <Button
                  onClick={handleOpenUrl}
                  className="w-full"
                  size="lg"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Authorization Page
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Enter Code and Email */}
          {step === 'code' && (
            <div className="space-y-4">
              {authCode ? (
                <div className="rounded-md bg-green-50 dark:bg-green-950 p-4 border border-green-200 dark:border-green-800">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
                    ✓ Authorization successful!
                  </p>
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Please enter your email address below to complete the setup.
                  </p>
                </div>
              ) : (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-4 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Authorization window opened!
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                    Please complete the authorization in the popup window. After you grant permission, you'll be redirected back automatically.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="userEmail" className="text-sm font-medium">
                  Account Email <span className="text-red-500">*</span>
                </label>
                <Input
                  id="userEmail"
                  type="email"
                  placeholder="your-email@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && userEmail && handleExchangeCode()}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  This will be used to identify your OAuth credentials.
                </p>
              </div>

              {providerName === 'google-drive' && (
                <div className="space-y-2">
                  <label htmlFor="rootFolder" className="text-sm font-medium">
                    Root Folder in Google Drive (optional)
                  </label>
                  <Input
                    id="rootFolder"
                    type="text"
                    placeholder="nexus-data (default)"
                    value={rootFolder}
                    onChange={(e) => setRootFolder(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && userEmail && handleExchangeCode()}
                  />
                  <p className="text-xs text-muted-foreground">
                    The folder in your Google Drive to mount. Leave empty for default (nexus-data).
                  </p>
                </div>
              )}

              {authCode && (
                <div className="space-y-2">
                  <label htmlFor="authCode" className="text-sm font-medium">
                    Authorization Code
                  </label>
                  <Input
                    id="authCode"
                    type="text"
                    value={authCode}
                    readOnly
                    className="font-mono text-xs bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Authorization code received (auto-filled).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="space-y-4">
              <div className="rounded-md bg-green-50 dark:bg-green-950 p-6 border border-green-200 dark:border-green-800 text-center">
                <div className="flex justify-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <svg
                      className="h-6 w-6 text-green-600 dark:text-green-400"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-lg font-medium text-green-900 dark:text-green-100 mb-2">
                  {providerDisplayName || providerName} Connected!
                </h3>
                <p className="text-sm text-green-800 dark:text-green-200">
                  {providerName === 'google-drive'
                    ? 'Your Google Drive has been connected and automatically mounted. You can now access your Drive files directly through Nexus.'
                    : `Your ${providerDisplayName || providerName} account has been connected. You can now access it through Nexus.`}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'email' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleGetAuthUrl} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </>
          )}

          {step === 'code' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleExchangeCode} disabled={loading || !userEmail || !userEmail.includes('@') || !authCode}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Setup
              </Button>
            </>
          )}

          {step === 'success' && (
            <Button onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
