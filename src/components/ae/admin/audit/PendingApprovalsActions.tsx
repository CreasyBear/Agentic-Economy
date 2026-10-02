import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
import {
  ADMIN_ACTION_COPY, ADMIN_ACTION_SHEET_COPY, ADMIN_AUDIT_ACTION_COPY,
  parseAdminProposalCommand, type AdminCommandRequest,
} from '@/components/ae/admin/actions/actions.contracts'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatExactAmount } from '@/modules/money/public'
import { AUDIT_COPY, type AdminApprovalProposal, type PendingApprovalsActionsProps } from './audit.contracts'

export function PendingApprovalsActions({ proposals, now, role, actorRef, paginationStatus, onLoadMore }: PendingApprovalsActionsProps) {
  const [selected, setSelected] = useState<AdminApprovalProposal | null>(null)
  const command = selected?.commandJson === null || selected === null
    ? null : parseAdminProposalCommand(selected.action, selected.commandJson)
  const onOpenChange = (open: boolean) => { if (!open) setSelected(null) }

  return (
    <AeSection title={ADMIN_AUDIT_ACTION_COPY.approvalActionsTitle} description={ADMIN_AUDIT_ACTION_COPY.approvalActionsDescription}>
      {proposals.length === 0 ? <p>{AUDIT_COPY.noPendingApprovals}</p> : (
        <ul className="grid gap-intra">
          {proposals.map((proposal) => {
            const material = proposal.commandJson === null
              ? null : parseAdminProposalCommand(proposal.action, proposal.commandJson)
            const canApprove = role === 'owner_admin' && proposal.proposerRef !== actorRef
              && proposal.expiresAt > now
            return (
              <li key={proposal.proposalRef} className="flex flex-wrap items-center justify-between gap-intra rounded-lg border border-border p-gutter">
                <div className="grid gap-1">
                  <span className="font-medium">{ADMIN_ACTION_COPY[proposal.action]}</span>
                  <AeCopyReference label={ADMIN_AUDIT_ACTION_COPY.proposal} value={proposal.proposalRef} />
                  <AeCopyReference label={AUDIT_COPY.columnLabels.proposer} value={proposal.proposerRef} />
                  <time dateTime={new Date(proposal.expiresAt).toISOString()}>
                    {AUDIT_COPY.columnLabels.expires}: {new Date(proposal.expiresAt).toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
                  </time>
                </div>
                {canApprove && material === null ? (
                  <Alert role="alert" variant="destructive"><AlertDescription>{ADMIN_ACTION_SHEET_COPY.proposalUnavailable}</AlertDescription></Alert>
                ) : canApprove && material !== null ? (
                  <Button type="button" variant="outline" className="min-h-touch" disabled={selected !== null} onClick={() => setSelected(proposal)}>
                    {ADMIN_AUDIT_ACTION_COPY.approve}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {paginationStatus === 'Exhausted' ? null : (
        <Button type="button" variant="outline" disabled={paginationStatus === 'LoadingMore'} onClick={onLoadMore}>{AUDIT_COPY.loadMore}</Button>
      )}
      {role === 'owner_admin' && selected !== null && selected.proposerRef !== actorRef
        && command !== null
        ? approvalSheet(command, selected.proposalRef, onOpenChange) : null}
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
    case 'set_payments_paused':
      return <TreasuryPaymentApproval key={proposalRef} command={command} proposalRef={proposalRef} onOpenChange={onOpenChange} />
    case 'change_treasury_thresholds':
      return null
    case 'set_business_suppression':
      return <AdminActionSheet {...common} action={command.action} input={command.input} initialReasonCode={command.reasonCode} targetRefs={[{ label: ADMIN_AUDIT_ACTION_COPY.targetLabels.businessId, value: command.input.businessId }]} />
    case 'change_commercial_policy':
      return <AdminActionSheet {...common} action={command.action} input={command.input} initialReasonCode={command.reasonCode} targetRefs={[{ label: ADMIN_AUDIT_ACTION_COPY.targetLabels.policyRef, value: command.input.policyRef }]} />
    case 'grant_promotional_credit':
      return <AdminActionSheet {...common} action={command.action} input={command.input} initialReasonCode={command.reasonCode} targetRefs={[
        { label: 'Workspace', value: command.input.accountRef },
        { label: 'Promotional credit', value: `A$${formatExactAmount({ currency: 'AUD', units: command.input.amountUnits, exponent: 6 }) ?? command.input.amountUnits}` },
        { label: 'Expires', value: new Date(command.input.expiresAt).toLocaleString('en-AU', { timeZone: 'Australia/Perth' }) },
      ]} />
    case 'grant_admin_membership':
      return <AdminActionSheet {...common} action={command.action} input={command.input} initialReasonCode={command.reasonCode} targetRefs={[{ label: ADMIN_AUDIT_ACTION_COPY.targetClerkUserId, value: command.input.targetClerkUserId }]} />
    case 'revoke_admin_membership':
      return <AdminActionSheet {...common} action={command.action} input={command.input} initialReasonCode={command.reasonCode} targetRefs={[{ label: ADMIN_AUDIT_ACTION_COPY.targetClerkUserId, value: command.input.targetClerkUserId }]} />
  }
}

/**
 * Requires a protected current audience matching the proposal's reviewed digest.
 * Ensures the second owner sees exactly who can spend after approval.
 * Invariant: a stale audience cannot be approved from this review; the command
 * envelope rechecks the same digest when applying the change.
 * On violation: keep the proposal intact and direct the owner to review it again.
 * One local component owns this query lifetime; no new proposal or storage model.
 */
function TreasuryPaymentApproval({ command, proposalRef, onOpenChange }: {
  command: Extract<AdminCommandRequest, { action: 'set_payments_paused' }>
  proposalRef: string
  onOpenChange: (open: boolean) => void
}) {
  const view = useQuery(api.adminConsoleTreasury.read, {})
  if (view === undefined) return <p role="status">Loading the payment audience for review…</p>
  if (view.kind !== 'ready' || view.environment !== command.input.environment
    || view.controls.launchStateDigest !== command.expectedStateDigest) {
    return <Alert role="alert" variant="destructive"><AlertDescription>
      The payment state has changed or is unavailable. <a className="underline underline-offset-4" href="/admin/treasury">Review Treasury before proposing resume again.</a>
    </AlertDescription></Alert>
  }
  const audience = view.controls.paymentsOpenTo === 'none'
    ? view.controls.resumePaymentsOpenTo : view.controls.paymentsOpenTo
  return <AdminActionSheet open onOpenChange={onOpenChange} action={command.action} input={command.input}
    approval={{ kind: 'approve', proposalRef }} initialEvidenceRefs={command.evidenceRefs}
    currentStateDigest={view.controls.launchStateDigest} initialReasonCode={command.reasonCode}
    targetRefs={[{ label: 'Payment environment', value: command.input.environment },
      { label: 'Payments after approval', value: command.input.paused ? 'Paused' : audience === 'admins' ? 'Open to admins' : 'Open to everyone' }]} />
}
