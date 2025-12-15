import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';

// Query keys factory
export const skillKeys = {
  all: ['skills'] as const,
  lists: () => [...skillKeys.all, 'list'] as const,
  list: (tier?: string) => [...skillKeys.lists(), tier] as const,
  detail: (name: string) => [...skillKeys.all, 'detail', name] as const,
};

// Skill type definitions
export interface Skill {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tier?: string;
  file_path?: string;
  created_at?: string;
  modified_at?: string;
  requires?: string[];
}

export interface SkillsListResponse {
  skills: Skill[];
  count: number;
}

export interface SkillImportResponse {
  imported_skills: string[];
  skill_paths: string[];
  tier: string;
}

export interface SkillValidationResponse {
  valid: boolean;
  skills_found: string[];
  errors: string[];
  warnings: string[];
}

export interface SkillExportResponse {
  skill_name: string;
  zip_data: string; // Base64 encoded
  size_bytes: number;
  format: string;
  filename?: string; // Suggested filename (e.g., "skill-name.skill")
}

// List all skills
export function useSkills(tier?: string, enabled = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: skillKeys.list(tier),
    queryFn: async (): Promise<SkillsListResponse> => {
      return apiClient.skillsList({ tier, include_metadata: true });
    },
    enabled,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Get skill details
export function useSkillInfo(skillName: string, enabled = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: skillKeys.detail(skillName),
    queryFn: async () => {
      return apiClient.skillsInfo({ skill_name: skillName });
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Upload skill from ZIP
export function useUploadSkill() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      zipData,
      tier,
      allowOverwrite,
    }: {
      zipData: string;
      tier: 'personal' | 'tenant';
      allowOverwrite?: boolean;
    }): Promise<SkillImportResponse> => {
      return apiClient.skillsImport({
        zip_data: zipData,
        tier,
        allow_overwrite: allowOverwrite || false,
      });
    },
    onSuccess: () => {
      // Invalidate skills list to refresh
      queryClient.invalidateQueries({ queryKey: skillKeys.lists() });
    },
  });
}

// Validate skill ZIP
export function useValidateSkillZip() {
  const { apiClient } = useAuth();

  return useMutation({
    mutationFn: async ({
      zipData,
    }: {
      zipData: string;
    }): Promise<SkillValidationResponse> => {
      return apiClient.skillsValidateZip({ zip_data: zipData });
    },
  });
}

// Export skill to ZIP
export function useExportSkill() {
  const { apiClient } = useAuth();

  return useMutation({
    mutationFn: async ({
      skillName,
      format,
      includeDependencies,
    }: {
      skillName: string;
      format?: 'generic' | 'claude';
      includeDependencies?: boolean;
    }): Promise<SkillExportResponse> => {
      return apiClient.skillsExport({
        skill_name: skillName,
        format: format || 'generic',
        include_dependencies: includeDependencies || false,
      });
    },
  });
}

// Delete skill (uses filesystem API)
export function useDeleteSkill() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const filesAPI = useMemo(() => createFilesAPI(apiClient), [apiClient]);

  return useMutation({
    mutationFn: async ({ skillPath }: { skillPath: string }) => {
      // Use filesystem API to delete skill directory
      // skillPath is like: /skills/users/{user_id}/skill-name/
      console.log('useDeleteSkill: Attempting to delete skill directory:', skillPath);

      try {
        await filesAPI.rmdir(skillPath, true);
        console.log('useDeleteSkill: Successfully deleted skill directory:', skillPath);
      } catch (error) {
        console.error('useDeleteSkill: Failed to delete skill directory:', error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('useDeleteSkill: Invalidating skills cache');
      queryClient.invalidateQueries({ queryKey: skillKeys.lists() });
    },
    onError: (error) => {
      console.error('useDeleteSkill: Mutation error:', error);
    },
  });
}
