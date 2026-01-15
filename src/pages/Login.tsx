import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const { updateConnection } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState(() => {
    // Get from localStorage or use default
    const stored = localStorage.getItem('nexus_api_url');
    return stored || 'http://localhost:2026';
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    if (!apiUrl.trim()) {
      setError('Please enter a Nexus server URL');
      return;
    }

    setLoading(true);
    try {
      await updateConnection(apiUrl.trim(), apiKey.trim());
      toast.success('Login successful');
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid API key or server URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Sign in to Nexus
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Connect to your Nexus server with an API key
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}

          <div>
            <label htmlFor="apiUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nexus Server URL
            </label>
            <input
              id="apiUrl"
              name="apiUrl"
              type="text"
              required
              className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
              placeholder="http://localhost:2026"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Enter the URL of your Nexus server (e.g., http://localhost:2026)
            </p>
          </div>

          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Key
            </label>
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              required
              className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800"
              placeholder="Enter your API key (sk-...)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
            />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Enter your Nexus API key to authenticate. API keys start with <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">sk-</code>
            </p>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Sign in with API Key'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
