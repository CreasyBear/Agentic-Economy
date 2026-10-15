import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { listUIMessages, mockModel } from '@convex-dev/agent'
import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defaultSettingsMiddleware, wrapLanguageModel } from 'ai'
import { api, components, internal } from '../../convex/_generated/api'
import type { ActionCtx } from '../../convex/_generated/server'
import { streamDurableChatResponse } from '../../convex/lib/chat/generate/stream'
import { callResultSchema } from '@/modules/capability-execution/call-contracts'
import { serializeToolSearchResult, serializeToolDetailResult } from '@/modules/capability-supply/public'
import { formatRunRequest } from '@/modules/chat/run-request'
import { openRouterModel, DEFAULT_OPENROUTER_MODEL } from '@/modules/model-gateway/public'
import { FixtureMarket, AUDIT_REF, RESEARCH_REF, amount } from '../../experiments/chat-trial/fixture-market'
import { convexTestWithMarketComponents, createTestAgentPrincipal } from '../helpers/convex-fixtures'
import { mockSearchTool, misorderedSearchResult } from '../helpers/tool-search-rerank-fixtures'
import { startedTurn } from '../helpers/started-turn'
import { withSourceWrite } from '../helpers/source-write-admission'

const reports: unknown[] = []
const live = process.env.AE_LIVE_CHAT_TRIAL === '1'
afterEach(() => {
  vi.unstubAllEnvs()
  if (process.env.AE_CHAT_TRIAL_REPORT === '1') writeFileSync(`output/chat-trial/evidence/current${live ? '-live-model' : ''}-results.json`,
    JSON.stringify({ synthetic: true, model: live ? DEFAULT_OPENROUTER_MODEL : 'mockModel scripted tool decisions', runtime: 'actual streamDurableChatResponse and Convex Agent storage', results: reports }, null, 2))
})

