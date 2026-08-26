import { Link, type NotFoundRouteProps } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'
import { Button } from '@/components/ui/button'
import type { PublicBusinessPageNotFoundReason } from '@/modules/catalog/public'

export function PublicBusinessNotFound({ data }: NotFoundRouteProps) {
  const reason: PublicBusinessPageNotFoundReason =
    typeof data === 'object' && data !== null && 'reason' in data && data.reason === 'not_public'
      ? 'not_public'
      : 'no_such_business'

  if (reason === 'not_public') {
    return (
      <AePageState
        title="Supplier profile unavailable"
        description="This supplier is not published in the catalogue right now."
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="default" className="min-h-11"><Link to="/for-providers">Publish an operation</Link></Button>
            <Button asChild variant="secondary" className="min-h-11"><Link to="/market" search={{ window: '30d' }} hash="operations">Back to catalog</Link></Button>
          </div>
        }
      />
    )
  }

  return (
    <AePageState
      title="No supplier at this address"
      description="Nothing is published here. Check the address, or browse the catalogue."
      action={
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="default" className="min-h-11"><Link to="/market" search={{ window: '30d' }} hash="operations">Browse catalog</Link></Button>
          <Button asChild variant="secondary" className="min-h-11"><Link to="/for-providers">Publish an Operation</Link></Button>
        </div>
      }
    />
  )
}
