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
  ...operatorRouteOptions,
  loader: ({ params }) => readCurrentOwnerContactFollowUpReceiptServer({ data: { proposalId: params.proposalId } }),
  head: () => ({
    meta: [
      { title: 'Contact follow-up receipt | Agentic Economy' },
      { name: 'description', content: 'Receipt and evidence status for one owner-approved contact follow-up.' },
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
      <AeOperatorShell
        operatorRole="owner"
        eyebrow="Receipt"
        title="Contact follow-up history"
        description="This page shows the proposal, decision, approval, attempt, and receipt for one contact follow-up request."
        currentPath="/owner/actions"
      >
        <Card padding={3}>
          <div className="grid gap-1.5">
            <Text as="div" type="large" weight="semibold" color="primary" display="block">Receipt unavailable</Text>
            <Text as="div" type="supporting" color="secondary" display="block">{readback.reason}</Text>
          </div>
        </Card>
      </AeOperatorShell>
    )
  }
  const reconstruction = readback.reconstruction

  return (
    <AeOperatorShell
      operatorRole="owner"
      eyebrow="Receipt"
      title="Contact follow-up history"
      description="This page shows the proposal, policy check, your decision, approval, attempt, receipt, and audit history for one contact follow-up request."
      currentPath="/owner/actions"
    >
      <Card padding={3}>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" label={humanizeStatusValue(reconstruction.readbackStatus)} />
            <Badge variant="neutral" label={humanizeStatusValue(reconstruction.repairAction)} />
          </div>
          <Text as="div" type="large" weight="semibold" color="primary" display="block">{reconstruction.proposal.parameters.contactName}</Text>
          <Text as="div" type="supporting" color="secondary" display="block">Receipt, or a note that evidence is missing — nothing else. No raw provider payload is shown.</Text>
        </div>
        <div className="grid gap-4">
          <AeOperatorFactGrid
            facts={[
              { label: 'Proposal', value: reconstruction.proposal.id },
              { label: 'Approval', value: humanizeStatusValue(reconstruction.gatewayAdmission?.status ?? 'missing') },
              { label: 'Attempt', value: humanizeStatusValue(reconstruction.attempt?.outcome ?? 'not attempted') },
              { label: 'Receipt', value: humanizeStatusValue(reconstruction.receipt?.kind ?? 'none') },
              { label: 'Private evidence refs', value: String(reconstruction.privateEvidenceRefs.length) },
              { label: 'Audit events', value: String(reconstruction.auditEvents.length) },
            ]}
          />
        </div>
      </Card>
    </AeOperatorShell>
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

function humanizeStatusValue(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\bproof gap\b/gi, 'evidence missing')
    .replace(/\bgateway admitted\b/gi, 'approved')
    .replace(/\s+/g, ' ')
    .trim()
}
