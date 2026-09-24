import { listUIMessages, mockModel, saveMessage, saveMessages } from '@convex-dev/agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, components, internal } from '../../convex/_generated/api'
import { streamDurableChatResponse } from '../../convex/lib/chat/generate/stream'
import { projectToolCard } from '@/modules/chat/tool-card'
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

describe.sequential('durable Tool chat messaging and shares', () => {
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
      prompt: '  Find\n\t the best   weather Tools  ',
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
      title: 'Find the best weather Tools',
      activePromptMessageId: sent.promptMessageId,
    })
    expect(componentThread?.title).toBe('Find the best weather Tools')
    expect(messages.page).toHaveLength(1)
    expect(messages.page[0]).toMatchObject({
      id: sent.promptMessageId,
      role: 'user',
      text: 'Find the best weather Tools',
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

  it.each([false, true])('persists a final response and settles stream deltas (extended lookup=%s)', async extended => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-model-owner')
    const created = await owner.mutation(api.chatThreads.createThread, {
      title: 'Find an exchange-rate Tool',
    })
    const promptMessageId = await backend.run(async (ctx) => {
      const saved = await saveMessage(ctx, components.agent, {
        threadId: created.threadId,
        userId: canonicalAccountRef,
        prompt: 'Find an exchange-rate Tool',
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

    const model = mockModel({
      contentSteps: [
        ...(extended ? Array.from({ length: 5 }, (_, index) => [{
          type: 'tool-call' as const, toolCallId: `lookup-${index}`, toolName: 'registry_tools_describe',
          input: JSON.stringify({ toolRef: `operation:v1:${'a'.repeat(64)}` }),
        }]) : []),
        [{ type: 'text', text: 'No current exchange-rate Tool was verified from that reference.' }],
      ],
    })
    const modelCalls = vi.spyOn(model, 'doStream')
    await backend.action(async (ctx) => {
      await streamDurableChatResponse(ctx, {
        threadId: created.threadId,
        ownerId: canonicalAccountRef,
        promptMessageId,
      }, model)
    })
    expect(modelCalls.mock.calls[0]?.[0].toolChoice).toEqual({ type: 'required' })
    if (extended) expect(modelCalls.mock.lastCall?.[0].tools).toBeUndefined()
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
    expect(messages.page[1]?.text).toBe(extended
      ? 'No current exchange-rate Tool was verified from that reference.'
      : '**No match for that yet.** Next: try different words or browse the Market.')
    expect(activeStreams).toEqual([])
  })
  it('settles two empty searches as one answer without option cards', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-no-match-owner')
    const created = await owner.mutation(api.chatThreads.createThread, { title: 'Find an absent Tool' })
    const { messageId } = await backend.run(ctx => saveMessage(ctx, components.agent, {
      threadId: created.threadId, userId: canonicalAccountRef, prompt: 'Find an absent Tool',
    }))
    const model = mockModel({ contentSteps: [
      [{ type: 'tool-call', toolCallId: 'search-1', toolName: 'registry_tools_search', input: JSON.stringify({ query: 'improbable missing tool alpha' }) }],
      [{ type: 'tool-call', toolCallId: 'search-2', toolName: 'registry_tools_search', input: JSON.stringify({ query: 'improbable missing tool beta' }) }],
    ] })
    await backend.action(ctx => streamDurableChatResponse(ctx, {
      threadId: created.threadId, ownerId: canonicalAccountRef, promptMessageId: messageId,
    }, model))
    const messages = await backend.run(ctx => listUIMessages(ctx, components.agent, {
      threadId: created.threadId, paginationOpts: { cursor: null, numItems: 20 },
    }))
    const assistant = messages.page.filter(message => message.role === 'assistant')
    expect(assistant).toHaveLength(1)
    expect(assistant[0]?.text).toBe('**No match for that yet.** Next: try different words or browse the Market.')
    expect(assistant[0]?.parts.filter(part => part.type.startsWith('tool-'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'output-available', output: expect.objectContaining({ kind: 'noMatch', results: [] }) }),
      ]),
    )
    const cards = assistant[0]?.parts.map(projectToolCard).filter(card => card?.kind === 'choices') ?? []
    expect(cards).not.toHaveLength(0)
    expect(cards.flatMap(card => card?.kind === 'choices' ? card.choices : [])).toEqual([])
  })
  it('halts at clarification and reports an input-required stream outcome', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-clarify-owner')
    const created = await owner.mutation(api.chatThreads.createThread, { title: 'Clarification' })
    const { messageId } = await backend.run(ctx => saveMessage(ctx, components.agent, {
      threadId: created.threadId, userId: canonicalAccountRef, prompt: 'Find something suitable',
    }))
    const model = mockModel({
      contentSteps: [[{
        type: 'tool-call', toolCallId: 'clarify-1', toolName: 'chat_clarify',
        input: JSON.stringify({ question: 'Which region?', choices: ['AU', 'US', 'Other'] }),
      }]],
    })
    const clarificationRequested = await backend.action(ctx => streamDurableChatResponse(ctx, {
      threadId: created.threadId, ownerId: canonicalAccountRef, promptMessageId: messageId,
    }, model))
    expect(clarificationRequested).toBe(true)
    const messages = await backend.run(ctx => listUIMessages(ctx, components.agent, {
      threadId: created.threadId, paginationOpts: { cursor: null, numItems: 20 },
    }))
    expect(messages.page.some(message => JSON.stringify(message.parts).includes('awaiting_answer'))).toBe(true)
  })

  it('records a safe recovery message when durable generation is unavailable', async () => {
    const previousApiKey = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY
    const backend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(backend, 'chat-unavailable-owner')
    try {
      const sent = await owner.mutation(api.chatMessages.sendMessage, {
        prompt: 'Find a current weather Operation',
      })
      await drainExpectedUnavailableGenerations(backend)

      const messages = await owner.query(api.chatMessages.listMessages, {
        threadId: sent.threadId,
        paginationOpts: { cursor: null, numItems: 20 },
      })
      expect(messages.page.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant'])
      const recovery = messages.page.find((message: { role: string; text: string }) => message.role === 'assistant')?.text ?? ''
      expect(recovery).toMatch(/before a final response was recorded/i)
      expect(recovery).toMatch(/call card or receipt/i)
      expect(recovery).not.toContain('agent_unavailable')
      await expect(owner.query(api.chatThreads.getThread, {
        threadId: sent.threadId,
        now: Date.now(),
      })).resolves.toMatchObject({ busy: false })
    } finally {
      restoreEnvironment('OPENROUTER_API_KEY', previousApiKey)
    }
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
      prompt: 'Compare current weather Tools',
    })
    await drainExpectedUnavailableGenerations(backend)

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
    expect(shared.title).toBe('Compare current weather Tools')
    expect(shared.page).toHaveLength(2)
    expect(shared.page[0]).toEqual({
      id: sent.promptMessageId,
      role: 'user',
      parts: [{ type: 'text', text: 'Compare current weather Tools' }],
    })
    expect(shared.page[1]).toMatchObject({
      role: 'assistant',
      parts: [{
        type: 'text',
        text: expect.stringMatching(/before a final response was recorded/i),
      }],
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
    })).resolves.toMatchObject({ title: 'Compare current weather Tools' })
    await drainExpectedUnavailableGenerations(backend)
  })

  it('projects settled shared messages into allowlisted text and Tool cards only', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-projection-owner')
    const created = await owner.mutation(api.chatThreads.createThread, {
      title: 'Public projection',
    })
    const toolRefs = ['a', 'b', 'c', 'd', 'e']
      .map((character) => `operation:v1:${character.repeat(64)}`)

    await backend.run(async (ctx) => {
      await saveMessages(ctx, components.agent, {
        threadId: created.threadId,
        userId: canonicalAccountRef,
        messages: [
          {
            role: 'user',
            content: 'Show <tool>current</tool> Tools',
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
                toolName: 'registry_tools_search',
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
                toolName: 'tool_call',
                input: { quoteRef: `operation-commitment:v1:${'b'.repeat(64)}` },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'known-search',
                toolName: 'registry_tools_search',
                output: {
                  type: 'json',
                  value: {
                    kind: 'matched',
                    schemaVersion: 'registry-tools:v3',
                    query: 'current',
                    partialResults: false,
                    results: toolRefs.map((ref, index) => ({
                      toolRef: ref,
                      title: `Tool ${index + 1}`,
                      summary: 'Current Tool result.',
                      matchReason: 'Matches the query.',
                      readiness: 'ready',
                      healthStatus: 'operational',
                      entitlement: 'public',
                      price: { kind: 'indicative', label: 'AUD 0.00' },
                      details: {
                        capabilityId: `capability:tool:${index + 1}`,
                        provider: { name: 'Provider', slug: 'provider' },
                        description: 'Current Tool result.',
                        listingTier: 'reviewed',
                      },
                      next: [],
                    })),
                    recommendation: { mode: 'fast', engine: 'test', text: 'Five matching Tools.', citations: [] },
                    next: [],
                    pagination: { limit: 10, hasMore: false },
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
                toolName: 'tool_call',
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
        parts: [{ type: 'text', text: 'Show [data-tag]current[data-tag] Tools' }],
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
            type: 'tool-card',
            kind: 'choices',
            toolId: 'registry.tools.search',
            state: 'complete',
            title: 'Search tools',
            toolRefs: toolRefs.slice(0, 4),
            choices: toolRefs.slice(0, 4).map((ref, index) => ({
              toolRef: ref,
              title: `Tool ${index + 1}`,
              provider: 'Provider',
              price: 'AUD 0.00',
              readiness: 'Operational',
            })),
            count: 5,
          },
          {
            type: 'tool-card',
            kind: 'status',
            toolId: 'tool.call',
            state: 'error',
            title: 'Call',
            summary: 'Tool unavailable',
          },
        ],
      },
    ])
    expect(JSON.stringify(shared)).not.toMatch(
      /SECRET|rawOutput|metadata|reasoning|model|usage|errorText|input|arbitrary_internal_tool/u,
    )
    const publicParts = shared.page.flatMap((message) => message.parts)
    const boundedText = publicParts.find((part) => part.type === 'text' && part.text.startsWith('😀'))
    expect(boundedText?.type).toBe('text')
    expect(Array.from(boundedText?.type === 'text' ? boundedText.text : '')).toHaveLength(8_000)
    for (const part of publicParts) {
      if (part.type !== 'tool-card') continue
      if (part.kind === 'status') expect(Array.from(part.summary).length).toBeLessThanOrEqual(240)
    }
    expect(shared.page.every((message: { id: string; role: string; parts: unknown[] }) => Object.keys(message).sort().join(',') === 'id,parts,role'))
      .toBe(true)
  })
})
