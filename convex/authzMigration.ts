import { v } from 'convex/values'

import { internalMutation } from './_generated/server'

const DEFAULT_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 500

export const backfillAdminMembershipTokenIdentifiers = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    patched: v.number(),
    isDone: v.boolean(),
    continueCursor: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const issuer = requiredEnv('CLERK_JWT_ISSUER_DOMAIN')
    const page = await ctx.db.query('adminMemberships').paginate({
      numItems: normalizeBatchSize(args.batchSize),
      cursor: args.cursor ?? null,
    })

    let patched = 0
    for (const row of page.page) {
      if (row.tokenIdentifier !== undefined) {
        continue
      }
      await ctx.db.patch(row._id, {
        tokenIdentifier: `${issuer}|${row.clerkUserId}`,
      })
      patched += 1
    }


    return {
      scanned: page.page.length,
      patched,
      isDone: page.isDone,
      ...(page.isDone ? {} : { continueCursor: page.continueCursor }),
    }
  },
})

function normalizeBatchSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE
  }
  return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(value)))
}

function requiredEnv(name: string): string {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  throw new Error(`${name} is required for admin membership tokenIdentifier backfill`)
}
