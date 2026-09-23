import { useState } from 'react'
import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
import {
  ADMIN_ACTION_COPY,
  ADMIN_ACTION_SHEET_COPY,
  ADMIN_AUDIT_ACTION_COPY,
  parseAdminProposalCommand,
  type AdminCommandRequest,
} from '@/components/ae/admin/actions/actions.contracts'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AUDIT_COPY } from './audit.contracts'

export function PendingApprovalsActions() {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const allowed = access?.kind === 'allowed'
  const canApprove = allowed && access.role === 'owner_admin'
  const proposals = useQuery(api.adminConsoleAudit.listAdminApprovalProposals, allowed ? {} : 'skip')
  const [selectedRef, setSelectedRef] = useState<string | null>(null)

  if (!allowed) return null
  const selected = Array.isArray(proposals) ? proposals.find((row) => row.proposalRef === selectedRef) : undefined
  const command = selected?.commandJson === null || selected === undefined
    ? null
    : parseAdminProposalCommand(selected.action, selected.commandJson)
  const onOpenChange = (open: boolean) => { if (!open) setSelectedRef(null) }

  return (
    <AeSection title={ADMIN_AUDIT_ACTION_COPY.approvalActionsTitle} description={ADMIN_AUDIT_ACTION_COPY.approvalActionsDescription}>
      {proposals === undefined ? <p role="status">{ADMIN_AUDIT_ACTION_COPY.approvalLoading}</p>
        : !Array.isArray(proposals) ? (
          <Alert role="alert" variant="destructive"><AlertDescription>{ADMIN_AUDIT_ACTION_COPY.approvalUnavailable}</AlertDescription></Alert>
        ) : proposals.length === 0 ? <p>{AUDIT_COPY.noPendingApprovals}</p> : (
          <ul className="grid gap-intra">
            {proposals.map((proposal) => {
              const material = proposal.commandJson === null
                ? null
                : parseAdminProposalCommand(proposal.action, proposal.commandJson)
              return (
                <li key={proposal.proposalRef} className="flex flex-wrap items-center justify-between gap-intra rounded-lg border border-border p-gutter">
                  <div className="grid gap-1">
                    <span className="font-medium">{ADMIN_ACTION_COPY[proposal.action]}</span>
                    <AeCopyReference label={ADMIN_AUDIT_ACTION_COPY.proposal} value={proposal.proposalRef} />
                    <AeCopyReference label={AUDIT_COPY.columnLabels.proposer} value={proposal.proposerRef} />
                  </div>
                  {canApprove && material === null ? (
                    <Alert role="alert" variant="destructive"><AlertDescription>{ADMIN_ACTION_SHEET_COPY.proposalUnavailable}</AlertDescription></Alert>
                  ) : canApprove && material !== null ? (
                    <Button type="button" variant="outline" className="min-h-touch" onClick={() => setSelectedRef(proposal.proposalRef)}>
                      {ADMIN_AUDIT_ACTION_COPY.approve}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      {canApprove && selected !== undefined && command !== null ? approvalSheet(command, selected.proposalRef, onOpenChange) : null}
    </AeSection>
  )
}

function approvalSheet(command: AdminCommandRequest, proposalRef: string, onOpenChange: (open: boolean) => void) {
  const common = {
    key: proposalRef,
    open: true,
    onOpenChange,
    approval: { kind: 'approve', proposalRef } satisfies { kind: 'approve'; proposalRef: string },
    initialEvidenceRefs: command.evidenceRefs,
    ...(command.expectedStateDigest === undefined ? {} : { currentStateDigest: command.expectedStateDigest }),
  }
  switch (command.action) {
    case 'set_business_suppression':
      return <AdminActionSheet {...common} action={command.action} input={command.input} initialReasonCode={command.reasonCode} targetRefs={[{ label: ADMIN_AUDIT_ACTION_COPY.targetLabels.businessId, value: command.input.businessId }]} />
    case 'change_commercial_policy':
      return <AdminActionSheet {...common} action={command.action} input={command.input} initialReasonCode={command.reasonCode} targetRefs={[{ label: ADMIN_AUDIT_ACTION_COPY.targetLabels.policyRef, value: command.input.policyRef }]} />
    case 'grant_admin_membership':
      return <AdminActionSheet {...common} action={command.action} input={command.input} initialReasonCode={command.reasonCode} targetRefs={[{ label: ADMIN_AUDIT_ACTION_COPY.targetClerkUserId, value: command.input.targetClerkUserId }]} />
    case 'revoke_admin_membership':
      return <AdminActionSheet {...common} action={command.action} input={command.input} initialReasonCode={command.reasonCode} targetRefs={[{ label: ADMIN_AUDIT_ACTION_COPY.targetClerkUserId, value: command.input.targetClerkUserId }]} />
  }
}
