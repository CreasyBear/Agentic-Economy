import { createFileRoute } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  createEmptyContactFollowUpSourceState,
  readContactFollowUpReconstruction,
  type ContactFollowUpProposalId,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'
import {
  readCurrentOwnerContactFollowUpReceiptServer,
  type OwnerContactFollowUpDetailServerResult,
} from '@/modules/protected-action/contact-follow-up.functions'

export type OwnerContactFollowUpReceiptRouteInput = {
  state?: ContactFollowUpSourceState
  proposalId: ContactFollowUpProposalId
}

export type OwnerContactFollowUpReceiptRouteReadback =
  | {
      kind: 'ok'
      reconstruction: ContactFollowUpReconstruction
    }
  | {
      kind: 'error'
      reason: string
    }

export const Route = createFileRoute('/owner/actions/$proposalId/receipt')({
  loader: ({ params }) => readCurrentOwnerContactFollowUpReceiptServer({ data: { proposalId: params.proposalId } }),
  head: () => ({
    meta: [
      { title: 'Contact follow-up receipt | Agentic Economy' },
      { name: 'description', content: 'Receipt and proof-gap readback for one owner-approved contact follow-up.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerContactFollowUpReceiptRoute,
})

export function readOwnerContactFollowUpReceiptRouteReadback(
  input: OwnerContactFollowUpReceiptRouteInput
): ContactFollowUpReconstruction {
  return readContactFollowUpReconstruction(input.state ?? createEmptyContactFollowUpSourceState(), input.proposalId)
}

function OwnerContactFollowUpReceiptRoute() {
  const readback = ownerContactFollowUpReceiptServerToRouteReadback(Route.useLoaderData())

  if (readback.kind === 'error') {
    return (
      <AePublicShell>
        <AePageHeader
          eyebrow="Receipt readback"
          title="Contact follow-up reconstruction"
          description="The owner readback separates source-owned proposal, decision, gateway, attempt, and receipt state."
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
        eyebrow="Receipt readback"
        title="Contact follow-up reconstruction"
        description="The owner readback separates proposal, policy, owner decision, gateway, attempt, receipt, proof gap, audit, and no-repair state."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{reconstruction.readbackStatus.replaceAll('_', ' ')}</Badge>
              <Badge variant="outline">{reconstruction.repairAction.replaceAll('_', ' ')}</Badge>
            </div>
            <CardTitle>{reconstruction.proposal.parameters.contactName}</CardTitle>
            <CardDescription>Source-owned receipt or proof-gap readback only. No raw provider payload is shown.</CardDescription>
          </CardHeader>
          <CardContent>
            <FactGrid
              facts={[
                { label: 'Proposal', value: reconstruction.proposal.id },
                { label: 'Gateway', value: reconstruction.gatewayAdmission?.status ?? 'missing' },
                { label: 'Attempt', value: reconstruction.attempt?.outcome ?? 'not attempted' },
                { label: 'Receipt', value: reconstruction.receipt?.kind ?? 'none' },
                { label: 'Private evidence refs', value: String(reconstruction.privateEvidenceRefs.length) },
                { label: 'Audit events', value: String(reconstruction.auditEvents.length) },
              ]}
            />
          </CardContent>
        </Card>
      </section>
    </AePublicShell>
  )
}

export function ownerContactFollowUpReceiptServerToRouteReadback(
  result: OwnerContactFollowUpDetailServerResult
): OwnerContactFollowUpReceiptRouteReadback {
  if (result.kind === 'ok') {
    return { kind: 'ok', reconstruction: result.reconstruction }
  }

  return { kind: 'error', reason: result.reason }
}

function FactGrid({ facts }: { facts: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`} className="rounded-lg border bg-muted/30 p-3">
          <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
