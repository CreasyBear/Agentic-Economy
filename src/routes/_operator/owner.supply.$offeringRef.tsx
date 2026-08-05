import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { brandNonEmpty } from '@/modules/common/ids'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import type { OwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings'
import { readOwnerOfferingSupplyServer, saveOwnerOfferingServer, type OwnerOfferingSupplyReadResult } from '@/components/ae/offerings/owner-offering.functions'
import { AeSupplyFunnel } from '@/components/ae/supply/AeSupplyFunnel'
import { advanceOwnerSupplyStepServer, publishOwnerCapabilityServer, readOwnerSupplyFunnelServer, runOwnerSupplyReadinessServer, runOwnerSupplyTestServer } from '@/modules/capability-supply/supply-funnel.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/supply/$offeringRef')({
  ...operatorRouteOptions,
  loader: async ({ params }) => {
    const [supply, offerings] = await Promise.all([readOwnerSupplyFunnelServer(), readOwnerOfferingSupplyServer()])
    const source = offerings.kind === 'available' ? offerings.offerings.find((item) => item.offeringRef === params.offeringRef) : undefined
    return { supply, offerings, source }
  },
  head: () => ({ meta: [{ title: 'Get your service ready | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerSupplyDetailRoute,
})

function OwnerSupplyDetailRoute() {
  const { offeringRef } = Route.useParams()
  const result = Route.useLoaderData()
  const requestKey = useRef<string | undefined>(undefined)
  const save = useServerFn(saveOwnerOfferingServer)
  const advance = useServerFn(advanceOwnerSupplyStepServer)
  const readiness = useServerFn(runOwnerSupplyReadinessServer)
  const test = useServerFn(runOwnerSupplyTestServer)
  const publish = useServerFn(publishOwnerCapabilityServer)
  const source = result.source
  const offerings = result.offerings
  if (result.supply.kind !== 'available' || offerings.kind !== 'available' || source === undefined || source.revision === undefined) {
    return <AeOperatorShell operatorRole="owner" title="Get your service ready" description="We could not load this service. Return to your services and try again." currentPath="/owner/supply"><div className="grid gap-3"><Alert><AlertTitle>Service unavailable</AlertTitle><AlertDescription>We could not load this service. Return to your services and try again.</AlertDescription></Alert><Button asChild variant="secondary" className="min-h-11 justify-self-start"><Link to="/owner/supply">Return to your services</Link></Button></div></AeOperatorShell>
  }
  const initialOffering = toEditorValue(source)
  return (
    <AeOperatorShell operatorRole="owner" title={source.revision.name} description="Describe what you do, set a price, test it, and go live." currentPath="/owner/supply">
      <AeSupplyFunnel
        businessId={offerings.businessId}
        offeringRef={offeringRef}
        initialOffering={initialOffering}
        callbacks={{
          saveOffering: async (value) => {
            requestKey.current ??= crypto.randomUUID()
            const saved = await save({ data: { businessId: offerings.businessId, requestKey: requestKey.current, value } })
            if (saved.kind === 'saved') requestKey.current = undefined
            return saved
          },
          advance: async (step, value) => advance({ data: { businessId: offerings.businessId, offeringRef, revision: source.currentRevision, operationKey: `owner-supply:${offerings.businessId}:${offeringRef}:${source.currentRevision}:${step}`, value: { step, ...value } } }),
          runReadiness: async (value) => readiness({ data: { businessId: offerings.businessId, offeringRef, revision: source.currentRevision, operationKey: `owner-supply:${offerings.businessId}:${offeringRef}:${source.currentRevision}:readiness`, value } }),
          runTest: async (value) => test({ data: { businessId: offerings.businessId, offeringRef, revision: source.currentRevision, operationKey: `owner-supply:${offerings.businessId}:${offeringRef}:${source.currentRevision}:test`, value } }),
          publish: async (value) => publish({ data: { businessId: offerings.businessId, offeringRef, revision: source.currentRevision, operationKey: `owner-supply:${offerings.businessId}:${offeringRef}:${source.currentRevision}:publish`, value } }),
        }}
      />
    </AeOperatorShell>
  )
}

function toEditorValue(source: Extract<OwnerOfferingSupplyReadResult, { kind: 'available' }>['offerings'][number]): OwnerOfferingEditorValue {
  if (source.revision === undefined) throw new Error('Offering revision missing')
  return {
    offeringRef: brandNonEmpty(source.offeringRef, 'OfferingRef'),
    expectedRevision: source.currentRevision,
    name: source.revision.name, category: source.revision.category, summary: source.revision.summary,
    serviceAreaSummary: source.revision.serviceAreaSummary ?? '', availabilitySummary: source.revision.availabilitySummary ?? '', pricingSummary: source.revision.pricingSummary ?? '',
    price: source.revision.price, status: source.status,
    accessPaths: source.accessPaths.map((path) => ({ accessPathRef: path.accessPathRef, status: path.status, descriptor: path.descriptor })),
  }
}
