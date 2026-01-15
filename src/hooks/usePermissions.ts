import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';

export interface PermissionTuple {
  tuple_id: string;
  subject_type: string;
  subject_id: string;
  relation: string;
  object_type: string;
  object_id: string;
  created_at: string | null;
}

export function useFilePermissions(filePath: string | null | undefined) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: ['permissions', filePath],
    queryFn: async () => {
      if (!filePath) return [];
      if (!apiClient) throw new Error('API client not initialized');

      const tuples = await apiClient.rebacListTuples({
        object: ['file', filePath],
      });

      // Filter out any tuples with invalid data
      return tuples.filter((t: any) => t.subject_type && t.subject_id && t.relation) as PermissionTuple[];
    },
    enabled: !!filePath && !!apiClient,
  });
}
