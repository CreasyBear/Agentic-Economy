import { Button } from '@/components/arc/button/button'

import type { HomeDirectoryPaginationProps } from '../agent-access-home.contracts'
import '../AgentHomeComposition.css'

export function HomeDirectoryPagination({
  showIssueMessage,
  buttonLabel,
  loadingMore,
  onLoadMore,
}: HomeDirectoryPaginationProps) {
  return (
    <div className="arc-market arc-agent-pagination">
      {showIssueMessage ? (
        <p role="alert" className="arc-agent-pagination-issue">
          More Agents could not be loaded. The Agents already shown remain available.
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="arc-agent-inline-action"
        disabled={loadingMore}
        onClick={onLoadMore}
      >
        {buttonLabel}
      </Button>
    </div>
  )
}
