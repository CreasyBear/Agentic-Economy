'use client'

import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import type { MarketToolSearchStatus, SearchRecoveryProps, ToolSearchNextPage } from '../tools-search-page.contracts'

export type ToolSearchStatusProps = Readonly<{
  status: MarketToolSearchStatus
  query: string
  recentCount: number
  onQueryChange: (query: string) => void
  onRetry: () => void
  onContinue: (nextPage: ToolSearchNextPage) => void
}>

export function ToolSearchStatus({
  status,
  query,
  recentCount,
  onQueryChange,
  onRetry,
  onContinue,
}: ToolSearchStatusProps) {
  if (status.kind === 'idle') {
    return (
      <p className="px-gutter py-section text-sm text-muted-foreground">
        {recentCount > 0
          ? `Recently inspected · ${recentCount}`
          : 'Search the Tool catalog by job, provider, or capability.'}
      </p>
    )
  }
  if (status.kind === 'debouncing' || status.kind === 'loading') {
    return (
      <p className="px-gutter py-section text-sm text-muted-foreground">
        Searching…
      </p>
    )
  }
  if (status.kind === 'error' && status.tone === 'alert') {
    return (
      <SearchRecovery
        message={status.message}
        onRetry={onRetry}
        onClear={() => onQueryChange('')}
        onContinue={onContinue}
        isError
      />
    )
  }
  if (status.kind === 'error' && status.tone === 'recovery' && status.query === query.trim()) {
    return (
      <SearchRecovery
        message={status.message}
        onRetry={onRetry}
        onClear={() => onQueryChange('')}
        onContinue={onContinue}
      />
    )
  }
  if (status.kind === 'empty' && status.query === query.trim()) {
    return (
      <SearchRecovery
        message={status.message}
        onRetry={onRetry}
        onClear={() => onQueryChange('')}
        onContinue={onContinue}
        {...(status.nextPage === undefined ? {} : { nextPage: status.nextPage })}
      />
    )
  }
  return null
}


function SearchRecovery({ message, onRetry, onClear, onContinue, nextPage, isError = false }: SearchRecoveryProps) {
  return (
    <div className="grid gap-intra px-gutter py-section">
      <p role={isError ? 'alert' : undefined} className="text-sm text-muted-foreground">{message}</p>
      <div className="flex flex-wrap gap-intra">
        <Button type="button" size="sm" className="min-h-touch"
          onClick={nextPage === undefined ? onRetry : () => onContinue(nextPage)}>
          {nextPage === undefined ? 'Try again' : 'Next page'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
          className="min-h-touch"
        >
          Clear search
        </Button>
        <Link
          to="/market"
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-touch')}
        >
          Browse current Tools
        </Link>
      </div>
    </div>
  )
}
