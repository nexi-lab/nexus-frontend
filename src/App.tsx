import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { FileBrowser } from './components/FileBrowser';
import { AuthProvider } from './contexts/AuthContext';
import { AdminSettings } from './pages/AdminSettings';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000, // 30 seconds
    },
  },
});

function App() {
  return (
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
  );
}

export default App;
