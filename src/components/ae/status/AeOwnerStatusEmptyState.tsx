'use client'

import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type AeOwnerStatusEmptyStateProps = {
  kind: 'not_found' | 'unavailable'
}

export function AeOwnerStatusEmptyState({ kind }: AeOwnerStatusEmptyStateProps) {
  const isNotFound = kind === 'not_found'

  return (
    <Card className="ae-owner-status-empty">
      <CardHeader>
        <CardTitle>{isNotFound ? 'No service page yet' : 'Status unavailable'}</CardTitle>
        <CardDescription>
          {isNotFound
            ? 'Claim your business to publish a page customers and assistants can read.'
            : 'Try again in a moment. If this keeps happening, contact support through corrections.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {isNotFound ? (
          <>
            <Button asChild>
              <Link to="/claim">
                <ArrowRightIcon data-icon="inline-start" aria-hidden="true" />
                List or claim your business
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/registry" search={{ q: '', limit: 10 }}>
                Browse published services
              </Link>
            </Button>
          </>
        ) : (
          <Button asChild variant="outline">
            <Link to="/owner/status">Try again</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
