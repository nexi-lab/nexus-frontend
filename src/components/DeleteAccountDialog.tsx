import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { AlertTriangle } from 'lucide-react';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  userEmail: string;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  onConfirm,
  userEmail,
}: DeleteAccountDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const isConfirmed = confirmText === 'delete';

  const handleConfirm = async () => {
    if (!isConfirmed) return;

    setIsDeleting(true);
    setError('');

    try {
      await onConfirm();
      // Dialog will be closed by parent component after successful deletion
    } catch (err: any) {
      setError(err.message || 'Failed to delete account');
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmText('');
      setError('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <DialogTitle className="text-xl">Delete Account</DialogTitle>
          </div>
          <DialogDescription className="text-left space-y-3 pt-2">
            <p className="text-base">
              This action <strong className="text-foreground">cannot be undone</strong>. This will permanently
              delete your account and remove all your data from our servers.
            </p>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h4 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                This will permanently delete:
              </h4>
              <ul className="text-sm text-red-800 dark:text-red-200 list-disc list-inside space-y-1">
                <li>Your account (<strong>{userEmail}</strong>)</li>
                <li>All your workspaces and files</li>
                <li>All your agents and connectors</li>
                <li>All your skills and memories</li>
                <li>All your API keys and access tokens</li>
                <li>All OAuth account linkages</li>
              </ul>
            </div>

            <div className="pt-3">
              <label htmlFor="confirmText" className="block text-sm font-medium text-foreground mb-2">
                Type <span className="font-mono bg-muted px-2 py-0.5 rounded">delete</span> to confirm:
              </label>
              <input
                id="confirmText"
                type="text"
                autoComplete="off"
                className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-red-500"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type 'delete' here"
                disabled={isDeleting}
              />
            </div>

            {error && (
              <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-md p-3">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isConfirmed || isDeleting}
          >
            {isDeleting ? 'Deleting Account...' : 'Delete My Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
