import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { accountErrorMessage } from '@/api/accounts';
import GoogleIcon from '@/assets/icon_google.svg?react';
import { startGoogleLogin } from '@/auth/google';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from './ui/button';

export default function ThirdAuth({ apiUrl: configuredUrl }: ThirdAuthProps) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiUrl } = useAuth();
  const serverUrl = configuredUrl ?? apiUrl;

  const onTriggerGoogleLogin = async () => {
    if (!serverUrl) return;
    setIsGoogleLoading(true);
    setError(null);
    try {
      await startGoogleLogin(serverUrl);
    } catch (failure) {
      setError(accountErrorMessage(failure, 'Google sign-in could not start. Please check your Nexus connection.'));
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button disabled={isGoogleLoading || !serverUrl} className="!px-8 !py-5" variant="outline" onClick={onTriggerGoogleLogin} type="button">
        {isGoogleLoading ? <Loader2 className="size-5.5 animate-spin" /> : <GoogleIcon className="size-5.5" />}
        Google
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

interface ThirdAuthProps {
  apiUrl?: string;
}
