import { Link } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/shared/arc/empty-state/AeEmptyState'
import { Button } from '@/components/arc/button/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { OWNER_OFFERINGS_COPY, type OwnerOfferingsProjectionGateProps } from '../owner-offerings.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './OwnerInventoryComposition.css'

export function OwnerOfferingsProjectionGate({
  projectionState,
  onRetryProjection,
}: OwnerOfferingsProjectionGateProps) {
  if (projectionState === 'current') return null

  return (
    <Alert className="arc-market arc-owner-inventory-gate">
      <AlertTitle>Your public page is still updating</AlertTitle>
      <AlertDescription>
        <p>Your changes are saved. People still see the last safe page until this update finishes.</p>
        {onRetryProjection === undefined ? null : (
          <Button type="button" variant="secondary" size="md" onClick={onRetryProjection}>
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
      title="Add your first Tool"
      description={OWNER_OFFERINGS_COPY.emptyDescription}
      action={
        <Link
          to="/owner/operations/new"
          className={`arc-market ${actionLinkClassName('secondary', 'md')} arc-owner-inventory-empty-action`}
        >
          {OWNER_OFFERINGS_COPY.emptyAction}
        </Link>
      }
    />
  )
}
