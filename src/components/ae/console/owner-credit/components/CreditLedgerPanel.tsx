import { BillingHistory } from '@/components/ae/shared/arc-pro/billing-overview/billing-overview'
import { AccountHistory } from '@/components/ae/console/AeAccountHistoryTable'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { AeOwnerCreditProps } from '../owner-credit.contracts'

export type CreditLedgerPanelProps = Pick<
  AeOwnerCreditProps,
  'accountHistory' | 'accountHistoryPort' | 'historyLoading' | 'unavailable' | 'onCreditRefresh'
>

export function CreditLedgerPanel({
  accountHistory,
  accountHistoryPort,
  historyLoading = false,
  unavailable = {},
  onCreditRefresh,
}: CreditLedgerPanelProps) {
  return (
    <div id="ledger"><BillingHistory
      title="Credit history"
      description="Booked Account transactions are shown once by transaction identity, newest recorded transaction first."
    >
      <AccountHistory
        key={canonicalDigest(accountHistory ?? { kind: 'missing' })}
        {...(accountHistory === undefined ? {} : { result: accountHistory })}
        {...(accountHistoryPort === undefined ? {} : { port: accountHistoryPort })}
        loading={historyLoading}
        unavailable={unavailable.history === true}
        {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
      />
    </BillingHistory></div>
  )
}
