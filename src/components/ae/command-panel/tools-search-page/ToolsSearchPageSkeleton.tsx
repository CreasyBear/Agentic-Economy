'use client'

import { SearchIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import '../CommandPanelComposition.css'

export function ToolsSearchPageSkeleton() {
  return <div className="arc-market arc-command-search" aria-busy="true">
    <div className="arc-command-loading-search-field" aria-hidden="true">
      <SearchIcon />
      <Skeleton className="arc-command-loading-query" />
    </div>
    <p role="status" aria-live="polite" className="arc-command-loading-label">
      <Spinner aria-hidden="true" role="presentation" />Loading Tools…
    </p>
    <div className="arc-command-loading-rows" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="arc-command-loading-row">
          <Skeleton className="arc-command-loading-icon" />
          <div className="arc-command-loading-copy">
            <Skeleton className="arc-command-loading-title" />
            <Skeleton className="arc-command-loading-description" />
          </div>
        </div>)}
    </div>
  </div>
}
