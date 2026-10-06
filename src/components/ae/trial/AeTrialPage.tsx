import { useAuth } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import type { Infer } from 'convex/values'
import { api } from '../../../../convex/_generated/api'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { trialClaimResultValue } from '@/modules/money/public'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { claimTrialServer } from './claimTrial.functions'

type TrialResult = Infer<typeof trialClaimResultValue>
const REFUSAL_COPY: Record<Extract<TrialResult, { kind: 'refused' }>['code'], string> = {
  authentication_required: 'Sign in to activate an approved trial.',
  personal_account_required: 'Switch to your personal Account and try again.',
  verified_email_required: 'Verify your primary email address in Account security, then try again.',
  trial_not_approved: 'No trial has been approved for your verified email. Signup does not include automatic credit. An Admin can approve a trial for your Account.',
  trial_expired: 'This trial invitation has expired.',
  trial_already_claimed: 'This invitation or Account already has a trial. Open your credit page to check its status.',
  trial_authority_invalid: 'The trial approval could not be verified. Contact an Admin before trying again.',
  trial_verification_unavailable: 'Trial verification is temporarily unavailable. Try again shortly.',
}

export function AeTrialPage() {
  const auth = useAuth()
  return (
    <AePublicPage hideFooterCloser>
      <div className="mx-auto grid w-full max-w-2xl gap-related px-page py-page">
        <h1 className="text-2xl font-semibold">Your Agentic Economy trial</h1>
        <AeSection title="A$10 to try Tools" description="Approved trials include A$10 promotional credit and 30 days of purchase access. No payment is required to activate.">
          {auth.isSignedIn !== true ? (
            <div className="grid gap-related">
              <p>Sign in with the verified email address that received the invitation. Public signup does not include automatic credit; an Admin must approve your trial.</p>
              <a className="underline underline-offset-4" href="/sign-in?redirect=%2Ftrial">Sign in to activate</a>
              <a className="underline underline-offset-4" href="/sign-up?redirect=%2Ftrial">Create an Account</a>
            </div>
          ) : (
            <TrialActivation />
          )}
        </AeSection>
      </div>
    </AePublicPage>
  )
}

function TrialActivation() {
  const current = useQuery(api.trialAccess.readCurrent, {})
  const [result, setResult] = useState<TrialResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const outcome = current?.kind === 'granted' ? current : result
  return (
    <div className="grid gap-related">
      {outcome?.kind === 'granted' ? <AeAlert title={outcome.booking === 'booked' ? 'Trial credit granted' : 'Confirming your trial credit'} tone={outcome.booking === 'booked' ? 'success' : 'info'}>
        <p>{outcome.booking === 'booked' ? 'Your approved A$10 grant has been recorded. Your credit page shows the amount remaining.' : 'Activation is recorded. Credit will appear after confirmation.'} Trial credit and purchase access expire {formatPerthTimestamp(outcome.expiresAt)}.</p>
      </AeAlert> : outcome?.kind === 'refused' ? <AeAlert title="Trial status" tone="warning">{REFUSAL_COPY[outcome.code]}</AeAlert>
        : <p>Activate an invitation approved for your primary email. The 30-day period starts when activation is recorded.</p>}
      {error ? <AeAlert title="Activation could not be confirmed" tone="warning">Check again to recover the same trial. A retry does not create another grant.</AeAlert> : null}
      {outcome?.kind === 'granted' && outcome.booking === 'booked' ? null : <Button type="button" disabled={pending} className="justify-self-start" onClick={async () => {
        if (pending) return
        setPending(true)
        setError(false)
        try { setResult(await claimTrialServer({ data: {} })) }
        catch { setError(true) }
        finally { setPending(false) }
      }}>{pending ? 'Checking trial…' : outcome?.kind === 'granted' ? 'Check credit status' : 'Activate approved trial'}</Button>}
      <a className="underline underline-offset-4" href="/owner/credit">View credit</a>
      <a className="underline underline-offset-4" href="/market">Browse Tools</a>
    </div>
  )
}
