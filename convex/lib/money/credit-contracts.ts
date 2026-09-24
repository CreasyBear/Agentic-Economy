import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { exactAmount, identifier } from '../../moneyLedgerValues'

export const creditAccountArgs = { principalId: identifier, currency: identifier }
export const creditActivityArgs = {
  principalId: identifier,
  credentialId: identifier,
  currency: identifier,
  paginationOpts: paginationOptsValidator,
}
export const keyUsageArgs = {
  principalId: identifier,
  credentialId: identifier,
  currency: identifier,
}

const creditRefusalValue = v.object({ kind: v.literal('refused'), code: v.string() })
const creditRefusalWithItemsValue = v.object({
  kind: v.literal('refused'),
  code: v.string(),
  items: v.array(v.string()),
})
const chargeStateValue = v.union(
  v.literal('free_tier'),
  v.literal('paid'),
  v.literal('insufficient_credit'),
  v.literal('outcome_unknown'),
  v.literal('refunded'),
)
export const creditAccountResultValue = v.union(
  v.object({
    kind: v.literal('ok'),
    principalId: v.string(),
    accountId: v.string(),
    balance: exactAmount,
    pendingTopup: v.optional(v.object({
      commandRef: v.string(),
      amount: exactAmount,
      state: v.union(v.literal('pending'), v.literal('outcome_unknown')),
      externalRef: v.optional(v.string()),
    })),
    autoRecharge: v.object({
      enabled: v.boolean(),
      threshold: exactAmount,
      rechargeAmount: exactAmount,
    }),
    evidence: v.literal('source'),
  }),
  creditRefusalValue,
)
export const creditActivityResultValue = v.union(
  v.object({
    kind: v.literal('ok'),
    page: v.array(v.object({
      activityRef: v.string(),
      credentialId: v.string(),
      serviceRef: v.string(),
      offeringRef: v.string(),
      businessId: v.string(),
      operationKey: v.string(),
      callRef: v.string(),
      attemptRef: v.string(),
      grossAmount: exactAmount,
      chargeState: chargeStateValue,
      priceDigest: v.string(),
      observedAt: v.number(),
      transactionRef: v.optional(v.string()),
    })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  creditRefusalWithItemsValue,
)
export const keyUsageResultValue = v.union(
  v.object({
    kind: v.literal('ok'),
    credentialId: v.string(),
    callCount: v.number(),
    paidCallCount: v.number(),
    freeCallCount: v.number(),
    grossSpend: exactAmount,
    states: v.array(chargeStateValue),
  }),
  creditRefusalWithItemsValue,
)

// Explicit return types on the Formance reads avoid `internal` aggregation
// cycling through this module's RPC registrations during inference.
export type FormanceDisplayBalanceRead = Readonly<
  | { kind: 'available'; currency: 'AUD' | 'USDC'; exponent: 6; units: string }
  | { kind: 'setup_required' | 'unavailable' }
>
export type FormanceStatementPageRead = Readonly<
  | { kind: 'available'; transactionRefs: readonly string[]; exactAmountUnits: string; continueCursor: string; isDone: boolean }
  | { kind: 'setup_required' | 'unavailable' }
>
export type FormancePeriodSpendRead = Readonly<
  | { kind: 'available'; spendUnits: string }
  | { kind: 'empty' }
  | { kind: 'setup_required' | 'unavailable' }
>

