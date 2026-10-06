import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { ADMIN_ACTION_COPY, ADMIN_ACTION_SHEET_COPY, type AdminActionSheetProps } from './actions.contracts'
import { AuditPreview } from './components/AuditPreview'
import { EvidenceRefsPicker } from './components/EvidenceRefsPicker'
import { ReasonSelect } from './components/ReasonSelect'
import { ReceiptView } from './components/ReceiptView'
import { useAdminActionSheet } from './useAdminActionSheet'
import { CommercialPolicyReview } from '../treasury/CommercialPolicyReview'

export function AdminActionSheet(props: AdminActionSheetProps) {
  const command = useAdminActionSheet(props)
  const destructive = props.action === 'revoke_admin_membership' || props.action === 'close_removal_dispute'
  const showBack = command.allowed && (
    command.phase === 'submitting'
    || (command.submittedRequest === null && ['evidence', 'proof', 'preview', 'confirm'].includes(command.phase) && (props.approval?.kind !== 'approve' || command.phase === 'confirm'))
  )
  const action = command.allowed && command.phase === 'reason' ? (
    <Button type="button" size="md" onClick={command.next}>{ADMIN_ACTION_SHEET_COPY.continue}</Button>
  ) : command.allowed && (command.phase === 'evidence' || command.phase === 'proof') ? (
    <Button type="button" size="md" onClick={command.next}>{ADMIN_ACTION_SHEET_COPY.continue}</Button>
  ) : command.allowed && command.phase === 'preview' ? (
    <Button type="button" size="md" disabled={command.pending} onClick={() => {
      if (command.pending) return
      if (destructive) command.next()
      else void command.submit()
    }}>{destructive ? ADMIN_ACTION_SHEET_COPY.continue : ADMIN_ACTION_SHEET_COPY.submit}</Button>
  ) : command.allowed && command.phase === 'confirm' ? (
    <Button type="button" variant="danger" size="md" disabled={command.pending} onClick={() => { if (!command.pending) void command.submit() }}>
      {ADMIN_ACTION_SHEET_COPY.confirm}
    </Button>
  ) : command.phase === 'submitting' ? (
    <Button type="button" size="md" disabled aria-busy="true">{ADMIN_ACTION_SHEET_COPY.processing}</Button>
  ) : null

  if (props.open && command.minimized) return <div className="grid gap-intra" role="status">
    <p className="text-sm">{ADMIN_ACTION_COPY[props.action]}: {command.pending ? 'response pending' : command.receipt !== null ? 'receipt available' : command.error === ADMIN_ACTION_SHEET_COPY.unavailable ? 'outcome unknown' : 'review retained'}. Resume to check the outcome before leaving or reloading.</p>
    <Button type="button" variant="secondary" size="md" onClick={command.resume}>Resume command</Button>
  </div>

  return (
    <AeRecordSheet
      open={props.open}
      onOpenChange={command.onOpenChange}
      title={ADMIN_ACTION_COPY[props.action]}
      description={ADMIN_ACTION_SHEET_COPY.description}
      action={(
        <>
          {showBack ? <Button type="button" variant="secondary" size="md" onClick={command.back}>{ADMIN_ACTION_SHEET_COPY.back}</Button> : null}
          {action}
        </>
      )}
    >
      <div className="arc-market flex min-w-0 flex-col gap-6 py-4">
        {command.allowed ? null : <AeAlert tone="info" title={ADMIN_ACTION_SHEET_COPY.permission} role="status" />}
        {command.phase === 'receipt' && command.receipt?.kind === 'refused' && command.receipt.code === 'mfa_reverification_required'
          ? <AeAlert tone="info" role="status" title={ADMIN_ACTION_SHEET_COPY.mfaRequired}><a href="/owner/settings/account/security" className="underline underline-offset-4 focus-visible:outline-2">Account security</a></AeAlert>
          : null}
        {command.error === null ? null : <AeAlert tone="danger" title={command.error} role="alert" />}
        {props.action === 'change_commercial_policy' ? <CommercialPolicyReview input={command.submittedRequest?.action === 'change_commercial_policy' ? command.submittedRequest.input : props.input} /> : null}
        {command.phase === 'reason' ? (
          <ReasonSelect action={props.action} value={command.reasonCode} onChange={command.setReason} />
        ) : command.phase === 'evidence' ? (
          <EvidenceRefsPicker targetRefs={props.targetRefs} selected={command.evidenceRefs} typedEvidence={command.typedEvidence} onToggle={command.setEvidence} onType={command.setTypedEvidence} />
        ) : command.phase === 'proof' ? (
          <p className="text-sm text-muted-foreground">{ADMIN_ACTION_SHEET_COPY.proofNotice}</p>
        ) : command.phase === 'preview' || command.phase === 'confirm' || command.phase === 'submitting' ? (
          <>
            {command.phase === 'confirm' ? <AeAlert tone="danger" title={ADMIN_ACTION_SHEET_COPY.confirmEffect} role="alert" /> : null}
            <AuditPreview action={props.action} targetRefs={props.targetRefs} reasonCode={command.reasonCode} evidenceRefs={command.evidenceRefs} approval={command.approval} />
          </>
        ) : command.receipt === null ? null : (
          <>
            {command.receipt.kind === 'refused' ? (
              <>
                <AuditPreview action={props.action} targetRefs={props.targetRefs} reasonCode={command.reasonCode} evidenceRefs={command.evidenceRefs} approval={command.approval} />
                {props.approval?.kind === 'approve' ? null : (
                  <EvidenceRefsPicker targetRefs={props.targetRefs} selected={command.evidenceRefs} typedEvidence={command.typedEvidence} onToggle={command.setEvidence} onType={command.setTypedEvidence} readOnly />
                )}
              </>
            ) : null}
            <ReceiptView receipt={command.receipt} onPropose={() => { void command.submit({ kind: 'propose' }) }} onRetry={(newKey) => { void command.retry(newKey) }} onEdit={command.edit} allowEdit={props.approval?.kind !== 'approve'} />
          </>
        )}
      </div>
    </AeRecordSheet>
  )
}
