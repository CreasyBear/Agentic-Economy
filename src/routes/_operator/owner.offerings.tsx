import { Link, createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

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
    <AeOperatorShell operatorRole="owner" title="Offerings" description="Describe what your business provides and how customers or agents can begin." currentPath="/owner/offerings" actions={<Button asChild variant="default"><Link to="/owner/offerings/new">Add an Offering</Link></Button>}>
      {result.kind === 'error' ? (
        <Alert variant="destructive"><AlertTitle>Offerings did not load</AlertTitle><AlertDescription>{result.reason ?? 'Sign in again or retry this page.'}</AlertDescription></Alert>
      ) : result.kind === 'not_found' ? (
        <Alert><AlertTitle>No provider identity is available</AlertTitle><AlertDescription><p>Offerings require a current provider identity.</p><Button asChild variant="secondary"><Link to="/for-providers">Review provider setup</Link></Button></AlertDescription></Alert>
      ) : result.offerings.some((item) => item.revision === undefined) ? (
        <div className="grid gap-4">
          <Alert><AlertTitle>One Offering needs repair</AlertTitle><AlertDescription>Its current revision could not be read, so it is not shown or editable.</AlertDescription></Alert>
          <AeOwnerOfferingsList offerings={offerings} projectionState={projectionState(result)} />
        </div>
      ) : <AeOwnerOfferingsList offerings={offerings} projectionState={projectionState(result)} />}
    </AeOperatorShell>
  )
}

function projectionState(result: Extract<Awaited<ReturnType<typeof readOwnerOfferingSupplyServer>>, { kind: 'available' }>): 'current' | 'projection_pending' {
  return result.projection.status === 'current' ? 'current' : 'projection_pending'
}
