import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AccountProvider } from './contexts/AccountContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ConnectionQueries } from './contexts/QueryProvider';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import Login from './pages/Login';
import OAuthCallback from './pages/OAuthCallback';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import './index.css';
import { Toaster } from 'sonner';

const FileBrowser = lazy(async () => ({ default: (await import('./components/FileBrowser')).FileBrowser }));
const AdminSettings = lazy(async () => ({ default: (await import('./pages/AdminSettings')).AdminSettings }));
const Settings = lazy(() => import('./pages/Settings'));
const Account = lazy(() => import('./pages/Account'));

function ProtectedRoute() {
  const { isAuthenticated, isResolvingIdentity, identityError } = useAuth();

  if (isResolvingIdentity) return <output>Verifying your Nexus connection...</output>;
  if (identityError)
    return (
      <div role="alert">
        {identityError}{' '}
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ConnectionQueries>
      <Suspense fallback={<output>Loading...</output>}>
        <Outlet />
      </Suspense>
    </ConnectionQueries>
  );
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
        <AccountProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<FileBrowser />} />
                <Route path="/files" element={<FileBrowser />} />
                <Route path="/admin" element={<AdminSettings />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="/oauth/callback" element={<OAuthCallback />} />

              {/* User Authentication Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/profile" element={<Navigate to="/account" replace />} />
              <Route
                path="/account"
                element={
                  <Suspense fallback={<output>Loading...</output>}>
                    <Account />
                  </Suspense>
                }
              />
              <Route path="*" element={<Navigate to="/files" replace />} />
            </Routes>
          </BrowserRouter>
        </AccountProvider>
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
