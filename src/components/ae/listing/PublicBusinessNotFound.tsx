import '@/components/ae/shared/ProviderCatalogueComposition.css'
import { Link, type NotFoundRouteProps } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'
import arcButtonStyles from '@/components/arc/button/button.module.css'
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
          <div className="arc-provider-actions">
            <Link to="/for-providers" className={cn(arcButtonStyles.button, arcButtonStyles.primary, arcButtonStyles.md)}>Add Tool</Link>
            <Link to="/market" className={cn(arcButtonStyles.button, arcButtonStyles.secondary, arcButtonStyles.md)}>Browse Tools</Link>
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
        <div className="arc-provider-actions">
          <Link to="/market" className={cn(arcButtonStyles.button, arcButtonStyles.primary, arcButtonStyles.md)}>Browse Tools</Link>
          <Link to="/for-providers" className={cn(arcButtonStyles.button, arcButtonStyles.secondary, arcButtonStyles.md)}>Add Tool</Link>
        </div>
      }
    />
  )
}
