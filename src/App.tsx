import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ConnectionQueries } from './contexts/QueryProvider';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import OAuthCallback from './pages/OAuthCallback';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import './index.css';
import { Toaster } from 'sonner';

const FileBrowser = lazy(async () => ({ default: (await import('./components/FileBrowser')).FileBrowser }));
const AdminSettings = lazy(async () => ({ default: (await import('./pages/AdminSettings')).AdminSettings }));
const Integration = lazy(async () => ({ default: (await import('./pages/Integration')).Integration }));
const Connector = lazy(async () => ({ default: (await import('./pages/Connector')).Connector }));
const Skill = lazy(async () => ({ default: (await import('./pages/Skill')).Skill }));
const Agent = lazy(async () => ({ default: (await import('./pages/Agent')).Agent }));
const Workspace = lazy(async () => ({ default: (await import('./pages/Workspace')).Workspace }));
const Memory = lazy(async () => ({ default: (await import('./pages/Memory')).Memory }));
const Settings = lazy(() => import('./pages/Settings'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isUserAuthenticated, isAuthenticated, isResolvingIdentity, identityError } = useAuth();

  if (isResolvingIdentity) return <p role="status">Verifying your Nexus connection...</p>;
  if (identityError) return <div role="alert">{identityError} <button type="button" onClick={() => window.location.reload()}>Retry</button></div>;

  // Allow access if either user account (JWT) or API key is authenticated
  if (!isUserAuthenticated && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Suspense fallback={<p role="status">Loading...</p>}>{children}</Suspense>;
}

function AppContent() {
  const { resolvedTheme } = useTheme();

  return (
    <>
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
        <ConnectionQueries>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ProtectedRoute><FileBrowser /></ProtectedRoute>} />
              <Route path="/files" element={<ProtectedRoute><FileBrowser /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
              <Route path="/integration" element={<ProtectedRoute><Integration /></ProtectedRoute>} />
              <Route path="/connector" element={<ProtectedRoute><Connector /></ProtectedRoute>} />
              <Route path="/skills" element={<ProtectedRoute><Skill /></ProtectedRoute>} />
              <Route path="/skill" element={<Navigate to="/skills" replace />} />
              <Route path="/agent" element={<ProtectedRoute><Agent /></ProtectedRoute>} />
              <Route path="/workspace" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
              <Route path="/memory" element={<ProtectedRoute><Memory /></ProtectedRoute>} />
              <Route path="/mounts" element={<Navigate to="/connector" replace />} />
              <Route path="/oauth/callback" element={<OAuthCallback />} />

              {/* User Authentication Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/profile" element={<Navigate to="/settings" replace />} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            </Routes>
          </BrowserRouter>
        </ConnectionQueries>
      </AuthProvider>
    </>
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
