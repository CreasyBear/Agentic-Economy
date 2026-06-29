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
import {
  readAdminContactFollowUpReconstructionServer,
  type AdminContactFollowUpReconstructionServerResult,
} from '@/modules/protected-action/contact-follow-up.functions'

export type AdminProtectedActionDetailRouteInput = {
  state?: ContactFollowUpSourceState
  proposalId: ContactFollowUpProposalId
}

export type AdminProtectedActionDetailRouteReadback =
  | {
      kind: 'ok'
      reconstruction: ContactFollowUpReconstruction
    }
  | {
      kind: 'not_found'
      reason: string
    }
  | {
      kind: 'error'
      reason: string
    }

export const Route = createFileRoute('/admin/protected-actions/$proposalId')({
  loader: ({ params }) => readAdminContactFollowUpReconstructionServer({ data: { proposalId: params.proposalId } }),
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
  const readback = adminProtectedActionDetailServerToRouteReadback(Route.useLoaderData())

  if (readback.kind !== 'ok') {
    return (
      <AeAdminShell
        title="Protected action detail"
        description="Operator reconstruction for one contact follow-up proposal, gateway, attempt, receipt, and no-repair path."
        currentPath="/admin/protected-actions"
      >
        <Card>
          <CardHeader>
            <CardTitle>{readback.kind === 'not_found' ? 'Protected action not found' : 'Protected action unavailable'}</CardTitle>
            <CardDescription>{readback.reason}</CardDescription>
          </CardHeader>
        </Card>
      </AeAdminShell>
    )
  }
  const reconstruction = readback.reconstruction

  return (
    <AeAdminShell
      title="Protected action detail"
      description="Operator reconstruction for one contact follow-up proposal, gateway, attempt, receipt, and no-repair path."
      currentPath="/admin/protected-actions"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{reconstruction.readbackStatus.replaceAll('_', ' ')}</Badge>
            <Badge variant="outline">{reconstruction.proposal.selectedActionSlug}</Badge>
          </div>
          <CardTitle className="break-words">{reconstruction.proposal.id}</CardTitle>
          <CardDescription>No raw provider payloads are exposed in this reconstruction.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FactGrid
            facts={[
              { label: 'Proposal hash', value: reconstruction.proposal.proposalHash },
              { label: 'Policy hash', value: reconstruction.policy?.policyHash ?? 'missing' },
              { label: 'Decision hash', value: reconstruction.ownerDecision?.decisionHash ?? 'missing' },
              { label: 'Gateway hash', value: reconstruction.gatewayAdmission?.admissionHash ?? 'missing' },
              { label: 'Attempt hash', value: reconstruction.attempt?.attemptHash ?? 'missing' },
              { label: 'Receipt hash', value: reconstruction.receipt?.payloadHash ?? 'missing' },
              { label: 'Private evidence refs', value: String(reconstruction.privateEvidenceRefs.length) },
              { label: 'Audit events', value: String(reconstruction.auditEvents.length) },
              { label: 'No repair reason', value: reconstruction.noRepair?.reason ?? 'none' },
            ]}
          />
        </CardContent>
      </Card>
    </AeAdminShell>
  )
}

export function adminProtectedActionDetailServerToRouteReadback(
  result: AdminContactFollowUpReconstructionServerResult
): AdminProtectedActionDetailRouteReadback {
  if (result.kind === 'allowed') {
    const reconstruction = result.rows[0]
    return reconstruction === undefined
      ? { kind: 'not_found', reason: 'No protected-action reconstruction matched that proposal.' }
      : { kind: 'ok', reconstruction }
  }

  return { kind: 'error', reason: result.publicMessage }
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
