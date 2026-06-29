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
      <AePublicShell>
        <AePageHeader
          eyebrow="Action Receipt"
          title="Business action receipt unavailable"
          description="Source-owned receipt readback is required before local proof can be inspected."
        />
        <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Receipt unavailable</CardTitle>
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
        eyebrow="Action Receipt"
        title="Business action receipt reconstruction"
        description="source/local proof only. production proof not claimed."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{reconstruction.receipt?.outcome.replaceAll('_', ' ') ?? 'no receipt'}</Badge>
              <Badge variant="outline">{reconstruction.receipt?.reconstructionStatus.replaceAll('_', ' ') ?? 'missing'}</Badge>
            </div>
            <CardTitle className="break-words text-lg">{reconstruction.receipt?.id ?? reconstruction.request.id}</CardTitle>
            <CardDescription>Public-safe receipt readback only. Private endpoint refs remain redacted.</CardDescription>
          </CardHeader>
          <CardContent>
            <FactGrid
              facts={[
                { label: 'Request hash', value: reconstruction.publicReadback?.hashes.requestHash ?? reconstruction.request.requestHash },
                { label: 'Checkpoint hash', value: reconstruction.publicReadback?.hashes.checkpointHash ?? 'missing' },
                { label: 'Result artifact hash', value: reconstruction.publicReadback?.hashes.resultArtifactHash ?? 'missing' },
                { label: 'External evidence refs', value: String(reconstruction.receipt?.externalEvidenceRefHashes.length ?? 0) },
                { label: 'Guardrail evidence refs', value: String(reconstruction.receipt?.guardrailEvidenceRefHashes.length ?? 0) },
              ]}
            />
          </CardContent>
        </Card>
      </section>
    </AePublicShell>
  )
}
