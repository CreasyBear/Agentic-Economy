import { afterEach, describe, expect, it, vi } from 'vitest'
import { components } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'
import { expireChatTurnContent } from '../../../convex/lib/chat/turns/contentRetention'
import { expireContentBatch } from '../../../convex/lib/capabilityExecution/contentRetention/cleanup'
import { CALL_CONTENT_RETENTION_MS } from '../../../convex/lib/capabilityExecution/contentRetention/callContent'
import { finishTurnHandler } from '../../../convex/lib/chat/turns/writes'

const endedAt = 1000
const now = endedAt + CALL_CONTENT_RETENTION_MS
afterEach(() => vi.useRealTimers())

async function fixture() {
  vi.useFakeTimers()
  vi.setSystemTime(endedAt)
  const backend = convexTestWithMarketComponents()
  const ids = await backend.run(async ctx => {
    const thread = await ctx.runMutation(components.agent.threads.createThread, { userId: 'account:retention', title: 'Old private title', summary: 'Old private summary' })
    const threadRow = await ctx.db.insert('chatThreads', { threadId: thread._id, ownerId: 'account:retention', title: 'Old private title', updatedAt: endedAt })
    const storageId = await ctx.storage.store(new Blob(['Old private file']))
    const { fileId } = await ctx.runMutation(components.agent.files.addFile, { storageId, hash: 'sha256:old', filename: 'private.txt' })
    const prompt = await ctx.runMutation(components.agent.messages.addMessages, { threadId: thread._id,
      messages: [{ message: { role: 'user', content: 'Old private prompt' }, fileIds: [fileId] }],
      embeddings: { dimension: 128, model: 'fixture', vectors: [Array.from({ length: 128 }, () => 0.1)] },
    })
    const promptMessageId = prompt.messages[0]!._id
    await ctx.runMutation(components.agent.messages.addMessages, { threadId: thread._id, promptMessageId,
      messages: Array.from({ length: 5 }, (_, index) => ({ message: { role: 'assistant' as const, content: `Old private reply ${index}` } })),
    })
    const next = await ctx.runMutation(components.agent.messages.addMessages, { threadId: thread._id,
      messages: [{ message: { role: 'user', content: 'Recent prompt' } }, { message: { role: 'assistant', content: 'Recent response' } }],
    })
    const turn = await ctx.db.insert('chatTurns', { turnRef: 'turn:retention', threadId: thread._id, principalKind: 'clerk_owner',
      principalRef: 'principal:retention', accountRef: 'account:retention', clientTurnId: 'client:retention', materialDigest: 'sha256:turn',
      state: 'completed', sequence: 1, promptMessageId, createdAt: 100, updatedAt: endedAt,
      searchContinuation: { query: 'Old private search', cursor: 'private-cursor', inputJson: '{"private":"input"}' },
      issuedSearchContinuations: [{ query: 'Old private search', cursor: 'private-cursor', inputJson: '{}', token: 'token' }],
    })
    return { thread: thread._id, threadRow, turn, promptMessageId, recentIds: next.messages.map(message => message._id), fileId, storageId }
  })
  vi.setSystemTime(now)
  return { backend, ...ids }
}

