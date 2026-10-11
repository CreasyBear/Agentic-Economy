import { z } from 'zod'
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

/** Runtime envelope check for port.begin: only what the hook reads, so a malformed response cannot throw mid-dispatch. */
export const accountFundingBeginEnvelopeSchema = z.union([
  z.looseObject({ kind: z.literal('outcome_unknown'), commandRef: z.string() }),
  z.looseObject({ kind: z.literal('refused') }),
  z.looseObject({ kind: z.literal('ok'), session: z.looseObject({ evidence: z.looseObject({ externalRef: z.string() }) }) }),
])
