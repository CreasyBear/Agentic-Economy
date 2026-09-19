import type {
  AccountFundingBeginInput,
  AccountFundingReadInput,
  AccountFundingStartResult,
} from './internal/account-funding-http'
import type { CreditPaymentSession } from './internal/ports'
import type { MoneyRefusal } from './public'

export type AccountFundingPort = Readonly<{
  begin: (input: AccountFundingBeginInput) => Promise<AccountFundingStartResult>
  read: (input: AccountFundingReadInput) => Promise<CreditPaymentSession | MoneyRefusal>
}>
