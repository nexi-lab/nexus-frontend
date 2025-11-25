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
}

export default function OAuthSetupDialog({ open, onOpenChange, onSuccess }: OAuthSetupDialogProps) {
  const { apiClient } = useAuth();
  const [step, setStep] = useState<'email' | 'authorize' | 'code' | 'success'>('email');
  const [userEmail, setUserEmail] = useState('');
  const [rootFolder, setRootFolder] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [authState, setAuthState] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Check for OAuth callback data when dialog opens
  useEffect(() => {
    if (open) {
      const oauthCode = sessionStorage.getItem('oauth_code');
      const oauthState = sessionStorage.getItem('oauth_state');

      if (oauthCode && oauthState) {
        // Clear the sessionStorage
        sessionStorage.removeItem('oauth_code');
        sessionStorage.removeItem('oauth_state');

        // Auto-fill the code and state
        setAuthCode(oauthCode);
        setAuthState(oauthState);

        // Show a toast that we detected the callback
        toast.success('OAuth callback detected! Please enter your email to complete setup.');

        // Stay on email step so user can enter their email
        setStep('email');
      }
    }
  }, [open]);

  const handleGetAuthUrl = async () => {
    if (!userEmail || !userEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      // First, check if the user already has OAuth credentials
      const credentials = await apiClient.call<Array<{
        provider: string;
        user_email: string;
        credential_id: string;
        revoked: boolean;
      }>>('oauth_list_credentials', { provider: 'google' });

      // Check if this user already has valid (non-revoked) credentials
      const existingCredential = credentials?.find(
        (cred) => cred.user_email === userEmail && !cred.revoked
      );

      if (existingCredential) {
        // User already has credentials - skip OAuth and create mount directly
        toast.success('Using existing Google Drive credentials');
        await createMount();
        return;
      }

      // If we already have an auth code (from OAuth callback), exchange it
      if (authCode && authState) {
        await handleExchangeCode();
        return;
      }

      // No credentials exist - proceed with OAuth flow
      const result = await apiClient.oauthGetDriveAuthUrl();
      setAuthUrl(result.url);
      setAuthState(result.state);
      setStep('authorize');
      toast.success('Authorization URL generated');
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

    setLoading(true);
    try {
      const result = await apiClient.oauthExchangeCode({
        provider: 'google',
        code: authCode,
        user_email: userEmail,
        state: authState,
      });

      if (result.success) {
        toast.success('OAuth credentials stored successfully!');

        // Automatically create and mount Google Drive
        toast.info('Creating Google Drive mount...');

        try {
          await createMount();
        } catch (mountError: any) {
          console.error('Mount creation failed:', mountError);
          // Still show success for OAuth, but note mount failed
          setStep('success');
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
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Setup Google Drive OAuth</DialogTitle>
          <DialogDescription>
            Connect your Google Drive account to Nexus for seamless file access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Step 1: Enter Email */}
          {step === 'email' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="userEmail" className="text-sm font-medium">
                  Google Account Email <span className="text-red-500">*</span>
                </label>
                <Input
                  id="userEmail"
                  type="email"
                  placeholder="your-email@gmail.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleGetAuthUrl()}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  This will be used to identify your Google Drive credentials.
                </p>
              </div>

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
                  You'll need to grant Nexus permission to access your Google Drive.
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

          {/* Step 3: Enter Code */}
          {step === 'code' && (
            <div className="space-y-4">
              <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-4 border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                  Next Steps:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
                  <li>Sign in with your Google account</li>
                  <li>Grant permission to access Google Drive</li>
                  <li>You'll be redirected to a page with an authorization code</li>
                  <li>Copy the code and paste it below</li>
                </ol>
              </div>

              <div className="space-y-2">
                <label htmlFor="authCode" className="text-sm font-medium">
                  Authorization Code <span className="text-red-500">*</span>
                </label>
                <Input
                  id="authCode"
                  type="text"
                  placeholder="Paste the authorization code here"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleExchangeCode()}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The code is typically in the URL after you grant permission.
                </p>
              </div>
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
                  Google Drive Connected!
                </h3>
                <p className="text-sm text-green-800 dark:text-green-200">
                  Your Google Drive has been connected and automatically mounted.
                  You can now access your Drive files directly through Nexus.
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

          {step === 'authorize' && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {step === 'code' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleExchangeCode} disabled={loading || !authCode}>
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
