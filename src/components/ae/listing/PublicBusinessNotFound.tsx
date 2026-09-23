import { Link, type NotFoundRouteProps } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import type { PublicBusinessPageNotFoundReason } from '@/modules/catalog/public'

export function PublicBusinessNotFound({ data }: NotFoundRouteProps) {
  const reason: PublicBusinessPageNotFoundReason =
    typeof data === 'object' && data !== null && 'reason' in data && data.reason === 'not_public'
      ? 'not_public'
      : 'no_such_business'

  if (reason === 'not_public') {
    return (
      <AePageState
        title="Provider profile unavailable"
        description="This provider is not published in the catalogue right now."
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/for-providers" className={cn(buttonVariants({ variant: 'default' }), 'min-h-touch')}>Publish a Tool</Link>
            <Link to="/market" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>Back to catalog</Link>
          </div>
        }
      />
    )
  }

  return (
    <AePageState
      title="No provider at this address"
      description="Nothing is published here. Check the address, or browse the catalogue."
      action={
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/market" className={cn(buttonVariants({ variant: 'default' }), 'min-h-touch')}>Browse catalog</Link>
          <Link to="/for-providers" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>Publish a Tool</Link>
        </div>
      }
    />
  )
}
