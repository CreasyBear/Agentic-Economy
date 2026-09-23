import { ExternalLinkIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { TACTILE, type PayoutActionBarProps } from '../earnings-card.contracts'
import { ExpressStatusWell } from './ExpressStatusWell'

export type PayoutActionBarComponentProps = PayoutActionBarProps

export function PayoutActionBar({
  accountState,
  stripeMaskLabel,
  stripeMaskAriaLabel,
  showStripeUnbound,
  expressStatusExplanation,
  payoutGuidanceText,
  showReviewPayout,
  showExpressDashboard,
  showSetupPayouts,
  showContinueOnboarding,
  expressOnboardingLabel,
  expressButtonVariant,
  busyKind,
  actionsDisabled,
  expressActionRef,
  payoutActionRef,
  onReviewPayout,
  onExpressDashboard,
  onSetupPayouts,
  onContinueOnboarding,
}: PayoutActionBarComponentProps) {
  return (
    <div className="grid gap-2">
      <p className="m-0 text-sm text-muted-foreground">
        {payoutGuidanceText}
      </p>
      <ExpressStatusWell
        accountState={accountState}
        {...(stripeMaskLabel === undefined ? {} : { stripeMaskLabel })}
        {...(stripeMaskAriaLabel === undefined ? {} : { stripeMaskAriaLabel })}
        showStripeUnbound={showStripeUnbound}
        expressStatusExplanation={expressStatusExplanation}
      />
      <div className="flex min-h-touch flex-wrap gap-2">
        {showReviewPayout ? (
          <Button
            ref={payoutActionRef}
            type="button"
            className={`min-h-touch ${TACTILE}`}
            disabled={actionsDisabled}
            onClick={onReviewPayout}
          >
            {busyKind === 'transfer' ? 'Submitting payout…' : 'Review payout'}
          </Button>
        ) : null}
        {showExpressDashboard ? (
          <Button
            ref={expressActionRef}
            type="button"
            variant={expressButtonVariant}
            className={`min-h-touch gap-2 ${TACTILE}`}
            disabled={actionsDisabled}
            onClick={() => void onExpressDashboard()}
          >
            {busyKind === 'express_dashboard' ? (
              'Opening Stripe…'
            ) : (
              <>
                View Bank Payouts on Stripe
                <ExternalLinkIcon className="size-4" aria-hidden />
              </>
            )}
          </Button>
        ) : showSetupPayouts ? (
          <Button
            ref={payoutActionRef}
            type="button"
            variant="secondary"
            className={`min-h-touch ${TACTILE}`}
            disabled={actionsDisabled}
            onClick={onSetupPayouts}
          >
            {busyKind === 'connect'
              ? 'Creating Connect account…'
              : 'Set up payouts'}
          </Button>
        ) : showContinueOnboarding ? (
          <Button
            ref={payoutActionRef}
            type="button"
            variant="secondary"
            className={`min-h-touch ${TACTILE}`}
            disabled={actionsDisabled}
            onClick={onContinueOnboarding}
          >
            {busyKind === 'onboarding'
              ? 'Opening hosted onboarding…'
              : expressOnboardingLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
