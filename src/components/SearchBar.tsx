import { FileText, Folder, Search, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchFiles } from '../hooks/useFiles';
import type { FileInfo, GrepMatch } from '../types/file';
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
  const [searchResults, setSearchResults] = useState<FileInfo[] | null>(null);
  const searchMutation = useSearchFiles();

  const handleSearch = async () => {
    if (!query.trim()) {
      // Clear search if query is empty
      setSearchResults(null);
      return;
    }

    try {
      const results = await searchMutation.mutateAsync({
        query,
        searchType,
        path: currentPath,
      });

      // Transform results to FileInfo[] format
      if (searchType === 'glob') {
        // Glob returns string[] - transform to FileInfo[]
        const fileInfoResults = (results as string[]).map((path: string) => ({
          path,
          name: path.split('/').filter(Boolean).pop() || path,
          isDirectory: false,
          size: undefined,
          type: undefined,
        }));
        setSearchResults(fileInfoResults);
      } else {
        // Grep returns GrepMatch[] - transform to FileInfo[] with unique files
        const grepResults = results as GrepMatch[];
        const uniqueFiles = new Map<string, GrepMatch[]>();

        // Group matches by file
        grepResults.forEach((match) => {
          if (!uniqueFiles.has(match.file)) {
            uniqueFiles.set(match.file, []);
          }
          uniqueFiles.get(match.file)!.push(match);
        });

        // Convert to FileInfo[] with match information
        const fileInfoResults = Array.from(uniqueFiles.entries()).map(([path, matches]) => ({
          path,
          name: path.split('/').filter(Boolean).pop() || path,
          isDirectory: false,
          size: undefined,
          type: undefined,
          // Store match count or matches for display
          matchCount: matches.length,
        }));

        setSearchResults(fileInfoResults);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

    // Auto-clear search when input becomes empty
    if (!newQuery.trim()) {
      setSearchResults(null);
    }
  };

  const handleClearClick = () => {
    setQuery('');
    setSearchResults(null);
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
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchType === 'glob' ? 'Search files (e.g., *.txt)' : 'Search contents...'}
            value={query}
            onChange={handleQueryChange}
            onKeyPress={handleKeyPress}
            className="pl-10 pr-10 text-sm"
          />
          {query && (
            <button onClick={handleClearClick} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-1">
          <button
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
              searchType === 'glob' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            }`}
            onClick={() => setSearchType('glob')}
          >
            Name
          </button>
          <button
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
              searchType === 'grep' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            }`}
            onClick={() => setSearchType('grep')}
          >
            Content
          </button>
        </div>

        <Button onClick={handleSearch} disabled={searchMutation.isPending} className="w-full" size="sm">
          {searchMutation.isPending ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {/* Search Results */}
      {searchResults !== null && (
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
    </div>
  );
}
