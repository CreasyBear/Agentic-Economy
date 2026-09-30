import { v, type Infer } from 'convex/values'
import { env } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { ActionCtx, QueryCtx } from '../../../_generated/server'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { accountCreditBalanceValue, eligiblePromotionalGrantValue, type AccountCreditBalance } from '@/modules/money/public'

export const readAccountCreditBalanceArgs = { accountRef: v.string() }
export const readAccountCreditBalanceResult = accountCreditBalanceValue
export const readEligiblePromotionalGrantsArgs = { accountRef: v.string() }
export const readEligiblePromotionalGrantsResult = v.union(
  v.object({ kind: v.literal('available'), grants: v.array(eligiblePromotionalGrantValue) }),
  v.object({ kind: v.literal('unavailable'), code: v.string() }),
)

type EligibleResult = Infer<typeof readEligiblePromotionalGrantsResult>

/** A bounded snapshot; overflow or malformed money fails closed. */
export async function readEligiblePromotionalGrantsHandler(
  ctx: QueryCtx, args: { accountRef: string },
): Promise<EligibleResult> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined || args.accountRef.length === 0) {
    return { kind: 'unavailable', code: 'promotional_balance_environment_unavailable' }
  }
  const now = Date.now()
  const rows = await ctx.db.query('moneyPromotionalGrants')
    .withIndex('by_accountRef_and_environment_and_expiresAt', q => q
      .eq('accountRef', args.accountRef).eq('environment', environment).gt('expiresAt', now))
    .take(1_001)
  if (rows.length > 1_000) return { kind: 'unavailable', code: 'promotional_balance_scan_limit' }
  const grants: { grantRef: string; availableUnits: string; expiresAt: number }[] = []
  for (const row of rows) {
    if (row.bookingState !== 'booked') continue
    if (!/^(?:0|[1-9]\d{0,15})$/u.test(row.availableUnits)
      || BigInt(row.availableUnits) > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { kind: 'unavailable', code: 'promotional_balance_amount_invalid' }
    }
    if (row.availableUnits === '0') continue
    if (grants.length >= 100) return { kind: 'unavailable', code: 'promotional_balance_grant_limit' }
    grants.push({ grantRef: row.grantRef, availableUnits: row.availableUnits, expiresAt: row.expiresAt })
  }
  return { kind: 'available', grants }
}

export async function readAccountCreditBalanceHandler(
  ctx: ActionCtx, args: { accountRef: string },
): Promise<AccountCreditBalance> {
  const eligible: EligibleResult = await ctx.runQuery(internal.moneyAccountCreditBalance.readEligible, args)
  if (eligible.kind !== 'available') return eligible
  const balance: AccountCreditBalance = await ctx.runAction(internal.moneyFormance.readCreditBalance, {
    accountRef: args.accountRef, grants: eligible.grants,
  })
  return balance
}
