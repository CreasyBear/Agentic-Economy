import { generateText, stepCountIs, streamText, tool } from 'ai'
import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { api, internal } from '../../../convex/_generated/api'
import type { ActionCtx } from '../../../convex/_generated/server'
import { chatModelCostHooks } from '../../../convex/lib/chat/generate/modelCost'
import { openRouterModel } from '@/modules/model-gateway/public'
import type { ChatModelCostBinding } from '@/modules/chat/model-cost'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { startedTurn } from '../../helpers/started-turn'

async function trackedTurn() {
  const backend = convexTestWithMarketComponents()
  const { owner } = await publishedBusinessOwner(backend, 'model-cost-hooks-owner')
  vi.useFakeTimers()
  try {
    const binding = startedTurn(await owner.mutation(api.chatTurns.startTurn, {
      principal: { kind: 'clerk' }, clientTurnId: 'model-cost-hooks', prompt: 'A private test question',
    }))
    await backend.run(async ctx => {
      const jobs = await ctx.db.system.query('_scheduled_functions').take(100)
      for (const job of jobs) {
        if (job.state.kind === 'pending' && (job.name === 'chatGenerate:generate' || job.name === 'chatTurns:finishTurn')) {
          await ctx.scheduler.cancel(job._id)
        }
      }
    })
    return { backend, binding: {
      turnRef: binding.turnRef, threadId: binding.threadId, promptMessageId: binding.promptMessageId,
    } satisfies ChatModelCostBinding }
  } finally {
    vi.useRealTimers()
  }
}

