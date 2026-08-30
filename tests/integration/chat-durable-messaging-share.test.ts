import { listUIMessages, mockModel, saveMessage, saveMessages } from '@convex-dev/agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, components, internal } from '../../convex/_generated/api'
import { streamDurableChatResponse } from '../../convex/chatGenerate'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../helpers/convex-fixtures'

const SHARE_SECRET = 'chat-share-integration-secret-with-at-least-32-characters'
const SHARE_KEY_ID = 'chat-share:integration'
const previousShareSecret = process.env.AE_CHAT_SHARE_SECRET
const previousShareKeyId = process.env.AE_CHAT_SHARE_KEY_ID

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
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-owner')
    const { owner: other } = await publishedBusinessOwner(backend, 'chat-other')

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
      ownerId: canonicalAccountRef,
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
    const { owner } = await publishedBusinessOwner(backend, 'chat-busy-owner')
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
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-model-owner')
    const created = await owner.mutation(api.chatThreads.createThread, {
      title: 'Find an exchange-rate operation',
    })
    const promptMessageId = await backend.run(async (ctx) => {
      const saved = await saveMessage(ctx, components.agent, {
        threadId: created.threadId,
        userId: canonicalAccountRef,
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
        ownerId: canonicalAccountRef,
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
    const { owner } = await publishedBusinessOwner(backend, 'chat-rate-owner')
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
    const { owner } = await publishedBusinessOwner(backend, 'chat-share-owner')
    const { owner: other } = await publishedBusinessOwner(backend, 'chat-share-other')
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
    expect(shared.page[0]).toEqual({
      id: sent.promptMessageId,
      role: 'user',
      parts: [{ type: 'text', text: 'Compare current weather operations' }],
    })
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

  it('projects settled shared messages into allowlisted text and operation cards only', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-projection-owner')
    const created = await owner.mutation(api.chatThreads.createThread, {
      title: 'Public projection',
    })
    const operationRefs = ['a', 'b', 'c', 'd', 'e']
      .map((character) => `operation:v1:${character.repeat(64)}`)
    const [operationRef] = operationRefs

    await backend.run(async (ctx) => {
      await saveMessages(ctx, components.agent, {
        threadId: created.threadId,
        userId: canonicalAccountRef,
        messages: [
          {
            role: 'user',
            content: 'Show <tool>current</tool> operations',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'REASONING_SECRET',
                providerMetadata: { hidden: { trace: 'REASONING_PROVIDER_SECRET' } },
              },
              {
                type: 'text',
                text: 'Here are <assistant>the results</assistant> <b>now</b>.',
                providerMetadata: { hidden: { trace: 'TEXT_PROVIDER_SECRET' } },
              },
              { type: 'text', text: '😀'.repeat(8_001) },
              {
                type: 'tool-call',
                toolCallId: 'known-search',
                toolName: 'registry_operations_search',
                input: { query: 'TOOL_INPUT_SECRET' },
                toolMetadata: { trace: 'TOOL_METADATA_SECRET' },
              },
              {
                type: 'tool-call',
                toolCallId: 'unknown-tool',
                toolName: 'arbitrary_internal_tool',
                input: { value: 'UNKNOWN_INPUT_SECRET' },
              },
              {
                type: 'tool-call',
                toolCallId: 'failed-execute',
                toolName: 'operation_invoke',
                input: { operationRef, payload: 'FAILED_INPUT_SECRET' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'known-search',
                toolName: 'registry_operations_search',
                output: {
                  type: 'json',
                  value: {
                    kind: 'ok',
                    matchedCount: operationRefs.length,
                    items: operationRefs.map((ref) => ({
                      operationRef: ref,
                      internal: 'RAW_ITEM_SECRET',
                    })),
                    rawOutput: 'RAW_OUTPUT_SECRET',
                    metadata: { trace: 'OUTPUT_METADATA_SECRET' },
                  },
                },
                providerMetadata: { hidden: { trace: 'RESULT_PROVIDER_SECRET' } },
              },
              {
                type: 'tool-result',
                toolCallId: 'unknown-tool',
                toolName: 'arbitrary_internal_tool',
                output: { type: 'json', value: { secret: 'UNKNOWN_OUTPUT_SECRET' } },
              },
              {
                type: 'tool-result',
                toolCallId: 'failed-execute',
                toolName: 'operation_invoke',
                output: { type: 'error-text', value: 'INTERNAL_EXECUTION_ERROR_SECRET' },
                isError: true,
              },
            ],
          },
        ],
        metadata: [
          { provider: 'user-provider-secret' },
          {
            model: 'MODEL_SECRET',
            provider: 'PROVIDER_SECRET',
            reasoning: 'METADATA_REASONING_SECRET',
            usage: { totalTokens: 999, raw: { billing: 'USAGE_SECRET' } },
          },
          { provider: 'TOOL_MESSAGE_PROVIDER_SECRET' },
        ],
      })
    })

    const issued = await owner.mutation(api.chatShares.issueShare, {
      threadId: created.threadId,
    })
    const shared = await backend.query(api.chatShares.listSharedMessages, {
      shareToken: issued.shareToken,
      paginationOpts: { cursor: null, numItems: 20 },
    })

    expect(shared.page).toEqual([
      {
        id: expect.any(String),
        role: 'user',
        parts: [{ type: 'text', text: 'Show [data-tag]current[data-tag] operations' }],
      },
      {
        id: expect.any(String),
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Here are [data-tag]the results[data-tag] ‹b›now‹/b›.',
          },
          { type: 'text', text: expect.any(String) },
          {
            type: 'operation-card',
            kind: 'choices',
            toolId: 'registry.operations.search',
            state: 'complete',
            title: 'Search tools',
            operationRefs: operationRefs.slice(0, 4),
            choices: [],
            count: 5,
          },
          {
            type: 'operation-card',
            kind: 'status',
            toolId: 'operation.invoke',
            state: 'error',
            title: 'Invoke',
            summary: 'Tool unavailable',
          },
        ],
      },
    ])
    expect(JSON.stringify(shared)).not.toMatch(
      /SECRET|rawOutput|metadata|reasoning|provider|model|usage|errorText|input|arbitrary_internal_tool/u,
    )
    const publicParts = shared.page.flatMap((message) => message.parts)
    const boundedText = publicParts.find((part) => part.type === 'text' && part.text.startsWith('😀'))
    expect(boundedText?.type).toBe('text')
    expect(Array.from(boundedText?.type === 'text' ? boundedText.text : '')).toHaveLength(8_000)
    for (const part of publicParts) {
      if (part.type !== 'operation-card') continue
      if (part.kind === 'status') expect(Array.from(part.summary).length).toBeLessThanOrEqual(240)
    }
    expect(shared.page.every((message) => Object.keys(message).sort().join(',') === 'id,parts,role'))
      .toBe(true)
  })
})
