import '@/components/ae/shared/ProviderCatalogueComposition.css'
import { Link, useLocation } from '@tanstack/react-router'
import arcButtonStyles from '@/components/arc/button/button.module.css'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/arc/skeleton/skeleton'

import { AeProviderListingPage } from '@/components/ae/listing/AeProviderListingPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'

import type { AePublicBusinessProps } from './public-business.contracts'

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
          <a href={pathname} className={cn(arcButtonStyles.button, arcButtonStyles.primary, arcButtonStyles.md, 'min-h-touch')}>Try again</a>
          <Link to="/market" className={cn(arcButtonStyles.button, arcButtonStyles.secondary, arcButtonStyles.md, 'min-h-touch')}>Browse Tools</Link>
        </div>
      }
    />
  )
}

export function ProviderListingPending() {
  return (
    <AePublicPage>
      <article className="ae-rail arc-provider-catalogue" aria-busy="true" aria-label="Loading provider">
        <p role="status" aria-label="Loading provider" className="sr-only">Loading provider catalogue…</p>
        <div aria-hidden="true" className="arc-provider-loading">
          <div className="h-11 w-36 max-w-full"><Skeleton lines={2} /></div>
          <header className="arc-provider-identity">
            <div className="arc-provider-loading"><div className="h-10 w-72 max-w-full overflow-hidden"><Skeleton lines={2} /></div><div className="h-5 w-full"><Skeleton lines={1} /></div></div>
            <div className="arc-provider-loading"><div className="h-5 w-40 max-w-full"><Skeleton lines={1} /></div><div className="h-11 w-full"><Skeleton lines={2} /></div></div>
          </header>
          <div className="arc-provider-layout">
            <div className="arc-provider-gallery">
              {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-64 w-full"><div className="arc-provider-card"><Skeleton lines={6} /></div></div>)}
            </div>
            <div className="arc-provider-aside h-72 w-full"><Skeleton lines={6} /></div>
          </div>
        </div>
      </article>
    </AePublicPage>
  )
}

export function ProviderListingError() {
  const { pathname } = useLocation()

  return (
    <AePageState
      tone="danger"
      title="This provider didn’t load"
      description="Try again, or return to the catalogue."
      action={
        <div className="arc-provider-actions">
          <a href={pathname} className={cn(arcButtonStyles.button, arcButtonStyles.primary, arcButtonStyles.md, 'min-h-touch')}>Try again</a>
          <Link to="/market" className={cn(arcButtonStyles.button, arcButtonStyles.secondary, arcButtonStyles.md, 'min-h-touch')}>Browse Tools</Link>
        </div>
      }
    />
  )
}
