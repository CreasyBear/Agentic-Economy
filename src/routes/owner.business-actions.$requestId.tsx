import { createFileRoute } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readCurrentOwnerBusinessActionDetailServer } from '@/modules/business-action/business-action.functions'
import type { CapabilityRequestId } from '@/modules/common/ids'
import {
  FactGrid,
  ownerBusinessActionDetailServerToRouteReadback,
  readOwnerBusinessActionDetailRouteReadback as readOwnerBusinessActionDetailFromSource,
  type OwnerBusinessActionDetailRouteInput,
  type OwnerBusinessActionDetailRouteReadback,
} from '@/routes/owner.business-actions'

export const Route = createFileRoute('/owner/business-actions/$requestId')({
  loader: ({ params }) => readCurrentOwnerBusinessActionDetailServer({ data: { requestId: params.requestId } }),
  head: () => ({
    meta: [
      { title: 'Review business action request | Agentic Economy' },
      { name: 'description', content: 'Owner checkpoint readback for one source-owned business action request.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBusinessActionDetailRoute,
})

export function readOwnerBusinessActionDetailRouteReadback(
  input: OwnerBusinessActionDetailRouteInput
): OwnerBusinessActionDetailRouteReadback {
  return readOwnerBusinessActionDetailFromSource(input)
}

function OwnerBusinessActionDetailRoute() {
  const params = Route.useParams()
  const readback = ownerBusinessActionDetailServerToRouteReadback(
    Route.useLoaderData(),
    params.requestId as CapabilityRequestId
  )

  if (readback.kind !== 'ok') {
    return (
      <AePublicShell>
        <AePageHeader
          eyebrow="Owner checkpoint"
          title="Business action request unavailable"
          description="Source-owned request readback is required before an owner checkpoint can be inspected."
        />
        <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Readback unavailable</CardTitle>
              <CardDescription>{readback.reason}</CardDescription>
            </CardHeader>
          </Card>
        </section>
      </AePublicShell>
    )
  }
  const reconstruction = readback.reconstruction

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner checkpoint"
        title="Business action request checkpoint"
        description="source/local proof only. production proof not claimed."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{reconstruction.checkpoint?.decision.replaceAll('_', ' ') ?? 'missing checkpoint'}</Badge>
              <Badge variant="outline">{reconstruction.resultArtifactState.status.replaceAll('_', ' ')}</Badge>
            </div>
            <CardTitle className="break-words text-lg">{reconstruction.request.id}</CardTitle>
            <CardDescription>Owner-visible receipt hashes only. Raw provider payloads and private endpoint refs are excluded.</CardDescription>
          </CardHeader>
          <CardContent>
            <FactGrid
              facts={[
                { label: 'Action', value: reconstruction.request.actionSlug },
                { label: 'Request status', value: reconstruction.request.status.replaceAll('_', ' ') },
                { label: 'Receipt', value: reconstruction.receipt?.id ?? 'missing' },
                { label: 'Private endpoint ref', value: reconstruction.resultArtifactState.privateEndpointRef.replaceAll('_', ' ') },
                { label: 'Proof label', value: reconstruction.publicReadback?.labels.join(', ') ?? 'missing' },
              ]}
            />
          </CardContent>
        </Card>
      </section>
    </AePublicShell>
  )
}
