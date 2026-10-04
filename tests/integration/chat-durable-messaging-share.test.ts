import { listUIMessages, mockModel, saveMessage, saveMessages } from '@convex-dev/agent'
import { getFunctionName } from 'convex/server'
import type { ActionCtx } from '../../convex/_generated/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, components, internal } from '../../convex/_generated/api'
import { streamDurableChatResponse } from '../../convex/lib/chat/generate/stream'
import { streamAnonymousChatResponse } from '../../convex/lib/chat/anonymous/stream'
import type { IndexedSource } from '../../convex/lib/market/directoryIndex/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { projectToolCard } from '@/modules/chat/tool-card'
import { formatRunRequest } from '@/modules/chat/run-request'
import { convexTestWithMarketComponents, createTestAgentPrincipal, publishedBusinessOwner, type ConvexFixtureBackend } from '../helpers/convex-fixtures'
import { admitDiscoveredToolFixture } from '../helpers/discovered-tool-fixture'
import { withSourceWrite } from '../helpers/source-write-admission'

const SHARE_SECRET = 'chat-share-integration-secret-with-at-least-32-characters'
const SHARE_KEY_ID = 'chat-share:integration'
const previousShareSecret = process.env.AE_CHAT_SHARE_SECRET
const previousShareKeyId = process.env.AE_CHAT_SHARE_KEY_ID

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

async function drainExpectedUnavailableGenerations(
  backend: ConvexFixtureBackend,
): Promise<void> {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    await backend.finishAllScheduledFunctions(() => undefined)
  } finally {
    error.mockRestore()
  }
}

async function startManuallyGeneratedTurn<T extends { promptMessageId: string }>(
  backend: ConvexFixtureBackend,
  start: () => Promise<T>,
): Promise<T> {
  // Hold the real scheduled generator while this fixture supplies a mock model.
  vi.useFakeTimers()
  try {
    const turn = await start()
    await backend.run(async ctx => {
      const jobs = await ctx.db.system.query('_scheduled_functions').take(100)
      const scheduled = jobs.find(job => job.name === 'chatGenerate:generate'
        && job.state.kind === 'pending'
        && job.args.some(arg => typeof arg === 'object' && arg !== null && !Array.isArray(arg)
          && 'promptMessageId' in arg && arg.promptMessageId === turn.promptMessageId))
      if (scheduled === undefined) throw new Error('manual_chat_generation_schedule_missing')
      await ctx.scheduler.cancel(scheduled._id)
      // Manual generation also owns this turn's deadline; draining every timer would expire it first.
      for (const job of jobs) {
        if (job.name === 'chatTurns:finishTurn' && job.state.kind === 'pending'
          && job.args.some(arg => typeof arg === 'object' && arg !== null && !Array.isArray(arg)
            && 'promptMessageId' in arg && arg.promptMessageId === turn.promptMessageId)) {
          await ctx.scheduler.cancel(job._id)
        }
      }
    })
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    return turn
  } finally {
    vi.useRealTimers()
  }
}

