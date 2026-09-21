import { Link } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import type { OwnerOfferingsProjectionGateProps } from '../owner-offerings.contracts'

export function OwnerOfferingsProjectionGate({
  projectionState,
  onRetryProjection,
}: OwnerOfferingsProjectionGateProps) {
  if (projectionState === 'current') return null

  return (
    <Alert>
      <AlertTitle>Your public page is still updating</AlertTitle>
      <AlertDescription>
        <p>Your changes are saved. People still see the last safe page until this update finishes.</p>
        {onRetryProjection === undefined ? null : (
          <Button type="button" variant="secondary" className="min-h-touch" onClick={onRetryProjection}>
            Refresh public status
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function OwnerOfferingsEmptyState() {
  return (
    <AeEmptyState
      title="No Tools yet"
      description="Connect a source and choose the exact Tool AE should validate."
      action={
        <Link
          to="/owner/operations/new"
          className={cn(buttonVariants(), 'min-h-touch')}
        >
          Add Tool
        </Link>
      }
    />
  )
}
