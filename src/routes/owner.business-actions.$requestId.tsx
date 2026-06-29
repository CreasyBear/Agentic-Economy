import { createFileRoute } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readCurrentOwnerBusinessActionReceiptServer } from '@/modules/business-action/business-action.functions'
import type { CapabilityRequestId } from '@/modules/common/ids'
import {
  FactGrid,
  readOwnerBusinessActionDetailRouteReadback as readOwnerBusinessActionDetailFromSource,
  type OwnerBusinessActionDetailRouteInput,
  type OwnerBusinessActionDetailRouteReadback,
} from '@/routes/owner.business-actions'

export const Route = createFileRoute('/owner/business-actions/$requestId')({
  loader: ({ params }) => readCurrentOwnerBusinessActionReceiptServer({ data: { requestId: params.requestId } }),
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
  const serverReadback = Route.useLoaderData()

  if (serverReadback.kind !== 'ok') {
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
              <CardDescription>{serverReadback.reason}</CardDescription>
            </CardHeader>
          </Card>
        </section>
      </AePublicShell>
    )
  }
  const receipt = serverReadback.receipt as Record<string, unknown>
  const publicReadback = serverReadback.publicReadback as Record<string, unknown>

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
              <Badge>{stringValue(receipt.outcome, 'missing').replaceAll('_', ' ')}</Badge>
              <Badge variant="outline">{stringValue(publicReadback.reconstructionStatus, 'missing').replaceAll('_', ' ')}</Badge>
            </div>
            <CardTitle className="break-words text-lg">{stringValue(receipt.requestId, 'missing') as CapabilityRequestId}</CardTitle>
            <CardDescription>Owner-visible receipt hashes only. Raw provider payloads and private endpoint refs are excluded.</CardDescription>
          </CardHeader>
          <CardContent>
            <FactGrid
              facts={[
                { label: 'Action', value: stringValue(receipt.actionSlug, 'missing') },
                { label: 'Card version', value: stringValue(receipt.cardVersion, 'missing') },
                { label: 'Receipt', value: stringValue(receipt.id, 'missing') },
                { label: 'Recorded', value: new Date(numberValue(receipt.recordedAt, 0)).toISOString() },
                { label: 'Proof label', value: stringArrayValue(publicReadback.labels).join(', ') },
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

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}
