import { useState } from 'react';
import { ArrowLeft, BookOpen, Download, Edit, FolderOpen, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSkills, useDeleteSkill, useExportSkill } from '../hooks/useSkills';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { SkillUploadDialog } from '../components/SkillUploadDialog';
import { SkillEditor } from '../components/SkillEditor';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';

interface EditingSkill {
  name: string;
  path: string;
}

export function Skill() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { apiClient } = useAuth();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<EditingSkill | null>(null);
  const [selectedTier, setSelectedTier] = useState<string | undefined>(undefined);

  const { data: skillsData, isLoading, error } = useSkills(selectedTier);
  const deleteMutation = useDeleteSkill();
  const exportMutation = useExportSkill();

  // Fetch SKILL.md content when editing
  const { data: skillContent, isLoading: isLoadingContent } = useQuery<string>({
    queryKey: ['skillContent', editingSkill?.path],
    queryFn: async (): Promise<string> => {
      if (!editingSkill) return '';
      // The path from skills list is already the full path to SKILL.md
      const result = await apiClient.call<any>('read', { path: editingSkill.path });

      // Convert Uint8Array to string
      if (result instanceof Uint8Array) {
        return new TextDecoder().decode(result);
      }
      return result as string;
    },
    enabled: !!editingSkill,
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache the data (formerly cacheTime)
    refetchOnMount: 'always', // Always refetch when component mounts
  });

  // Save SKILL.md mutation
  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!editingSkill) throw new Error('No skill selected');
      // The path from skills list is already the full path to SKILL.md

      // Convert string to bytes for base64 encoding (handle large files properly)
      const bytes = new TextEncoder().encode(content);

      // Convert to base64 using a method that handles large arrays
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Content = btoa(binary);

      // Send bytes in the format expected by the JSON-RPC protocol
      const result = await apiClient.call('write', {
        path: editingSkill.path,
        content: {
          __type__: 'bytes',
          data: base64Content,
        },
      });

      return result;
    },
    onSuccess: () => {
      toast.success('Skill saved successfully');
      // Invalidate both skills list and skill content cache
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      queryClient.invalidateQueries({ queryKey: ['skillContent'] });
      // Also invalidate file content cache (used by file browser)
      if (editingSkill) {
        queryClient.invalidateQueries({ queryKey: ['fileContent', editingSkill.path] });
      }
      // Don't close the dialog - let user verify changes and close manually
    },
    onError: (error: any) => {
      toast.error(`Failed to save skill: ${error.message || 'Unknown error'}`);
    },
  });

  const handleDelete = async (skillPath: string, skillName: string) => {
    if (!confirm(`Are you sure you want to delete the skill "${skillName}"?`)) {
      return;
    }

    // The skillPath is the path to SKILL.md, we need to get the parent directory
    // e.g., /skills/system/my-skill/SKILL.md -> /skills/system/my-skill/
    let directoryPath = skillPath;

    // Remove SKILL.md if present
    if (directoryPath.endsWith('/SKILL.md')) {
      directoryPath = directoryPath.slice(0, -9); // Remove '/SKILL.md'
    } else if (directoryPath.endsWith('SKILL.md')) {
      directoryPath = directoryPath.slice(0, -8); // Remove 'SKILL.md'
    }

    // Ensure path ends with / for directory deletion
    if (!directoryPath.endsWith('/')) {
      directoryPath += '/';
    }

    try {
      await deleteMutation.mutateAsync({ skillPath: directoryPath });
      toast.success(`Skill "${skillName}" deleted successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to delete skill';
      toast.error(`Failed to delete skill: ${errorMsg}`);
    }
  };

  const handleExport = async (skillName: string) => {
    try {
      const result = await exportMutation.mutateAsync({
        skillName,
        format: 'generic',
        includeDependencies: false,
      });

      // Convert base64 to blob and download
      const binaryString = atob(result.zip_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);

      // Create download link and click it
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || `${skillName}.skill`; // Use filename from API (e.g., "skill-name.skill")
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Skill "${skillName}" exported successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to export skill';
      toast.error(errorMsg);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to files">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <BookOpen className="h-8 w-8" />
            <h1 className="text-2xl font-bold">Skills</h1>
          </div>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Skill
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Introduction */}
          <div className="mb-6">
            <p className="text-muted-foreground">
              Manage and upload skills for your Nexus instance. Skills can be personal or system-wide.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="mb-6 flex items-center gap-2">
            <Button
              variant={selectedTier === undefined ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTier(undefined)}
            >
              All Skills
            </Button>
            <Button
              variant={selectedTier === 'personal' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTier('personal')}
            >
              Personal
            </Button>
            <Button
              variant={selectedTier === 'system' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTier('system')}
            >
              System
            </Button>
          </div>

          {/* Skills List */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64">
              <p className="text-sm text-red-600">Failed to load skills</p>
              <p className="text-xs text-muted-foreground mt-2">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : !skillsData || skillsData.skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <FolderOpen className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No skills found</h3>
              <p className="text-sm text-muted-foreground mt-2 mb-4">
                Upload your first skill to get started
              </p>
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Upload Skill
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skillsData.skills.map((skill) => (
                <div
                  key={skill.file_path || skill.name}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{skill.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {skill.tier ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-muted">
                            {skill.tier}
                          </span>
                        ) : null}
                        {skill.version && (
                          <span className="ml-2">v{skill.version}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {skill.description}
                  </p>

                  {skill.author && (
                    <p className="text-xs text-muted-foreground mb-3">
                      By {skill.author}
                    </p>
                  )}

                  {skill.requires && skill.requires.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-1">Dependencies:</p>
                      <div className="flex flex-wrap gap-1">
                        {skill.requires.map((dep) => (
                          <span
                            key={dep}
                            className="text-xs px-2 py-0.5 rounded bg-muted"
                          >
                            {dep}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    {skill.file_path && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingSkill({ name: skill.name, path: skill.file_path! })}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExport(skill.name)}
                      disabled={exportMutation.isPending}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Export
                    </Button>
                    {skill.file_path && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(skill.file_path!, skill.name)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Upload Dialog */}
      <SkillUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editingSkill} onOpenChange={(open) => !open && setEditingSkill(null)}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[96vh]">
          <DialogHeader>
            <DialogTitle>Edit Skill: {editingSkill?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {isLoadingContent ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : skillContent ? (
              <SkillEditor
                initialContent={skillContent}
                onSave={async (content) => {
                  await saveMutation.mutateAsync(content);
                }}
                readOnly={false}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Failed to load skill content
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
