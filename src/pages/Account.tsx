import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { accountErrorMessage } from '../api/accounts';
import { useAccount } from '../contexts/AccountContext';

export default function Account() {
  const { account, serverUrl, resolving, error, logout, updateProfile, changePassword, deleteAccount } = useAccount();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  if (resolving) return <output>Loading your account...</output>;
  if (error)
    return (
      <p role="alert">
        {error}{' '}
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
        <Link to="/login">Change account connection</Link>
      </p>
    );
  if (!account) return <Navigate to="/login" replace />;

  const submit = async (event: React.FormEvent, action: () => Promise<void>, success: string) => {
    event.preventDefault();
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setActionError(accountErrorMessage(error, 'Unable to complete this account action.'));
    } finally {
      setBusy(false);
    }
  };

  const deleteIdentity = account.email ?? account.user_id;

  return (
    <main className="mx-auto max-w-lg space-y-6 p-8">
      <h1 className="text-2xl font-bold">Your Nexus account</h1>
      <dl className="space-y-2">
        <dt>Account server</dt>
        <dd>{serverUrl}</dd>
        <dt>Email</dt>
        <dd>{account.email}</dd>
        <dt>User ID</dt>
        <dd>{account.user_id}</dd>
      </dl>
      <form className="space-y-2" onSubmit={(event) => submit(event, () => updateProfile(displayName ?? account.display_name ?? ''), 'Profile updated.')}>
        <label htmlFor="account-name">Display name</label>
        <input
          id="account-name"
          className="w-full rounded border p-2"
          maxLength={255}
          value={displayName ?? account.display_name ?? ''}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          Save profile
        </button>
      </form>
      {account.primary_auth_method === 'password' && (
        <form
          className="space-y-2"
          onSubmit={(event) =>
            submit(
              event,
              async () => {
                if (password !== confirmation) throw new Error('New passwords do not match.');
                await changePassword(currentPassword, password);
                setCurrentPassword('');
                setPassword('');
                setConfirmation('');
              },
              'Password changed successfully!',
            )
          }
        >
          <h2 className="text-lg font-semibold">Change Password</h2>
          <label htmlFor="account-current-password">Current Password</label>
          <input
            id="account-current-password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded border p-2"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <label htmlFor="account-new-password">New Password</label>
          <input
            id="account-new-password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded border p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label htmlFor="account-confirm-password">Confirm New Password</label>
          <input
            id="account-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded border p-2"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            Change Password
          </button>
        </form>
      )}
      <form
        className="space-y-2 rounded border border-red-500 p-4"
        onSubmit={(event) =>
          submit(
            event,
            async () => {
              if (deleteConfirmation !== deleteIdentity) throw new Error('Enter the account identity to confirm deletion.');
              await deleteAccount();
            },
            'Account deleted.',
          )
        }
      >
        <h2 className="text-lg font-semibold">Delete account</h2>
        <p>
          This permanently deletes your account and sign-in bindings. Your native file connection and its files remain available through the existing native
          credential.
        </p>
        <label htmlFor="account-delete-confirmation">Type {deleteIdentity} to confirm</label>
        <input
          id="account-delete-confirmation"
          className="w-full rounded border p-2"
          autoComplete="off"
          required
          value={deleteConfirmation}
          onChange={(event) => setDeleteConfirmation(event.target.value)}
        />
        <button type="submit" disabled={busy || deleteConfirmation !== deleteIdentity}>
          Delete account permanently
        </button>
      </form>
      {actionError && <p role="alert">{actionError}</p>}
      {message && <output>{message}</output>}
      <nav className="flex gap-4">
        <Link to="/login">Connect to files</Link>
        <Link to="/files">Files</Link>
        <button type="button" onClick={logout}>
          Sign out of account
        </button>
      </nav>
    </main>
  );
}
