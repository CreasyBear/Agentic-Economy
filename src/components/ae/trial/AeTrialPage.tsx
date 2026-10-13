import { useAuth } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Infer } from 'convex/values'
import { api } from '../../../../convex/_generated/api'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { trialClaimResultValue } from '@/modules/money/public'
import { formatTimestamp } from '@/lib/ui/format-time'
import { trialNextAction } from './trial-next-action'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
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
  trial_code_invalid: 'That trial code is not recognized. Check the code and try again.',
  trial_code_exhausted: 'This trial code has reached its redemption limit. Contact support for access.',
}

export function AeTrialPage() {
  const auth = useAuth()
  return (
    <AePublicPage>
      <div className="mx-auto grid w-full max-w-2xl gap-related px-page py-page">
        <h1 className="text-2xl font-medium">Your Agentic Economy trial</h1>
        <AeSection title="A$10 to try Tools" description="Approved trials include A$10 promotional credit and 30 days of purchase access. No payment is required to activate.">
          {auth.isSignedIn !== true ? (
            <div className="grid gap-related">
              <p>Create an Account or sign in with your verified email to redeem a trial code or activate an approved invitation. Public signup alone does not include automatic credit.</p>
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
  const currentSnapshot = useRef(current)
  useLayoutEffect(() => { currentSnapshot.current = current }, [current])
  const [result, setResult] = useState<{ outcome: TrialResult; currentAtResult: TrialResult | undefined } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [code, setCode] = useState('')
  // Keep an action result while the query is still its snapshot at action completion.
  // Later authority changes supersede it; generic no-offer reads cannot replace
  // a claim refusal that includes Clerk verification or availability evidence.
  const useCurrent = current !== undefined && current !== result?.currentAtResult
    && !(current.kind === 'refused' && current.code === 'trial_not_approved' && result?.outcome.kind === 'refused')
  const outcome = useCurrent ? current : result?.outcome ?? current
  async function activate(trialCode?: string) {
    if (pending) return
    setPending(true)
    setError(false)
    try {
      const outcome = await claimTrialServer({ data: trialCode === undefined ? {} : { code: trialCode } })
      setResult({ outcome, currentAtResult: currentSnapshot.current })
    } catch { setError(true) }
    finally { setPending(false) }
  }
  const remedy = outcome?.kind === 'refused' ? trialNextAction(outcome.code) : undefined
  return (
    <div className="grid gap-related">
      {outcome?.kind === 'granted' ? null : <form className="grid gap-related" onSubmit={event => {
        event.preventDefault()
        if (code.trim() !== '') void activate(code.trim())
      }}>
        <Input label="Trial code" value={code} maxLength={32} autoComplete="off" disabled={pending}
          onChange={event => setCode(event.target.value)} />
        <Button type="submit" disabled={pending || code.trim() === ''} className="justify-self-start">
          {pending ? 'Checking trial…' : 'Redeem code'}
        </Button>
        <p className="text-sm text-muted-foreground">A valid code grants A$10 promotional credit and 30 days of purchase access. One trial per Account.</p>
      </form>}
      {outcome?.kind === 'granted' ? <AeAlert title={outcome.booking === 'booked' ? 'Trial credit granted' : 'Confirming your trial credit'} tone={outcome.booking === 'booked' ? 'success' : 'info'}>
        <p>{outcome.booking === 'booked' ? 'Your approved A$10 grant has been recorded. Your credit page shows the amount remaining.' : 'Activation is recorded. Credit will appear after confirmation.'} Trial credit and purchase access expire {formatTimestamp(outcome.expiresAt, 'Australia/Perth')}.</p>
      </AeAlert> : outcome?.kind === 'refused' ? <AeAlert title="Trial status" tone="warning">{REFUSAL_COPY[outcome.code]}</AeAlert>
        : <p>Activate an invitation approved for your primary email. The 30-day period starts when activation is recorded.</p>}
      {error ? <AeAlert title="Activation could not be confirmed" tone="warning">Check again to recover the same trial. A retry does not create another grant.</AeAlert> : null}
      {remedy !== undefined ? <a href={remedy.href} className={actionLinkClassName('primary', 'md')}>{remedy.label}</a> : outcome?.kind === 'granted' && outcome.booking === 'booked' ? null : <Button type="button" disabled={pending} className="justify-self-start" onClick={() => void activate()}>{pending ? 'Checking trial…' : outcome?.kind === 'granted' ? 'Check credit status' : 'Activate approved trial'}</Button>}
      {remedy !== undefined && outcome?.kind === 'refused' && outcome.code !== 'trial_already_claimed' ? <Button type="button" variant="secondary" disabled={pending} onClick={() => void activate()}>{pending ? 'Checking trial…' : 'Check trial status'}</Button> : null}
      {remedy?.href === '/owner/credit' ? null : <a className="underline underline-offset-4" href="/owner/credit">View credit</a>}
      <a className="underline underline-offset-4" href="/market">Browse Tools</a>
    </div>
  )
}
