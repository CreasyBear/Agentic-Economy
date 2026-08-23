import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOwnerOfferingEditor, type OwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings'
import { readOwnerOfferingSupplyServer, saveOwnerOfferingServer } from '@/components/ae/offerings/owner-offering.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/offerings/$offeringRef')({
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>): Readonly<{ next?: 'supply' }> => search.next === 'supply' ? { next: 'supply' } : {},
  loader: () => readOwnerOfferingSupplyServer(),
  head: () => ({ meta: [{ title: 'Edit Operation | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerOfferingDetailRoute,
})

function OwnerOfferingDetailRoute() {
  const { offeringRef } = Route.useParams()
  const result = Route.useLoaderData()
  const save = useServerFn(saveOwnerOfferingServer)
  const search = Route.useSearch()
  const navigate = useNavigate()
  const requestKeyRef = useRef<string | undefined>(undefined)
  const source = result.kind === 'available' ? result.offerings.find((item) => item.offeringRef === offeringRef) : undefined
  const businessId = result.kind === 'available' ? result.businessId : undefined
  const initialValue = source === undefined || source.revision === undefined ? undefined : toEditorValue(source)
  return (
    <AeOperatorShell operatorRole="owner" title={source?.revision?.name ?? 'Operation'} description="Keep its public facts, price, and access route current." currentPath="/owner/offerings" breadcrumbs={[{ label: 'Operations', href: '/owner/offerings' }, { label: source?.revision?.name ?? 'Operation' }]}>
      {result.kind === 'error' ? <Alert variant="destructive"><AlertTitle>Operation did not load</AlertTitle><AlertDescription>{result.reason ?? 'Retry this page.'}</AlertDescription></Alert>
        : initialValue === undefined ? <Alert><AlertTitle>Operation unavailable</AlertTitle><AlertDescription><p>This Operation was not found for the current supplier, or its current revision needs repair.</p><Button asChild variant="secondary"><Link to="/owner/offerings">Back to Operations</Link></Button></AlertDescription></Alert>
        : source?.status === 'retired' ? <Alert><AlertTitle>This Operation is retired</AlertTitle><AlertDescription>Its history remains available, but retired Operations cannot be edited.</AlertDescription></Alert>
        : businessId === undefined ? <Alert variant="destructive"><AlertTitle>Operation did not load</AlertTitle><AlertDescription>The current supplier could not be resolved.</AlertDescription></Alert>
        : <AeOwnerOfferingEditor initialValue={initialValue} onSave={(value) => {
          requestKeyRef.current ??= crypto.randomUUID()
          return save({ data: { businessId, requestKey: requestKeyRef.current, value } }).then((saved) => {
            if (saved.kind === 'saved') {
              requestKeyRef.current = undefined
              if (search.next === 'supply') void navigate({ to: '/owner/supply/$offeringRef', params: { offeringRef } })
            }
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
    // Without this the next save would publish a revision with no price and
    // silently retire one the owner already published.
    price: source.revision.price,
    status: source.status,
    accessPaths: source.accessPaths.map((path) => ({ accessPathRef: path.accessPathRef, status: path.status, descriptor: path.descriptor })),
  }
}
