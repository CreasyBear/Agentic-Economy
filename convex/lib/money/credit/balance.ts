import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { exactAmount, identifier } from '../../../moneyLedgerValues'
import { creditAccountResultValue, type FormanceDisplayBalanceRead } from './contracts'
export const creditAccountMoneyFactsArgs = { accountRef: identifier }


export const creditAccountMoneyFactsValue = v.object({
  autoRecharge: v.object({
    enabled: v.boolean(),
    threshold: exactAmount,
    rechargeAmount: exactAmount,
  }),
  pendingTopup: v.optional(v.object({
    commandRef: v.string(),
    amount: exactAmount,
    state: v.union(v.literal('pending'), v.literal('outcome_unknown')),
    externalRef: v.optional(v.string()),
  })),
})

type CreditAccountMoneyFacts = Infer<typeof creditAccountMoneyFactsValue>

export async function readCreditAccountMoneyFactsHandler(ctx: QueryCtx, args: { accountRef: string }): Promise<CreditAccountMoneyFacts> {
    const zero = { currency: 'AUD' as const, units: '0', exponent: 6 as const }
    const settings = await ctx.db
      .query('moneyAutoRechargeSettings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', args.accountRef))
      .unique()
    const autoRecharge = settings === null
      ? { enabled: false, threshold: zero, rechargeAmount: zero }
      : {
          enabled: settings.enabled,
          threshold: {
            currency: 'AUD' as const,
            units: settings.thresholdUnits,
            exponent: 6 as const,
          },
          rechargeAmount: {
            currency: 'AUD' as const,
            units: settings.rechargeAmountUnits,
            exponent: 6 as const,
          },
        }

    const fundingCommands = await ctx.db
      .query('moneyFundingCommands')
      .withIndex('by_accountRef_and_createdAt', (query) => query.eq('accountRef', args.accountRef))
      .order('desc')
      .take(20)
    const pendingCommand = fundingCommands.find(
      (row) => row.state === 'pending' || row.state === 'outcome_unknown',
    )
    const pendingTopup = pendingCommand === undefined
      ? undefined
      : {
          commandRef: pendingCommand.commandRef,
          amount: {
            currency: 'AUD' as const,
            units: pendingCommand.totalUnits,
            exponent: 6 as const,
          },
          state: pendingCommand.state === 'outcome_unknown' ? 'outcome_unknown' as const : 'pending' as const,
          ...(pendingCommand.externalRef === undefined
            ? {}
            : { externalRef: pendingCommand.externalRef }),
        }

    return { autoRecharge, ...(pendingTopup === undefined ? {} : { pendingTopup }) }
}

export async function readCreditAccountHandler(ctx: ActionCtx, args: { principalId: string; currency: string }): Promise<Infer<typeof creditAccountResultValue>> {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'unauthenticated' }
    if (args.principalId !== actor.canonicalAccountRef) {
      return { kind: 'refused' as const, code: 'billing_identity_mismatch' }
    }
    const balance: FormanceDisplayBalanceRead = await ctx.runAction(internal.moneyFormance.readDisplayBalance, {
      balanceKind: 'account_aud' as const,
      subjectRef: actor.canonicalAccountRef,
    })
    if (balance.kind !== 'available') return { kind: 'refused' as const, code: 'source_unavailable' }
    const moneyFacts: CreditAccountMoneyFacts = await ctx.runQuery(
      internal.moneyLedger.readCreditAccountMoneyFacts,
      { accountRef: actor.canonicalAccountRef },
    )
    return {
      kind: 'ok' as const,
      principalId: actor.canonicalAccountRef,
      accountId: actor.canonicalAccountRef,
      balance: { currency: balance.currency, units: balance.units, exponent: balance.exponent },
      autoRecharge: moneyFacts.autoRecharge,
      ...(moneyFacts.pendingTopup === undefined ? {} : { pendingTopup: moneyFacts.pendingTopup }),
      evidence: 'source' as const,
    }
}
