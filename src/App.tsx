import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { FileBrowser } from './components/FileBrowser';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AdminSettings } from './pages/AdminSettings';
import './index.css';
import { Toaster } from 'sonner';
import { GOOGLE_CLIENT_ID } from './utils/config';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000, // 30 seconds
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
