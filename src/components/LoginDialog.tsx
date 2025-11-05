import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import ThirdAuth from './ThirdAuth';
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
    await doLogin(apiKey);
  };

  const doLogin = async (apiKey: string) => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }
    setIsLoading(true);
    try {
      await login(apiKey.trim());
      handleCancel();
      toast.success('Login successful');
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
    <Dialog open={open} onOpenChange={onOpenChange} closeOnOverlayClick={false}>
      <DialogContent className="w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Login to NexusFS</DialogTitle>
            <DialogDescription>Enter your API key to access the file system</DialogDescription>
          </DialogHeader>

          <div className="py-8">
            <Input type="password" placeholder="Enter API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoFocus />
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>

          <DialogFooter>
            <ThirdAuth onSuccess={handleCancel} />
            <div className="flex items-center gap-4">
              <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="size-5.5 animate-spin" /> : null}
                {isLoading ? 'Validating...' : 'Login'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
