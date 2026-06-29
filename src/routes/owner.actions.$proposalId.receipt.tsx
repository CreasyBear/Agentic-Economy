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

export type OwnerContactFollowUpReceiptRouteInput = {
  state?: ContactFollowUpSourceState
  proposalId: ContactFollowUpProposalId
}

export const Route = createFileRoute('/owner/actions/$proposalId/receipt')({
  loader: ({ params }) =>
    readOwnerContactFollowUpReceiptRouteReadback({
      proposalId: params.proposalId as ContactFollowUpProposalId,
    }),
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
  const readback = Route.useLoaderData()

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
              <Badge>{readback.readbackStatus.replaceAll('_', ' ')}</Badge>
              <Badge variant="outline">{readback.repairAction.replaceAll('_', ' ')}</Badge>
            </div>
            <CardTitle>{readback.proposal.parameters.contactName}</CardTitle>
            <CardDescription>Source-owned receipt or proof-gap readback only. No raw provider payload is shown.</CardDescription>
          </CardHeader>
          <CardContent>
            <FactGrid
              facts={[
                { label: 'Proposal', value: readback.proposal.id },
                { label: 'Gateway', value: readback.gatewayAdmission?.status ?? 'missing' },
                { label: 'Attempt', value: readback.attempt?.outcome ?? 'not attempted' },
                { label: 'Receipt', value: readback.receipt?.kind ?? 'none' },
                { label: 'Private evidence refs', value: String(readback.privateEvidenceRefs.length) },
                { label: 'Audit events', value: String(readback.auditEvents.length) },
              ]}
            />
          </CardContent>
        </Card>
      </section>
    </AePublicShell>
  )
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
