import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'

import type {
  EarningsAccountStatusProps,
  PayoutConfirmDialogProps,
} from '../earnings-card.contracts'

export type PayoutConfirmDialogComponentProps = PayoutConfirmDialogProps

export function PayoutConfirmDialog({
  confirmAction,
  connectConfirmDescription,
  onboardingConfirmDescription,
  transferConfirmDescription,
  pending,
  returnFocusRef,
  onOpenChange,
  onConfirm,
}: PayoutConfirmDialogComponentProps) {
  const title =
    confirmAction === 'transfer'
      ? 'Confirm payout'
      : confirmAction === 'onboarding'
        ? 'Confirm payout authority update'
        : 'Confirm payout authority'
  const description =
    confirmAction === 'transfer'
      ? transferConfirmDescription
      : confirmAction === 'onboarding'
        ? onboardingConfirmDescription
        : connectConfirmDescription
  const confirmLabel =
    confirmAction === 'transfer'
      ? 'Confirm payout'
      : confirmAction === 'onboarding'
        ? 'Confirm and continue'
        : 'Confirm and set up'

  return (
    <AeConfirmDialog
      open={confirmAction !== undefined}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      pending={pending}
      onConfirm={onConfirm}
      returnFocusRef={returnFocusRef}
    />
  )
}

export type EarningsAccountStatusComponentProps = EarningsAccountStatusProps

export function EarningsAccountStatus({
  diagnosticError,
  message,
}: EarningsAccountStatusComponentProps) {
  return (
    <div aria-live="polite" className="min-h-[5.5rem]">
      {diagnosticError !== undefined ? (
        <Alert variant="destructive">
          <AlertTitle className="text-sm font-medium">
            {diagnosticError.whatHappened}
          </AlertTitle>
          <AlertDescription className="grid gap-1 text-xs">
            <span>{diagnosticError.financialImpact}</span>
            <span>{diagnosticError.nextStep}</span>
          </AlertDescription>
        </Alert>
      ) : message === undefined ? null : (
        <p className="m-0 text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  )
}
