import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import ArcButton from '@/components/arc/button/button'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { ADMIN_ACTION_SHEET_COPY, ADMIN_SUCCESS_COPY, type ReceiptViewProps } from '../actions.contracts'
import './CommandReviewComposition.css'

export function ReceiptView({ receipt, onPropose, onRetry, onEdit, allowEdit }: ReceiptViewProps) {
  if (receipt.kind === 'pending') return (
    <Alert role="status">
      <AlertTitle>Credit grant pending</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>Funds become available after ledger confirmation. Check this grant before starting another.</span>
        <ArcButton type="button" variant="secondary" size="md" className="arc-command-receipt-action" onClick={() => onRetry(false)}>Check grant status</ArcButton>
        {receipt.effectRefs.map((ref) => <AeCopyReference key={ref} label={ADMIN_ACTION_SHEET_COPY.effectReference} value={ref} />)}
        <AeCopyReference label={ADMIN_ACTION_SHEET_COPY.auditReference} value={receipt.auditEventRef} />
      </AlertDescription>
    </Alert>
  )
  if (receipt.kind === 'completed') return (
    <DecisionPanel aria-label="Action result" className="arc-command-receipt">
      <Alert role="status" className="arc-command-receipt-alert">
        <AlertTitle>{getStatusPresentation('completed').label}: {ADMIN_SUCCESS_COPY[receipt.code]}</AlertTitle>
        <AlertDescription className="arc-command-receipt-body">
          {receipt.effectRefs.map((ref) => <AeCopyReference key={ref} label={ADMIN_ACTION_SHEET_COPY.effectReference} value={ref} />)}
          <AeCopyReference label={ADMIN_ACTION_SHEET_COPY.auditReference} value={receipt.auditEventRef} />
        </AlertDescription>
      </Alert>
    </DecisionPanel>
  )
  if (receipt.kind === 'proposed') return (
    <DecisionPanel aria-label="Action result" className="arc-command-receipt">
      <Alert role="status" className="arc-command-receipt-alert">
        <AlertTitle>{getStatusPresentation('awaiting_second_approval').label}</AlertTitle>
        <AlertDescription className="arc-command-receipt-body">
          <AeCopyReference label={ADMIN_ACTION_SHEET_COPY.proposalReference} value={receipt.proposalRef} />
          <span>{ADMIN_ACTION_SHEET_COPY.proposalExpiry(formatPerthTimestamp(receipt.expiresAt))}</span>
        </AlertDescription>
      </Alert>
    </DecisionPanel>
  )
  const presentation = ADMIN_REFUSAL_PRESENTATION[receipt.code]
  return (
    <DecisionPanel aria-label="Action result" className="arc-command-receipt">
      <Alert role="alert" variant="destructive" className="arc-command-receipt-alert">
        <AlertTitle>{getStatusPresentation('refused').label}</AlertTitle>
        <AlertDescription className="arc-command-receipt-body">
          <span>{presentation.copy}</span>
          <span>{presentation.nextStep}</span>
          {receipt.code === 'approval_required' ? (
            <ArcButton type="button" variant="secondary" size="md" className="arc-command-receipt-action" onClick={onPropose}>
              {ADMIN_ACTION_SHEET_COPY.propose}
            </ArcButton>
          ) : presentation.retry === 'no' ? null : (
            <ArcButton type="button" variant="secondary" size="md" className="arc-command-receipt-action" onClick={() => onRetry(presentation.retry === 'new_key')}>
              {ADMIN_ACTION_SHEET_COPY.retry}
            </ArcButton>
          )}
          {allowEdit ? (
            <ArcButton type="button" variant="secondary" size="md" className="arc-command-receipt-action" onClick={onEdit}>{ADMIN_ACTION_SHEET_COPY.edit}</ArcButton>
          ) : null}
        </AlertDescription>
      </Alert>
    </DecisionPanel>
  )
}
