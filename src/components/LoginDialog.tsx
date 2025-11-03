import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setIsLoading(true);

    try {
      // Login with the API key (validates with whoami)
      await login(apiKey.trim());
      setApiKey('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setApiKey('');
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Login to NexusFS</DialogTitle>
            <DialogDescription>Enter your API key to access the file system</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Input type="password" placeholder="Enter API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoFocus />
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Validating...' : 'Login'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
