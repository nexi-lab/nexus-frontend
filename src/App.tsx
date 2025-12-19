import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FileBrowser } from './components/FileBrowser';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AdminSettings } from './pages/AdminSettings';
import { Integration } from './pages/Integration';
import { Connector } from './pages/Connector';
import { Skill } from './pages/Skill';
import { Agent } from './pages/Agent';
import { Workspace } from './pages/Workspace';
import { Memory } from './pages/Memory';
import OAuthCallback from './pages/OAuthCallback';
import './index.css';
import { Toaster } from 'sonner';
import { GOOGLE_CLIENT_ID } from './utils/config';
import { AuthenticationError } from './api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (_failureCount, error) => {
        // Don't retry on authentication errors
        if (error instanceof AuthenticationError) {
          return false;
        }
        return _failureCount < 1;
      },
      staleTime: 30000, // 30 seconds
    },
    mutations: {
      retry: (_failureCount, error) => {
        // Don't retry on authentication errors
        if (error instanceof AuthenticationError) {
          return false;
        }
        return false; // Don't retry mutations by default
      },
    },
  },
});

function AppContent() {
  const { resolvedTheme } = useTheme();

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Toaster
        theme={resolvedTheme}
        position="top-center"
        richColors
        toastOptions={{
          classNames: {
            toast: '!rounded-xl',
          },
        }}
      />
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<FileBrowser />} />
              <Route path="/admin" element={<AdminSettings />} />
              <Route path="/integration" element={<Integration />} />
              <Route path="/connector" element={<Connector />} />
              <Route path="/skill" element={<Skill />} />
              <Route path="/agent" element={<Agent />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="/memory" element={<Memory />} />
              <Route path="/mounts" element={<Navigate to="/connector" replace />} />
              <Route path="/oauth/callback" element={<OAuthCallback />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
