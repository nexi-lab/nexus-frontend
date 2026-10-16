import { Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import NexusAPIClient from '@/api/client';
import GoogleIcon from '@/assets/icon_google.svg?react';
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
      const client = new NexusAPIClient(serverUrl);
      const { auth_url, state } = await client.authGoogleAuthorize();
      const authorizationUrl = new URL(auth_url);
      if (authorizationUrl.protocol !== 'https:' || !state) {
        throw new Error('The server returned an invalid Google sign-in response.');
      }
      sessionStorage.setItem('oauth_state', state);
      sessionStorage.removeItem('oauth_provider');
      localStorage.setItem('nexus_api_url', serverUrl);
      window.location.assign(authorizationUrl.href);
    } catch (failure) {
      const detail = isAxiosError(failure) ? failure.response?.data?.detail : failure instanceof Error ? failure.message : null;
      setError(typeof detail === 'string' ? detail : 'Google sign-in could not start. Please check your Nexus connection.');
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
