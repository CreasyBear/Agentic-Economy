import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { formatCurrencyAmount } from '@/modules/money/public'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'

export function AeSupplyEarningsCard({ readback }: Readonly<{ readback: OwnerProviderEarningsReadback }>) {
  return (
    <Card>
      <CardHeader className="p-5 pb-0">
        <CardTitle>
          <h3 className="text-lg font-semibold text-foreground">Earnings</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        {readback.kind === 'error' ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{readback.code === 'unauthenticated' ? 'Earnings are unavailable for this session.' : 'Earnings source is unavailable.'}</EmptyTitle>
              <EmptyDescription>{readback.code === 'unauthenticated' ? 'An authenticated owner session is required to read provider earnings.' : 'We could not read source earnings and payout data. Try again later.'}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : readback.kind === 'not_found' ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No earnings have been recorded.</EmptyTitle>
              <EmptyDescription>This owner does not have a business with a provider-earnings account yet. Setup or test calls do not create earnings.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : readback.accounts.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No earnings have been recorded.</EmptyTitle>
              <EmptyDescription>No provider-earnings money account exists for this business yet. Setup or test calls do not create earnings.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4">
            {readback.accounts.map((account) => (
              <section key={account.currency} className="grid gap-4 rounded-md border border-border p-4">
                <div className="grid gap-1">
                  <h4 className="font-semibold text-foreground">{account.currency} earnings</h4>
                  <p className="text-sm text-muted-foreground">Source-recorded provider earnings and payout state.</p>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="grid gap-1">
                    <dt className="text-sm font-medium text-muted-foreground">Gross accrued</dt>
                    <dd className="m-0 text-foreground">{formatCurrencyAmount(account.earnings.grossAccrual)}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-sm font-medium text-muted-foreground">AE fee / rake</dt>
                    <dd className="m-0 text-foreground">{formatCurrencyAmount(account.earnings.rake)}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-sm font-medium text-muted-foreground">Provider net</dt>
                    <dd className="m-0 text-foreground">{formatCurrencyAmount(account.earnings.providerNet)}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-sm font-medium text-muted-foreground">Paid out</dt>
                    <dd className="m-0 text-foreground">{formatCurrencyAmount(account.earnings.paidOut)}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-sm font-medium text-muted-foreground">Held</dt>
                    <dd className="m-0 text-foreground">{formatCurrencyAmount(account.earnings.held)}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-sm font-medium text-muted-foreground">Minimum payout</dt>
                    <dd className="m-0 text-foreground">{formatCurrencyAmount(account.payout.minimumPayout)}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-sm font-medium text-muted-foreground">Payout account</dt>
                    <dd className="m-0 text-foreground">{payoutAccountLabel(account.payout.accountState)}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-sm font-medium text-muted-foreground">Payout state</dt>
                    <dd className="m-0 text-foreground">{payoutStateLabel(account.payout.payoutState)}</dd>
                  </div>
                </dl>
                {account.earnings.truncated ? <p className="text-sm text-muted-foreground">The source ledger read was capped at the latest 100 entries for this currency; totals may be incomplete.</p> : null}
              </section>
            ))}
            {readback.accountsTruncated ? <p className="text-sm text-muted-foreground">Only the first 10 provider-earnings currencies are shown.</p> : null}
            <p className="text-sm text-muted-foreground">Setup or test calls do not create earnings. Earnings appear only when source money records provider accruals.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function payoutAccountLabel(state: string): string {
  return state === 'missing' ? 'Not set up' : state.replaceAll('_', ' ')
}

function payoutStateLabel(state: string | undefined): string {
  return state === undefined ? 'No payout recorded' : state.replaceAll('_', ' ')
}
