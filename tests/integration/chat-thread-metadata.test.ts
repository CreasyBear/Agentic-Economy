import { describe, expect, it } from 'vitest'

import { api, components } from '../../convex/_generated/api'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'

const identity = (name: string) => ({
  subject: `user_${name}`,
  issuer: 'https://identity.example',
  tokenIdentifier: `token_${name}`,
})

describe('durable chat thread metadata', () => {
  it('creates an owned Agent component thread and normalizes its title', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('owner'))

    const created = await owner.mutation(api.chatThreads.createThread, {
      title: '  Find\n\t useful   operations  ',
    })
    expect(created).toMatchObject({
      title: 'Find useful operations',
      busy: false,
    })

    const componentThread = await backend.run((ctx) => ctx.runQuery(
      components.agent.threads.getThread,
      { threadId: created.threadId },
    ))
    expect(componentThread).toMatchObject({
      _id: created.threadId,
      userId: 'token_owner',
      title: 'Find useful operations',
    })

    const defaultTitle = await owner.mutation(api.chatThreads.createThread, {
      title: '   ',
    })
    expect(defaultTitle.title).toBe('New conversation')
  })

  it('keeps missing and foreign thread reads indistinguishable', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('owner'))
    const other = backend.withIdentity(identity('other'))
    const created = await owner.mutation(api.chatThreads.createThread, {
      title: 'Private thread',
    })

    await expect(other.query(api.chatThreads.getThread, {
      threadId: created.threadId,
      now: Date.now(),
    })).rejects.toThrow('thread_not_found')
    await expect(owner.query(api.chatThreads.getThread, {
      threadId: 'missing-thread',
      now: Date.now(),
    })).rejects.toThrow('thread_not_found')
    await expect(other.mutation(api.chatThreads.renameThread, {
      threadId: created.threadId,
      title: 'Foreign rename',
    })).rejects.toThrow('thread_not_found')
    await expect(owner.mutation(api.chatThreads.renameThread, {
      threadId: 'missing-thread',
      title: 'Missing rename',
    })).rejects.toThrow('thread_not_found')
    await expect(other.mutation(api.chatThreads.deleteThread, {
      threadId: created.threadId,
    })).rejects.toThrow('thread_not_found')
    await expect(owner.mutation(api.chatThreads.deleteThread, {
      threadId: 'missing-thread',
    })).rejects.toThrow('thread_not_found')
  })

  it('lists only the owner threads in updated order with native bounded pagination', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('owner'))
    const other = backend.withIdentity(identity('other'))
    const first = await owner.mutation(api.chatThreads.createThread, { title: 'First' })
    const second = await owner.mutation(api.chatThreads.createThread, { title: 'Second' })
    const third = await owner.mutation(api.chatThreads.createThread, { title: 'Third' })
    await other.mutation(api.chatThreads.createThread, { title: 'Other owner' })

    await backend.run(async (ctx) => {
      for (const [threadId, updatedAt] of [
        [first.threadId, 100],
        [second.threadId, 300],
        [third.threadId, 200],
      ] as const) {
        const row = await ctx.db.query('chatThreads')
          .withIndex('by_threadId', (index) => index.eq('threadId', threadId))
          .unique()
        if (row === null) throw new Error('test_thread_missing')
        await ctx.db.patch(row._id, { updatedAt })
      }
    })

    const firstPage = await owner.query(api.chatThreads.listThreads, {
      now: 1_000,
      paginationOpts: { cursor: null, numItems: 2 },
    })
    expect(firstPage.page.map((thread) => thread.title)).toEqual(['Second', 'Third'])
    const secondPage = await owner.query(api.chatThreads.listThreads, {
      now: 1_000,
      paginationOpts: { cursor: firstPage.continueCursor, numItems: 2 },
    })
    expect(secondPage.page.map((thread) => thread.title)).toEqual(['First'])

    await expect(owner.query(api.chatThreads.listThreads, {
      now: 1_000,
      paginationOpts: { cursor: null, numItems: 51 },
    })).rejects.toThrow('chat_thread_page_size_invalid')

    for (let index = 0; index < 18; index += 1) {
      await owner.mutation(api.chatThreads.createThread, { title: `Extra ${index}` })
    }
    const defaultPage = await owner.query(api.chatThreads.listThreads, { now: 1_000 })
    expect(defaultPage.page).toHaveLength(20)
  })

  it('searches titles within the authenticated owner only', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('owner'))
    const other = backend.withIdentity(identity('other'))
    await owner.mutation(api.chatThreads.createThread, { title: 'Alpha accounting helper' })
    await owner.mutation(api.chatThreads.createThread, { title: 'Travel planning' })
    await other.mutation(api.chatThreads.createThread, { title: 'Alpha private record' })

    const result = await owner.query(api.chatThreads.searchThreads, {
      query: '  Alpha  ',
      now: Date.now(),
    })
    expect(result.page.map((thread) => thread.title)).toEqual(['Alpha accounting helper'])
  })

  it('renames app and component metadata together and rejects an empty title', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('owner'))
    const created = await owner.mutation(api.chatThreads.createThread, { title: 'Old title' })

    const renamed = await owner.mutation(api.chatThreads.renameThread, {
      threadId: created.threadId,
      title: `  ${'x'.repeat(90)}  `,
    })
    expect(Array.from(renamed.title)).toHaveLength(80)
    const componentThread = await backend.run((ctx) => ctx.runQuery(
      components.agent.threads.getThread,
      { threadId: created.threadId },
    ))
    expect(componentThread?.title).toBe(renamed.title)

    await expect(owner.mutation(api.chatThreads.renameThread, {
      threadId: created.threadId,
      title: '\n\t ',
    })).rejects.toThrow('thread_title_invalid')
  })

  it('rejects active deletion, permits stale deletion, cleans shares, and deletes the component thread', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('owner'))
    const created = await owner.mutation(api.chatThreads.createThread, { title: 'Delete me' })
    const now = Date.now()

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('chatThreads')
        .withIndex('by_threadId', (index) => index.eq('threadId', created.threadId))
        .unique()
      if (row === null) throw new Error('test_thread_missing')
      await ctx.db.patch(row._id, {
        activePromptMessageId: 'prompt-active',
        activeStartedAt: now,
      })
      await ctx.db.insert('chatThreadShares', {
        threadId: created.threadId,
        accessId: 'share-one',
        generation: 1,
        verifier: 'verifier-one',
        keyId: 'key-one',
        status: 'active',
        createdAt: now,
      })
      await ctx.db.insert('chatThreadShares', {
        threadId: created.threadId,
        accessId: 'share-two',
        generation: 2,
        verifier: 'verifier-two',
        keyId: 'key-one',
        status: 'revoked',
        createdAt: now,
        revokedAt: now,
      })
    })

    await expect(owner.mutation(api.chatThreads.deleteThread, {
      threadId: created.threadId,
    })).rejects.toThrow('thread_busy')

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('chatThreads')
        .withIndex('by_threadId', (index) => index.eq('threadId', created.threadId))
        .unique()
      if (row === null) throw new Error('test_thread_missing')
      await ctx.db.patch(row._id, { activeStartedAt: now - 10 * 60 * 1_000 - 1 })
    })
    await expect(owner.mutation(api.chatThreads.deleteThread, {
      threadId: created.threadId,
    })).resolves.toBeNull()

    const [appThread, shares, componentThread] = await backend.run(async (ctx) => Promise.all([
      ctx.db.query('chatThreads')
        .withIndex('by_threadId', (index) => index.eq('threadId', created.threadId))
        .unique(),
      ctx.db.query('chatThreadShares')
        .withIndex('by_threadId', (index) => index.eq('threadId', created.threadId))
        .collect(),
      ctx.runQuery(components.agent.threads.getThread, { threadId: created.threadId }),
    ]))
    expect(appThread).toBeNull()
    expect(shares).toEqual([])
    expect(componentThread).toBeNull()
  })
})
