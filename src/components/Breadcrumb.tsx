import { ChevronRight, Home } from 'lucide-react'

interface BreadcrumbProps {
  path: string
  onPathChange: (path: string) => void
}

export function Breadcrumb({ path, onPathChange }: BreadcrumbProps) {
  const parts = path === '/' ? [] : path.split('/').filter(Boolean)

  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
        onClick={() => onPathChange('/')}
      >
        <Home className="h-4 w-4" />
      </button>

      {parts.map((part, index) => {
        const fullPath = '/' + parts.slice(0, index + 1).join('/')
        const isLast = index === parts.length - 1

        return (
          <div key={fullPath} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4" />
            <button
              className={`hover:text-foreground transition-colors p-1 rounded hover:bg-muted ${
                isLast ? 'text-foreground font-medium' : ''
              }`}
              onClick={() => onPathChange(fullPath)}
            >
              {part}
            </button>
          </div>
        )
      })}
    </div>
  )
}
