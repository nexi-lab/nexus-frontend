import { useGoogleLogin } from '@react-oauth/google';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import GoogleIcon from '@/assets/icon_google.svg?react';
import { useAuth } from '@/contexts/AuthContext';
import { TEMP_API_KEY } from '@/utils/config';
import { Button } from './ui/button';

export default function ThirdAuth({ onSuccess }: ThirdAuthProps) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { login } = useAuth();

  const googleLogin = useGoogleLogin({
    onSuccess: async (response) => {
      console.log(response);
      try {
        await login(TEMP_API_KEY);
        toast.success('Login successful');
        onSuccess();
      } catch (error) {
        console.error(error);
      } finally {
        setIsGoogleLoading(false);
      }
    },
    onError: (error) => {
      setIsGoogleLoading(false);
      console.log(error);
    },
    onNonOAuthError: (error) => {
      setIsGoogleLoading(false);
      console.log(error);
    },
  });

  const onTriggerGoogleLogin = () => {
    setIsGoogleLoading(true);
    googleLogin();
  };

  return (
    <div className="grid grid-cols-2 gap-5">
      <Button disabled={isGoogleLoading} className="!px-8 !py-5" variant="outline" onClick={onTriggerGoogleLogin} type="button">
        {isGoogleLoading ? <Loader2 className="size-5.5 animate-spin" /> : <GoogleIcon className="size-5.5" />}
        Google
      </Button>
    </div>
  );
}

interface ThirdAuthProps {
  onSuccess: () => void;
}
