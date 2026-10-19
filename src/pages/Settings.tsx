import { ArrowLeft, Check, Copy, Eye, EyeOff, Key, LogOut, User } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { copyToClipboard } from '../utils';

export default function Settings() {
  const navigate = useNavigate();
  const { apiUrl, apiKey, userInfo, logout } = useAuth();
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyKey = async () => {
    if (!apiKey) return;
    await copyToClipboard(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!userInfo) return null;
  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to home">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <User className="h-8 w-8" />
          <h1 className="text-2xl font-bold">Profile & Settings</h1>
        </div>
        <Button
          variant="destructive"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <section className="space-y-4 rounded border p-6">
          <h2 className="text-lg font-medium">Nexus Connection</h2>
          <dl className="space-y-2">
            <dt>Server</dt>
            <dd>{apiUrl}</dd>
            <dt>Subject</dt>
            <dd>{userInfo.subject_id}</dd>
            <dt>Subject Type</dt>
            <dd>{userInfo.subject_type}</dd>
            <dt>Zone</dt>
            <dd>{userInfo.zone_id}</dd>
          </dl>
        </section>
        {apiKey && (
          <section className="space-y-4 rounded border p-6">
            <h2 className="flex gap-2 text-lg font-medium">
              <Key className="h-5 w-5" />
              API Access
            </h2>
            <div className="flex gap-2">
              <p className="flex-1 break-all rounded bg-muted p-3 font-mono">{showApiKey ? apiKey : '*'.repeat(Math.min(apiKey.length, 32))}</p>
              <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)} title={showApiKey ? 'Hide API key' : 'Show API key'}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={copyKey} title="Copy to clipboard">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </section>
        )}
        <Link to="/account">Account settings</Link>
      </main>
    </div>
  );
}