describe.sequential('current chat research-to-action trial through the actual runtime', () => {
  it.each(['research', 'audit', 'authority', 'uncertain'] as const)('records the %s journey without replacing the runtime', async scenario => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTestWithMarketComponents()
    const { principal } = await createTestAgentPrincipal(backend, `trial-${scenario}`)
    const market = new FixtureMarket()
    const sessionId = `baseline-${scenario}`
    market.create({ id: sessionId, mode: scenario === 'authority' ? 'approval' : scenario === 'uncertain' ? 'held_uncertain' : 'active' })
    const toolRef = scenario === 'research' ? RESEARCH_REF : AUDIT_REF
    const input = scenario === 'research' ? { keyword: 'battery storage' } : { url: 'https://example.com' }
    vi.useFakeTimers()
    const binding = startedTurn(await backend.mutation(api.chatTurns.startTurn,
      await withSourceWrite('protected_action', { principal: { kind: 'agent_key' as const, ...principal },
        clientTurnId: scenario, prompt: scenario === 'research' ? 'Research battery storage and return a sourced table.' : formatRunRequest(toolRef, input),
        operationKey: 'chat-turn.start', correlationId: scenario })))
    await backend.run(async ctx => {
      const jobs = await ctx.db.system.query('_scheduled_functions').take(100)
      for (const job of jobs.filter(job => ['chatGenerate:generate', 'chatTurns:finishTurn'].includes(job.name)
        && job.state.kind === 'pending' && job.args.some(arg => typeof arg === 'object' && arg !== null
          && !Array.isArray(arg) && 'promptMessageId' in arg && arg.promptMessageId === binding.promptMessageId))) {
        await ctx.scheduler.cancel(job._id)
      }
    })
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    vi.useRealTimers()
    await backend.mutation(internal.chatTurns.finishTurn, { turnRef: binding.turnRef, promptMessageId: binding.promptMessageId, state: 'working' })
    const searchTurn = { turnRef: binding.turnRef, threadId: binding.threadId, promptMessageId: binding.promptMessageId }
    const current = await backend.query(internal.chatTurns.authorizeKeyGeneration, searchTurn)
    if (current === null) throw new Error('trial_authority_missing')
    const native = mockSearchTool(toolRef, 'battery.research', 'Battery storage research', 'Research battery storage and return dated evidence with source links.')
    const descriptor = { ...native,
      commercial: { ...native.commercial, price: { kind: 'fixed' as const, amount } },
      contract: { ...native.contract,
        inputJsonSchema: { type: 'object', properties: { keyword: { type: 'string', description: 'The subject to research' } }, required: ['keyword'], additionalProperties: false },
        outputJsonSchema: { type: 'object', properties: { synthetic: { type: 'boolean' }, sources: { type: 'array', items: {
          type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, date: { type: 'string' }, fact: { type: 'string' } },
          required: ['title', 'url', 'date', 'fact'] } } }, required: ['synthetic', 'sources'] } } }
    const nativeSearch = { ...misorderedSearchResult('battery storage research'), items: [descriptor] }
    const quoteRef = `operation-commitment:v1:${createHash('sha256').update(JSON.stringify([sessionId, binding.turnRef, { toolRef, input }])).digest('hex')}`
    const toolCall = (toolName: string, args: unknown) => [{ type: 'tool-call' as const, toolCallId: toolName, toolName, input: JSON.stringify(args) }]
    const table = '**Completed synthetic research**\n\n| Finding | Date | Source |\n|---|---|---|\n| Fixture battery capacity is 42 MWh. | 2026-10-14 | [Fixture battery capacity](https://research.example/battery-capacity) |'
    const scripted = mockModel({ contentSteps: [
      toolCall('registry_tools_search', { query: 'battery storage research', source: 'current' }),
      toolCall('registry_tools_describe', { toolRef }),
      toolCall('tool_quote', { toolRef, input }),
      toolCall('tool_call', { quoteRef }),
      [{ type: 'text', text: table }],
      [{ type: 'text', text: table }],
    ] })
    const model = live ? wrapLanguageModel({ model: openRouterModel({ ...(process.env.OPENROUTER_API_KEY ? { apiKey: process.env.OPENROUTER_API_KEY } : {}),
      model: DEFAULT_OPENROUTER_MODEL }, DEFAULT_OPENROUTER_MODEL),
      middleware: defaultSettingsMiddleware({ settings: { maxOutputTokens: 1000 } }) }) : scripted
    const outbound = vi.spyOn(model, 'doStream')
    const begin = performance.now()
    const seams: string[] = []
    let failure: string | undefined
    try { await backend.action(ctx => streamDurableChatResponse(new Proxy(ctx, { get(target, property, receiver) {
      if (property === 'runAction') return async (...args: Parameters<ActionCtx['runAction']>) => {
        const name = getFunctionName(args[0]); seams.push(name)
        if (name === 'capabilityToolCatalog:searchInternal') return serializeToolSearchResult(nativeSearch)
        if (name === 'capabilityToolCatalog:presentSearch') return { result: serializeToolSearchResult(nativeSearch) }
        if (name === 'capabilityToolCatalog:detailInternal') return serializeToolDetailResult({ kind: 'found', schemaVersion: 'registry-tools:v3', tool: descriptor })
        if (name === 'chatQuote:quote') {
          const value = z.object({ toolRef: z.string(), input: z.record(z.string(), z.unknown()) }).parse(args[1])
          return market.execute(sessionId, 'tool.quote', value, binding.turnRef)
        }
        if (name === 'chatCall:call') {
          const value = z.object({ quoteRef: z.string(), idempotencyKey: z.string() }).parse(args[1])
          const result = z.object({ kind: z.string() }).passthrough().parse(market.execute(sessionId, 'tool.call', value, binding.turnRef))
          const { next: _next, ...native } = result
          return callResultSchema.parse(result.kind === 'outcome_unknown' ? { ...native, kind: 'reconciliation_required' } : native)
        }
        return Reflect.apply(target.runAction, target, args)
      }
      return Reflect.get(target, property, receiver) as unknown
    } }) as ActionCtx, { ...searchTurn, searchTurn, ownerId: current.ownerId, trustedChatAuthority: current.authority,
      ...(live ? { deadlineAt: Date.now() + 60_000 } : {}) }, model))
    } catch (error) {
      if (!live) throw error
      failure = error instanceof Error ? error.message : 'trial_model_failed'
    }
    const messages = await backend.run(ctx => listUIMessages(ctx, components.agent, { threadId: binding.threadId, paginationOpts: { cursor: null, numItems: 50 } }))
    const answer = messages.page.filter(message => message.role === 'assistant' && message.text.trim()).map(message => message.text).join('\n')
    const inspected = market.inspect(sessionId)
    reports.push({ id: scenario, ms: Math.round(performance.now() - begin), answer, seams, modelRequests: outbound.mock.calls.length, failure,
      dispatches: inspected.dispatches, calls: inspected.calls, quotes: inspected.quotes, events: inspected.events,
      modelCost: await backend.query(internal.chatModelCost.readTurn, { turnRef: binding.turnRef }),
      toolParts: messages.page.flatMap(message => message.parts).filter(part => part.type.startsWith('tool-')),
      sourceTable: answer.includes('| Finding | Date | Source |') && answer.includes('https://research.example/battery-capacity') })
    if (live) { expect(inspected.dispatches).toBeLessThanOrEqual(1); return }
    expect(answer.trim().length).toBeGreaterThan(0)
    expect(inspected.dispatches).toBe(scenario === 'authority' ? 0 : 1)
    if (scenario === 'research') expect(answer).toContain('https://research.example/battery-capacity')
    if (scenario === 'uncertain') {
      expect(inspected.calls).toMatchObject([{ kind: 'outcome_unknown' }])
      expect(answer).toContain(inspected.calls[0]?.callRef)
    }
  }, 75_000)
})
