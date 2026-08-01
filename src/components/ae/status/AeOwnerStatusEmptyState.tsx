'use client'

import { ArrowRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type AeOwnerStatusEmptyStateProps = {
  kind: 'not_found' | 'unavailable'
}

export function AeOwnerStatusEmptyState({ kind }: AeOwnerStatusEmptyStateProps) {
  const isNotFound = kind === 'not_found'

  return (
    <Card className="grid gap-5 p-5">
      <div className="grid gap-1.5">
        <h2 className="block text-lg font-semibold text-foreground">{isNotFound ? 'No service page yet' : 'Status unavailable'}</h2>
        <p className="block text-sm text-muted-foreground">
          {isNotFound
            ? 'Claim your business to publish a page customers and assistants can read.'
            : 'Try again in a moment. If this keeps happening, contact support through corrections.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {isNotFound ? (
          <>
            <Button asChild variant="default">
              <a href="/claim"><ArrowRightIcon aria-hidden="true" />List or claim your business</a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/registry?q=&limit=10">Browse published services</a>
            </Button>
          </>
        ) : (
          <Button asChild variant="secondary">
            <a href="/owner/status">Try again</a>
          </Button>
        )}
      </div>
    </Card>
  )
}
