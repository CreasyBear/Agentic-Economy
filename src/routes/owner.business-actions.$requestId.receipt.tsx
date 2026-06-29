import { createFileRoute } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readCurrentOwnerBusinessActionReceiptServer } from '@/modules/business-action/business-action.functions'
import {
  FactGrid,
  readOwnerBusinessActionDetailRouteReadback,
  type OwnerBusinessActionDetailRouteInput,
  type OwnerBusinessActionDetailRouteReadback,
} from '@/routes/owner.business-actions'

export const Route = createFileRoute('/owner/business-actions/$requestId/receipt')({
  loader: ({ params }) => readCurrentOwnerBusinessActionReceiptServer({ data: { requestId: params.requestId } }),
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
  const serverReadback = Route.useLoaderData()

  if (serverReadback.kind !== 'ok') {
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
              <CardDescription>{serverReadback.reason}</CardDescription>
            </CardHeader>
          </Card>
        </section>
      </AePublicShell>
    )
  }
  const receipt = serverReadback.receipt as Record<string, unknown>
  const publicReadback = serverReadback.publicReadback as Record<string, unknown>
  const hashes = objectValue(publicReadback.hashes)

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
              <Badge>{stringValue(receipt.outcome, 'missing').replaceAll('_', ' ')}</Badge>
              <Badge variant="outline">{stringValue(publicReadback.reconstructionStatus, 'missing').replaceAll('_', ' ')}</Badge>
            </div>
            <CardTitle className="break-words text-lg">{stringValue(receipt.id, 'missing')}</CardTitle>
            <CardDescription>Public-safe receipt readback only. Private endpoint refs remain redacted.</CardDescription>
          </CardHeader>
          <CardContent>
            <FactGrid
              facts={[
                { label: 'Request hash', value: stringValue(hashes.requestHash, 'missing') },
                { label: 'Checkpoint hash', value: stringValue(hashes.checkpointHash, 'missing') },
                { label: 'Result artifact hash', value: stringValue(hashes.resultArtifactHash, 'missing') },
                { label: 'External evidence refs', value: String(arrayValue(receipt.externalEvidenceRefHashes).length) },
                { label: 'Guardrail evidence refs', value: String(arrayValue(receipt.guardrailEvidenceRefHashes).length) },
              ]}
            />
          </CardContent>
        </Card>
      </section>
    </AePublicShell>
  )
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
