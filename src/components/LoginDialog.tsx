import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n/useTranslation';
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
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    await doLogin(apiKey);
  };

  const doLogin = async (apiKey: string) => {
    if (!apiKey.trim()) {
      setError(t('login.enterApiKey'));
      return;
    }
    setIsLoading(true);
    try {
      await login(apiKey.trim());
      handleCancel();
      toast.success(t('login.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.invalidKey'));
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
            <DialogTitle>{t('login.title')}</DialogTitle>
            <DialogDescription>{t('login.description')}</DialogDescription>
          </DialogHeader>

          <div className="py-8">
            <Input type="password" placeholder={t('login.placeholder')} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoFocus />
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>

          <DialogFooter>
            <ThirdAuth onSuccess={handleCancel} />
            <div className="flex items-center gap-4">
              <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="size-5.5 animate-spin" /> : null}
                {isLoading ? t('login.validating') : t('common.login')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
