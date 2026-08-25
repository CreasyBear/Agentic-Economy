'use client'

import { ArrowRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

type AeOwnerStatusEmptyStateProps = {
  kind: 'not_found' | 'unavailable'
}

export function AeOwnerStatusEmptyState({ kind }: AeOwnerStatusEmptyStateProps) {
  const isNotFound = kind === 'not_found'

  return (
    <Empty className="border border-border bg-card p-5">
      <EmptyHeader>
        <EmptyTitle>{isNotFound ? 'No supplier profile yet' : 'Status unavailable'}</EmptyTitle>
        <EmptyDescription>
          {isNotFound
            ? 'Set up your supplier profile to publish Operations agents can inspect.'
            : 'Try again in a moment. If this keeps happening, contact support through corrections.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-3">
          {isNotFound ? (
            <Button asChild variant="default">
              <a href="/for-providers"><ArrowRightIcon aria-hidden="true" />Review supplier setup</a>
            </Button>
          ) : (
            <Button asChild variant="secondary">
              <a href="/owner/status">Try again</a>
            </Button>
          )}
        </div>
      </EmptyContent>
    </Empty>
  )
}
