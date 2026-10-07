import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from './AdminActionSheet'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import type { AdminActionInput } from '@/lib/operator/admin-console/contracts'

export function AdminTrialAccess({ accountRef }: { accountRef?: string }) {
  const view = useQuery(api.trialAccess.readAdmin, accountRef === undefined ? {} : { accountRef })
  const [email, setEmail] = useState('')
  const [draft, setDraft] = useState<AdminActionInput['issue_trial'] | null>(null)
  const [open, setOpen] = useState(false)
  if (view === undefined || view.kind === 'refused') return null
  const alreadyGranted = accountRef !== undefined && view.offers.length > 0
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
      {view.offers.length > 0 ? (
        <div className="mt-related grid gap-related">
          {accountRef === undefined ? <p className="text-sm font-medium">Latest 25 approved trials</p> : null}
          <ul className="grid gap-related">
            {view.offers.map(offer => (
              <li key={offer.offerRef} className="rounded-card border border-border p-related text-sm">
                <p className="break-words font-medium">{offer.recipient.kind === 'email' ? offer.recipient.email : offer.recipient.accountRef}</p>
                {offer.delivery.kind === 'queued' || offer.delivery.kind === 'sending' ? <p>Invitation delivery pending.</p>
                  : offer.delivery.kind === 'sent' ? <p>Invitation sent.</p>
                    : offer.delivery.kind === 'failed' ? <p>Email could not be sent. The approved recipient can sign in at /trial to activate.</p>
                      : offer.delivery.kind === 'unknown' ? <p>Email delivery is unconfirmed. A duplicate email will not be sent. The recipient can sign in at /trial.</p> : null}
                {offer.activation.kind === 'unclaimed' ? <p>Awaiting activation · claim by {formatPerthTimestamp(offer.activation.claimBy)}</p> : (
                  <>
                    <p>{offer.booking === 'booked' ? 'A$10 credit granted.' : offer.booking === 'pending' ? 'Credit confirmation pending.' : 'Credit status unavailable.'} Expires {formatPerthTimestamp(offer.activation.expiresAt)}.</p>
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
          { label: draft.recipient.kind === 'email' ? 'Email' : 'Account', value: draft.recipient.kind === 'email' ? draft.recipient.email : draft.recipient.accountRef },
          { label: 'Trial', value: 'A$10 credit and purchase access for 30 days from activation' },
          { label: 'Environment', value: draft.environment },
        ]} />}
    </AeSection>
  )
}
