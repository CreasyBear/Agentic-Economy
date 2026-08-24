import { listUIMessages, mockModel, saveMessage } from '@convex-dev/agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, components, internal } from '../../convex/_generated/api'
import { streamDurableChatResponse } from '../../convex/chatGenerate'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'

const SHARE_SECRET = 'chat-share-integration-secret-with-at-least-32-characters'
const SHARE_KEY_ID = 'chat-share:integration'
const previousShareSecret = process.env.AE_CHAT_SHARE_SECRET
const previousShareKeyId = process.env.AE_CHAT_SHARE_KEY_ID

const identity = (name: string) => ({
  subject: `user_${name}`,
  issuer: 'https://identity.example',
  tokenIdentifier: `token_${name}`,
})

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

async function drainExpectedUnavailableGenerations(
  backend: ReturnType<typeof convexTestWithMarketComponents>,
): Promise<void> {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    await backend.finishAllScheduledFunctions(() => undefined)
  } finally {
    error.mockRestore()
  }
}

describe.sequential('durable operation chat messaging and shares', () => {
  beforeEach(() => {
    process.env.AE_CHAT_SHARE_SECRET = SHARE_SECRET
    process.env.AE_CHAT_SHARE_KEY_ID = SHARE_KEY_ID
  })

  afterEach(() => {
    restoreEnvironment('AE_CHAT_SHARE_SECRET', previousShareSecret)
    restoreEnvironment('AE_CHAT_SHARE_KEY_ID', previousShareKeyId)
  })

  it('atomically creates an owned thread, saves the normalized prompt, and derives its title', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('owner'))
    const other = backend.withIdentity(identity('other'))

    const sent = await owner.mutation(api.chatMessages.sendMessage, {
      prompt: '  Find\n\t the best   weather operations  ',
    })
    const [row, componentThread, messages] = await backend.run(async (ctx) => Promise.all([
      ctx.db.query('chatThreads')
        .withIndex('by_threadId', (index) => index.eq('threadId', sent.threadId))
        .unique(),
      ctx.runQuery(components.agent.threads.getThread, { threadId: sent.threadId }),
      listUIMessages(ctx, components.agent, {
        threadId: sent.threadId,
        paginationOpts: { cursor: null, numItems: 20 },
      }),
    ]))

    expect(row).toMatchObject({
      ownerId: 'token_owner',
      title: 'Find the best weather operations',
      activePromptMessageId: sent.promptMessageId,
    })
    expect(componentThread?.title).toBe('Find the best weather operations')
    expect(messages.page).toHaveLength(1)
    expect(messages.page[0]).toMatchObject({
      id: sent.promptMessageId,
      role: 'user',
      text: 'Find the best weather operations',
      status: 'success',
    })

    await expect(other.query(api.chatMessages.listMessages, {
      threadId: sent.threadId,
      paginationOpts: { cursor: null, numItems: 20 },
    })).rejects.toThrow('thread_not_found')
    await expect(owner.query(api.chatMessages.listMessages, {
      threadId: 'missing-thread',
      paginationOpts: { cursor: null, numItems: 20 },
    })).rejects.toThrow('thread_not_found')
    await expect(owner.query(api.chatMessages.listMessages, {
      threadId: sent.threadId,
      paginationOpts: { cursor: null, numItems: 0 },
      streamArgs: { kind: 'list' },
    })).resolves.toMatchObject({ page: [], streams: { kind: 'list' } })
    await expect(backend.mutation(api.chatMessages.sendMessage, {
      prompt: 'anonymous prompt',
    })).rejects.toThrow('unauthenticated')
    await expect(owner.mutation(api.chatMessages.sendMessage, {
      prompt: '   ',
    })).rejects.toThrow('invalid_input')
    await expect(owner.mutation(api.chatMessages.sendMessage, {
      prompt: 'x'.repeat(2_001),
    })).rejects.toThrow('invalid_input')
    await expect(owner.query(api.chatMessages.listMessages, {
      threadId: sent.threadId,
      paginationOpts: { cursor: null, numItems: 51 },
    })).rejects.toThrow('chat_message_page_size_invalid')
    await drainExpectedUnavailableGenerations(backend)
  })

  it('rejects active concurrency, admits stale state, and only matching cleanup clears it', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('busy-owner'))
    const first = await owner.mutation(api.chatMessages.sendMessage, {
      prompt: 'First prompt',
    })

    await expect(owner.mutation(api.chatMessages.sendMessage, {
      threadId: first.threadId,
      prompt: 'Concurrent prompt',
    })).rejects.toThrow('thread_busy')

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('chatThreads')
        .withIndex('by_threadId', (index) => index.eq('threadId', first.threadId))
        .unique()
      if (row === null) throw new Error('test_thread_missing')
      await ctx.db.patch(row._id, { activeStartedAt: Date.now() - 10 * 60 * 1_000 - 1 })
    })
    const second = await owner.mutation(api.chatMessages.sendMessage, {
      threadId: first.threadId,
      prompt: 'Replacement after stale state',
    })

    await expect(backend.mutation(internal.chatMessages.clearActiveGeneration, {
      threadId: first.threadId,
      promptMessageId: first.promptMessageId,
    })).resolves.toBe(false)
    await expect(backend.mutation(internal.chatMessages.clearActiveGeneration, {
      threadId: first.threadId,
      promptMessageId: second.promptMessageId,
    })).resolves.toBe(true)

    const row = await backend.run((ctx) => ctx.db.query('chatThreads')
      .withIndex('by_threadId', (index) => index.eq('threadId', first.threadId))
      .unique())
    expect(row?.activePromptMessageId).toBeUndefined()
    expect(row?.activeStartedAt).toBeUndefined()
    await drainExpectedUnavailableGenerations(backend)
  })

  it('persists a fake-model response and settles saved stream deltas without network access', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('model-owner'))
    const created = await owner.mutation(api.chatThreads.createThread, {
      title: 'Find an exchange-rate operation',
    })
    const promptMessageId = await backend.run(async (ctx) => {
      const saved = await saveMessage(ctx, components.agent, {
        threadId: created.threadId,
        userId: 'token_model-owner',
        prompt: 'Find an exchange-rate operation',
      })
      const row = await ctx.db.query('chatThreads')
        .withIndex('by_threadId', (index) => index.eq('threadId', created.threadId))
        .unique()
      if (row === null) throw new Error('test_thread_missing')
      await ctx.db.patch(row._id, {
        activePromptMessageId: saved.messageId,
        activeStartedAt: Date.now(),
      })
      return saved.messageId
    })

    await backend.action(async (ctx) => {
      await streamDurableChatResponse(ctx, {
        threadId: created.threadId,
        ownerId: 'token_model-owner',
        promptMessageId,
      }, mockModel({
        content: [{ type: 'text', text: 'One current exchange-rate operation is available.' }],
      }))
    })
    await backend.mutation(internal.chatMessages.clearActiveGeneration, {
      threadId: created.threadId,
      promptMessageId,
    })

    const [messages, activeStreams] = await backend.run(async (ctx) => Promise.all([
      listUIMessages(ctx, components.agent, {
        threadId: created.threadId,
        paginationOpts: { cursor: null, numItems: 20 },
      }),
      ctx.runQuery(components.agent.streams.list, {
        threadId: created.threadId,
        statuses: ['streaming'],
      }),
    ]))
    expect(messages.page.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages.page.find((message) => message.role === 'assistant')?.text).toContain(
      'One current exchange-rate operation is available.',
    )
    expect(activeStreams).toEqual([])
  })

  it('enforces thirty durable submissions per identity each hour', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('rate-owner'))
    const created = await owner.mutation(api.chatThreads.createThread, { title: 'Rate thread' })

    for (let index = 0; index < 30; index += 1) {
      const sent = await owner.mutation(api.chatMessages.sendMessage, {
        threadId: created.threadId,
        prompt: `Prompt ${index}`,
      })
      await backend.mutation(internal.chatMessages.clearActiveGeneration, {
        threadId: created.threadId,
        promptMessageId: sent.promptMessageId,
      })
    }
    await expect(owner.mutation(api.chatMessages.sendMessage, {
      threadId: created.threadId,
      prompt: 'Prompt over limit',
    })).rejects.toThrow('rate_limited')

    const messages = await backend.run((ctx) => listUIMessages(ctx, components.agent, {
      threadId: created.threadId,
      paginationOpts: { cursor: null, numItems: 50 },
    }))
    expect(messages.page).toHaveLength(30)
    await drainExpectedUnavailableGenerations(backend)
  })

  it('issues one opaque grant, hides ownership publicly, revokes, and reissues by generation', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = backend.withIdentity(identity('share-owner'))
    const other = backend.withIdentity(identity('share-other'))
    const sent = await owner.mutation(api.chatMessages.sendMessage, {
      prompt: 'Compare current weather operations',
    })

    const first = await owner.mutation(api.chatShares.issueShare, { threadId: sent.threadId })
    const reused = await owner.mutation(api.chatShares.issueShare, { threadId: sent.threadId })
    expect(reused.shareToken).toBe(first.shareToken)
    const stored = await backend.run((ctx) => ctx.db.query('chatThreadShares')
      .withIndex('by_threadId', (index) => index.eq('threadId', sent.threadId))
      .collect())
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ generation: 1, status: 'active' })
    expect(JSON.stringify(stored[0])).not.toContain(first.shareToken)

    const shared = await backend.query(api.chatShares.listSharedMessages, {
      shareToken: first.shareToken,
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(shared.title).toBe('Compare current weather operations')
    expect(shared.page).toHaveLength(1)
    expect(shared.page[0]).toMatchObject({ role: 'user', status: 'success' })
    expect(shared.page[0]).not.toHaveProperty('userId')
    expect(shared).not.toHaveProperty('streams')

    await expect(other.mutation(api.chatShares.issueShare, {
      threadId: sent.threadId,
    })).rejects.toThrow('thread_not_found')
    await expect(other.mutation(api.chatShares.revokeShare, {
      threadId: sent.threadId,
    })).rejects.toThrow('thread_not_found')
    await expect(other.query(api.chatShares.getShareState, {
      threadId: sent.threadId,
    })).rejects.toThrow('thread_not_found')

    await expect(owner.mutation(api.chatShares.revokeShare, {
      threadId: sent.threadId,
    })).resolves.toEqual({ threadId: sent.threadId, revoked: true })
    await expect(owner.mutation(api.chatShares.revokeShare, {
      threadId: sent.threadId,
    })).resolves.toEqual({ threadId: sent.threadId, revoked: false })
    await expect(backend.query(api.chatShares.listSharedMessages, {
      shareToken: first.shareToken,
      paginationOpts: { cursor: null, numItems: 20 },
    })).rejects.toThrow('shared_thread_not_found')
    await expect(backend.query(api.chatShares.listSharedMessages, {
      shareToken: 'not-a-token',
      paginationOpts: { cursor: null, numItems: 20 },
    })).rejects.toThrow('shared_thread_not_found')

    const second = await owner.mutation(api.chatShares.issueShare, { threadId: sent.threadId })
    expect(second.shareToken).not.toBe(first.shareToken)
    const reissued = await backend.run((ctx) => ctx.db.query('chatThreadShares')
      .withIndex('by_threadId', (index) => index.eq('threadId', sent.threadId))
      .unique())
    expect(reissued).toMatchObject({ generation: 2, status: 'active' })
    expect(JSON.stringify(reissued)).not.toContain(second.shareToken)
    await expect(backend.query(api.chatShares.listSharedMessages, {
      shareToken: second.shareToken,
      paginationOpts: { cursor: null, numItems: 20 },
    })).resolves.toMatchObject({ title: 'Compare current weather operations' })
    await drainExpectedUnavailableGenerations(backend)
  })
})
