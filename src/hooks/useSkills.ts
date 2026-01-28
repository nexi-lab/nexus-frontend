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
  owner?: string;
  tier?: string;
  file_path?: string;
  path?: string;
  created_at?: string;
  modified_at?: string;
  requires?: string[];
  tags?: string[];
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

// Helper function to parse SKILL.md content
function parseSkillMd(content: string, dirName: string, dirPath: string): Skill {
  const lines = content.split('\n');
  // Use directory name as the skill name (more consistent identifier)
  const name = dirName;
  let description = '';
  let version: string | undefined;
  let author: string | undefined;

  // Extract description from the first heading or first paragraph
  const firstHeadingIndex = lines.findIndex(line => line.startsWith('#'));
  if (firstHeadingIndex >= 0) {
    // Use the heading text as part of description if it's descriptive
    const headingText = lines[firstHeadingIndex].replace(/^#+\s*/, '').trim();
    const descLines = lines.slice(firstHeadingIndex + 1);
    let descEnd = descLines.length;
    for (let i = 0; i < descLines.length; i++) {
      if (descLines[i].startsWith('#')) {
        descEnd = i;
        break;
      }
    }
    const bodyDesc = descLines.slice(0, descEnd)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join(' ')
      .substring(0, 500);

    // Use body description if available, otherwise use heading text
    description = bodyDesc || headingText;
  }

  // Try to extract version and author from content
  const versionMatch = content.match(/version[:\s]+([^\n\r]+)/i);
  if (versionMatch) {
    version = versionMatch[1].trim();
  }

  const authorMatch = content.match(/author[:\s]+([^\n\r]+)/i);
  if (authorMatch) {
    author = authorMatch[1].trim();
  }

  // Ensure path ends with /
  const skillPath = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;

  return {
    name,
    description: description || `Skill: ${name}`,
    version,
    author,
    file_path: `${skillPath}SKILL.md`,
    path: skillPath,
    tier: 'personal',
  };
}

// List all skills by reading from filesystem
export function useSkills(tier?: string, enabled = true) {
  const { apiClient, userInfo } = useAuth();

  // Construct the skills folder path from tenant and user IDs
  const skillsFolderPath = useMemo(() => {
    const tenantId = userInfo?.tenant_id || 'default';
    const userId = userInfo?.subject_id || 'admin';
    return `/tenant:${tenantId}/user:${userId}/skill`;
  }, [userInfo?.tenant_id, userInfo?.subject_id]);

  return useQuery({
    queryKey: skillKeys.list(tier),
    queryFn: async (): Promise<SkillsListResponse> => {
      if (!apiClient) throw new Error('API client not initialized');

      const filesAPI = createFilesAPI(apiClient);

      try {
        // List all items in the skills folder
        const items = await filesAPI.list(skillsFolderPath, { details: true });

        // Filter for directories only
        const skillDirs = items.filter(item => item.isDirectory);

        // Fetch SKILL.md for each directory
        const skills = await Promise.all(
          skillDirs.map(async (dir) => {
            try {
              // Ensure path ends with / before appending SKILL.md
              const normalizedPath = dir.path.endsWith('/') ? dir.path : `${dir.path}/`;
              const skillMdPath = `${normalizedPath}SKILL.md`.replace(/\/+/g, '/');
              const skillMdContent = await filesAPI.read(skillMdPath);

              // Decode the content (it's a Uint8Array)
              const textDecoder = new TextDecoder('utf-8');
              const content = textDecoder.decode(skillMdContent);

              return parseSkillMd(content, dir.name, dir.path);
            } catch (error) {
              console.warn(`Failed to read SKILL.md for ${dir.path}:`, error);
              // Return a basic skill entry even if SKILL.md can't be read
              const skillPath = dir.path.endsWith('/') ? dir.path : `${dir.path}/`;
              return {
                name: dir.name,
                description: `Skill: ${dir.name}`,
                file_path: `${skillPath}SKILL.md`,
                path: skillPath,
                tier: 'personal',
              };
            }
          })
        );

        // Filter out null entries
        const validSkills = skills.filter((s): s is Skill => s !== null);

        return { skills: validSkills, count: validSkills.length };
      } catch (error) {
        // If the skills folder doesn't exist, return empty list
        console.warn(`Failed to list skills from ${skillsFolderPath}:`, error);
        return { skills: [], count: 0 };
      }
    },
    enabled: enabled && !!apiClient,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Get skill details
export function useSkillInfo(skillName: string, enabled = true) {
  const { apiClient } = useAuth();

  return useQuery({
    queryKey: skillKeys.detail(skillName),
    queryFn: async () => {
      if (!apiClient) throw new Error('API client not initialized');
      return apiClient.skillsInfo({ skill_name: skillName });
    },
    enabled: enabled && !!apiClient,
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
      if (!apiClient) throw new Error('API client not initialized');
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
      if (!apiClient) throw new Error('API client not initialized');
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
      if (!apiClient) throw new Error('API client not initialized');
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
  const filesAPI = useMemo(() => apiClient ? createFilesAPI(apiClient) : null, [apiClient]);

  return useMutation({
    mutationFn: async ({ skillPath }: { skillPath: string }) => {
      if (!filesAPI) throw new Error('API client not initialized');
      // Use filesystem API to delete skill directory
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
