import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { CustomerRequestAgentKeyInventoryItem } from '@/modules/customer-request/agent-access'
import { addExactAmounts, type ExactAmount } from '@/modules/money/public'
import type { CreditAccountView, CreditActivityView, KeyUsageView } from '@/modules/money/public'

import { formatTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount } from '@/modules/money/public'
import { AeCreditTopUpPanel } from './AeCreditTopUpPanel'

export type AgentOperatorKeyReadback = Readonly<{
  key: CustomerRequestAgentKeyInventoryItem
  principalId: string
  account?: CreditAccountView
  activity: readonly CreditActivityView[]
  usage?: KeyUsageView
  dataState: 'source' | 'empty' | 'unavailable'
}>

export type AeAgentOperatorConsoleProps = Readonly<{
  items: readonly AgentOperatorKeyReadback[]
  loading: boolean
  onRevoke: (keyId: string) => void
  revokingKeyId?: string
}>

export function AeAgentOperatorConsole({ items, loading, onRevoke, revokingKeyId }: AeAgentOperatorConsoleProps) {
  const balanceAmounts = items.flatMap(({ account }) => account === undefined ? [] : [account.balance])
  const balance = balanceAmounts.reduce<ExactAmount | undefined>((total, amount, index) => (
    index === 0 ? amount : total === undefined ? undefined : addExactAmounts(total, amount)
  ), undefined)
  const activity = items.flatMap((item) => item.activity.map((entry) => ({ item, entry }))).sort((left, right) => right.entry.observedAt - left.entry.observedAt)
  const hasUnavailableData = items.some((item) => item.dataState === 'unavailable')

  return (
    <div className="grid gap-6">
      <section aria-labelledby="credit-title" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="credit-title" className="text-2xl font-semibold tracking-tight text-foreground">Check your balance</h2>
          <p className="block text-muted-foreground">Browsing is free. Paid calls use the credit assigned to each assistant.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="border border-border bg-card">
            <CardContent className="grid gap-2">
              <p className="text-sm font-semibold text-muted-foreground">AVAILABLE CREDIT</p>
              <p className="text-lg font-semibold text-foreground">{hasUnavailableData ? 'Balance unavailable' : formatAmount(balance)}</p>
              <p className="text-sm text-muted-foreground">{hasUnavailableData ? 'Some balance details are temporarily unavailable.' : 'Keep credit separate for each assistant.'}</p>
            </CardContent>
          </Card>
          <AeCreditTopUpPanel />
        </div>
      </section>

      <section aria-labelledby="ledger-title" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="ledger-title" className="text-2xl font-semibold tracking-tight text-foreground">Review recent activity</h2>
          <p className="block text-muted-foreground">See calls and credit changes for each assistant.</p>
        </div>
        {loading ? (
          <Card>
            <CardContent>
              <p className="text-muted-foreground">Loading recent activity…</p>
            </CardContent>
          </Card>
        ) : hasUnavailableData ? (
          <Card className="border border-border bg-card">
            <CardContent className="grid gap-2">
              <p className="font-semibold text-foreground">Activity unavailable</p>
              <p className="text-muted-foreground">Some call details are temporarily unavailable.</p>
            </CardContent>
          </Card>
        ) : activity.length === 0 ? (
          <Card className="border border-border bg-card">
            <CardContent className="grid gap-2">
              <p className="font-semibold text-foreground">No calls yet</p>
              <p className="text-muted-foreground">Browsing does not create paid-call charges.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border border-border bg-card">
            <CardContent className="p-0">
              <ol className="m-0 list-none divide-y divide-border p-0">
                {activity.map(({ item, entry }) => <ActivityRow key={entry.activityRef} item={item} entry={entry} />)}
              </ol>
            </CardContent>
          </Card>
        )}
      </section>

      <section aria-labelledby="keys-title" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="keys-title" className="text-2xl font-semibold tracking-tight text-foreground">Manage assistant access</h2>
          <p className="block text-muted-foreground">Review what each assistant can do, its usage, and spend. Revoked or expired access stays visible.</p>
        </div>
        {loading ? <p className="text-muted-foreground">Loading assistant access…</p> : items.length === 0 ? (
          <Card className="border border-border bg-card">
            <CardContent>
              <p className="text-muted-foreground">No assistant is connected yet. Start setup from your assistant and approve the request to create access you can revoke.</p>
            </CardContent>
          </Card>
        ) : items.map((item) => <KeyCard key={item.key.keyId} item={item} revoking={revokingKeyId === item.key.keyId} disabled={revokingKeyId !== undefined} onRevoke={onRevoke} />)}
      </section>
    </div>
  )
}

