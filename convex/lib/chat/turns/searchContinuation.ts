import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { sanitizeChatToolString } from '@/modules/chat/search-presentation'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { chatThreadBelongsToPrincipal, readPrincipalChatThread } from '../threads/ownership'
import type { TurnActor } from '../threads/listing'

/** Only the issuing thread knows this key; the card receives a signed reference, never a native cursor. */
function signedToken(key: string, turnRef: string, query: string, cursor: string, inputJson: string): string {
  const digest = canonicalDigest({ scope: 'chat-search-continuation:v1', turnRef, query, cursor, inputJson })
  return `sc1.${turnRef}.${bytesToHex(hmac(sha256, key, digest))}`
}

export async function resolveSearchContinuation(
  ctx: MutationCtx,
  input: Readonly<{ actor: TurnActor; threadId: string | undefined; query: string; cursor: string }>,
): Promise<{ query: string; cursor: string; inputJson: string }> {
  const { threadId, query, cursor, actor } = input
  if (threadId === undefined || query.trim() !== query || query.length === 0 || query.length > 200
    || cursor.length > 8192) throw new Error('invalid_search_continuation')
  const thread = await readPrincipalChatThread(ctx, threadId, actor.accountRef, actor.kind, actor.principalRef)
  const issuingTurnRef = /^sc1\.(turn_[0-9a-f-]{36})\.([0-9a-f]{64})$/u.exec(cursor)?.[1]
  if (issuingTurnRef === undefined || thread.searchCursorSigningKey === undefined) throw new Error('invalid_search_continuation')
  const issuingTurn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', issuingTurnRef)).unique()
  if (issuingTurn === null || issuingTurn.threadId !== threadId
    || issuingTurn.principalKind !== actor.kind || issuingTurn.principalRef !== actor.principalRef
    || issuingTurn.accountRef !== actor.accountRef) throw new Error('invalid_search_continuation')
  const issued = issuingTurn.issuedSearchContinuations?.find(item =>
    item.token === cursor && sanitizeChatToolString(item.query) === query)
  if (issued === undefined || signedToken(thread.searchCursorSigningKey, issuingTurn.turnRef,
    issued.query, issued.cursor, issued.inputJson) !== cursor) {
    throw new Error('invalid_search_continuation')
  }
  return { query: issued.query, cursor: issued.cursor, inputJson: issued.inputJson }
}

export async function issueSearchContinuation(
  ctx: MutationCtx,
  args: Readonly<{ turnRef: string; threadId: string; promptMessageId: string; query: string; cursor: string; inputJson: string }>,
): Promise<string> {
  if (args.query.length === 0 || args.query.length > 200 || args.cursor.length === 0 || args.cursor.length > 8192
    || args.inputJson.length > 8192) {
    throw new Error('invalid_search_continuation')
  }
  const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', args.turnRef)).unique()
  if (turn === null || turn.threadId !== args.threadId || turn.promptMessageId !== args.promptMessageId
    || turn.cancelRequestedAt !== undefined || !['submitted', 'working'].includes(turn.state)) {
    throw new Error('turn_not_found')
  }
  const thread = await readPrincipalChatThread(ctx, args.threadId, turn.accountRef, turn.principalKind, turn.principalRef)
  if (thread.activePromptMessageId !== args.promptMessageId) throw new Error('turn_not_found')
  const key = thread.searchCursorSigningKey ?? crypto.randomUUID()
  if (thread.searchCursorSigningKey === undefined) await ctx.db.patch(thread._id, { searchCursorSigningKey: key })
  const token = signedToken(key, args.turnRef, args.query, args.cursor, args.inputJson)
  if (!turn.issuedSearchContinuations?.some(item => item.token === token)) {
    await ctx.db.patch(turn._id, {
      issuedSearchContinuations: [...(turn.issuedSearchContinuations ?? []),
        { query: args.query, cursor: args.cursor, inputJson: args.inputJson, token }],
    })
  }
  return token
}

export async function readSearchContinuation(
  ctx: QueryCtx,
  args: Readonly<{ turnRef: string; threadId: string; promptMessageId: string }>,
): Promise<{ query: string; cursor: string; inputJson: string } | null> {
  const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', args.turnRef)).unique()
  if (turn === null || turn.threadId !== args.threadId || turn.promptMessageId !== args.promptMessageId
    || turn.cancelRequestedAt !== undefined || !['submitted', 'working'].includes(turn.state)) return null
  const thread = await ctx.db.query('chatThreads').withIndex('by_threadId', q => q.eq('threadId', args.threadId)).unique()
  if (thread === null || thread.activePromptMessageId !== args.promptMessageId
    || !chatThreadBelongsToPrincipal(thread, turn.accountRef, turn.principalKind, turn.principalRef)) return null
  return turn.searchContinuation ?? null
}
