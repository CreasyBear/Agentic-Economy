import { useState, type FormEvent } from 'react'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { reconciliationBindingIdentity } from '@/lib/call-recovery/client-storage'
import type { CallReconciliationForm, CallStatusPageActions, FoundCallStatus } from '@/lib/call-recovery/call-status-page-types'
import { canRefreshCallStatus } from '@/lib/call-recovery/call-status-refresh'

import { cn } from '@/lib/utils'

import { CallReceiptStatusFeedback, callReceiptRefreshLabel, callReceiptTactilePressClassName } from './CallReceiptPrimitives'

type CallRecoveryAvailability = Readonly<{
  canCancelNow: boolean
  canReconcileNow: boolean
  hasReconciliationRecordBlocker: boolean
  hasReconciliationPermissionBlocker: boolean
  canRefreshNow: boolean
  recoveryPending: boolean
  visible: boolean
}>

function callRecoveryAvailability(
  result: FoundCallStatus,
  actions?: CallStatusPageActions,
): CallRecoveryAvailability {
  const canCancelNow = result.state === 'authorized' || result.state === 'retryable' || result.state === 'leased'
  const canSubmitReconciliationEvidence = result.ownerContext?.reconciliation.canSubmitEvidence === true
  const hasReconciliationRecordBlocker = result.state === 'reconciliation_required'
    && (result.attemptRef === undefined || result.effectGeneration === undefined)
  const hasReconciliationPermissionBlocker = result.state === 'reconciliation_required'
    && !hasReconciliationRecordBlocker
    && !canSubmitReconciliationEvidence
  const canReconcileNow = result.state === 'reconciliation_required'
    && !hasReconciliationRecordBlocker
    && !hasReconciliationPermissionBlocker
    && actions?.onReconcile !== undefined
  const canRefreshNow = canRefreshCallStatus(result) && actions?.onRefresh !== undefined
  const recoveryPending = actions?.refreshPending === true
    || actions?.cancelPending === true
    || actions?.reconcilePending === true
  const visible = canRefreshNow
    || canCancelNow
    || canReconcileNow
    || hasReconciliationRecordBlocker
    || hasReconciliationPermissionBlocker
    || actions?.feedback !== undefined

  return {
    canCancelNow,
    canReconcileNow,
    hasReconciliationRecordBlocker,
    hasReconciliationPermissionBlocker,
    canRefreshNow,
    recoveryPending,
    visible,
  }
}

export function CallRecoveryPanel({
  result,
  actions,
}: Readonly<{ result: FoundCallStatus; actions?: CallStatusPageActions }>) {
  const availability = callRecoveryAvailability(result, actions)
  if (!availability.visible) return null

  return (
    <section className="grid gap-related border-t border-border pt-section" aria-labelledby="recovery-actions-title">
      <div className="grid gap-intra">
        <h2 id="recovery-actions-title" className="text-xl font-semibold tracking-tight text-foreground">Resolve this Call</h2>
        <p className="text-sm text-muted-foreground">Use only the action supported by the recorded state. Each action refreshes this exact Call.</p>
      </div>
      <CallReceiptStatusFeedback feedback={actions?.feedback} callRef={result.callRef} />
      <ReconciliationBlockers availability={availability} />
      <RecoveryPrimaryActions availability={availability} result={result} {...(actions === undefined ? {} : { actions })} />
      {availability.canReconcileNow ? (
        <AdvancedReconciliation
          key={reconciliationBindingIdentity(result)}
          {...(actions === undefined ? {} : { actions })}
          recoveryPending={availability.recoveryPending}
        />
      ) : null}
    </section>
  )
}

