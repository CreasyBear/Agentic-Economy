import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import type { ChatModelCostBinding, ChatModelCostBegin, ChatModelCostObserve } from '@/modules/chat/model-cost'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

async function fixture() {
  const backend = convexTestWithMarketComponents()
  const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'model-cost-owner')
  const start = async (key: string) => {
    const turn = await owner.mutation(api.chatTurns.startTurn, {
      principal: { kind: 'clerk' }, clientTurnId: key, prompt: 'Find a weather Tool',
    })
    // The fixture owns no inference. Retain the actual native prompt/turn and
    // cancel only their background generation/deadline before testing storage.
    await backend.run(async ctx => {
      const jobs = await ctx.db.system.query('_scheduled_functions').take(100)
      for (const job of jobs) if (job.state.kind === 'pending'
        && (job.name === 'chatGenerate:generate' || job.name === 'chatTurns:finishTurn')) {
        await ctx.scheduler.cancel(job._id)
      }
    })
    const binding: ChatModelCostBinding = { turnRef: turn.turnRef, threadId: turn.threadId, promptMessageId: turn.promptMessageId }
    return binding
  }
  const binding = await start('cost-turn')
  const begin = (requestRef: string, overrides: Partial<ChatModelCostBegin> = {}) => backend.mutation(internal.chatModelCost.begin, {
    ...binding, requestRef, source: 'openrouter', purpose: 'initial', requestedModel: 'provider/model', ...overrides,
  })
  const observe = (requestRef: string, overrides: Partial<ChatModelCostObserve> = {}) => backend.mutation(internal.chatModelCost.observe, {
    ...binding, requestRef, accounting: { status: 'unpriced', reason: 'missing_usage' }, ...overrides,
  })
  const finish = (state: 'completed' | 'input-required' | 'auth-required' = 'completed') => backend.mutation(internal.chatTurns.finishTurn, {
    turnRef: binding.turnRef, promptMessageId: binding.promptMessageId, state,
  })
  const read = () => backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef })
  const rows = () => backend.run(ctx => ctx.db.query('chatModelCostRequests').collect())
  return { backend, owner, canonicalAccountRef, binding, start, begin, observe, finish, read, rows }
}

