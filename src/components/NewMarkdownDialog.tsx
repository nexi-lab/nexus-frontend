import { FileText, X } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useUploadFile } from '../hooks/useFiles';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Input } from './ui/input';

interface NewMarkdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
}

export function NewMarkdownDialog({ open, onOpenChange, currentPath }: NewMarkdownDialogProps) {
  const [fileName, setFileName] = useState('');
  const [content, setContent] = useState('# New Document\n\nStart writing your markdown here...');
  const uploadMutation = useUploadFile();

  const handleSave = async () => {
    if (!fileName.trim()) {
      alert('Please enter a file name');
      return;
    }

    // Ensure .md extension
    const finalFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const filePath = `${currentPath}/${finalFileName}`.replace(/\/+/g, '/');

    try {
      // Convert string to ArrayBuffer
      const encoder = new TextEncoder();
      const arrayBuffer = encoder.encode(content).buffer;

      await uploadMutation.mutateAsync({
        path: filePath,
        content: arrayBuffer,
      });

      // Reset and close
      setFileName('');
      setContent('# New Document\n\nStart writing your markdown here...');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create markdown file:', error);
      alert(`Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCancel = () => {
    setFileName('');
    setContent('# New Document\n\nStart writing your markdown here...');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[80vh] p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h2 className="text-lg font-semibold">New Markdown File</h2>
          </div>
          <button onClick={handleCancel} className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* File Name Input */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">File name:</label>
            <Input type="text" placeholder="document.md" value={fileName} onChange={(e) => setFileName(e.target.value)} className="flex-1" />
            {!fileName.endsWith('.md') && fileName && <span className="text-sm text-muted-foreground">.md</span>}
          </div>
        </div>

        {/* Split Pane: Editor and Preview */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Markdown Editor */}
          <div className="flex-1 flex flex-col border-r">
            <div className="p-2 border-b bg-muted/30">
              <h3 className="text-sm font-medium">Markdown Editor</h3>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 p-4 font-mono text-sm resize-none focus:outline-none bg-background"
              placeholder="Write your markdown here..."
            />
          </div>

          {/* Right: Live Preview */}
          <div className="flex-1 flex flex-col">
            <div className="p-2 border-b bg-muted/30">
              <h3 className="text-sm font-medium">Preview</h3>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-muted/10">
              <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t">
          <p className="text-sm text-muted-foreground">
            Path: {currentPath}/{fileName || 'untitled'}
            {!fileName.endsWith('.md') && fileName ? '.md' : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!fileName.trim() || uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Creating...' : 'Create File'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