describe.sequential('durable Tool chat messaging and shares', () => {
  beforeEach(() => {
    process.env.AE_CHAT_SHARE_SECRET = SHARE_SECRET
    process.env.AE_CHAT_SHARE_KEY_ID = SHARE_KEY_ID
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    restoreEnvironment('AE_CHAT_SHARE_SECRET', previousShareSecret)
    restoreEnvironment('AE_CHAT_SHARE_KEY_ID', previousShareKeyId)
  })

  it('records an observed zero when Card Run saves an answer without requesting a model', async () => {
    const backend = convexTestWithMarketComponents()
    const { principal } = await createTestAgentPrincipal(backend, 'card-run-cost')
    const binding = await startManuallyGeneratedTurn(backend, async () => backend.mutation(api.chatTurns.startTurn,
      await withSourceWrite('protected_action', {
        principal: { kind: 'agent_key' as const, ...principal }, clientTurnId: 'card-run-cost',
        prompt: formatRunRequest(`operation:v1:${'d'.repeat(64)}`, {}),
        operationKey: 'chat-turn.start', correlationId: 'card-run-cost',
      })))
    await backend.mutation(internal.chatTurns.finishTurn, { turnRef: binding.turnRef,
      promptMessageId: binding.promptMessageId, state: 'working' })
    const searchTurn = { turnRef: binding.turnRef, threadId: binding.threadId, promptMessageId: binding.promptMessageId }
    const current = await backend.query(internal.chatTurns.authorizeKeyGeneration, searchTurn)
    if (current === null) throw new Error('card_run_authority_missing')
    const model = mockModel({ content: [{ type: 'text', text: 'Must not request this model' }] })
    const outbound = vi.spyOn(model, 'doStream')
    await backend.action(ctx => streamDurableChatResponse(ctx, { ...searchTurn, ownerId: current.ownerId,
      trustedChatAuthority: current.authority, searchTurn }, model))
    await backend.mutation(internal.chatTurns.finishTurn, { turnRef: binding.turnRef,
      promptMessageId: binding.promptMessageId, state: 'completed' })
    expect(outbound).not.toHaveBeenCalled()
    expect(await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })).toMatchObject({
      status: 'complete', knownCostUsd: '0', requestCount: 0, unknownRequestCount: 0, requests: [],
    })
    const messages = await backend.run(ctx => listUIMessages(ctx, components.agent, {
      threadId: binding.threadId, paginationOpts: { cursor: null, numItems: 20 },
    }))
    expect(messages.page.some(message => message.role === 'assistant' && message.text.trim().length > 0)).toBe(true)
  })

  it.each(['immediate_explanation', 'initial', 'final_answer'] as const)(
    'persists each actual %s request before SDK provider I/O while retaining answer behavior', async surface => {
      const backend = convexTestWithMarketComponents()
      const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, `chat-cost-${surface}`)
      const binding = await startManuallyGeneratedTurn(backend, () => owner.mutation(api.chatTurns.startTurn, {
        principal: { kind: 'clerk' }, clientTurnId: `cost-${surface}`, prompt: 'Find an exchange-rate Tool',
      }))
      const model = mockModel({ contentSteps: surface === 'final_answer' ? [
        [{ type: 'tool-call', toolCallId: 'inspect-for-cost', toolName: 'registry_tools_describe',
          input: JSON.stringify({ toolRef: `operation:v1:${'a'.repeat(64)}` }) }],
        [{ type: 'text', text: 'Checking those results' }],
        [{ type: 'text', text: 'No current exchange-rate Tool was verified.' }],
      ] : [[{ type: 'text', text: 'No current exchange-rate Tool was verified.' }]] })
      const original = model.doStream.bind(model)
      let outbound = 0
      const calls = vi.spyOn(model, 'doStream').mockImplementation(async options => {
        outbound += 1
        const summary = await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })
        const requests = summary.requests.filter(request => request.source === 'openrouter')
        expect(requests).toHaveLength(outbound)
        expect(requests.at(-1)?.accounting).toEqual({ status: 'pending' })
        return await original(options)
      })
      await backend.action(ctx => {
        const context = surface === 'immediate_explanation' ? ctx : new Proxy(ctx, {
          get(target, property, receiver) {
            if (property === 'runAction') return (...args: Parameters<ActionCtx['runAction']>) => {
              if (getFunctionName(args[0]) === 'capabilityToolCatalog:searchInternal') {
                return Promise.reject(new Error('catalogue_unavailable'))
              }
              return Reflect.apply(target.runAction, target, args)
            }
            return Reflect.get(target, property, receiver) as unknown
          },
        }) as ActionCtx
        return streamDurableChatResponse(context, {
          threadId: binding.threadId, ownerId: canonicalAccountRef, promptMessageId: binding.promptMessageId,
          searchTurn: { turnRef: binding.turnRef, threadId: binding.threadId, promptMessageId: binding.promptMessageId },
        }, model)
      })
      const summary = await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })
      const requests = summary.requests.filter(request => request.source === 'openrouter')
      expect(requests.map(request => request.purpose)).toEqual(surface === 'final_answer'
        ? ['initial', 'initial', 'final_answer'] : [surface])
      expect(new Set(requests.map(request => request.requestRef)).size).toBe(requests.length)
      expect(requests.every(request => request.accounting.status === 'unpriced')).toBe(true)
      expect(calls).toHaveBeenCalledTimes(surface === 'final_answer' ? 3 : 1)
      if (surface === 'final_answer') expect(calls.mock.lastCall?.[0].tools).toBeUndefined()
      const messages = await backend.run(ctx => listUIMessages(ctx, components.agent, {
        threadId: binding.threadId, paginationOpts: { cursor: null, numItems: 20 },
      }))
      expect(messages.page.some(message => message.role === 'assistant' && message.text.trim().length > 0)).toBe(true)
      calls.mockRestore()
    },
  )

  it('atomically creates an owned thread, saves the normalized prompt, and derives its title', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-owner')
    const { owner: other } = await publishedBusinessOwner(backend, 'chat-other')

    const sent = await owner.mutation(internal.chatMessages.sendMessage, {
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
    await expect(backend.mutation(internal.chatMessages.sendMessage, {
      prompt: 'anonymous prompt',
    })).rejects.toThrow('unauthenticated')
    await expect(owner.mutation(internal.chatMessages.sendMessage, {
      prompt: '   ',
    })).rejects.toThrow('invalid_input')
    await expect(owner.mutation(internal.chatMessages.sendMessage, {
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
    const first = await owner.mutation(internal.chatMessages.sendMessage, {
      prompt: 'First prompt',
    })

    await expect(owner.mutation(internal.chatMessages.sendMessage, {
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
    const second = await owner.mutation(internal.chatMessages.sendMessage, {
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
    // Keep this case on the model-led recovery path; immediate retrieval has separate coverage.
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-model-owner')
    const created = await owner.mutation(internal.chatThreads.createThread, {
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
    expect(activeStreams).toEqual([])
  })
  it('keeps one fallback assistant reply when immediate explanation is unusable', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-immediate-single-voice-owner')
    const created = await owner.mutation(internal.chatThreads.createThread, {
      title: 'Find an exchange-rate Tool',
    })
    const prompt = await backend.run(ctx => saveMessage(ctx, components.agent, {
      threadId: created.threadId, userId: canonicalAccountRef, prompt: 'Find an exchange-rate Tool',
    }))
    const model = mockModel({ contentSteps: [[{ type: 'text', text: 'No.' }]] })

    await backend.action(ctx => streamDurableChatResponse(ctx, {
      threadId: created.threadId, ownerId: canonicalAccountRef, promptMessageId: prompt.messageId,
    }, model))
    const messages = await backend.run(ctx => listUIMessages(ctx, components.agent, {
      threadId: created.threadId, paginationOpts: { cursor: null, numItems: 20 },
    }))
    const answers = messages.page.filter(message => message.role === 'assistant' && message.text?.trim())
    const searchCards = messages.page.flatMap(message =>
      message.parts.filter(part => part.type === 'tool-registry_tools_search'))
    expect(searchCards).toHaveLength(1)
    expect(answers[0]?.text).not.toBe('No.')
    expect(answers).toHaveLength(1)
  })

  it('uses an earlier search result for follow-ups before choosing another search', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-search-followup-owner')
    const created = await owner.mutation(internal.chatThreads.createThread, { title: 'Search follow-up' })
    const firstPrompt = await backend.run(ctx => saveMessage(ctx, components.agent, {
      threadId: created.threadId, userId: canonicalAccountRef, prompt: 'Find blockchain tools',
    }))
    await backend.run(ctx => saveMessages(ctx, components.agent, {
      threadId: created.threadId,
      userId: canonicalAccountRef,
      promptMessageId: firstPrompt.messageId,
      messages: [
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'prior-search', toolName: 'registry_tools_search', input: { query: 'blockchain' } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'prior-search', toolName: 'registry_tools_search', output: { type: 'json', value: { kind: 'match', marker: 'Earlier blockchain result' } } }] },
      ],
    }))
    const followup = await backend.run(ctx => saveMessage(ctx, components.agent, {
      threadId: created.threadId, userId: canonicalAccountRef,
      prompt: 'Which of those is relevant to blockchain?',
    }))
    const model = mockModel({ contentSteps: [[{
      type: 'text', text: 'The earlier blockchain result is the relevant match.',
    }]] })
    const modelCalls = vi.spyOn(model, 'doStream')

    await backend.action(ctx => streamDurableChatResponse(ctx, {
      threadId: created.threadId, ownerId: canonicalAccountRef, promptMessageId: followup.messageId,
    }, model))

    expect(modelCalls.mock.calls[0]?.[0].toolChoice).toEqual({ type: 'auto' })
    expect(JSON.stringify(modelCalls.mock.calls[0]?.[0])).toContain('Earlier blockchain result')
    const messages = await backend.run(ctx => listUIMessages(ctx, components.agent, {
      threadId: created.threadId, paginationOpts: { cursor: null, numItems: 20 },
    }))
    const searchResults = messages.page.flatMap(message => message.parts.filter(part =>
      part.type === 'tool-registry_tools_search'))
    expect(searchResults).toHaveLength(1)
    expect(messages.page.filter(message => message.role === 'assistant' && message.text.trim())
      .map(message => message.text)).toEqual(['The earlier blockchain result is the relevant match.'])
  })

  it('settles distinct unsuccessful searches without inventing options', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-no-match-owner')
    const created = await owner.mutation(internal.chatThreads.createThread, { title: 'Find an absent Tool' })
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
    const cards = assistant[0]?.parts.map(projectToolCard).filter(card => card?.kind === 'choices') ?? []
    expect(cards).toEqual([])
  })
  it('forces authenticated and guest page-two searches without giving the model a cursor', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTestWithMarketComponents()
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
    const generation = 'chat-next-page-directory'
    await backend.run(async ctx => {
      await ctx.db.insert('marketExternalRegistryGenerations', {
        generation, source: 'coinbase', status: 'refreshing', startedAt: 1, ingestedCount: 0, nextOffset: 0,
      })
      await ctx.db.insert('marketExternalRegistryState', {
        key: 'coinbase', refreshGeneration: generation, lastAttemptAt: 1, lastAttemptStatus: 'refreshing',
      })
    })
    const rows: IndexedSource[] = [1, 2].map(index => {
      const resource = `https://weather.example/tools/${index}`
      const raw = { resource, type: 'http', description: `Weather forecast Tool ${index}` }
      return { resource, sourceJson: JSON.stringify(raw), sourceDigest: canonicalDigest(raw), entry: {
        resource, title: `Weather forecast Tool ${index}`, description: 'Weather forecast by city',
        protocol: 'http', provider: 'weather.example', metadataJson: '',
        category: 'Weather', tags: ['forecast'], activity: { calls30d: index, payers30d: 2 },
        output: { fields: [], schemaJson: '{}' },
        provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared',
          updatedAt: new Date(1_700_000_000_000 + index).toISOString() },
        prices: [{ network: 'base', scheme: 'exact', amount: '1000000', decimalAmount: '1', symbol: 'USDC' }],
      } }
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, {
      generation, offset: 0, reportedTotal: 2, observedAt: 2, runStartedAt: 1, workload, items: rows,
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, {
      generation, offset: 100, reportedTotal: 2, observedAt: 3, runStartedAt: 1, workload, items: [],
    })
    const pageOne = await backend.query(internal.x402DirectoryIndex.searchCompactInternal, {
      query: 'weather', paginationOpts: { cursor: null, numItems: 1 }, access: 'external_listing',
    })
    if (pageOne.kind !== 'ok' || pageOne.isDone || pageOne.page.length !== 1) throw new Error('first_page_missing')
    const pageTwo = await backend.query(internal.x402DirectoryIndex.searchCompactInternal, {
      query: 'weather', paginationOpts: { cursor: pageOne.continueCursor, numItems: 1 },
      access: 'external_listing',
    })
    expect(pageTwo).toMatchObject({ kind: 'ok', page: [{ title: 'Weather forecast Tool 2' }] })
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-next-page-owner')
    const first = await startManuallyGeneratedTurn(backend, async () => owner.mutation(api.chatTurns.startTurn,
      await withSourceWrite('protected_action', {
        principal: { kind: 'clerk' as const }, clientTurnId: 'first-page', prompt: 'Weather in Sydney',
        operationKey: 'chat-page:first', correlationId: 'chat-page:first',
      })))
    await backend.mutation(internal.chatTurns.finishTurn, {
      turnRef: first.turnRef, promptMessageId: first.promptMessageId, state: 'working',
    })
    const firstModel = mockModel({ contentSteps: [
      [{ type: 'tool-call', toolCallId: 'first-search', toolName: 'registry_tools_search',
        input: JSON.stringify({ query: 'weather', source: 'coinbase', limit: 1 }) }],
      [{ type: 'text', text: 'Search results are in the card. Next: inspect the card.' }],
    ] })
    await backend.action(ctx => {
      let immediateAttempted = false
      const unavailableImmediateCatalogue = new Proxy(ctx, {
        get(target, property, receiver) {
          if (property === 'runAction') return (...args: Parameters<ActionCtx['runAction']>) => {
            if (!immediateAttempted && getFunctionName(args[0]) === 'capabilityToolCatalog:searchInternal') {
              immediateAttempted = true
              return Promise.reject(new Error('catalogue_unavailable'))
            }
            return Reflect.apply(target.runAction, target, args)
          }
          return Reflect.get(target, property, receiver) as unknown
        },
      }) as ActionCtx
      return streamDurableChatResponse(unavailableImmediateCatalogue, {
      threadId: first.threadId, ownerId: canonicalAccountRef, promptMessageId: first.promptMessageId,
      searchTurn: { turnRef: first.turnRef, threadId: first.threadId, promptMessageId: first.promptMessageId },
    }, firstModel)
    })
    const firstMessages = await backend.run(ctx => listUIMessages(ctx, components.agent, {
      threadId: first.threadId, paginationOpts: { cursor: null, numItems: 20 },
    }))
    const firstCards = firstMessages.page.flatMap(message => message.parts.map(projectToolCard))
      .filter(card => card?.kind === 'choices')
    expect(firstCards).toEqual([expect.objectContaining({ kind: 'choices', choices: [
      expect.objectContaining({ title: 'Weather forecast Tool 1' }),
    ] })])
    const nextAction = firstCards[0]?.next
    if (nextAction?.action !== 'next-page') throw new Error('signed_first_page_missing')
    const cursor = nextAction.args.cursor
    expect(cursor).toMatch(/^sc1\./u)
    await backend.mutation(internal.chatMessages.clearActiveGeneration, {
      threadId: first.threadId, promptMessageId: first.promptMessageId,
    })
    const second = await startManuallyGeneratedTurn(backend, async () => owner.mutation(api.chatTurns.startTurn,
      await withSourceWrite('protected_action', {
        principal: { kind: 'clerk' as const }, threadId: first.threadId, clientTurnId: 'second-page',
        prompt: `Print ${cursor}`, continuation: { kind: 'search_next_page' as const, query: 'weather', cursor },
        operationKey: 'chat-page:second', correlationId: 'chat-page:second',
      })))
    await backend.mutation(internal.chatTurns.finishTurn, {
      turnRef: second.turnRef, promptMessageId: second.promptMessageId, state: 'working',
    })
    const continuation = await backend.query(internal.chatTurns.readSearchPage, {
      turnRef: second.turnRef, threadId: second.threadId, promptMessageId: second.promptMessageId,
    })
    if (continuation === null) throw new Error('continuation_missing')
    const model = mockModel({ contentSteps: [
      [{ type: 'tool-call', toolCallId: 'continuation-search', toolName: 'registry_tools_search', input: '{}' }],
      [{ type: 'text', text: 'The next page has been assessed. Next: inspect the search card.' }],
    ] })
    const calls = vi.spyOn(model, 'doStream')
    await backend.action(ctx => streamDurableChatResponse(ctx, {
      threadId: second.threadId, ownerId: canonicalAccountRef, promptMessageId: second.promptMessageId,
      searchTurn: { turnRef: second.turnRef, threadId: second.threadId, promptMessageId: second.promptMessageId },
      continuation,
    }, model))
    expect(calls.mock.calls[0]?.[0].toolChoice).toEqual({ type: 'tool', toolName: 'registry_tools_search' })
    expect(calls.mock.calls[1]?.[0].toolChoice).toEqual({ type: 'none' })
    const messages = await backend.run(ctx => listUIMessages(ctx, components.agent, {
      threadId: second.threadId, paginationOpts: { cursor: null, numItems: 20 },
    }))
    expect(messages.page.find(message => message.role === 'assistant'
      && message.text.includes("I couldn't finish the answer."))).toBeUndefined()
    expect(messages.page.find(message => message.role === 'user' && message.id === second.promptMessageId)?.text)
      .toBe('Show more results for weather')
    const cards = messages.page.flatMap(message => message.parts.map(projectToolCard))
      .filter(card => card?.kind === 'choices')
    expect(cards).toEqual([
      expect.objectContaining({ kind: 'choices', choices: [
        expect.objectContaining({ title: 'Weather forecast Tool 1' }),
      ] }),
      expect.objectContaining({ kind: 'choices', choices: [
        expect.objectContaining({ title: 'Weather forecast Tool 2' }),
      ] }),
    ])
    expect(messages.page.map(message => message.text).join(' ')).not.toContain(cursor)
    const guestModel = mockModel({ contentSteps: [
      [{ type: 'tool-call', toolCallId: 'guest-page', toolName: 'registry_tools_search', input: '{}' }],
      [{ type: 'text', text: 'The next weather Tool is in the card below.' }],
    ] })
    const guestStream = await backend.action(async ctx => {
      const response = await streamAnonymousChatResponse(ctx,
        [{ role: 'user', content: 'Show more results for weather' }], guestModel, undefined,
        { kind: 'search_next_page', query: 'weather', cursor: `x402:${pageOne.continueCursor}` })
      return await response.text()
    })
    expect(guestStream).toContain('Weather forecast Tool 2')
    expect(guestStream).not.toContain(pageOne.continueCursor)
    await drainExpectedUnavailableGenerations(backend)
  })

  it('keeps a completed Tool description when the model fails after the tool step', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTestWithMarketComponents()
    const { toolRef } = await admitDiscoveredToolFixture(backend)
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-failed-final-owner')
    const created = await owner.mutation(internal.chatThreads.createThread, { title: 'Timezone Tool' })
    const { messageId } = await backend.run(ctx => saveMessage(ctx, components.agent, {
      threadId: created.threadId, userId: canonicalAccountRef, prompt: 'Describe the timezone Tool',
    }))
    const model = mockModel({ contentSteps: [[{
      type: 'tool-call', toolCallId: 'describe-1', toolName: 'registry_tools_describe',
      input: JSON.stringify({ toolRef }),
    }]] })
    const original = model.doStream.bind(model)
    let attempts = 0
    vi.spyOn(model, 'doStream').mockImplementation(async options => {
      if (++attempts > 1) throw new Error('injected_post_tool_model_failure')
      return original(options)
    })
    await backend.action(ctx => streamDurableChatResponse(ctx, {
      threadId: created.threadId, ownerId: canonicalAccountRef, promptMessageId: messageId,
    }, model))
    const messages = await backend.run(ctx => listUIMessages(ctx, components.agent, {
      threadId: created.threadId, paginationOpts: { cursor: null, numItems: 20 },
    }))
    const answer = messages.page.filter(message => message.role === 'assistant').at(-1)?.text ?? ''
    expect(answer).toContain('Timezone')
    expect(answer).not.toContain('try again')
    expect(messages.page.flatMap(message => message.parts.map(projectToolCard))
      .filter(card => card?.kind === 'choices')).toHaveLength(1)
    expect(attempts).toBe(2)
  })

  it('halts at clarification and reports an input-required stream outcome', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'chat-clarify-owner')
    const created = await owner.mutation(internal.chatThreads.createThread, { title: 'Clarification' })
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

  it('records a typed turn failure when durable generation is unavailable', async () => {
    const previousApiKey = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY
    const backend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(backend, 'chat-unavailable-owner')
    try {
      const sent = await owner.mutation(internal.chatMessages.sendMessage, {
        prompt: 'Find a current weather Operation',
      })
      await drainExpectedUnavailableGenerations(backend)

      const messages = await owner.query(api.chatMessages.listMessages, {
        threadId: sent.threadId,
        paginationOpts: { cursor: null, numItems: 20 },
      })
      const turn = await backend.run(ctx => ctx.db.query('chatTurns')
        .withIndex('by_promptMessageId', index => index.eq('promptMessageId', sent.promptMessageId))
        .unique())
      expect(turn).toMatchObject({ state: 'failed', failureReason: 'generation_failed' })
      expect(messages.page.map((message: { role: string }) => message.role)).toEqual(['user'])
      const prompt = messages.page.find((message: { id: string }) => message.id === sent.promptMessageId)
      expect(prompt?.parts).toContainEqual({
        type: 'data-chat-failure', data: { reason: 'generation_failed' },
      })
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
    const created = await owner.mutation(internal.chatThreads.createThread, { title: 'Rate thread' })

    for (let index = 0; index < 30; index += 1) {
      const sent = await owner.mutation(internal.chatMessages.sendMessage, {
        threadId: created.threadId,
        prompt: `Prompt ${index}`,
      })
      await backend.mutation(internal.chatMessages.clearActiveGeneration, {
        threadId: created.threadId,
        promptMessageId: sent.promptMessageId,
      })
    }
    await expect(owner.mutation(internal.chatMessages.sendMessage, {
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
    const sent = await owner.mutation(internal.chatMessages.sendMessage, {
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
    expect(shared.page).toHaveLength(1)
    expect(shared.page[0]).toEqual({
      id: sent.promptMessageId,
      role: 'user',
      parts: [{ type: 'text', text: 'Compare current weather Tools' }],
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
    const created = await owner.mutation(internal.chatThreads.createThread, {
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
                    kind: 'match',
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
                      price: { kind: 'indicative', label: 'USDC 0.000001' },
                      displayPrice: {
                        kind: 'indicative',
                        amount: { currency: 'AUD', exponent: 6, units: '1' },
                        rateObservedAt: 1_000,
                        validUntil: 2_000_000_000_000,
                      },
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
              price: 'A$0.01',
              readiness: 'ready',
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
