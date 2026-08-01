import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import type {
  CreditAccountQuery,
  CreditAccountView,
  CreditActivityQuery,
  CreditActivityView,
  KeyUsageQuery,
  KeyUsageView,
  MoneyQueryPort,
} from '@/modules/money/public'

export class MoneyQueryError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'MoneyQueryError'
    this.code = code
  }
}

type CreditAccountSourceResult = Readonly<
  | ({ kind: 'ok' } & CreditAccountView)
  | { kind: 'refused'; code: string }
>
type CreditActivitySourceResult = Readonly<
  | { kind: 'ok'; items: readonly CreditActivityView[]; nextCursor?: string }
  | { kind: 'refused'; code: string; items: readonly [] }
>
type KeyUsageSourceResult = Readonly<
  | { kind: 'ok'; items: readonly KeyUsageView[]; nextCursor?: string }
  | { kind: 'refused'; code: string; items: readonly [] }
>

const readCreditAccountQuery = sourceQuery<CreditAccountQuery, CreditAccountSourceResult>('moneyLedger:readCreditAccount')
const listCreditActivityQuery = sourceQuery<CreditActivityQuery, CreditActivitySourceResult>('moneyLedger:listCreditActivity')
const readKeyUsageQuery = sourceQuery<KeyUsageQuery, KeyUsageSourceResult>('moneyLedger:readKeyUsage')

export function createConvexMoneyQueryPort(): MoneyQueryPort {
  return {
    readCreditAccount: async (query) => {
      const result = await callSourceQuery(readCreditAccountQuery, query)
      if (result.kind !== 'ok') throw new MoneyQueryError(result.code)
      return {
        principalId: result.principalId,
        currency: result.currency,
        balanceMinor: result.balanceMinor,
        ...(result.pendingTopup === undefined ? {} : { pendingTopup: result.pendingTopup }),
        autoRecharge: {
          enabled: result.autoRecharge.enabled,
          thresholdMinor: result.autoRecharge.thresholdMinor,
          rechargeAmountMinor: result.autoRecharge.rechargeAmountMinor,
        },
        evidence: result.evidence,
      }
    },
    listCreditActivity: async (query) => {
      const result = await callSourceQuery(listCreditActivityQuery, query)
      if (result.kind !== 'ok') throw new MoneyQueryError(result.code)
      return {
        items: result.items,
        ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
      }
    },
    readKeyUsage: async (query) => {
      const result = await callSourceQuery(readKeyUsageQuery, query)
      if (result.kind !== 'ok') throw new MoneyQueryError(result.code)
      return {
        items: result.items,
        ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
      }
    },
    readProviderEarnings: async () => {
      throw new MoneyQueryError('unsupported_console_query')
    },
    readPayoutStatus: async () => {
      throw new MoneyQueryError('unsupported_console_query')
    },
  }
}


