import { v } from 'convex/values'

import {
  chatThreadShareAccessId,
  chatThreadShareVerifier,
  mintChatThreadShareToken,
  resolveChatThreadShareKeyring,
} from '@/modules/chat-sharing/share-token'
import {
  findChatThreadShareByThread,
  writeChatThreadShare,
} from '@/modules/chat-sharing/convex'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { requireOwnedChatThread } from '../../../chatThreads'

export const issueShareArgs = { threadId: v.string() }
export const issueShareResult = v.object({ threadId: v.string(), shareToken: v.string() })
export const revokeShareArgs = { threadId: v.string() }
export const revokeShareResult = v.object({ threadId: v.string(), revoked: v.boolean() })
export const getShareStateArgs = { threadId: v.string() }
export const getShareStateResult = v.object({
  threadId: v.string(),
  state: v.union(v.literal('none'), v.literal('active'), v.literal('revoked')),
})

export function keyring() {
  return resolveChatThreadShareKeyring({
    AE_CHAT_SHARE_SECRET: env.AE_CHAT_SHARE_SECRET,
    AE_CHAT_SHARE_KEY_ID: env.AE_CHAT_SHARE_KEY_ID,
  })
}

export async function issueShareHandler(ctx: MutationCtx, args: { threadId: string }): Promise<typeof issueShareResult.type> {
  const thread = await requireOwnedChatThread(ctx, args.threadId)
  const signingKey = keyring()
  const existing = await findChatThreadShareByThread(ctx, thread.threadId)
  const generation = existing === null
    ? 1
    : existing.status === 'revoked'
      ? existing.generation + 1
      : existing.generation
  const shareToken = mintChatThreadShareToken({
    threadId: thread.threadId,
    generation,
    keyId: signingKey.keyId,
  }, signingKey)
  const now = Date.now()
  const share = {
    threadId: thread.threadId,
    accessId: chatThreadShareAccessId(shareToken),
    generation,
    verifier: chatThreadShareVerifier(shareToken, signingKey.secret),
    keyId: signingKey.keyId,
    status: 'active' as const,
    createdAt: existing?.status === 'active' ? existing.createdAt : now,
  }
  await writeChatThreadShare(ctx, share)
  return { threadId: thread.threadId, shareToken }
}

export async function revokeShareHandler(ctx: MutationCtx, args: { threadId: string }): Promise<typeof revokeShareResult.type> {
  const thread = await requireOwnedChatThread(ctx, args.threadId)
  const existing = await findChatThreadShareByThread(ctx, thread.threadId)
  if (existing === null || existing.status === 'revoked') {
    return { threadId: thread.threadId, revoked: false }
  }
  await writeChatThreadShare(ctx, {
    threadId: existing.threadId,
    accessId: existing.accessId,
    generation: existing.generation,
    verifier: existing.verifier,
    keyId: existing.keyId,
    status: 'revoked',
    createdAt: existing.createdAt,
    revokedAt: Date.now(),
  })
  return { threadId: thread.threadId, revoked: true }
}

export async function getShareStateHandler(ctx: QueryCtx, args: { threadId: string }): Promise<typeof getShareStateResult.type> {
  const thread = await requireOwnedChatThread(ctx, args.threadId)
  const existing = await findChatThreadShareByThread(ctx, thread.threadId)
  const state: 'none' | 'active' | 'revoked' = existing?.status ?? 'none'
  return {
    threadId: thread.threadId,
    state,
  }
}
