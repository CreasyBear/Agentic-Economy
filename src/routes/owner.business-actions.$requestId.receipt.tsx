import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { readCurrentOwnerBusinessActionDetailServer } from '@/modules/business-action/business-action.functions'
import type { CapabilityRequestId } from '@/modules/common/ids'
import {
  ownerBusinessActionDetailServerToRouteReadback,
  readOwnerBusinessActionDetailRouteReadback,
  type OwnerBusinessActionDetailRouteInput,
  type OwnerBusinessActionDetailRouteReadback,
} from '@/routes/owner.business-actions'

export const Route = createFileRoute('/owner/business-actions/$requestId/receipt')({
  loader: ({ params }) => readCurrentOwnerBusinessActionDetailServer({ data: { requestId: params.requestId } }),
  head: () => ({
    meta: [
      { title: 'Business action receipt | Agentic Economy' },
      { name: 'description', content: 'Receipt readback for one source-owned business action request.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBusinessActionReceiptRoute,
})

export function readOwnerBusinessActionReceiptRouteReadback(
  input: OwnerBusinessActionDetailRouteInput
): OwnerBusinessActionDetailRouteReadback {
  return readOwnerBusinessActionDetailRouteReadback(input)
}

function OwnerBusinessActionReceiptRoute() {
  const params = Route.useParams()
  const readback = ownerBusinessActionDetailServerToRouteReadback(
    Route.useLoaderData(),
    params.requestId as CapabilityRequestId
  )

  if (readback.kind !== 'ok') {
    return (
      <AeOperatorShell
        operatorRole="owner"
        eyebrow="Action Receipt"
        title="Business action receipt unavailable"
        description="Source-owned receipt readback is required before local proof can be inspected."
        currentPath="/owner/business-actions"
      >
        <Card padding={5}>
          <div className="grid gap-1.5">
            <Text as="div" type="large" weight="semibold" color="primary" display="block">Receipt unavailable</Text>
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
      eyebrow="Action Receipt"
      title="Business action receipt reconstruction"
      description="source/local proof only. production proof not claimed."
      currentPath="/owner/business-actions"
    >
      <Card padding={5}>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" label={reconstruction.receipt?.outcome.replaceAll('_', ' ') ?? 'no receipt'} />
            <Badge variant="neutral" label={reconstruction.receipt?.reconstructionStatus.replaceAll('_', ' ') ?? 'missing'} />
          </div>
          <Text as="div" type="large" weight="semibold" color="primary" display="block" className="break-words text-lg">{reconstruction.receipt?.id ?? reconstruction.request.id}</Text>
          <Text as="div" type="supporting" color="secondary" display="block">Public-safe receipt readback only. Private endpoint refs remain redacted.</Text>
        </div>
        <div className="grid gap-4">
          <AeOperatorFactGrid
            facts={[
              { label: 'Request hash', value: reconstruction.publicReadback?.hashes.requestHash ?? reconstruction.request.requestHash },
              { label: 'Checkpoint hash', value: reconstruction.publicReadback?.hashes.checkpointHash ?? 'missing' },
              { label: 'Result artifact hash', value: reconstruction.publicReadback?.hashes.resultArtifactHash ?? 'missing' },
              { label: 'External evidence refs', value: String(reconstruction.receipt?.externalEvidenceRefHashes.length ?? 0) },
              { label: 'Guardrail evidence refs', value: String(reconstruction.receipt?.guardrailEvidenceRefHashes.length ?? 0) },
            ]}
          />
        </div>
      </Card>
    </AeOperatorShell>
  )
}
