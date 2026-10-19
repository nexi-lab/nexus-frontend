import { FileText, Folder, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchFiles } from '../hooks/useFiles';
import type { FileInfo } from '../types/file';
import { type ContextMenuAction, FileContextMenu } from './FileContextMenu';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface SearchBarProps {
  currentPath: string;
  onFileSelect: (file: FileInfo) => void;
  onContextMenuAction?: (action: ContextMenuAction, file: FileInfo) => void;
}

export function SearchBar({ currentPath, onFileSelect, onContextMenuAction }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'glob' | 'grep'>('glob');
  const searchMutation = useSearchFiles();
  const { data: result, reset } = searchMutation;
  useEffect(() => reset(), [currentPath, reset]);
  const paths = result && ('paths' in result ? result.paths : [...new Set(result.matches.map((match) => match.path))]);
  const counts = new Map<string, number>();
  if (result && 'matches' in result) {
    for (const match of result.matches) counts.set(match.path, (counts.get(match.path) ?? 0) + 1);
  }
  const searchResults = paths?.map((path) => ({
    path,
    name: path.split('/').filter(Boolean).pop() || path,
    isDirectory: false,
    matchCount: counts.get(path),
  }));

  const handleSearch = () => {
    if (!query.trim()) {
      reset();
      return;
    }
    searchMutation.mutate({ query, searchType, path: currentPath });
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    reset();
  };

  const handleClearClick = () => {
    setQuery('');
    reset();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleResultClick = (file: FileInfo) => {
    onFileSelect(file);
  };

  return (
    <search aria-label="File search" className="flex flex-col h-full">
      {/* Search Input */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            aria-label="Search files"
            placeholder={searchType === 'glob' ? 'Search files (e.g., *.txt)' : 'Search contents...'}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyPress}
            className="pl-10 pr-10 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={handleClearClick}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
              searchType === 'glob' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            }`}
            aria-pressed={searchType === 'glob'}
            onClick={() => {
              setSearchType('glob');
              reset();
            }}
          >
            Name
          </button>
          <button
            type="button"
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
              searchType === 'grep' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            }`}
            aria-pressed={searchType === 'grep'}
            onClick={() => {
              setSearchType('grep');
              reset();
            }}
          >
            Content
          </button>
        </div>

        <Button onClick={handleSearch} disabled={searchMutation.isPending} className="w-full" size="sm">
          {searchMutation.isPending ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {searchMutation.isError && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {searchMutation.error.message}
        </p>
      )}
      {result?.truncated && (
        <output className="block p-3 text-sm text-muted-foreground">More results are available. Refine your query or search a smaller folder.</output>
      )}

      {/* Search Results */}
      {searchResults && (
        <div className="flex-1 overflow-auto">
          <div className="p-2 border-b bg-muted/50">
            <p className="text-xs text-muted-foreground">{searchResults.length} result(s) found</p>
          </div>
          <div className="p-1">
            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No results found</div>
            ) : (
              searchResults.map((file) => (
                <FileContextMenu key={file.path} file={file} onAction={(action, file) => onContextMenuAction?.(action, file)}>
                  <div
                    className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer transition-colors text-sm"
                    onClick={() => handleResultClick(file)}
                  >
                    {file.isDirectory ? (
                      <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm">{file.name}</p>
                      <p className="truncate text-xs text-muted-foreground font-mono">{file.path}</p>
                      {'matchCount' in file && typeof file.matchCount === 'number' && file.matchCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {file.matchCount} match{file.matchCount > 1 ? 'es' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </FileContextMenu>
              ))
            )}
          </div>
        </div>
      )}
    </search>
  );
}
