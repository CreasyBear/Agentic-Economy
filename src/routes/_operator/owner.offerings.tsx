import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOwnerOfferingsList, type OwnerOfferingSummary } from '@/components/ae/offerings/AeOwnerOfferings'
import { readOwnerOfferingSupplyServer } from '@/components/ae/offerings/owner-offering.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/offerings')({
  ...operatorRouteOptions,
  loader: () => readOwnerOfferingSupplyServer(),
  head: () => ({ meta: [{ title: 'Offerings | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerOfferingsRoute,
})

function OwnerOfferingsRoute() {
  const location = useLocation()
  const result = Route.useLoaderData()
  if (location.pathname !== '/owner/offerings') return <Outlet />

  const offerings: OwnerOfferingSummary[] = result.kind === 'available'
    ? result.offerings.flatMap((item) => item.revision === undefined ? [] : [{ offering: {
        offeringRef: item.revision.offeringRef,
        revision: item.revision.revision,
        name: item.revision.name,
        category: item.revision.category,
        summary: item.revision.summary,
        ...(item.revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: item.revision.serviceAreaSummary }),
        ...(item.revision.availabilitySummary === undefined ? {} : { availabilitySummary: item.revision.availabilitySummary }),
        ...(item.revision.pricingSummary === undefined ? {} : { pricingSummary: item.revision.pricingSummary }),
      }, status: item.status, accessPathCount: item.accessPaths.filter((path) => path.status !== 'withdrawn').length }])
    : []

  return (
    <AeOperatorShell operatorRole="owner" title="Offerings" description="Describe what your business provides and how customers or agents can begin." currentPath="/owner/offerings" actions={<Button href="/owner/offerings/new" label="Add an Offering" variant="primary" />}>
      {result.kind === 'error' ? (
        <Banner status="error" title="Offerings did not load" description={result.reason ?? 'Sign in again or retry this page.'} />
      ) : result.kind === 'not_found' ? (
        <Banner status="warning" title="Claim a business first" description="Offerings belong to a claimed business page." endContent={<Button href="/claim" label="Claim a business" variant="secondary" />} />
      ) : result.offerings.some((item) => item.revision === undefined) ? (
        <div className="grid gap-4">
          <Banner status="warning" title="One Offering needs repair" description="Its current revision could not be read, so it is not shown or editable." />
          <AeOwnerOfferingsList offerings={offerings} projectionState={projectionState(result)} />
        </div>
      ) : <AeOwnerOfferingsList offerings={offerings} projectionState={projectionState(result)} />}
    </AeOperatorShell>
  )
}

function projectionState(result: Extract<Awaited<ReturnType<typeof readOwnerOfferingSupplyServer>>, { kind: 'available' }>): 'current' | 'projection_pending' | 'migration_mismatch' {
  if (result.cutover.lastCheckStatus === 'mismatch') return 'migration_mismatch'
  return result.projection.status === 'current' ? 'current' : 'projection_pending'
}
