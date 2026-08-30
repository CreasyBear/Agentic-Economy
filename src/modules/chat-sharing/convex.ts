import type { WithoutSystemFields } from 'convex/server'

import type { Doc } from '../../../convex/_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../convex/_generated/server'

/**
 * Owner seam for the chatThreadShares durable table.
 *
 * Convex hosts (adapters) register queries/mutations and compose these helpers;
 * neither a host nor another feature module touches the table directly.
 */
export async function findChatThreadShareByThread(
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  threadId: string,
): Promise<Doc<'chatThreadShares'> | null> {
  return await ctx.db
    .query('chatThreadShares')
    .withIndex('by_threadId', (index) => index.eq('threadId', threadId))
    .unique()
}

export async function findChatThreadShareByAccessId(
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  accessId: string,
): Promise<Doc<'chatThreadShares'> | null> {
  return await ctx.db
    .query('chatThreadShares')
    .withIndex('by_accessId', (index) => index.eq('accessId', accessId))
    .unique()
}

/**
 * Insert-or-replace keyed by thread id: first write inserts, later writes
 * replace the same document so the stored row identity never churns.
 */
export async function writeChatThreadShare(
  ctx: Pick<MutationCtx, 'db'>,
  share: WithoutSystemFields<Doc<'chatThreadShares'>>,
): Promise<void> {
  const existing = await ctx.db
    .query('chatThreadShares')
    .withIndex('by_threadId', (index) => index.eq('threadId', share.threadId))
    .unique()
  if (existing === null) {
    await ctx.db.insert('chatThreadShares', share)
  } else {
    await ctx.db.replace(existing._id, share)
  }
}

export async function deleteChatThreadShares(
  ctx: Pick<MutationCtx, 'db'>,
  threadId: string,
): Promise<void> {
  for await (const share of ctx.db
    .query('chatThreadShares')
    .withIndex('by_threadId', (index) => index.eq('threadId', threadId))) {
    await ctx.db.delete(share._id)
  }
}
