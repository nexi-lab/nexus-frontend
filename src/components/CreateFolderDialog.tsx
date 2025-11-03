import { useState } from 'react';
import { useCreateDirectory } from '../hooks/useFiles';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
}

export function CreateFolderDialog({ open, onOpenChange, currentPath }: CreateFolderDialogProps) {
  const [folderName, setFolderName] = useState('');
  const createMutation = useCreateDirectory();

  const handleCreate = async () => {
    if (!folderName.trim()) return;

    const newPath = `${currentPath}/${folderName}`.replace('//', '/');

    try {
      await createMutation.mutateAsync({ path: newPath });
      setFolderName('');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Folder Name</label>
            <Input
              placeholder="Enter folder name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <p className="text-sm text-muted-foreground">Location: {currentPath}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!folderName.trim() || createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
