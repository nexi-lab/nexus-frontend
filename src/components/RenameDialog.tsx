import { useEffect, useState } from 'react';
import { useRenameFile } from '../hooks/useFiles';
import type { FileInfo } from '../types/file';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileInfo | null;
}

export function RenameDialog({ open, onOpenChange, file }: RenameDialogProps) {
  const [newName, setNewName] = useState('');
  const renameMutation = useRenameFile();

  useEffect(() => {
    if (file) {
      setNewName(file.name);
    }
  }, [file]);

  const handleRename = async () => {
    if (!file || !newName.trim() || newName === file.name) return;

    const parentPath = file.path.substring(0, file.path.lastIndexOf('/')) || '/';
    const newPath = `${parentPath}/${newName}`.replace('//', '/');

    try {
      await renameMutation.mutateAsync({ oldPath: file.path, newPath });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to rename:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {file?.isDirectory ? 'Folder' : 'File'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">New Name</label>
            <Input
              placeholder="Enter new name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleRename()}
            />
          </div>
          <p className="text-sm text-muted-foreground">Current: {file?.name}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={!newName.trim() || newName === file?.name || renameMutation.isPending}>
            {renameMutation.isPending ? 'Renaming...' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
