import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
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

import { projectFoundCallPurchaseStatus } from '@/modules/capability-execution/call-receipt-view'
import { cn } from '@/lib/utils'

import { CallReceiptStatusFeedback, callReceiptRefreshLabel, callReceiptTactilePressClassName } from './CallReceiptPrimitives'

const RECONCILIATION_RESOLUTIONS = [
  { value: 'not_released', label: 'Effect not released' },
  { value: 'released', label: 'Effect released' },
] as const

type CallRecoveryAvailability = Readonly<{
  needsReview: boolean
  canCancelNow: boolean
  canReconcileNow: boolean
  canRefreshNow: boolean
  recoveryPending: boolean
  visible: boolean
}>

function callRecoveryAvailability(
  result: FoundCallStatus,
  actions?: CallStatusPageActions,
): CallRecoveryAvailability {
  const purchase = projectFoundCallPurchaseStatus(result)
  const needsReview = purchase.kind === 'uncertain'
  const purchaseResolved = ['delivered', 'refunded', 'failed'].includes(purchase.kind)
  const canCancelNow = !purchaseResolved && !needsReview && (result.state === 'authorized' || result.state === 'retryable' || result.state === 'leased')
  const canReconcileNow = needsReview && result.state === 'reconciliation_required'
    && result.attemptRef !== undefined && result.effectGeneration !== undefined
    && result.ownerContext?.reconciliation.canSubmitEvidence === true
    && actions?.onReconcile !== undefined
  const canRefreshNow = !purchaseResolved && canRefreshCallStatus(result) && actions?.onRefresh !== undefined
  const recoveryPending = actions?.refreshPending === true
    || actions?.cancelPending === true
    || actions?.reconcilePending === true
  const visible = needsReview
    || canRefreshNow
    || canCancelNow
    || canReconcileNow
    || actions?.feedback !== undefined

  return {
    needsReview,
    canCancelNow,
    canReconcileNow,
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
      <h2 id="recovery-actions-title" className="sr-only">Call actions</h2>
      <CallReceiptStatusFeedback feedback={actions?.feedback} callRef={result.callRef} />
      {availability.needsReview ? (
        <p className="text-sm text-muted-foreground">
          This Call is saved in Calls. Get help to check its payment and result. Checking status only reads the latest record; it does not run or pay for the service again.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          You can leave this page and return to this Call from Calls. Closing the page does not cancel it.
        </p>
      )}
      <RecoveryPrimaryActions callRef={result.callRef} availability={availability} {...(actions === undefined ? {} : { actions })} />
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

function RecoveryPrimaryActions({
  callRef,
  availability,
  actions,
}: Readonly<{ callRef: string; availability: CallRecoveryAvailability; actions?: CallStatusPageActions }>) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const canCancel = availability.canCancelNow && actions?.onCancel !== undefined
  const refreshLabelMode = 'refresh_status' as const
  if (!availability.needsReview && !availability.canRefreshNow && !canCancel) return null

  return (
    <>
      <div className="flex flex-wrap gap-intra">
        {availability.needsReview ? (
          <Link to="/support" search={{ callRef }} className={buttonVariants({ className: 'min-h-touch' })}>
            Get help with this Call
          </Link>
        ) : null}
        {availability.canRefreshNow ? (
          <Button
            type="button"
            variant={availability.needsReview ? 'outline' : 'default'}
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
        description="Cancel this Call before the service starts. If the service has already started, check its result and payment instead."
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
              onValueChange={(value) => { if (value != null) setResolution(value as CallReconciliationForm['resolution']) }}
              items={RECONCILIATION_RESOLUTIONS}
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
