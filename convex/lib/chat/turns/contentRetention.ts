import { components } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { CALL_CONTENT_RETENTION_MS, callContentMayExpire } from '../../capabilityExecution/contentRetention/callContent'

const DEFAULT_CHAT_TITLE = 'New conversation'

/** Requires an inactive, aged turn and final linked purchases. Component
 * deletion and the resume cursor commit together. No payload enters the cursor.
 * An unknown purchase or active turn retains the evidence. */
export async function expireChatTurnContent(ctx: MutationCtx, turn: Doc<'chatTurns'>, now: number): Promise<boolean> {
  if (turn.contentRetention?.state === 'expired' || ['submitted', 'working'].includes(turn.state)
    || turn.updatedAt > now - CALL_CONTENT_RETENTION_MS) return false
  const refs = new Set([...(turn.callRefs ?? []), ...(turn.inFlightCallRefs ?? []), ...(turn.failureCallRefs ?? [])])
  for (const callRef of refs) {
    const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
    if (call === null || call.ownerId !== turn.accountRef || !await callContentMayExpire(ctx, call, now)) return false
  }
  const threadId = turn.threadId
  const thread = threadId === undefined ? null : await ctx.db.query('chatThreads')
    .withIndex('by_threadId', q => q.eq('threadId', threadId)).unique()
  const activePromptMessageId = thread?.activePromptMessageId
  if (activePromptMessageId !== undefined) {
    const active = await ctx.db.query('chatTurns').withIndex('by_promptMessageId', q => q.eq('promptMessageId', activePromptMessageId)).unique()
    if (active === null || ['submitted', 'working'].includes(active.state)) return false
  }
  let progress = turn.contentRetention
  if (progress === undefined && turn.promptMessageId !== undefined && turn.threadId !== undefined) {
    const [prompt] = await ctx.runQuery(components.agent.messages.getMessagesByIds, { messageIds: [turn.promptMessageId] })
    // A missing prompt without a committed cursor is not proof that its replies
    // were deleted; preserve the turn for investigation instead of claiming expiry.
    if (prompt == null || prompt.threadId !== turn.threadId || prompt.message?.role !== 'user') return false
    progress = { state: 'purging', order: prompt.order, cursor: null }
  }
  if (progress?.state === 'purging' && turn.threadId !== undefined) {
    // Read two messages at a time: the component's range-deletion API takes 64,
    // which can exceed a transaction's byte limit for large Tool outputs.
    const messages = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
      threadId: turn.threadId, order: 'asc', paginationOpts: { cursor: progress.cursor, numItems: 2 },
    })
    await ctx.runMutation(components.agent.messages.deleteByIds, {
      messageIds: messages.page.filter(message => message.order === progress.order).map(message => message._id),
    })
    if (!messages.isDone && !messages.page.some(message => message.order > progress.order)) {
      await ctx.db.patch(turn._id, { contentRetention: { ...progress, cursor: messages.continueCursor } })
      return true
    }
  }
  await ctx.db.patch(turn._id, {
    searchContinuation: undefined, issuedSearchContinuations: undefined,
    contentRetention: { state: 'expired', expiredAt: now },
  })
  if (thread !== null) {
    // Titles are derived from the original prompt and are another content copy.
    const expireTitle = (thread.titleUpdatedAt ?? 0) <= now - CALL_CONTENT_RETENTION_MS
    await ctx.runMutation(components.agent.threads.updateThread, {
      threadId: thread.threadId, patch: { ...(expireTitle ? { title: DEFAULT_CHAT_TITLE } : {}), summary: '' },
    })
    await ctx.db.patch(thread._id, { ...(expireTitle ? { title: DEFAULT_CHAT_TITLE } : {}),
      ...(thread.activePromptMessageId === turn.promptMessageId
        ? { activePromptMessageId: undefined, activeStartedAt: undefined } : {}),
    })
  }
  return true
}

/** The component protects shared or newly released file references for 24h.
 * Delete storage only after its own mutation confirms that ownership is gone. */
export async function expireUnusedChatFiles(ctx: MutationCtx, cursor: string | null): Promise<{ isDone: boolean; continueCursor: string }> {
  const page = await ctx.runQuery(components.agent.files.getFilesToDelete, { paginationOpts: { cursor, numItems: 20 } })
  for (const file of page.page) {
    const storageId = ctx.db.system.normalizeId('_storage', file.storageId)
    if (storageId === null) continue
    const deleted = await ctx.runMutation(components.agent.files.deleteFiles, { fileIds: [file._id] })
    if (deleted.includes(file._id)) await ctx.storage.delete(storageId)
  }
  return page
}

export async function expireChatTitles(ctx: MutationCtx, cursor: string | null, now: number): Promise<{ isDone: boolean; continueCursor: string }> {
  const rows = await ctx.db.query('chatThreads').withIndex('by_titleUpdatedAt', q =>
    q.gt('titleUpdatedAt', 0).lte('titleUpdatedAt', now - CALL_CONTENT_RETENTION_MS)).paginate({ cursor, numItems: 10 })
  for (const row of rows.page) {
    await ctx.runMutation(components.agent.threads.updateThread, { threadId: row.threadId, patch: { title: DEFAULT_CHAT_TITLE, summary: '' } })
    await ctx.db.patch(row._id, { title: DEFAULT_CHAT_TITLE, titleUpdatedAt: undefined })
  }
  return rows
}