function ReconciliationBlockers({ availability }: Readonly<{ availability: CallRecoveryAvailability }>) {
  return (
    <>
      {availability.hasReconciliationRecordBlocker ? (
        <Alert>
          <AlertTitle>Reconciliation cannot be submitted</AlertTitle>
          <AlertDescription>
            This record does not expose the attempt reference and effect generation required by the reconciliation contract. No evidence is fabricated or submitted from this browser.
            <p className="mt-intra rounded-lg border border-success-ring bg-success-subtle px-3 py-2 text-sm text-success-foreground">
              A$0.00 charged — this receipt is unchanged until evidence is accepted.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {availability.hasReconciliationPermissionBlocker ? (
        <Alert>
          <AlertTitle>Evidence submission is unavailable</AlertTitle>
          <AlertDescription>
            Permission to submit Provider evidence could not be confirmed from this receipt source. Refresh this exact Call to check again; no evidence can be submitted here until permission is available.
            <p className="mt-intra rounded-lg border border-success-ring bg-success-subtle px-3 py-2 text-sm text-success-foreground">
              A$0.00 charged — this receipt is unchanged until evidence is accepted.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}

function RecoveryPrimaryActions({
  availability,
  actions,
  result,
}: Readonly<{ availability: CallRecoveryAvailability; actions?: CallStatusPageActions; result: FoundCallStatus }>) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const canCancel = availability.canCancelNow && actions?.onCancel !== undefined
  const refreshLabelMode = result.state === 'retryable' ? 'try_again' as const : 'refresh_status' as const
  if (!availability.canRefreshNow && !canCancel) return null

  return (
    <>
      <div className="flex flex-wrap gap-intra">
        {availability.canRefreshNow ? (
          <Button
            type="button"
            className={cn('min-h-touch', callReceiptTactilePressClassName)}
            disabled={availability.recoveryPending}
            onClick={() => { void actions?.onRefresh?.() }}
          >
            {callReceiptRefreshLabel(refreshLabelMode, actions?.refreshPending === true)}
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            type="button"
            variant="secondary"
            className={cn('min-h-touch', callReceiptTactilePressClassName)}
            disabled={availability.recoveryPending}
            onClick={() => setCancelDialogOpen(true)}
          >
            Cancel Call
          </Button>
        ) : null}
      </div>
      <AeConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel this Call?"
        description="Cancellation is explicit and may be refused if the external effect has already started."
        confirmLabel="Confirm cancellation"
        cancelLabel="Keep Call"
        confirmVariant="destructive"
        pending={actions?.cancelPending === true}
        onConfirm={async () => {
          await actions?.onCancel?.()
          setCancelDialogOpen(false)
        }}
      />
    </>
  )
}

function AdvancedReconciliation({
  actions,
  recoveryPending,
}: Readonly<{ actions?: CallStatusPageActions; recoveryPending: boolean }>) {
  const [resolution, setResolution] = useState<CallReconciliationForm['resolution']>(actions?.reconciliationDraft?.resolution ?? 'not_released')
  const [source, setSource] = useState(actions?.reconciliationDraft?.source ?? '')
  const [evidenceRef, setEvidenceRef] = useState(actions?.reconciliationDraft?.evidenceRef ?? '')
  function submitReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    actions?.onReconcile?.({ resolution, source, evidenceRef })
  }

  return (
    <details className="border-t border-border pt-related">
      <summary className="flex min-h-touch cursor-pointer items-center text-sm font-medium text-foreground">Advanced evidence reconciliation</summary>
      <form className="pt-related" onSubmit={submitReconciliation}>
        <FieldGroup className="max-w-xl">
          <Field data-disabled={actions?.reconcilePending || undefined}>
            <FieldLabel htmlFor="reconciliation-resolution">Observed provider outcome</FieldLabel>
            <Select
              value={resolution}
              onValueChange={(value) => setResolution(value as CallReconciliationForm['resolution'])}
              disabled={recoveryPending}
              required
            >
              <SelectTrigger id="reconciliation-resolution" className="min-h-touch w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="not_released">Effect not released</SelectItem>
                  <SelectItem value="released">Effect released</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field data-disabled={actions?.reconcilePending || undefined}>
            <FieldLabel htmlFor="reconciliation-source">Evidence source</FieldLabel>
            <Input
              id="reconciliation-source"
              maxLength={300}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Provider control plane"
              disabled={recoveryPending}
              required
              className="min-h-touch"
            />
          </Field>
          <Field data-disabled={actions?.reconcilePending || undefined}>
            <FieldLabel htmlFor="reconciliation-reference">Evidence reference</FieldLabel>
            <Input
              id="reconciliation-reference"
              maxLength={300}
              value={evidenceRef}
              onChange={(event) => setEvidenceRef(event.target.value)}
              placeholder="Provider event or incident reference"
              disabled={recoveryPending}
              required
              className="min-h-touch"
            />
          </Field>
          <Field orientation="horizontal">
            <Button type="submit" className={cn('min-h-touch', callReceiptTactilePressClassName)} disabled={recoveryPending}>
              {actions?.reconcilePending === true ? 'Reconciling Call…' : 'Submit reconciliation evidence'}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </details>
  )
}
