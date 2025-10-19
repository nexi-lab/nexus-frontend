import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { useSearchFiles } from '../hooks/useFiles'

interface SearchBarProps {
  currentPath: string
  onResultsFound: (results: any[]) => void
}

export function SearchBar({ currentPath, onResultsFound }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<'glob' | 'grep'>('glob')
  const searchMutation = useSearchFiles()

  const handleSearch = async () => {
    if (!query.trim()) return

    try {
      const results = await searchMutation.mutateAsync({
        query,
        searchType,
        path: currentPath,
      })
      onResultsFound(results)
    } catch (error) {
      console.error('Search failed:', error)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={
            searchType === 'glob'
              ? 'Search files by name (e.g., *.txt)'
              : 'Search file contents...'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          className="pl-10"
        />
      </div>
      <div className="flex border rounded-md">
        <button
          className={`px-3 py-2 text-sm transition-colors ${
            searchType === 'glob'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          }`}
          onClick={() => setSearchType('glob')}
        >
          Name
        </button>
        <button
          className={`px-3 py-2 text-sm transition-colors ${
            searchType === 'grep'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          }`}
          onClick={() => setSearchType('grep')}
        >
          Content
        </button>
      </div>
      <Button onClick={handleSearch} disabled={searchMutation.isPending}>
        {searchMutation.isPending ? 'Searching...' : 'Search'}
      </Button>
    </div>
  )
}
