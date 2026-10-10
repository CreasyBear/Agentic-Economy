import '@/components/ae/shared/ProviderCatalogueComposition.css'
import { Link, useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

import { AeProviderListingPage } from '@/components/ae/listing/AeProviderListingPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'

export { ProviderListingPending } from './ProviderListingPending'

import type { AePublicBusinessProps } from './public-business.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export function AePublicBusiness({ routeData, backFrom, backThreadId }: AePublicBusinessProps) {
  if (routeData.kind === 'unavailable') {
    return <PublicBusinessUnavailable />
  }

  const { page, supply } = routeData
  const catalog = page.catalog
  const agentJsonUrl = `/api/businesses/${catalog.slug}`

  return (
    <AePublicPage>
      <AeProviderListingPage
        catalog={catalog}
        agentJsonUrl={agentJsonUrl}
        {...(routeData.service === undefined ? {} : { service: routeData.service })}
        {...(supply === undefined ? {} : { supply })}
        {...(backFrom === undefined ? {} : { backFrom })}
        {...(backThreadId === undefined ? {} : { backThreadId })}
      />
    </AePublicPage>
  )
}

function PublicBusinessUnavailable() {
  const { pathname } = useLocation()

  return (
    <AePageState
      tone="warning"
      title="Provider temporarily unavailable"
      description="The provider catalogue source is unavailable right now. Try again in a moment."
      action={
        <div className="arc-provider-actions">
          <a href={pathname} className={cn(actionLinkClassName('primary', 'md'), 'min-h-touch')}>Try again</a>
          <Link to="/market" className={cn(actionLinkClassName('secondary', 'md'), 'min-h-touch')}>Browse Tools</Link>
        </div>
      }
    />
  )
}

export function ProviderListingError() {
  const { pathname } = useLocation()

  return (
    <AePageState
      tone="danger"
      title="This provider didn’t load"
      description="This provider’s listings could not be read."
      action={
        <div className="arc-provider-actions">
          <a href={pathname} className={cn(actionLinkClassName('primary', 'md'), 'min-h-touch')}>Try again</a>
          <Link to="/market" className={cn(actionLinkClassName('secondary', 'md'), 'min-h-touch')}>Browse Tools</Link>
        </div>
      }
    />
  )
}
