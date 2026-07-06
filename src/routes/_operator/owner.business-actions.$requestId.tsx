import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { readCurrentOwnerBusinessActionDetailServer } from '@/modules/business-action/business-action.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import type { CapabilityRequestId } from '@/modules/common/ids'
import {
  ownerBusinessActionDetailServerToRouteReadback,
  readOwnerBusinessActionDetailRouteReadback as readOwnerBusinessActionDetailFromSource,
  type OwnerBusinessActionDetailRouteInput,
  type OwnerBusinessActionDetailRouteReadback,
} from '@/routes/_operator/owner.business-actions'

export const Route = createFileRoute('/_operator/owner/business-actions/$requestId')({
  ...operatorRouteOptions,
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
  const detailPath = `/owner/business-actions/${params.requestId}`

  if (readback.kind !== 'ok') {
    return (
      <AeOperatorShell
        operatorRole="owner"
        eyebrow="Owner checkpoint"
        title="Business action request unavailable"
        description="Source-owned request readback is required before an owner checkpoint can be inspected."
        currentPath={detailPath}
      >
        <Card padding={5}>
          <div className="grid gap-1.5">
            <Text as="div" type="large" weight="semibold" color="primary" display="block">Readback unavailable</Text>
            <Text as="div" type="supporting" color="secondary" display="block">{readback.reason}</Text>
          </div>
        </Card>
      </AeOperatorShell>
    )
  }
  const reconstruction = readback.reconstruction

  return (
    <AeOperatorShell
      operatorRole="owner"
      eyebrow="Owner checkpoint"
      title="Business action request checkpoint"
      description="source/local proof only. production proof not claimed."
      currentPath={detailPath}
    >
      <Card padding={5}>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" label={reconstruction.checkpoint?.decision.replaceAll('_', ' ') ?? 'missing checkpoint'} />
            <Badge variant="neutral" label={reconstruction.resultArtifactState.status.replaceAll('_', ' ')} />
          </div>
          <Text as="div" type="large" weight="semibold" color="primary" display="block" className="break-words text-lg">{reconstruction.request.id}</Text>
          <Text as="div" type="supporting" color="secondary" display="block">Owner-visible receipt hashes only. Raw provider payloads and private endpoint refs are excluded.</Text>
        </div>
        <div className="grid gap-4">
          <AeOperatorFactGrid
            facts={[
              { label: 'Action', value: reconstruction.request.actionSlug },
              { label: 'Request status', value: reconstruction.request.status.replaceAll('_', ' ') },
              { label: 'Receipt', value: reconstruction.receipt?.id ?? 'missing' },
              { label: 'Private endpoint ref', value: reconstruction.resultArtifactState.privateEndpointRef.replaceAll('_', ' ') },
              { label: 'Proof label', value: reconstruction.publicReadback?.labels.join(', ') ?? 'missing' },
            ]}
          />
        </div>
      </Card>
    </AeOperatorShell>
  )
}