describe('durable model-cost request storage', () => {
  it('deduplicates concurrent starts and completions, preserving exact priced facts and the canonical Account', async () => {
    const f = await fixture()
    await Promise.all([f.begin('request:one'), f.begin('request:one')])
    const observed = { model: 'provider/actual-model', inputTokens: 21, outputTokens: 5,
      providerGenerationId: 'gen-one', accounting: { status: 'priced', amountUsd: '0.1000', source: 'inline' } } as const
    await Promise.all([f.observe('request:one', observed), f.observe('request:one', observed)])
    await f.finish()
    expect(await f.read()).toEqual({ turnRef: f.binding.turnRef, status: 'complete', knownCostUsd: '0.1', requestCount: 1,
      unknownRequestCount: 0, requests: [{ requestRef: 'request:one', source: 'openrouter', purpose: 'initial', requestedModel: 'provider/model',
        model: 'provider/actual-model', inputTokens: 21, outputTokens: 5, providerGenerationId: 'gen-one',
        accounting: { status: 'priced', amountUsd: '0.1', source: 'inline' } }] })
    const before = await f.rows()
    expect(before).toHaveLength(1)
    expect(before[0]?.accountRef).toBe(f.canonicalAccountRef)
    await f.begin('request:one')
    await f.observe('request:one', observed)
    await f.observe('request:one', { accounting: { status: 'unpriced', reason: 'lookup_failed' } })
    expect(await f.rows()).toEqual(before)
  })

  it('rejects changed request material, prompt/turn binding and accepted usage/price without modifying evidence', async () => {
    const f = await fixture()
    await f.begin('request:one')
    await f.observe('request:one', { model: 'provider/model', inputTokens: 10,
      accounting: { status: 'priced', amountUsd: '0.2', source: 'inline' } })
    const before = await f.rows()
    await expect(f.begin('request:one', { requestedModel: 'provider/different' })).rejects.toThrow('model_cost_request_conflict')
    await expect(f.begin('request:one', { source: 'jev' })).rejects.toThrow('model_cost_request_conflict')
    await expect(f.observe('request:one', { promptMessageId: 'different-prompt' })).rejects.toThrow('model_cost_binding_invalid')
    for (const update of [{ model: 'provider/other' }, { inputTokens: 11 },
      { accounting: { status: 'priced', amountUsd: '0.3', source: 'inline' } }] as const) {
      await expect(f.observe('request:one', update)).rejects.toThrow('model_cost_observation_conflict')
    }
    const other = await f.start('other-turn')
    await expect(f.begin('request:one', other)).rejects.toThrow('model_cost_request_conflict')
    expect(await f.rows()).toEqual(before)
  })

  it('counts one provider generation once under concurrent observations and keeps the refused request visibly pending', async () => {
    const f = await fixture()
    await Promise.all([f.begin('request:a'), f.begin('request:b')])
    const accounting = { status: 'priced', amountUsd: '0.01', source: 'inline' } as const
    const results = await Promise.allSettled(['request:a', 'request:b'].map(ref => f.observe(ref, { providerGenerationId: 'gen-shared', accounting })))
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(row => row.status === 'rejected')).toHaveLength(1)
    await f.finish()
    expect(await f.read()).toMatchObject({ status: 'incomplete', knownCostUsd: '0.01', requestCount: 2, unknownRequestCount: 1 })
    const rows = await f.rows()
    expect(rows.filter(row => row.providerGenerationId === 'gen-shared')).toHaveLength(1)
    expect(rows.filter(row => row.accounting.status === 'pending')).toHaveLength(1)
  })

  it('accepts bound late completion after cancellation and forbids a new request after that generation finished', async () => {
    const f = await fixture()
    await f.begin('request:late')
    expect(await f.owner.mutation(api.chatTurns.cancelTurn, { principal: { kind: 'clerk' }, turnRef: f.binding.turnRef }))
      .toMatchObject({ kind: 'stopped' })
    expect(await f.read()).toMatchObject({ status: 'incomplete', unknownRequestCount: 1 })
    await f.observe('request:late', { accounting: { status: 'priced', amountUsd: '0', source: 'inline' } })
    expect(await f.read()).toMatchObject({ status: 'complete', knownCostUsd: '0', requestCount: 1, unknownRequestCount: 0 })
    await expect(f.begin('request:after-cancel')).rejects.toThrow('model_cost_turn_finished')
    expect(await f.rows()).toHaveLength(1)
  })

  it.each(['completed', 'input-required', 'auth-required'] as const)('distinguishes tracked zero-request %s answers from historical untracked answers', async state => {
      const f = await fixture()
      expect(await f.read()).toMatchObject({ status: 'incomplete', knownCostUsd: '0', requestCount: 0 })
      await f.finish(state)
      expect(await f.read()).toMatchObject({ status: 'complete', knownCostUsd: '0', requestCount: 0, requests: [] })
      await f.backend.run(async ctx => {
        const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', f.binding.turnRef)).unique()
        if (turn === null) throw new Error('historical_turn_fixture_missing')
        await ctx.db.patch(turn._id, { modelCostTrackingVersion: undefined })
      })
      expect(await f.read()).toMatchObject({ status: 'untracked', requestCount: 0, requests: [] })
      expect(await f.backend.query(internal.chatModelCost.readTurn, { turnRef: 'turn:missing' })).toMatchObject({ status: 'untracked' })
    })

  it('keeps Jev usage visibly unpriced and refuses invalid or sensitive observation material', async () => {
    const f = await fixture()
    await f.begin('jev:request', { source: 'jev', purpose: 'discovery_rerank', requestedModel: '~typesafe/jev-latest' })
    await f.observe('jev:request', { model: '~typesafe/jev-latest', inputTokens: 42, outputTokens: 0,
      accounting: { status: 'unpriced', reason: 'jev_usage_only' } })
    await f.finish()
    expect(await f.read()).toMatchObject({ status: 'incomplete', knownCostUsd: '0', unknownRequestCount: 1,
      requests: [{ model: '~typesafe/jev-latest', inputTokens: 42, outputTokens: 0, accounting: { status: 'unpriced', reason: 'jev_usage_only' } }] })
    const before = await f.rows()
    await expect(f.observe('jev:request', { outputTokens: -1 })).rejects.toThrow('model_cost_usage_invalid')
    await expect(f.observe('jev:request', { inputTokens: 1.2 })).rejects.toThrow('model_cost_usage_invalid')
    await expect(f.observe('jev:request', { inputTokens: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow('model_cost_usage_invalid')
    await expect(f.observe('jev:request', { model: 'raw prompt or error text' })).rejects.toThrow('model_cost_model_invalid')
    await expect(f.observe('jev:request', { accounting: { status: 'priced', amountUsd: '1', source: 'inline' } })).rejects.toThrow('model_cost_price_source_invalid')
    expect(await f.rows()).toEqual(before)
    const summary = await f.read()
    for (const key of ['accountRef', 'promptMessageId', 'error', 'rawBody']) expect(Object.keys(summary.requests[0]!)).not.toContain(key)
  })

  it('records known costs for an already working historical turn without inventing tracking coverage', async () => {
    const f = await fixture()
    await f.backend.mutation(internal.chatTurns.finishTurn, { turnRef: f.binding.turnRef, promptMessageId: f.binding.promptMessageId, state: 'working' })
    await f.backend.run(async ctx => {
      const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', f.binding.turnRef)).unique()
      if (turn === null) throw new Error('historical_turn_fixture_missing')
      await ctx.db.patch(turn._id, { modelCostTrackingVersion: undefined })
    })
    await f.begin('request:historical')
    await f.observe('request:historical', { accounting: { status: 'priced', amountUsd: '0.125', source: 'inline' } })
    await f.finish()
    expect(await f.read()).toMatchObject({ status: 'untracked', knownCostUsd: '0.125', requestCount: 1, unknownRequestCount: 0 })
    const turn = await f.backend.run(ctx => ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', f.binding.turnRef)).unique())
    expect(turn?.modelCostTrackingVersion).toBeUndefined()
  })

  it('claims at most three metadata lookups despite duplicates, and stops all claims after pricing', async () => {
    const f = await fixture()
    await f.begin('request:stats')
    await f.observe('request:stats', { model: 'provider/model', inputTokens: 10, providerGenerationId: 'gen-stats' })
    await f.observe('request:stats', { providerGenerationId: 'gen-stats' })
    const initialJobs = await f.backend.run(ctx => ctx.db.system.query('_scheduled_functions').collect())
    expect(initialJobs.filter(job => job.name === 'chatModelCost.actions:reconcile' && job.state.kind === 'pending')).toHaveLength(1)
    const claims = await Promise.all([1, 1].map(attempt => f.backend.mutation(internal.chatModelCost.claimStatsLookup, { requestRef: 'request:stats', attempt })))
    expect(claims.filter(row => row !== null)).toEqual([{ ...f.binding, requestRef: 'request:stats', providerGenerationId: 'gen-stats', model: 'provider/model', inputTokens: 10 }])
    await f.observe('request:stats', { accounting: { status: 'unpriced', reason: 'lookup_failed' } })
    expect(await f.backend.mutation(internal.chatModelCost.claimStatsLookup, { requestRef: 'request:stats', attempt: 2 })).not.toBeNull()
    expect(await f.backend.mutation(internal.chatModelCost.claimStatsLookup, { requestRef: 'request:stats', attempt: 3 })).not.toBeNull()
    expect(await f.backend.mutation(internal.chatModelCost.claimStatsLookup, { requestRef: 'request:stats', attempt: 3 })).toBeNull()
    expect(await f.backend.mutation(internal.chatModelCost.claimStatsLookup, { requestRef: 'request:stats', attempt: 4 })).toBeNull()
    const jobs = await f.backend.run(ctx => ctx.db.system.query('_scheduled_functions').collect())
    expect(jobs.filter(job => job.name === 'chatModelCost.actions:reconcile')).toHaveLength(3)
    await f.observe('request:stats', { accounting: { status: 'priced', amountUsd: '0.0123', source: 'generation_stats' } })
    expect(await f.backend.mutation(internal.chatModelCost.claimStatsLookup, { requestRef: 'request:stats', attempt: 2 })).toBeNull()
    await f.finish()
    expect(await f.read()).toMatchObject({ status: 'complete', knownCostUsd: '0.0123', unknownRequestCount: 0 })
  })

  it('reports a bounded incomplete read instead of silently claiming lifetime request coverage', async () => {
    const f = await fixture()
    for (let index = 0; index < 257; index += 1) await f.begin(`request:bounded:${index}`)
    await f.finish()
    const summary = await f.read()
    expect(summary).toMatchObject({ status: 'limit_exceeded', requestCount: 257, unknownRequestCount: 256, knownCostUsd: '0' })
    expect(summary.requests).toHaveLength(256)
    expect(await f.rows()).toHaveLength(257)
  })
})
