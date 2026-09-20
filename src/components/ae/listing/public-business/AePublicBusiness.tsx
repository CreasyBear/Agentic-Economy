import { Link, useLocation } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

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
      title="Supplier temporarily unavailable"
      description="The supplier catalogue source is unavailable right now. Try again in a moment."
      action={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a href={pathname} className={cn(buttonVariants(), 'min-h-touch')}>Try again</a>
          <Link to="/market" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>Back to catalog</Link>
        </div>
      }
    />
  )
}

export function ProviderListingPending() {
  return (
    <AePublicPage>
      <article className="ae-rail grid gap-6 py-section" aria-busy="true" aria-label="Loading supplier">
        <Skeleton className="h-11 w-36" />
        <header className="grid gap-4 border-b border-border pb-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}
          </div>
        </header>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="overflow-hidden rounded-card border border-border bg-card">
            <Skeleton className="h-16 w-full rounded-none" />
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-32 w-full rounded-none border-t border-border" />)}
          </div>
          <Skeleton className="h-72 w-full" />
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
      title="This supplier didn’t load"
      description="Try again, or return to the catalogue."
      action={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a href={pathname} className={cn(buttonVariants(), 'min-h-touch')}>Try again</a>
          <Link to="/market" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>Back to catalog</Link>
        </div>
      }
    />
  )
}
