import { Link } from '@tanstack/react-router'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { Button } from '@/components/ui/button'
import { addExactAmounts, formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import type { AgentActivityView, AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'
import { formatTimestamp } from '@/lib/ui/format-time'
import { AeCreditTopUpPanel, type CreditTopupPort, type CreditTopupTarget } from './AeCreditTopUpPanel'

export type AeOwnerCreditProps = Readonly<{
  items: readonly AgentOperatorKeyReadback[]
  loading: boolean
  creditTopupPort?: CreditTopupPort
  onCreditRefresh?: () => void | Promise<void>
}>

export function creditTopupTargetFromItems(
  items: readonly AgentOperatorKeyReadback[],
): CreditTopupTarget | undefined {
  const item = items.find(({ account }) => account?.evidence === 'source')
  if (item?.account === undefined) return undefined
  return {
    principalId: item.principalId,
    currency: item.account.balance.currency,
    exponent: item.account.balance.exponent,
  }
}

export function creditBalanceFromItems(
  items: readonly AgentOperatorKeyReadback[],
): ExactAmount | undefined {
  const amounts = items.flatMap(({ account }) => (account === undefined ? [] : [account.balance]))
  return amounts.reduce<ExactAmount | undefined>((total, amount, index) => (
    index === 0 ? amount : total === undefined ? undefined : addExactAmounts(total, amount)
  ), undefined)
}

export function AeOwnerCredit({
  items,
  loading,
  creditTopupPort,
  onCreditRefresh,
}: AeOwnerCreditProps) {
  const balance = creditBalanceFromItems(items)
  const hasUnavailableData = items.some((item) => item.dataState === 'unavailable')
  const creditTopupTarget = creditTopupTargetFromItems(items)
  const activity = items
    .flatMap((item) => item.activity.map((entry) => ({ item, entry })))
    .sort((left, right) => right.entry.observedAt - left.entry.observedAt)

  return (
    <div className="grid gap-8">
      <section id="fund" aria-labelledby="credit-title" className="grid scroll-mt-6 gap-4">
        <div className="grid gap-1">
          <h2 id="credit-title" className="text-sm font-medium text-foreground">Balance</h2>
          <p className="text-sm text-muted-foreground">Browsing is free. Paid calls use the credit assigned to each agent.</p>
        </div>
        <AeFactList
          facts={[
            {
              label: 'Available credit',
              value: hasUnavailableData ? 'Balance unavailable' : formatCreditAmount(balance),
            },
            {
              label: 'Assignment',
              value: hasUnavailableData
                ? 'Some balance details are temporarily unavailable.'
                : 'Keep credit separate for each agent.',
              muted: true,
            },
          ]}
        />
        <AeCreditTopUpPanel
          {...(creditTopupTarget === undefined ? {} : { target: creditTopupTarget })}
          {...(creditTopupPort === undefined ? {} : { port: creditTopupPort })}
          {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
        />
      </section>

      <section aria-labelledby="ledger-title" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="ledger-title" className="text-sm font-medium text-foreground">Recent charges</h2>
          <p className="text-sm text-muted-foreground">Calls and credit changes for each agent. Open Calls for the full table.</p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading recent charges…</p>
        ) : hasUnavailableData ? (
          <p className="text-sm text-muted-foreground">Some charge details are temporarily unavailable.</p>
        ) : activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No charges yet. Browsing does not create paid-call charges.</p>
        ) : (
          <ol className="m-0 list-none divide-y divide-border border-y border-border p-0">
            {activity.map(({ item, entry }) => (
              <CreditActivityRow key={entry.activityRef} item={item} entry={entry} />
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function CreditActivityRow({
  item,
  entry,
}: Readonly<{ item: AgentOperatorKeyReadback; entry: AgentActivityView }>) {
  return (
    <li className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid gap-1">
        <p className="font-medium text-foreground">{entry.operation?.label ?? activityLabel(entry)}</p>
        {entry.operation === undefined ? null : (
          <p className="text-sm text-muted-foreground">{entry.operation.supplier} · {activityLabel(entry)}</p>
        )}
        <p className="text-sm text-muted-foreground">{item.key.name} · {formatTimestamp(entry.observedAt)}</p>
        <Button asChild variant="link" className="h-auto min-h-0 w-fit px-0">
          <Link
            to="/operations/invocations/$invocationRef"
            params={{ invocationRef: entry.invocationRef }}
          >
            View receipt
          </Link>
        </Button>
      </div>
      <p className="font-medium tabular-nums text-foreground">{formatCreditAmount(entry.grossAmount)}</p>
    </li>
  )
}

function activityLabel(entry: AgentActivityView): string {
  switch (entry.chargeState) {
    case 'free_tier':
      return 'Free call'
    case 'paid':
      return 'Paid call'
    case 'refunded':
      return 'Refunded call'
    case 'outcome_unknown':
      return 'Paid call needs checking'
    case 'insufficient_credit':
      return 'Call declined for insufficient credit'
    default: {
      const exhaustive: never = entry.chargeState
      return exhaustive
    }
  }
}

function formatCreditAmount(amount: ExactAmount | undefined): string {
  return amount === undefined ? '—' : formatCurrencyAmount(amount)
}
