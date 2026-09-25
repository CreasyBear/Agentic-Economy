import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'

export function chatThreadBelongsToPrincipal(
  row: Doc<'chatThreads'>,
  accountRef: string,
  kind: 'agent_key' | 'clerk_owner',
  principalRef: string,
): boolean {
  return row.ownerId === accountRef
    && (row.principalKind ?? 'clerk_owner') === kind
    && (row.principalRef ?? row.ownerId) === (row.principalKind === undefined ? accountRef : principalRef)
}

export async function readPrincipalChatThread(
  ctx: Pick<QueryCtx, 'db'>,
  threadId: string,
  accountRef: string,
  kind: 'agent_key' | 'clerk_owner',
  principalRef: string,
): Promise<Doc<'chatThreads'>> {
  const row = await ctx.db.query('chatThreads')
    .withIndex('by_threadId', (index) => index.eq('threadId', threadId))
    .unique()
  if (row === null || !chatThreadBelongsToPrincipal(row, accountRef, kind, principalRef)) {
    throw new Error('thread_not_found')
  }
  return row
}

/** Native money mutations must read this active-prompt fence in their own transaction. */
export async function activeChatTurnForMoney(
  ctx: Pick<QueryCtx, 'db'>,
  turn: Doc<'chatTurns'>,
): Promise<boolean> {
  if (turn.state !== 'working' || turn.cancelRequestedAt !== undefined
    || turn.threadId === undefined || turn.promptMessageId === undefined) return false
  const threadId = turn.threadId
  const thread = await ctx.db.query('chatThreads')
    .withIndex('by_threadId', q => q.eq('threadId', threadId)).unique()
  return thread !== null
    && chatThreadBelongsToPrincipal(thread, turn.accountRef, turn.principalKind, turn.principalRef)
    && thread.activePromptMessageId === turn.promptMessageId
}
