import { AlertCircleIcon, CheckCircle2Icon, CreditCardIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { aeStatusToneVariants } from '@/lib/ui/status-presentation'
import { TACTILE } from '../supplier-onboarding-wizard.contracts'
import type { PayoutsStepProps } from '../supplier-onboarding-wizard.contracts'

export function PayoutsStep({
  payoutConnection,
  onConnectPayouts,
  onSkipForNow,
}: PayoutsStepProps) {
  return (
    <div className="grid gap-4">
      <Alert className="border-border bg-muted/40 py-2.5">
        <CreditCardIcon className="size-4 text-primary" />
        <AlertTitle className="text-xs font-semibold">Step 2: Connect Bank Account via Stripe Express</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Stripe Express securely hosts KYC and identity verification. Direct credit settlements are deposited into your Australian bank account (BSB + Account Number). Agentic Economy never stores account numbers.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border bg-muted/20 p-4 grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="grid gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-foreground">Payout Status</span>
              <Badge variant={aeStatusToneVariants[payoutConnection.tone]} className="gap-1">
                {payoutConnection.state === 'connected'
                  ? <CheckCircle2Icon className="size-3" />
                  : <AlertCircleIcon className="size-3" />}
                {payoutConnection.label}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {payoutConnection.sentence}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 flex-wrap">
          {payoutConnection.action === undefined ? null : (
            <Button
              type="button"
              onClick={onConnectPayouts}
              className={`min-h-touch ${TACTILE}`}
            >
              {payoutConnection.action}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onSkipForNow}
            className={`min-h-touch ${TACTILE}`}
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  )
}
