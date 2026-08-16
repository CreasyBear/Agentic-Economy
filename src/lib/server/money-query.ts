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
  | { kind: 'ok'; page: readonly CreditActivityView[]; isDone: boolean; continueCursor: string }
  | { kind: 'refused'; code: string; items: readonly [] }
>
type KeyUsageSourceResult = Readonly<
  | ({ kind: 'ok' } & KeyUsageView)
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
        accountId: result.accountId,
        balance: result.balance,
        ...(result.pendingTopup === undefined ? {} : { pendingTopup: result.pendingTopup }),
        autoRecharge: {
          enabled: result.autoRecharge.enabled,
          threshold: result.autoRecharge.threshold,
          rechargeAmount: result.autoRecharge.rechargeAmount,
        },
        evidence: result.evidence,
      }
    },
    listCreditActivity: async (query) => {
      const result = await callSourceQuery(listCreditActivityQuery, query)
      if (result.kind !== 'ok') throw new MoneyQueryError(result.code)
      return {
        page: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      }
    },
    readKeyUsage: async (query) => {
      const result = await callSourceQuery(readKeyUsageQuery, query)
      if (result.kind !== 'ok') throw new MoneyQueryError(result.code)
      return {
        credentialId: result.credentialId,
        callCount: result.callCount,
        paidCallCount: result.paidCallCount,
        freeCallCount: result.freeCallCount,
        grossSpend: result.grossSpend,
        states: result.states,
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


