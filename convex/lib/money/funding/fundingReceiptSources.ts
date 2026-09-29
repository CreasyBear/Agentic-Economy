import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'

export const resolveFundingReceiptSourcesArgs = {
  accountRef: v.string(),
  transactionRefs: v.array(v.string()),
} as const

export const resolveFundingReceiptSourcesResult = v.array(v.union(v.string(), v.null()))

/** A settled funding command links to its receipt only when the Formance reference is unique. */
export async function resolveFundingReceiptSourcesHandler(
  ctx: QueryCtx,
  args: { accountRef: string; transactionRefs: string[] },
): Promise<Array<string | null>> {
  const sources: Array<string | null> = []
  for (const transactionRef of args.transactionRefs) {
    const matches = await ctx.db.query('moneyFundingCommands')
      .withIndex('by_appliedTransactionRef', (query) => query.eq('appliedTransactionRef', transactionRef))
      .take(2)
    const command = matches.length === 1 ? matches[0] : undefined
    sources.push(command !== undefined
      && command.accountRef === args.accountRef
      && command.state === 'succeeded'
      ? command.commandRef
      : null)
  }
  return sources
}

