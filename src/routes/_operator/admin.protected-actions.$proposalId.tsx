import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { operatorRouteOptions } from '@/lib/operator/route-options'
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

export const Route = createFileRoute('/_operator/admin/protected-actions/$proposalId')({
  ...operatorRouteOptions,
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
  const params = Route.useParams()
  const detailPath = `/admin/protected-actions/${params.proposalId}`

  if (readback.kind !== 'ok') {
    return (
      <AeOperatorShell
        operatorRole="admin"
        title="Protected action detail"
        description="Operator reconstruction for one contact follow-up proposal, gateway, attempt, receipt, and no-repair path."
        currentPath={detailPath}
      >
        <Card padding={5}>
          <div className="grid gap-1.5">
            <Text as="div" type="large" weight="semibold" color="primary" display="block">{readback.kind === 'not_found' ? 'Protected action not found' : 'Protected action unavailable'}</Text>
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
      title="Protected action detail"
      description="Operator reconstruction for one contact follow-up proposal, gateway, attempt, receipt, and no-repair path."
      currentPath={detailPath}
    >
      <Card padding={5}>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" label={reconstruction.readbackStatus.replaceAll('_', ' ')} />
            <Badge variant="neutral" label={reconstruction.proposal.selectedActionSlug} />
          </div>
          <Text as="div" type="large" weight="semibold" color="primary" display="block" className="break-words">{reconstruction.proposal.id}</Text>
          <Text as="div" type="supporting" color="secondary" display="block">No raw provider payloads are exposed in this reconstruction.</Text>
        </div>
        <div className="grid gap-5">
          <AeOperatorFactGrid
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
        </div>
      </Card>
    </AeOperatorShell>
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
