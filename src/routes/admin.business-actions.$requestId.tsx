import { createFileRoute } from '@tanstack/react-router'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readAdminBusinessActionReconstructionServer } from '@/modules/business-action/business-action.functions'
import type { CapabilityRequestId } from '@/modules/common/ids'
import {
  adminBusinessActionServerToDetailRouteReadback,
  readAdminBusinessActionDetailRouteReadback as readAdminBusinessActionDetailFromSource,
  type AdminBusinessActionDetailRouteReadback,
  type AdminBusinessActionsRouteInput,
} from '@/routes/admin.business-actions'
import { FactGrid } from '@/routes/owner.business-actions'

export const Route = createFileRoute('/admin/business-actions/$requestId')({
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
      <AeAdminShell
        title="Business action detail"
        description="source/local proof only. production proof not claimed."
        currentPath="/admin/business-actions"
      >
        <Card>
          <CardHeader>
            <CardTitle>Business action not found</CardTitle>
            <CardDescription>{readback.reason}</CardDescription>
          </CardHeader>
        </Card>
      </AeAdminShell>
    )
  }

  const reconstruction = readback.reconstruction

  return (
    <AeAdminShell
      title="Business action detail"
      description="source/local proof only. production proof not claimed."
      currentPath="/admin/business-actions"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{reconstruction.receipt?.outcome.replaceAll('_', ' ') ?? 'no receipt'}</Badge>
            <Badge variant="outline">{reconstruction.resultArtifactState.status.replaceAll('_', ' ')}</Badge>
          </div>
          <CardTitle className="break-words text-lg">{reconstruction.request.id}</CardTitle>
          <CardDescription>Guardrail decision evidence is separate from post-checkpoint external evidence.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FactGrid
            facts={[
              { label: 'Action', value: reconstruction.request.actionSlug },
              { label: 'Request status', value: reconstruction.request.status.replaceAll('_', ' ') },
              { label: 'Checkpoint', value: reconstruction.checkpoint?.decision ?? 'missing' },
              { label: 'Guardrail decisions', value: String(reconstruction.guardrailDecisions.length) },
              { label: 'External evidence', value: String(reconstruction.externalEvidenceEvents.length) },
              { label: 'Private evidence refs', value: String(reconstruction.privateEvidenceMetadata.count) },
            ]}
          />
        </CardContent>
      </Card>
    </AeAdminShell>
  )
}
