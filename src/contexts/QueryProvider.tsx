import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AuthenticationError } from '../api/client';
import { useAuth } from './AuthContext';

let nextConnection = 0;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => !(error instanceof AuthenticationError) && failureCount < 1,
        staleTime: 30000,
      },
      mutations: { retry: false },
    },
  });
}

export function ConnectionQueries({ children }: { children: ReactNode }) {
  const { apiClient } = useAuth();
  // Queries and mounted views belong to one configured credential.
  const connection = useMemo(() => ({ id: ++nextConnection, client: createQueryClient() }), [apiClient]);
  const previous = useRef<QueryClient | null>(null);
  useEffect(() => {
    const retired = previous.current;
    previous.current = connection.client;
    if (retired && retired !== connection.client) {
      void retired.cancelQueries();
      retired.clear();
    }
  }, [connection.client]);
  return <QueryClientProvider key={connection.id} client={connection.client}>{children}</QueryClientProvider>;
}
