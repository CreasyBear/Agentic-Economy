import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOwnerOfferingEditor, type OwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings'
import { readOwnerOfferingSupplyServer, saveOwnerOfferingServer } from '@/components/ae/offerings/owner-offering.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/offerings/$offeringRef')({
  ...operatorRouteOptions,
  loader: () => readOwnerOfferingSupplyServer(),
  head: () => ({ meta: [{ title: 'Edit Offering | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerOfferingDetailRoute,
})

function OwnerOfferingDetailRoute() {
  const { offeringRef } = Route.useParams()
  const result = Route.useLoaderData()
  const save = useServerFn(saveOwnerOfferingServer)
  const requestKeyRef = useRef<string | undefined>(undefined)
  const source = result.kind === 'available' ? result.offerings.find((item) => item.offeringRef === offeringRef) : undefined
  const businessId = result.kind === 'available' ? result.businessId : undefined
  const initialValue = source === undefined || source.revision === undefined ? undefined : toEditorValue(source)
  return (
    <AeOperatorShell operatorRole="owner" title={source?.revision?.name ?? 'Offering'} description="Keep the public facts and ways to get started current." currentPath="/owner/offerings" breadcrumbs={[{ label: 'Offerings', href: '/owner/offerings' }, { label: source?.revision?.name ?? 'Offering' }]}>
      {result.kind === 'error' ? <Banner status="error" title="Offering did not load" description={result.reason ?? 'Retry this page.'} />
        : initialValue === undefined ? <Banner status="warning" title="Offering unavailable" description="This Offering was not found for the current owner, or its current revision needs repair." endContent={<Button href="/owner/offerings" label="Back to Offerings" variant="secondary" />} />
        : source?.status === 'retired' ? <Banner status="info" title="This Offering is retired" description="Its history remains available, but retired Offerings cannot be edited." />
        : businessId === undefined ? <Banner status="error" title="Offering did not load" description="The current business owner could not be resolved." />
        : <AeOwnerOfferingEditor initialValue={initialValue} onSave={(value) => {
          requestKeyRef.current ??= crypto.randomUUID()
          return save({ data: { businessId, requestKey: requestKeyRef.current, value } }).then((saved) => {
            if (saved.kind === 'saved') requestKeyRef.current = undefined
            return saved
          })
        }} />}
    </AeOperatorShell>
  )
}

function toEditorValue(source: Extract<Extract<Awaited<ReturnType<typeof readOwnerOfferingSupplyServer>>, { kind: 'available' }>['offerings'][number], { revision?: unknown }>): OwnerOfferingEditorValue {
  if (source.revision === undefined) throw new Error('Offering revision missing')
  return {
    offeringRef: source.offeringRef as never,
    expectedRevision: source.currentRevision,
    name: source.revision.name,
    category: source.revision.category,
    summary: source.revision.summary,
    serviceAreaSummary: source.revision.serviceAreaSummary ?? '',
    availabilitySummary: source.revision.availabilitySummary ?? '',
    pricingSummary: source.revision.pricingSummary ?? '',
    status: source.status,
    accessPaths: source.accessPaths.map((path) => ({ accessPathRef: path.accessPathRef, status: path.status, descriptor: path.descriptor })),
  }
}
