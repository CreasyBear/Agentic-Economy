import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { ADMIN_ACTION_SHEET_COPY, ADMIN_SUCCESS_COPY, type ReceiptViewProps } from '../actions.contracts'


export function ReceiptView({ receipt, onPropose, onRetry, onEdit, allowEdit }: ReceiptViewProps) {
  if (receipt.kind === 'completed') return (
    <Alert role="status">
      <AlertTitle>{getStatusPresentation('completed').label}: {ADMIN_SUCCESS_COPY[receipt.code]}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        {receipt.effectRefs.map((ref) => <AeCopyReference key={ref} label={ADMIN_ACTION_SHEET_COPY.effectReference} value={ref} />)}
        <AeCopyReference label={ADMIN_ACTION_SHEET_COPY.auditReference} value={receipt.auditEventRef} />
      </AlertDescription>
    </Alert>
  )
  if (receipt.kind === 'proposed') return (
    <Alert role="status">
      <AlertTitle>{getStatusPresentation('awaiting_second_approval').label}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <AeCopyReference label={ADMIN_ACTION_SHEET_COPY.proposalReference} value={receipt.proposalRef} />
        <span>{ADMIN_ACTION_SHEET_COPY.proposalExpiry(formatPerthTimestamp(receipt.expiresAt))}</span>
      </AlertDescription>
    </Alert>
  )
  const presentation = ADMIN_REFUSAL_PRESENTATION[receipt.code]
  return (
    <Alert role="alert" variant="destructive">
      <AlertTitle>{getStatusPresentation('refused').label}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{presentation.copy}</span>
        <span>{presentation.nextStep}</span>
        {receipt.code === 'approval_required' ? (
          <Button type="button" variant="outline" onClick={onPropose}>
            {ADMIN_ACTION_SHEET_COPY.propose}
          </Button>
        ) : presentation.retry === 'no' ? null : (
          <Button type="button" variant="outline" onClick={() => onRetry(presentation.retry === 'new_key')}>
            {ADMIN_ACTION_SHEET_COPY.retry}
          </Button>
        )}
        {allowEdit ? (
          <Button type="button" variant="outline" onClick={onEdit}>{ADMIN_ACTION_SHEET_COPY.edit}</Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
