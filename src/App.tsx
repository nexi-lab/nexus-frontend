import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FileBrowser } from './components/FileBrowser';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AdminSettings } from './pages/AdminSettings';
import { Integration } from './pages/Integration';
import { Connector } from './pages/Connector';
import { Skill } from './pages/Skill';
import { Agent } from './pages/Agent';
import { Workspace } from './pages/Workspace';
import { Memory } from './pages/Memory';
import OAuthCallback from './pages/OAuthCallback';
import Login from './pages/Login';
import Register from './pages/Register';
import Settings from './pages/Settings';
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isUserAuthenticated } = useAuth();

  if (!isUserAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

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
              <Route path="/" element={<ProtectedRoute><FileBrowser /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
              <Route path="/integration" element={<ProtectedRoute><Integration /></ProtectedRoute>} />
              <Route path="/connector" element={<ProtectedRoute><Connector /></ProtectedRoute>} />
              <Route path="/skill" element={<ProtectedRoute><Skill /></ProtectedRoute>} />
              <Route path="/agent" element={<ProtectedRoute><Agent /></ProtectedRoute>} />
              <Route path="/workspace" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
              <Route path="/memory" element={<ProtectedRoute><Memory /></ProtectedRoute>} />
              <Route path="/mounts" element={<Navigate to="/connector" replace />} />
              <Route path="/oauth/callback" element={<OAuthCallback />} />

              {/* User Authentication Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/profile" element={<Navigate to="/settings" replace />} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </LanguageProvider>
  );
}

export default App;