function streamingResponse(cost: number | undefined, headers: Record<string, string> = {}, reportedModel: string | null = 'actual/model') {
  const events = [
    { id: 'provider-body-id', ...(reportedModel === null ? {} : { model: reportedModel }), choices: [{ index: 0, delta: { role: 'assistant', content: 'A useful answer.' }, finish_reason: null }] },
    { id: 'provider-body-id', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10, ...(cost === undefined ? {} : { cost }) } },
  ]
  return new Response(`${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream', ...headers },
  })
}

function model(fetch: typeof globalThis.fetch) {
  return openRouterModel({ apiKey: 'fixture-key', model: 'requested/model' }, 'requested/model', { fetch })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('durable chat cost hooks through the installed SDK', () => {
  it.each([
    { cost: 0, expected: { status: 'priced', amountUsd: '0', source: 'inline' } },
    { cost: 0.0123, expected: { status: 'priced', amountUsd: '0.0123', source: 'inline' } },
    { cost: undefined, expected: { status: 'unpriced', reason: 'missing_usage' } },
    { cost: -0.1, expected: { status: 'unpriced', reason: 'missing_usage' } },
    { cost: 1e30, expected: { status: 'unpriced', reason: 'missing_usage' } },
  ])('records reported cost $cost without inventing missing cost', async ({ cost, expected }) => {
    const { backend, binding } = await trackedTurn()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      expect(await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef }))
        .toMatchObject({ requestCount: 1, requests: [{ accounting: { status: 'pending' } }] })
      return streamingResponse(cost)
    })
    await backend.action(async ctx => {
      const hooks = chatModelCostHooks(ctx, binding, 'initial')
      const result = streamText({ model: model(fetch), prompt: 'A private test question', ...hooks, maxRetries: 0 })
      expect(await result.text).toBe('A useful answer.')
      await result.steps
    })
    const summary = await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })
    expect(summary).toMatchObject({ requestCount: 1, unknownRequestCount: expected.status === 'priced' ? 0 : 1,
      requests: [{ requestedModel: 'requested/model', model: 'actual/model', inputTokens: 7, outputTokens: 3, accounting: expected }] })
    expect(summary.requests[0]).not.toHaveProperty('providerGenerationId')
    expect(JSON.stringify(summary)).not.toContain('private test question')
  })

  it.each(['gen-header-1', 'invalid id with spaces', 'gen/not-a-lookup-id'])('only joins a validated provider generation header: %s', async header => {
    const { backend, binding } = await trackedTurn()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => streamingResponse(0.005, { 'x-generation-id': header }))
    await backend.action(async ctx => {
      const hooks = chatModelCostHooks(ctx, binding, 'immediate_explanation')
      const result = streamText({ model: model(fetch), prompt: 'Test', ...hooks, maxRetries: 0 })
      await result.text
      await result.steps
    })
    const summary = await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })
    expect(summary.requests[0]?.providerGenerationId).toBe(header === 'gen-header-1' ? header : undefined)
    expect(summary.requests[0]?.providerGenerationId).not.toBe('provider-body-id')
  })

  it.each([null, 'requested/model', 'actual/model'])(
    'does not promote the SDK model fallback into provider evidence: %s', async reportedModel => {
      const { backend, binding } = await trackedTurn()
      const fetch = vi.fn<typeof globalThis.fetch>(async () => streamingResponse(0.005, {}, reportedModel))
      await backend.action(async ctx => {
        const result = streamText({ model: model(fetch), prompt: 'Test',
          ...chatModelCostHooks(ctx, binding, 'initial'), maxRetries: 0 })
        expect(await result.text).toBe('A useful answer.')
        const steps = await result.steps
        expect(steps[0]?.response.modelId).toBe(reportedModel ?? 'requested/model')
      })
      const summary = await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })
      expect(summary).toMatchObject({ knownCostUsd: '0.005', requestCount: 1, unknownRequestCount: 0,
        requests: [{ requestedModel: 'requested/model', accounting: { status: 'priced', amountUsd: '0.005', source: 'inline' } }] })
      if (reportedModel === 'actual/model') expect(summary.requests[0]?.model).toBe('actual/model')
      else expect(summary.requests[0]).not.toHaveProperty('model')
    },
  )

  it('refuses a mismatched Turn binding before the external model request', async () => {
    const { backend, binding } = await trackedTurn()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => streamingResponse(0.01))
    await expect(backend.action(async ctx => {
      const hooks = chatModelCostHooks(ctx, { ...binding, promptMessageId: 'foreign-prompt' }, 'initial')
      const result = streamText({ model: model(fetch), prompt: 'Test', ...hooks, maxRetries: 0 })
      await result.text
      await result.steps
    })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    expect(await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })).toMatchObject({ requestCount: 0 })
  })

  it('a failed start write prevents outbound I/O despite SDK notification error suppression', async () => {
    const { backend, binding } = await trackedTurn()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => streamingResponse(0.01))
    await expect(backend.action(async ctx => {
      const unavailable = new Proxy(ctx, {
        get(target, property, receiver) {
          if (property === 'runMutation') return (...args: Parameters<ActionCtx['runMutation']>) => {
            if (getFunctionName(args[0]) === 'chatModelCost:begin') return Promise.reject(new Error('database_unavailable'))
            return Reflect.apply(target.runMutation, target, args)
          }
          return Reflect.get(target, property, receiver) as unknown
        },
      }) as ActionCtx
      const hooks = chatModelCostHooks(unavailable, binding, 'initial')
      const result = streamText({ model: model(fetch), prompt: 'Test', ...hooks, maxRetries: 0 })
      await result.text
      await result.steps
    })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retains a pending record when completion storage is unavailable and keeps the usable answer', async () => {
    const { backend, binding } = await trackedTurn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetch = vi.fn<typeof globalThis.fetch>(async () => streamingResponse(0.01))
    await backend.action(async ctx => {
      const unavailable = new Proxy(ctx, {
        get(target, property, receiver) {
          if (property === 'runMutation') return (...args: Parameters<ActionCtx['runMutation']>) => {
            if (getFunctionName(args[0]) === 'chatModelCost:observe') return Promise.reject(new Error('secret-provider-body'))
            return Reflect.apply(target.runMutation, target, args)
          }
          return Reflect.get(target, property, receiver) as unknown
        },
      }) as ActionCtx
      const result = streamText({ model: model(fetch), prompt: 'Test', ...chatModelCostHooks(unavailable, binding, 'final_answer'), maxRetries: 0 })
      expect(await result.text).toBe('A useful answer.')
      await result.steps
    })
    expect(await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef }))
      .toMatchObject({ knownCostUsd: '0', unknownRequestCount: 1, requests: [{ accounting: { status: 'pending' } }] })
    expect(error).toHaveBeenCalled()
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-provider-body')
  })

  it('keeps one identity per SDK step and composes selection and repeated completion without double cost', async () => {
    const { backend, binding } = await trackedTurn()
    const callbacks: number[] = []
    const bodies: Record<string, unknown>[] = []
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const number = bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      const summary = await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })
      expect(summary.requestCount).toBe(number)
      expect(summary.requests.at(-1)?.accounting).toEqual({ status: 'pending' })
      return new Response(JSON.stringify({ id: `body-${number}`, model: 'actual/model',
        choices: [{ message: number === 1
          ? { role: 'assistant', content: null, tool_calls: [{ id: 'lookup-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }] }
          : { role: 'assistant', content: 'Done.' }, finish_reason: number === 1 ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10, cost: number === 1 ? 0.01 : 0.02 },
      }), { headers: { 'content-type': 'application/json', 'x-generation-id': `gen-step-${number}` } })
    })
    await backend.action(async ctx => {
      const hooks = chatModelCostHooks(ctx, binding, 'initial')
      const result = await generateText({
        model: model(fetch), prompt: 'Test', maxRetries: 0, stopWhen: stepCountIs(2),
        tools: { lookup: tool({ inputSchema: z.object({}), execute: async () => 'a retained tool result' }) },
        onStart: hooks.onStart,
        prepareStep: async options => { await hooks.prepareStep(options); return { toolChoice: options.stepNumber === 0 ? 'required' : 'none' } },
        onStepEnd: async step => { callbacks.push(step.stepNumber); await hooks.onStepEnd(step); await hooks.onStepEnd(step) },
      })
      expect(result.steps[0]?.toolResults[0]?.output).toBe('a retained tool result')
      expect(result.text).toBe('Done.')
    })
    const summary = await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })
    expect(summary).toMatchObject({ requestCount: 2, knownCostUsd: '0.03', unknownRequestCount: 0 })
    const references = summary.requests.map(request => request.requestRef)
    expect(references[0]).toMatch(/:0$/u)
    expect(references[1]).toMatch(/:1$/u)
    expect(references[0]?.replace(/:\d+$/u, '')).toBe(references[1]?.replace(/:\d+$/u, ''))
    expect(callbacks).toEqual([0, 1])
    expect(bodies.map(body => body.tool_choice)).toEqual(['required', 'none'])
  })

  it('leaves an interrupted in-flight request pending without a synthetic generation join', async () => {
    const { backend, binding } = await trackedTurn()
    const controller = new AbortController()
    let outbound: (() => void) | undefined
    const started = new Promise<void>(resolve => { outbound = resolve })
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      outbound?.()
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    })
    const result = backend.action(async ctx => {
      const generation = streamText({ model: model(fetch), prompt: 'Test', ...chatModelCostHooks(ctx, binding, 'initial'),
        maxRetries: 0, abortSignal: controller.signal })
      await generation.text
      await generation.steps
    })
    await started
    controller.abort()
    await result.catch(() => undefined)
    expect(await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef }))
      .toMatchObject({ knownCostUsd: '0', unknownRequestCount: 1, requests: [{ accounting: { status: 'pending' } }] })
    expect((await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })).requests[0])
      .not.toHaveProperty('providerGenerationId')
  })

  it('leaves legacy generation without a durable binding untracked', async () => {
    const { backend, binding } = await trackedTurn()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => streamingResponse(0.01))
    await backend.action(async ctx => {
      const result = streamText({ model: model(fetch), prompt: 'Test', ...chatModelCostHooks(ctx, undefined, 'initial'), maxRetries: 0 })
      await result.text
      await result.steps
    })
    expect(fetch).toHaveBeenCalledOnce()
    expect(await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })).toMatchObject({ requestCount: 0 })
  })
})