function ActivityRow({ item, entry }: Readonly<{ item: AgentOperatorKeyReadback; entry: CreditActivityView }>) {
  return (
    <li className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid gap-1">
        <p className="font-semibold text-foreground">{activityLabel(entry)}</p>
        <p className="text-sm text-muted-foreground">{item.key.name} · {formatTimestamp(entry.observedAt)}</p>
      </div>
      <p className="font-semibold text-foreground">{formatAmount(entry.grossAmount)}</p>
    </li>
  )
}

function KeyCard({ item, revoking, disabled, onRevoke }: Readonly<{ item: AgentOperatorKeyReadback; revoking: boolean; disabled: boolean; onRevoke: (keyId: string) => void }>) {
  const usage = item.usage
  const accountBalance = item.account?.balance
  const zeroBalance = accountBalance === undefined ? undefined : { ...accountBalance, units: '0' }
  const status = item.key.revoked ? 'Revoked' : item.key.expired ? 'Expired' : 'Connected'
  return (
    <Card className="border border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle>{item.key.name}</CardTitle>
        <Badge variant={item.key.revoked || item.key.expired ? 'outline' : 'default'}>{status}</Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 sm:grid-cols-4">
          <Metric label="Calls" value={String(usage?.callCount ?? 0)} />
          <Metric label="Free calls" value={String(usage?.freeCallCount ?? 0)} />
          <Metric label="Paid calls" value={String(usage?.paidCallCount ?? 0)} />
          <Metric label="Spend" value={formatAmount(usage?.grossSpend ?? zeroBalance)} />
        </dl>
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">What this assistant can do: {scopeLabel(item.key.authorityMode)}.</p>
          <p className="text-sm text-muted-foreground">Usage and balance: {dataLabel(item.dataState)}.</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          variant="secondary"
          disabled={disabled || item.key.revoked}
          onClick={() => onRevoke(item.key.keyId)}
          className="min-h-11"
        >
          {revoking ? 'Revoking access…' : 'Revoke access now'}
        </Button>
      </CardFooter>
    </Card>
  )
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="m-0 text-foreground">{value}</dd>
    </div>
  )
}

function activityLabel(entry: CreditActivityView): string {
  if (entry.chargeState === 'free_tier') return 'Free call'
  if (entry.chargeState === 'paid') return 'Paid call'
  if (entry.chargeState === 'refunded') return 'Refunded call'
  if (entry.chargeState === 'outcome_unknown') return 'Paid call needs checking'
  return 'Call declined for insufficient credit'
}

function scopeLabel(mode: CustomerRequestAgentKeyInventoryItem['authorityMode']): string {
  if (mode === 'inspect_only') return 'Browse and compare businesses'
  if (mode === 'approve_each') return 'Bring each request to you for approval'
  if (mode === 'bounded_mandate') return 'Work within the limits you set'
  return 'Carry out approved work on your behalf'
}

function dataLabel(state: AgentOperatorKeyReadback['dataState']): string {
  if (state === 'source') return 'Usage details are available'
  if (state === 'empty') return 'No usage yet'
  return 'Usage details are temporarily unavailable'
}

function formatAmount(amount: ExactAmount | undefined): string {
  return amount === undefined ? '—' : formatCurrencyAmount(amount)
}
