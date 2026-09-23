import { Button } from '@/components/ui/button'

import type { HomeDirectoryPaginationProps } from '../agent-access-home.contracts'

export function HomeDirectoryPagination({
  showIssueMessage,
  buttonLabel,
  loadingMore,
  onLoadMore,
}: HomeDirectoryPaginationProps) {
  return (
    <div className="grid w-fit gap-intra">
      {showIssueMessage ? (
        <p role="alert" className="text-sm text-muted-foreground">
          More Agents could not be loaded. The Agents already shown remain available.
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="w-fit"
        disabled={loadingMore}
        onClick={onLoadMore}
      >
        {buttonLabel}
      </Button>
    </div>
  )
}
