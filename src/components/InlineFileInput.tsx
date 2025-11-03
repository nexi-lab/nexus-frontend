import { FileText, Folder } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface InlineFileInputProps {
  type: 'file' | 'folder';
  level: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function InlineFileInput({ type, level, onConfirm, onCancel }: InlineFileInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the input when it appears
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (value.trim()) {
        onConfirm(value.trim());
      } else {
        onCancel();
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    // If user clicks away, treat it as cancel if empty, otherwise confirm
    if (value.trim()) {
      onConfirm(value.trim());
    } else {
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 text-sm bg-accent/50" style={{ paddingLeft: `${level * 12 + 8}px` }}>
      <span className="w-4" />
      {type === 'folder' ? <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" /> : <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="flex-1 bg-transparent border-b border-primary focus:outline-none text-sm"
        placeholder={type === 'folder' ? 'folder name' : 'file name'}
      />
    </div>
  );
}
