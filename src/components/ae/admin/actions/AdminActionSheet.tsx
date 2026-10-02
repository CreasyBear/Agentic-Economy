import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ADMIN_ACTION_COPY, ADMIN_ACTION_SHEET_COPY, type AdminActionSheetProps } from './actions.contracts'
import { AuditPreview } from './components/AuditPreview'
import { EvidenceRefsPicker } from './components/EvidenceRefsPicker'
import { ReasonSelect } from './components/ReasonSelect'
import { ReceiptView } from './components/ReceiptView'
import { useAdminActionSheet } from './useAdminActionSheet'

export function AdminActionSheet(props: AdminActionSheetProps) {
  const command = useAdminActionSheet(props)
  const destructive = props.action === 'revoke_admin_membership' || props.action === 'close_removal_dispute'
  const showBack = command.allowed && (
    command.phase === 'submitting'
    || (['evidence', 'proof', 'preview', 'confirm'].includes(command.phase) && (props.approval?.kind !== 'approve' || command.phase === 'confirm'))
  )
  const action = command.allowed && command.phase === 'reason' ? (
    <Button type="button" className="min-h-touch" onClick={command.next}>{ADMIN_ACTION_SHEET_COPY.continue}</Button>
  ) : command.allowed && (command.phase === 'evidence' || command.phase === 'proof') ? (
    <Button type="button" className="min-h-touch" onClick={command.next}>{ADMIN_ACTION_SHEET_COPY.continue}</Button>
  ) : command.allowed && command.phase === 'preview' ? (
    <Button type="button" className="min-h-touch" disabled={command.pending} onClick={() => {
      if (command.pending) return
      if (destructive) command.next()
      else void command.submit()
    }}>{destructive ? ADMIN_ACTION_SHEET_COPY.continue : ADMIN_ACTION_SHEET_COPY.submit}</Button>
  ) : command.allowed && command.phase === 'confirm' ? (
    <Button type="button" variant="destructive" className="min-h-touch" disabled={command.pending} onClick={() => { if (!command.pending) void command.submit() }}>
      {ADMIN_ACTION_SHEET_COPY.confirm}
    </Button>
  ) : command.phase === 'submitting' ? (
    <Button type="button" disabled aria-busy="true">{ADMIN_ACTION_SHEET_COPY.processing}</Button>
  ) : null

  return (
    <AeRecordSheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={ADMIN_ACTION_COPY[props.action]}
      description={ADMIN_ACTION_SHEET_COPY.description}
      action={(
        <>
          {showBack ? <Button type="button" variant="outline" className="min-h-touch" onClick={command.back}>{ADMIN_ACTION_SHEET_COPY.back}</Button> : null}
          {action}
        </>
      )}
    >
      <div className="flex flex-col gap-4 py-4">
        {command.allowed ? null : <Alert role="status"><AlertDescription>{ADMIN_ACTION_SHEET_COPY.permission}</AlertDescription></Alert>}
        {command.phase === 'receipt' && command.receipt?.kind === 'refused' && command.receipt.code === 'mfa_reverification_required'
          ? <Alert role="status"><AlertDescription>{ADMIN_ACTION_SHEET_COPY.mfaRequired} <a href="/owner/settings/account/security" className="underline underline-offset-4 focus-visible:outline-2">Account security</a></AlertDescription></Alert>
          : null}
        {command.error === null ? null : <Alert role="alert" variant="destructive"><AlertDescription>{command.error}</AlertDescription></Alert>}
        {command.phase === 'reason' ? (
          <ReasonSelect action={props.action} value={command.reasonCode} onChange={command.setReason} />
        ) : command.phase === 'evidence' ? (
          <EvidenceRefsPicker targetRefs={props.targetRefs} selected={command.evidenceRefs} typedEvidence={command.typedEvidence} onToggle={command.setEvidence} onType={command.setTypedEvidence} />
        ) : command.phase === 'proof' ? (
          <p className="text-sm text-muted-foreground">{ADMIN_ACTION_SHEET_COPY.proofNotice}</p>
        ) : command.phase === 'preview' || command.phase === 'confirm' || command.phase === 'submitting' ? (
          <>
            {command.phase === 'confirm' ? <Alert role="alert" variant="destructive"><AlertDescription>{ADMIN_ACTION_SHEET_COPY.confirmEffect}</AlertDescription></Alert> : null}
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
