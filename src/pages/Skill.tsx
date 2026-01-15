import { useState } from 'react';
import { ArrowLeft, BookOpen, Download, Edit, FolderOpen, Globe, Loader2, Plus, Share2, Star, Trash2, Upload, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDiscoverSkills, useDeleteSkill, useExportSkill, useSubscribeSkill, useUnsubscribeSkill } from '../hooks/useSkills';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { SkillUploadDialog } from '../components/SkillUploadDialog';
import { SkillEditor } from '../components/SkillEditor';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n/useTranslation';

// Tab type for the four main views
type SkillTab = 'subscribed' | 'myskills' | 'shared' | 'marketplace';

interface EditingSkill {
  name: string;
  path: string;
}

export function Skill() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { apiClient } = useAuth();
  const { t } = useTranslation();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<EditingSkill | null>(null);
  const [selectedTab, setSelectedTab] = useState<SkillTab>('subscribed');

  // Pagination state for each tab
  const [subscribedOffset, setSubscribedOffset] = useState(0);
  const [ownedOffset, setOwnedOffset] = useState(0);
  const [sharedOffset, setSharedOffset] = useState(0);
  const [publicOffset, setPublicOffset] = useState(0);
  const limit = 21; // Page size (matches backend default)

  // Fetch skills for each tab with pagination
  const { data: subscribedData, isLoading: isLoadingSubscribed, error: subscribedError } = useDiscoverSkills('subscribed', subscribedOffset, limit);
  const { data: ownedData, isLoading: isLoadingOwned, error: ownedError } = useDiscoverSkills('owned', ownedOffset, limit);
  const { data: sharedData, isLoading: isLoadingShared, error: sharedError } = useDiscoverSkills('shared', sharedOffset, limit);
  const { data: publicData, isLoading: isLoadingPublic, error: publicError } = useDiscoverSkills('public', publicOffset, limit);

  const deleteMutation = useDeleteSkill();
  const exportMutation = useExportSkill();
  const subscribeMutation = useSubscribeSkill();
  const unsubscribeMutation = useUnsubscribeSkill();

  // Skills for each tab
  const subscribedSkills = subscribedData?.skills || [];
  const mySkills = ownedData?.skills || [];
  const sharedSkills = sharedData?.skills || [];
  const marketplaceSkills = publicData?.skills || [];

  // Track owned skill paths for edit/delete button visibility
  const ownedPaths = new Set(ownedData?.skills?.map(s => s.path) || []);

  // Current skills based on selected tab
  const currentSkills = (() => {
    switch (selectedTab) {
      case 'subscribed': return subscribedSkills;
      case 'myskills': return mySkills;
      case 'shared': return sharedSkills;
      case 'marketplace': return marketplaceSkills;
    }
  })();

  const isLoading = (() => {
    switch (selectedTab) {
      case 'subscribed': return isLoadingSubscribed;
      case 'myskills': return isLoadingOwned;
      case 'shared': return isLoadingShared;
      case 'marketplace': return isLoadingPublic;
    }
  })();

  const error = (() => {
    switch (selectedTab) {
      case 'subscribed': return subscribedError;
      case 'myskills': return ownedError;
      case 'shared': return sharedError;
      case 'marketplace': return publicError;
    }
  })();

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
      toast.success(t('skill.saved'));
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
      toast.error(`${t('skill.saveFailed')}: ${error.message || 'Unknown error'}`);
    },
  });

  const handleDelete = async (skillPath: string, skillName: string) => {
    if (!confirm(t('skill.deleteConfirm').replace('{name}', skillName))) {
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
      toast.success(t('skill.deleted').replace('{name}', skillName));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('skill.deleteFailed');
      toast.error(`${t('skill.deleteFailed')}: ${errorMsg}`);
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

      toast.success(t('skill.exported').replace('{name}', skillName));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('skill.exportFailed');
      toast.error(errorMsg);
    }
  };

  const handleSubscribe = async (skillPath: string, skillName: string) => {
    try {
      await subscribeMutation.mutateAsync({ skillPath });
      toast.success(`Subscribed to ${skillName}`);
    } catch (error) {
      toast.error(`Failed to subscribe: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleUnsubscribe = async (skillPath: string, skillName: string) => {
    try {
      await unsubscribeMutation.mutateAsync({ skillPath });
      toast.success(`Unsubscribed from ${skillName}`);
    } catch (error) {
      toast.error(`Failed to unsubscribe: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/files')} aria-label="Back to files">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <BookOpen className="h-8 w-8" />
            <h1 className="text-2xl font-bold">{t('skill.title')}</h1>
          </div>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {t('skill.upload')}
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Introduction */}
          <div className="mb-6">
            <p className="text-muted-foreground">
              {t('skill.description')}
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="mb-6 flex items-center gap-2 flex-wrap">
            <Button
              variant={selectedTab === 'subscribed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTab('subscribed')}
            >
              <Star className="h-3 w-3 mr-1" />
              Subscribed
              {subscribedSkills.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-primary-foreground/20">
                  {subscribedSkills.length}
                </span>
              )}
            </Button>
            <Button
              variant={selectedTab === 'myskills' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTab('myskills')}
            >
              <User className="h-3 w-3 mr-1" />
              My Skills
              {mySkills.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-primary-foreground/20">
                  {mySkills.length}
                </span>
              )}
            </Button>
            <Button
              variant={selectedTab === 'shared' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTab('shared')}
            >
              <Share2 className="h-3 w-3 mr-1" />
              Shared Skills
              {sharedSkills.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-primary-foreground/20">
                  {sharedSkills.length}
                </span>
              )}
            </Button>
            <Button
              variant={selectedTab === 'marketplace' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTab('marketplace')}
            >
              <Globe className="h-3 w-3 mr-1" />
              Skill Marketplace
              {marketplaceSkills.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-muted">
                  {marketplaceSkills.length}
                </span>
              )}
            </Button>
          </div>

          {/* Skills List */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64">
              <p className="text-sm text-red-600">{t('skill.loadFailed')}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : currentSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <FolderOpen className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">
                {selectedTab === 'subscribed' && 'No subscribed skills'}
                {selectedTab === 'myskills' && 'No skills yet'}
                {selectedTab === 'shared' && 'No shared skills'}
                {selectedTab === 'marketplace' && 'No skills in marketplace'}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 mb-4">
                {selectedTab === 'subscribed' && 'Subscribe to skills from the marketplace'}
                {selectedTab === 'myskills' && 'Upload a skill to get started'}
                {selectedTab === 'shared' && 'No skills have been shared with you yet'}
                {selectedTab === 'marketplace' && 'No public skills available at the moment'}
              </p>
              {(selectedTab === 'subscribed' || selectedTab === 'shared') && (
                <Button variant="outline" onClick={() => setSelectedTab('marketplace')}>
                  <Globe className="h-4 w-4 mr-2" />
                  Browse Marketplace
                </Button>
              )}
              {selectedTab === 'myskills' && (
                <div className="flex gap-2">
                  <Button onClick={() => setUploadDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('skill.upload')}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedTab('marketplace')}>
                    <Globe className="h-4 w-4 mr-2" />
                    Browse Marketplace
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentSkills.map((skill) => (
                <div
                  key={skill.path || skill.name}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{skill.name}</h3>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {skill.is_public && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            <Globe className="h-3 w-3 mr-1" />
                            Public
                          </span>
                        )}
                        {skill.is_subscribed && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                            <Star className="h-3 w-3 mr-1" />
                            Subscribed
                          </span>
                        )}
                        {skill.version && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-muted">
                            v{skill.version}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {skill.description}
                  </p>

                  {skill.owner && (
                    <p className="text-xs text-muted-foreground mb-3">
                      {t('skill.by')} {skill.owner}
                    </p>
                  )}

                  {skill.tags && skill.tags.length > 0 && (
                    <div className="mb-3">
                      <div className="flex flex-wrap gap-1">
                        {skill.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 rounded bg-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {/* Subscribe/Subscribed toggle button */}
                    {skill.is_subscribed ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleUnsubscribe(skill.path, skill.name)}
                        disabled={unsubscribeMutation.isPending}
                      >
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Subscribed
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSubscribe(skill.path, skill.name)}
                        disabled={subscribeMutation.isPending}
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Subscribe
                      </Button>
                    )}
                    {/* Edit button - only for owned skills */}
                    {skill.path && ownedPaths.has(skill.path) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingSkill({ name: skill.name, path: `${skill.path}SKILL.md` })}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        {t('common.edit')}
                      </Button>
                    )}
                    {/* Export button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExport(skill.name)}
                      disabled={exportMutation.isPending}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {t('common.export') || 'Export'}
                    </Button>
                    {/* Delete button - only for owned skills */}
                    {skill.path && ownedPaths.has(skill.path) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(skill.path, skill.name)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {t('common.delete')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoading && !error && currentSkills.length > 0 && (() => {
            const currentData = (() => {
              switch (selectedTab) {
                case 'subscribed': return subscribedData;
                case 'myskills': return ownedData;
                case 'shared': return sharedData;
                case 'marketplace': return publicData;
              }
            })();

            const currentOffset = (() => {
              switch (selectedTab) {
                case 'subscribed': return subscribedOffset;
                case 'myskills': return ownedOffset;
                case 'shared': return sharedOffset;
                case 'marketplace': return publicOffset;
              }
            })();

            const setCurrentOffset = (() => {
              switch (selectedTab) {
                case 'subscribed': return setSubscribedOffset;
                case 'myskills': return setOwnedOffset;
                case 'shared': return setSharedOffset;
                case 'marketplace': return setPublicOffset;
              }
            })();

            if (!currentData) return null;

            const totalCount = currentData.total_count;
            const hasMore = currentData.has_more;
            const currentPage = Math.floor(currentOffset / limit) + 1;
            const totalPages = Math.ceil(totalCount / limit);

            return (
              <div className="mt-6 flex items-center justify-between border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {currentOffset + 1} to {Math.min(currentOffset + limit, totalCount)} of {totalCount} skills
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentOffset(Math.max(0, currentOffset - limit))}
                    disabled={currentOffset === 0}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-3 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentOffset(currentOffset + limit)}
                    disabled={!hasMore}
                  >
                    Next
                  </Button>
                </div>
              </div>
            );
          })()}
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
            <DialogTitle>{t('skill.edit')}: {editingSkill?.name}</DialogTitle>
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
                {t('skill.loadContentFailed')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
