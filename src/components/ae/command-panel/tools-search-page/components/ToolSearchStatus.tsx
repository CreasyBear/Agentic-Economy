'use client'

import { Link } from '@tanstack/react-router'

import { Button } from '@/components/arc/button/button'
import '../../CommandPanelComposition.css'

import type { MarketToolSearchStatus, SearchRecoveryProps, ToolSearchNextPage } from '../tools-search-page.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

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
      <p className="arc-market arc-command-status">
        {recentCount > 0
          ? `Recently inspected · ${recentCount}`
          : 'Search the Tool catalog by job, provider, or capability.'}
      </p>
    )
  }
  if (status.kind === 'debouncing' || status.kind === 'loading') {
    return (
      <p className="arc-market arc-command-status">
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
    <div className="arc-market arc-command-recovery">
      <p role={isError ? 'alert' : undefined} >{message}</p>
      <div className="arc-command-recovery-actions">
        <Button type="button" size="md"
          onClick={nextPage === undefined ? onRetry : () => onContinue(nextPage)}>
          {nextPage === undefined ? 'Try again' : 'Next page'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onClear}

        >
          Clear search
        </Button>
        <Link
          to="/market"
          className={actionLinkClassName('secondary', 'md')}
        >
          Browse current Tools
        </Link>
      </div>
    </div>
  )
}
