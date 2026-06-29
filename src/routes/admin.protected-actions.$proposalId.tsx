import { createFileRoute } from '@tanstack/react-router'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  createEmptyContactFollowUpSourceState,
  readContactFollowUpReconstruction,
  type ContactFollowUpProposalId,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'

export type AdminProtectedActionDetailRouteInput = {
  state?: ContactFollowUpSourceState
  proposalId: ContactFollowUpProposalId
}

export const Route = createFileRoute('/admin/protected-actions/$proposalId')({
  loader: ({ params }) =>
    readAdminProtectedActionDetailRouteReadback({
      proposalId: params.proposalId as ContactFollowUpProposalId,
    }),
  head: () => ({
    meta: [
      { title: 'Protected action detail | Agentic Economy' },
      { name: 'description', content: 'Operator detail for one contact follow-up protected action chain.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminProtectedActionDetailRoute,
})

export function readAdminProtectedActionDetailRouteReadback(
  input: AdminProtectedActionDetailRouteInput
): ContactFollowUpReconstruction {
  return readContactFollowUpReconstruction(input.state ?? createEmptyContactFollowUpSourceState(), input.proposalId)
}

function AdminProtectedActionDetailRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeAdminShell
      title="Protected action detail"
      description="Operator reconstruction for one contact follow-up proposal, gateway, attempt, receipt, and no-repair path."
      currentPath="/admin/protected-actions"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{readback.readbackStatus.replaceAll('_', ' ')}</Badge>
            <Badge variant="outline">{readback.proposal.selectedActionSlug}</Badge>
          </div>
          <CardTitle className="break-words">{readback.proposal.id}</CardTitle>
          <CardDescription>No raw provider payloads are exposed in this reconstruction.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FactGrid
            facts={[
              { label: 'Proposal hash', value: readback.proposal.proposalHash },
              { label: 'Policy hash', value: readback.policy?.policyHash ?? 'missing' },
              { label: 'Decision hash', value: readback.ownerDecision?.decisionHash ?? 'missing' },
              { label: 'Gateway hash', value: readback.gatewayAdmission?.admissionHash ?? 'missing' },
              { label: 'Attempt hash', value: readback.attempt?.attemptHash ?? 'missing' },
              { label: 'Receipt hash', value: readback.receipt?.payloadHash ?? 'missing' },
              { label: 'Private evidence refs', value: String(readback.privateEvidenceRefs.length) },
              { label: 'Audit events', value: String(readback.auditEvents.length) },
              { label: 'No repair reason', value: readback.noRepair?.reason ?? 'none' },
            ]}
          />
        </CardContent>
      </Card>
    </AeAdminShell>
  )
}

function FactGrid({ facts }: { facts: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-3 md:grid-cols-3">
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`} className="rounded-md border bg-muted/30 p-3">
          <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
