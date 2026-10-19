import type { ReactNode } from 'react';
import type NexusAPIClient from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export function NexusConnection({ children }: { children: (client: NexusAPIClient) => ReactNode }) {
  const { apiClient } = useAuth();
  if (!apiClient) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center text-muted-foreground">
          <p className="font-medium mb-2">API client not initialized</p>
          <p>Please configure your connection in the login page.</p>
        </div>
      </div>
    );
  }
  return children(apiClient);
}
