import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from './AdminActionSheet'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { formatTimestamp } from '@/lib/ui/format-time'
import type { AdminActionInput } from '@/lib/operator/admin-console/contracts'
import { COLOSSEUM_TRIAL_CODE, COLOSSEUM_TRIAL_MAX_CLAIMS, COLOSSEUM_TRIAL_CLAIM_BY } from '@/modules/money/public'

export function AdminTrialAccess({ accountRef }: { accountRef?: string }) {
  const view = useQuery(api.trialAccess.readAdmin, accountRef === undefined ? {} : { accountRef })
  const [email, setEmail] = useState('')
  const [draft, setDraft] = useState<AdminActionInput['issue_trial'] | null>(null)
  const [open, setOpen] = useState(false)
  if (view === undefined || view.kind === 'refused') return null
  const alreadyGranted = accountRef !== undefined && view.offers.length > 0
  const codeApproved = view.offers.some(offer => offer.recipient.kind === 'code')
  return (
    <AeSection title={accountRef === undefined ? 'Invite someone to a trial' : 'Trial access'}
      description="A$10 promotional credit and purchase access for 30 days from activation. One trial per Account; no Admin role is granted.">
      {alreadyGranted ? null : (
        <form className="grid max-w-xl gap-related" onSubmit={event => {
          event.preventDefault()
          setDraft({ environment: view.environment, recipient: accountRef === undefined
            ? { kind: 'email', email: email.trim().toLowerCase() } : { kind: 'account', accountRef } })
          setOpen(true)
        }}>
          {accountRef === undefined ? <Input label="Recipient email" type="email" autoComplete="off" maxLength={254} required
            value={email} onChange={event => setEmail(event.target.value)} /> : null}
          <p className="text-sm text-muted-foreground">{accountRef === undefined
            ? 'The invitation expires in 30 days. Credit starts when the recipient signs in with this verified email and activates the trial.'
            : 'Credit is available after confirmation. The 30-day period starts when this grant is approved.'}</p>
          <Button type="submit" variant="secondary" className="justify-self-start">{accountRef === undefined ? 'Review trial invitation' : 'Review A$10 trial grant'}</Button>
        </form>
      )}
      {accountRef !== undefined || codeApproved ? null : <div className="grid gap-related">
        <p>COLOSSEUM: up to 10 Accounts × A$10 (A$100 total). Redeem by 30 November 2026, Perth time. Each trial lasts 30 days from redemption.</p>
        <Button type="button" variant="secondary" className="justify-self-start" onClick={() => {
          setDraft({ environment: view.environment, recipient: { kind: 'code', code: COLOSSEUM_TRIAL_CODE,
            maxClaims: COLOSSEUM_TRIAL_MAX_CLAIMS, claimBy: COLOSSEUM_TRIAL_CLAIM_BY } })
          setOpen(true)
        }}>Review COLOSSEUM code</Button>
      </div>}
      {view.offers.length > 0 ? (
        <div className="mt-related grid gap-related">
          {accountRef === undefined ? <p className="text-sm font-medium">Latest 25 approved trials</p> : null}
          <ul className="grid gap-related">
            {view.offers.map(offer => (
              <li key={offer.offerRef} className="rounded-lg border border-border p-related text-sm">
                <p className="break-words font-medium">{offer.recipient.kind === 'email' ? offer.recipient.email
                  : offer.recipient.kind === 'account' ? offer.recipient.accountRef : `${offer.recipient.code} · ${offer.redeemedCount ?? 0}/${offer.recipient.maxClaims} redeemed`}</p>
                {offer.delivery.kind === 'queued' || offer.delivery.kind === 'sending' ? <p>Invitation delivery pending.</p>
                  : offer.delivery.kind === 'sent' ? <p>Invitation sent.</p>
                    : offer.delivery.kind === 'failed' ? <p>Email could not be sent. The approved recipient can sign in at /trial to activate.</p>
                      : offer.delivery.kind === 'unknown' ? <p>Email delivery is unconfirmed. A duplicate email will not be sent. The recipient can sign in at /trial.</p> : null}
                {offer.activation.kind === 'unclaimed' ? <p>Awaiting activation · claim by {formatTimestamp(offer.activation.claimBy, 'Australia/Perth')}</p> : (
                  <>
                    <p>{offer.booking === 'booked' ? 'A$10 credit granted.' : offer.booking === 'pending' ? 'Credit confirmation pending.' : 'Credit status unavailable.'} Expires {formatTimestamp(offer.activation.expiresAt, 'Australia/Perth')}.</p>
                    <a className="underline underline-offset-4" href={`/admin/workspaces/${encodeURIComponent(offer.activation.accountRef)}`}>Open Account</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft === null ? null : <AdminActionSheet action="issue_trial" input={draft} open={open} onOpenChange={setOpen}
        initialReasonCode="onboarding" targetRefs={[
          { label: draft.recipient.kind === 'email' ? 'Email' : draft.recipient.kind === 'code' ? 'Code' : 'Account',
            value: draft.recipient.kind === 'email' ? draft.recipient.email : draft.recipient.kind === 'account' ? draft.recipient.accountRef : draft.recipient.code },
          { label: 'Trial', value: 'A$10 credit and purchase access for 30 days from activation' },
          ...(draft.recipient.kind === 'code' ? [
            { label: 'Campaign cap', value: '10 Accounts, A$100 total' },
            { label: 'Redeem by', value: formatTimestamp(draft.recipient.claimBy, 'Australia/Perth') },
          ] : []),
          { label: 'Environment', value: draft.environment },
        ]} />}
    </AeSection>
  )
}