describe('chat content retention', () => {
  it('resumes after the prompt is deleted, removes its replies and file reference, and keeps the next turn', async () => {
    const f = await fixture()
    const expire = () => f.backend.run(async ctx => expireChatTurnContent(ctx, (await ctx.db.get(f.turn))!, now))
    await expire()
    expect(await f.backend.run(ctx => ctx.runQuery(components.agent.messages.getMessagesByIds, { messageIds: [f.promptMessageId] }))).toEqual([null])
    expect((await f.backend.run(ctx => ctx.db.get(f.turn)))?.contentRetention).toMatchObject({ state: 'purging', order: 0 })
    // A fresh function invocation has no prompt to recover from; only the
    // committed component cursor can finish this cleanup correctly.
    for (let index = 0; index < 4; index += 1) await expire()
    const turn = (await f.backend.run(ctx => ctx.db.get(f.turn)))!
    expect(turn.contentRetention).toEqual({ state: 'expired', expiredAt: now })
    expect(turn).not.toHaveProperty('searchContinuation')
    expect(turn).not.toHaveProperty('issuedSearchContinuations')
    const messages = await f.backend.run(ctx => ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
      threadId: f.thread, order: 'asc', paginationOpts: { cursor: null, numItems: 10 },
    }))
    expect(messages.page.map(message => message._id)).toEqual(f.recentIds)
    expect(await f.backend.run(ctx => ctx.runQuery(components.agent.files.get, { fileId: f.fileId }))).toMatchObject({ refcount: 0 })
    expect(await f.backend.run(ctx => ctx.runQuery(components.agent.threads.getThread, { threadId: f.thread })))
      .toMatchObject({ title: 'New conversation', summary: '' })
    expect(await f.backend.run(ctx => finishTurnHandler(ctx, { turnRef: 'turn:retention', promptMessageId: f.promptMessageId, state: 'working' }))).toBe(false)
    expect(await expire()).toBe(false)
    await f.backend.run(ctx => expireContentBatch(ctx, 'files', null, now))
    expect(await f.backend.run(async ctx => await ctx.storage.get(f.storageId) !== null)).toBe(true)
    vi.setSystemTime(now + 24 * 60 * 60 * 1000)
    await f.backend.run(ctx => expireContentBatch(ctx, 'files', null, Date.now()))
    expect(await f.backend.run(async ctx => await ctx.storage.get(f.storageId) !== null)).toBe(false)
    expect(await f.backend.run(ctx => ctx.runQuery(components.agent.files.get, { fileId: f.fileId }))).toBeNull()
  })

  it('keeps a recently renamed title while the scheduled resume phase finishes older message deletion', async () => {
    const f = await fixture()
    await f.backend.run(async ctx => {
      await ctx.db.patch(f.threadRow, { title: 'Recent title', titleUpdatedAt: now })
      await ctx.runMutation(components.agent.threads.updateThread, { threadId: f.thread, patch: { title: 'Recent title' } })
    })
    await f.backend.run(ctx => expireContentBatch(ctx, 'chat', null, now))
    for (let index = 0; index < 5; index += 1) await f.backend.run(ctx => expireContentBatch(ctx, 'chatResume', null, now))
    expect((await f.backend.run(ctx => ctx.db.get(f.turn)))?.contentRetention?.state).toBe('expired')
    expect((await f.backend.run(ctx => ctx.db.get(f.threadRow)))?.title).toBe('Recent title')
    await f.backend.run(ctx => expireContentBatch(ctx, 'titles', null, now + CALL_CONTENT_RETENTION_MS - 1))
    expect((await f.backend.run(ctx => ctx.db.get(f.threadRow)))?.title).toBe('Recent title')
    await f.backend.run(ctx => expireContentBatch(ctx, 'titles', null, now + CALL_CONTENT_RETENTION_MS))
    expect((await f.backend.run(ctx => ctx.db.get(f.threadRow)))?.title).toBe('New conversation')
  })

  it.each(['working', 'submitted'] as const)('retains an active %s turn and all of its messages', async state => {
    const f = await fixture()
    await f.backend.run(ctx => ctx.db.patch(f.turn, { state }))
    expect(await f.backend.run(async ctx => expireChatTurnContent(ctx, (await ctx.db.get(f.turn))!, now))).toBe(false)
    expect((await f.backend.run(ctx => ctx.runQuery(components.agent.messages.getMessagesByIds, { messageIds: [f.promptMessageId] })))[0]).not.toBeNull()
  })

  it('retains content when any linked purchase is missing or unresolved', async () => {
    const f = await fixture()
    await f.backend.run(ctx => ctx.db.patch(f.turn, { callRefs: ['call:missing'] }))
    expect(await f.backend.run(async ctx => expireChatTurnContent(ctx, (await ctx.db.get(f.turn))!, now))).toBe(false)
    expect((await f.backend.run(ctx => ctx.db.get(f.turn)))?.searchContinuation?.query).toBe('Old private search')
  })
})
