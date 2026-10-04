import { callSourceAction, sourceAction } from '@/lib/server/convex-source'
import type {
  CreditAccountQuery,
  CreditAccountView,
  CreditActivityQuery,
  CreditActivityPage,
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
  | ({ kind: 'ok' } & CreditActivityPage)
  | { kind: 'refused'; code: string; items: readonly [] }
>
type KeyUsageSourceResult = Readonly<
  | ({ kind: 'ok' } & KeyUsageView)
  | { kind: 'refused'; code: string; items: readonly [] }
>

const readCreditAccountAction = sourceAction<CreditAccountQuery, CreditAccountSourceResult>('moneyLedger:readCreditAccount')
const listCreditActivityAction = sourceAction<CreditActivityQuery, CreditActivitySourceResult>('moneyLedger:listCreditActivity')
const readKeyUsageAction = sourceAction<KeyUsageQuery, KeyUsageSourceResult>('moneyLedger:readKeyUsage')

export function createConvexMoneyQueryPort(): MoneyQueryPort {
  return {
    readCreditAccount: async (query) => {
      const result = await callSourceAction(readCreditAccountAction, query)
      if (result.kind !== 'ok') throw new MoneyQueryError(result.code)
      return {
        principalId: result.principalId,
        accountId: result.accountId,
        balance: result.balance,
        ...(result.purchasedBalance === undefined ? {} : { purchasedBalance: result.purchasedBalance }),
        ...(result.promotionalBalance === undefined ? {} : { promotionalBalance: result.promotionalBalance }),
        ...(result.nextPromotionalExpiryAt === undefined ? {} : { nextPromotionalExpiryAt: result.nextPromotionalExpiryAt }),
        ...(result.pendingTopup === undefined ? {} : {
          pendingTopup: {
            commandRef: result.pendingTopup.commandRef,
            amount: result.pendingTopup.amount,
            state: result.pendingTopup.state,
            ...(result.pendingTopup.externalRef === undefined
              ? {}
              : { externalRef: result.pendingTopup.externalRef }),
          },
        }),
        evidence: result.evidence,
      }
    },
    listCreditActivity: async (query) => {
      const result = await callSourceAction(listCreditActivityAction, query)
      if (result.kind !== 'ok') throw new MoneyQueryError(result.code)
      return {
        page: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
        ...(result.periodStartAt===undefined?{}:{periodStartAt:result.periodStartAt}),
        ...(result.periodEndAt===undefined?{}:{periodEndAt:result.periodEndAt}),
        ...(result.snapshotAt===undefined?{}:{snapshotAt:result.snapshotAt}),
        ...(result.timeBasis===undefined?{}:{timeBasis:result.timeBasis}),
        ...(result.coverage===undefined?{}:{coverage:result.coverage}),
        ...(result.source===undefined?{}:{source:result.source}),
      }
    },
    readKeyUsage: async (query) => {
      const result = await callSourceAction(readKeyUsageAction, query)
      if (result.kind !== 'ok') throw new MoneyQueryError(result.code)
      return {
        credentialId: result.credentialId,
        callCount: result.callCount,
        paidCallCount: result.paidCallCount,
        freeCallCount: result.freeCallCount,
        grossSpend: result.grossSpend,
        states: result.states,
        ...(result.refundUnits===undefined?{}:{refundUnits:result.refundUnits}),
        ...(result.netChargeUnits===undefined?{}:{netChargeUnits:result.netChargeUnits}),
        ...(result.promotionalUseUnits===undefined?{}:{promotionalUseUnits:result.promotionalUseUnits}),
        ...(result.promotionalRefundUnits===undefined?{}:{promotionalRefundUnits:result.promotionalRefundUnits}),
        ...(result.periodStartAt===undefined?{}:{periodStartAt:result.periodStartAt}),
        ...(result.periodEndAt===undefined?{}:{periodEndAt:result.periodEndAt}),
        ...(result.snapshotAt===undefined?{}:{snapshotAt:result.snapshotAt}),
        ...(result.countTimeBasis===undefined?{}:{countTimeBasis:result.countTimeBasis}),
        ...(result.spendTimeBasis===undefined?{}:{spendTimeBasis:result.spendTimeBasis}),
        ...(result.coverage===undefined?{}:{coverage:result.coverage}),
        ...(result.source===undefined?{}:{source:result.source}),
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
