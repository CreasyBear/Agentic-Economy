import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAdminBusinessActionReconstructionServer } from '@/modules/business-action/business-action.functions'
import type { CapabilityRequestId } from '@/modules/common/ids'
import {
  adminBusinessActionServerToDetailRouteReadback,
  readAdminBusinessActionDetailRouteReadback as readAdminBusinessActionDetailFromSource,
  type AdminBusinessActionDetailRouteReadback,
  type AdminBusinessActionsRouteInput,
} from '@/routes/admin.business-actions'

export const Route = createFileRoute('/admin/business-actions/$requestId')({
  ...operatorRouteOptions,
  loader: ({ params }) => readAdminBusinessActionReconstructionServer({ data: { requestId: params.requestId } }),
  head: () => ({
    meta: [
      { title: 'Business action detail | Agentic Economy' },
      { name: 'description', content: 'Operator detail for one source-local business action receipt chain.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminBusinessActionDetailRoute,
})

export function readAdminBusinessActionDetailRouteReadback(
  input: Required<Pick<AdminBusinessActionsRouteInput, 'requestId'>> & Pick<AdminBusinessActionsRouteInput, 'state'>
): AdminBusinessActionDetailRouteReadback {
  return readAdminBusinessActionDetailFromSource(input)
}

function AdminBusinessActionDetailRoute() {
  const params = Route.useParams()
  const requestId = params.requestId as CapabilityRequestId
  const readback = adminBusinessActionServerToDetailRouteReadback(Route.useLoaderData(), requestId)

  if (readback.kind !== 'ok') {
    return (
      <AeOperatorShell
        operatorRole="admin"
        title="Business action detail"
        description="source/local proof only. production proof not claimed."
        currentPath="/admin/business-actions"
      >
        <Card padding={5}>
          <div className="grid gap-1.5">
            <Text as="div" type="large" weight="semibold" color="primary" display="block">Business action not found</Text>
            <Text as="div" type="supporting" color="secondary" display="block">{readback.reason}</Text>
          </div>
        </Card>
      </AeOperatorShell>
    )
  }

  const reconstruction = readback.reconstruction

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Business action detail"
      description="source/local proof only. production proof not claimed."
      currentPath="/admin/business-actions"
    >
      <Card padding={5}>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" label={reconstruction.receipt?.outcome.replaceAll('_', ' ') ?? 'no receipt'} />
            <Badge variant="neutral" label={reconstruction.resultArtifactState.status.replaceAll('_', ' ')} />
          </div>
          <Text as="div" type="large" weight="semibold" color="primary" display="block" className="break-words text-lg">{reconstruction.request.id}</Text>
          <Text as="div" type="supporting" color="secondary" display="block">Guardrail decision evidence is separate from post-checkpoint external evidence.</Text>
        </div>
        <div className="grid gap-5">
          <AeOperatorFactGrid
            facts={[
              { label: 'Action', value: reconstruction.request.actionSlug },
              { label: 'Request status', value: reconstruction.request.status.replaceAll('_', ' ') },
              { label: 'Checkpoint', value: reconstruction.checkpoint?.decision ?? 'missing' },
              { label: 'Guardrail decisions', value: String(reconstruction.guardrailDecisions.length) },
              { label: 'External evidence', value: String(reconstruction.externalEvidenceEvents.length) },
              { label: 'Private evidence refs', value: String(reconstruction.privateEvidenceMetadata.count) },
            ]}
          />
        </div>
      </Card>
    </AeOperatorShell>
  )
}
