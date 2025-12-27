import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Copy, Eye, EyeOff, Check, ArrowLeft, User, Key, LogOut } from 'lucide-react';
import { copyToClipboard } from '../utils';
import { Button } from '../components/ui/button';

export default function Settings() {
  const navigate = useNavigate();
  const { userAccount, isUserAuthenticated, changePassword, userLogout, logout } = useAuth();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isUserAuthenticated) {
      navigate('/login');
      return;
    }
  }, [isUserAuthenticated, navigate]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordLoading(true);

    try {
      await changePassword(oldPassword, newPassword);
      setPasswordSuccess('Password changed successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.response?.data?.detail || err.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    if (isUserAuthenticated) {
      userLogout();
    } else {
      logout();
    }
    navigate('/login');
  };

  const handleCopyApiKey = async () => {
    if (!userAccount?.api_key) return;
    await copyToClipboard(userAccount.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 12) {
      return '*'.repeat(key.length);
    }
    return key.slice(0, 8) + '*'.repeat(key.length - 16) + key.slice(-8);
  };

  if (!userAccount) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <User className="h-8 w-8" />
            <h1 className="text-2xl font-bold">Profile & Settings</h1>
          </div>
          <Button variant="destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-card shadow rounded-lg border">
            {/* Account Information */}
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-medium">Account Information</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Email:</span>
                  <p className="mt-1 text-sm">{userAccount.email}</p>
                </div>
                {userAccount.username && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Username:</span>
                    <p className="mt-1 text-sm">{userAccount.username}</p>
                  </div>
                )}
                {userAccount.display_name && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Display Name:</span>
                    <p className="mt-1 text-sm">{userAccount.display_name}</p>
                  </div>
                )}
                {userAccount.avatar_url && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Avatar:</span>
                    <div className="mt-2">
                      <img
                        src={userAccount.avatar_url}
                        alt="User avatar"
                        className="h-16 w-16 rounded-full object-cover border-2 border-border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-sm font-medium text-muted-foreground">User ID:</span>
                  <p className="mt-1 text-sm font-mono">{userAccount.user_id}</p>
                </div>
                {userAccount.created_at && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Account Created:</span>
                    <p className="mt-1 text-sm">
                      {new Date(userAccount.created_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Authentication Method:</span>
                  <p className="mt-1 text-sm capitalize">
                    {userAccount.primary_auth_method === 'oauth' || userAccount.primary_auth_method === 'google'
                      ? 'Google OAuth'
                      : userAccount.primary_auth_method || 'oauth'}
                  </p>
                </div>
              </div>
            </div>

            {/* API Key Section */}
            {userAccount.api_key && (
              <div className="px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2 mb-4">
                  <Key className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-medium">API Access</h2>
                </div>
                <div className="space-y-3">
                  {userAccount.tenant_id && (
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Tenant ID:</span>
                      <p className="mt-1 text-sm font-mono">{userAccount.tenant_id}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Personal API Key:</span>
                    <div className="mt-2 flex gap-2">
                      <div className="flex-1 bg-muted p-3 rounded-md font-mono text-sm break-all border border-border">
                        {showApiKey ? userAccount.api_key : maskApiKey(userAccount.api_key)}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowApiKey(!showApiKey)}
                        title={showApiKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCopyApiKey}
                        title="Copy to clipboard"
                      >
                        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    {copied && (
                      <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                        API key copied to clipboard!
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Use this API key to access Nexus programmatically via the Python SDK or direct API calls.
                    </p>
                    <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        <strong>Note:</strong> This API key is automatically provided on every login.
                        You don't need to manually save it - just log in again if you need to retrieve it.
                      </p>
                    </div>
                    <div className="mt-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                      <p className="text-xs text-yellow-800 dark:text-yellow-200">
                        <strong>Security:</strong> Keep your API key secure and never share it publicly.
                        It provides full access to your account.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Change Password - Only for password-based auth users */}
            {userAccount.primary_auth_method === 'password' && (
              <div className="px-6 py-4">
                <h2 className="text-lg font-medium mb-4">Change Password</h2>

                {passwordSuccess && (
                  <div className="mb-4 rounded-md bg-green-50 dark:bg-green-900/20 p-4">
                    <div className="text-sm text-green-800 dark:text-green-200">{passwordSuccess}</div>
                  </div>
                )}

                {passwordError && (
                  <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900/20 p-4">
                    <div className="text-sm text-red-800 dark:text-red-200">{passwordError}</div>
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label htmlFor="oldPassword" className="block text-sm font-medium mb-2">
                      Current Password
                    </label>
                    <input
                      id="oldPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium mb-2">
                      New Password
                    </label>
                    <input
                      id="newPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="At least 12 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Password must be at least 12 characters long
                    </p>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                      Confirm New Password
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={passwordLoading}
                    className="w-full"
                  >
                    {passwordLoading ? 'Changing...' : 'Change Password'}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
