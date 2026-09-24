import { mockModel, type ToolCtx } from '@convex-dev/agent'
import { generateText, type ToolSet } from 'ai'
import { getFunctionName } from 'convex/server'
import { z } from 'zod'
import { convexToJson, type Value } from 'convex/values'
import { projectToolCard } from '@/modules/chat/tool-card'
import { chatClarifyInputSchema } from '@/modules/chat/agent-turn.contracts'
import { describe, expect, it, vi } from 'vitest'

import {
  CHAT_TOOL_IDS,
  CHAT_TOOL_NAME_MAP,
  createChatAgent,
  chatNoMatchSearchCount,
  MAX_CHAT_TOOL_CALLS,
  MAX_CHAT_TOOL_RESULT_BYTES,
  prepareChatToolStep,
  type ChatToolId,
} from '../../../convex/chatTools'
import { api, internal } from '../../../convex/_generated/api'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { serializeToolSearchResult, serializeToolDetailResult } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { registryToolsSearchContract } from '@/modules/registry/tool-action-contracts'
import {
  ERC20_QUERY,
  TOOL_CRYPTO_TX,
  TOOL_CURRENCY,
  TOOL_TIMEZONE,
  misorderedSearchResult,
} from '../../helpers/tool-search-rerank-fixtures'

const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
const COMMITMENT_REF = `operation-commitment:v1:${'b'.repeat(64)}`
const AUTHORITY = {
  kind: 'agent_key',
  turnRef: 'chat-turn:key-backed-1',
  credentialLocator: `crd_${'4'.repeat(32)}`,
  applicationRef: 'agent-app:market-buyer',
  environment: 'production',
  scopes: ['market_tools:call'],
  grantRef: `grant_${'5'.repeat(32)}`,
} as const satisfies TrustedChatAuthority

const noCandidates = {
  kind: 'no_candidates',
  schemaVersion: 'registry-tools:v3',
  query: 'weather',
  appliedFilters: {},
  matchedCount: 0,
  ranking: [],
  navigation: [],
} as const

const notFound = {
  kind: 'not_found',
  schemaVersion: 'registry-tools:v3',
  toolRef: OPERATION_REF,
  navigation: [],
} as const

const compareUnavailable = {
  kind: 'unavailable',
  schemaVersion: 'registry-tools:v3',
  reason: 'tool_not_found',
  navigation: [],
} as const

function toolCtx(input: Readonly<{
  runQuery?: ToolCtx['runQuery']
  runAction?: ToolCtx['runAction']
}> = {}): ToolCtx {
  return {
    runQuery: input.runQuery ?? vi.fn(async () => true),
    runAction: input.runAction ?? vi.fn(),
  } as unknown as ToolCtx
}

async function invokeTool(
  agent: ReturnType<typeof createChatAgent>,
  toolId: ChatToolId,
  ctx: ToolCtx,
  input: unknown,
  messages: ReadonlyArray<{ role: 'user'; content: string }> = [],
): Promise<unknown> {
  const providerToolName = CHAT_TOOL_NAME_MAP.canonicalToProvider[toolId]
  const tool = agent.options.tools?.[providerToolName]
  if (tool === undefined || typeof tool.execute !== 'function') {
    throw new Error(`Missing executable chat tool: ${toolId}`)
  }
  const bound = { ...tool, ctx }
  return await Reflect.apply(tool.execute, bound, [
    input,
    { toolCallId: `test:${toolId}`, messages },
  ])
}

function nativeReadResult(functionName: string): unknown {
  switch (functionName) {
    case 'capabilityToolCatalog:search':
      return noCandidates
    case 'capabilityToolCatalog:detail':
      return notFound
    case 'capabilityToolCatalog:compare':
      return compareUnavailable
    default:
      throw new Error(`Unexpected catalogue action: ${functionName}`)
  }
}

describe('Tool chat Agent tools', () => {
  it('offers the clarification choices as a provider-representable three-item array', () => {
    const schema = z.toJSONSchema(chatClarifyInputSchema, { io: 'input' })
    expect(schema.properties?.choices).toMatchObject({
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
    })
  })
  it('uses the second search for a distinct attempt, but never erases a later match', () => {
    const search = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
    const noMatch = { toolResults: [{ toolName: search, output: { kind: 'noMatch' } }] }
    const matched = { toolResults: [{ toolName: search, output: { kind: 'matched' } }] }
    expect(prepareChatToolStep({ stepNumber: 0, steps: [] }).toolChoice).toBe('required')
    expect(prepareChatToolStep({ stepNumber: 1, steps: [noMatch] })).toEqual({
      toolChoice: 'required', activeTools: [search],
    })
    expect(chatNoMatchSearchCount([noMatch, noMatch])).toBe(2)
    expect(chatNoMatchSearchCount([noMatch, matched])).toBe(0)
    expect(prepareChatToolStep({ stepNumber: 2, steps: [noMatch, matched] }).toolChoice).toBe('auto')
  })

  it('persists schema-bearing detail output losslessly and renders its completed card', async () => {
    const inputJsonSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { value: { $ref: '#/$defs/text' } },
      $defs: { text: { type: 'string' } },
    }
    const tool = { ...TOOL_CURRENCY, toolRef: OPERATION_REF as typeof TOOL_CURRENCY.toolRef, toolId: OPERATION_REF,
      contract: { ...TOOL_CURRENCY.contract, inputJsonSchema } }
    const agent = createChatAgent(mockModel())
    const output = await invokeTool(agent, 'registry.tools.describe', toolCtx({
      runAction: vi.fn().mockResolvedValue(serializeToolDetailResult({
        kind: 'found', schemaVersion: 'registry-tools:v3', tool,
      })),
    }), { toolRef: OPERATION_REF })
    expect(() => convexToJson(output as Value)).not.toThrow()
    const decoded: unknown = typeof output === 'string' ? JSON.parse(output) : output
    expect(decoded).toMatchObject({ tool: { inputJsonSchema } })
    expect(projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']}`,
      state: 'output-available', output,
    })).toMatchObject({ state: 'complete', toolRefs: [OPERATION_REF] })
  })

  it('exports the canonical tools and bounded Agent defaults', () => {
    const agent = createChatAgent(mockModel(), AUTHORITY)

    expect(Object.keys(agent.options.tools ?? {})).toEqual(
      CHAT_TOOL_IDS.map((toolId) => CHAT_TOOL_NAME_MAP.canonicalToProvider[toolId]),
    )
    expect(Object.isFrozen(CHAT_TOOL_NAME_MAP)).toBe(true)
    expect(Object.isFrozen(CHAT_TOOL_NAME_MAP.canonicalToProvider)).toBe(true)
    expect(Object.isFrozen(CHAT_TOOL_NAME_MAP.providerToCanonical)).toBe(true)
    for (const toolId of CHAT_TOOL_IDS) {
      const providerToolName = CHAT_TOOL_NAME_MAP.canonicalToProvider[toolId]
      expect(CHAT_TOOL_NAME_MAP.providerToCanonical[providerToolName]).toBe(toolId)
    }
    expect(agent.options.contextOptions).toEqual({ recentMessages: 20 })
    expect(agent.options.stopWhen).toBeTypeOf('function')
  })

  it('mentions only provider tool names that the Agent actually offers', () => {
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const tools = agent.options.tools ?? {}
    const offeredNames = new Set(Object.keys(tools))
    const descriptions = Object.values(tools)
      .map((tool) => tool.description ?? '')
      .join('\n')
    const mentionedNames = descriptions.match(
      /\b(?:ae_)?(?:registry|tool)_[A-Za-z0-9_-]+\b/g,
    ) ?? []

    expect(mentionedNames).toContain(
      CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote'],
    )
    expect(mentionedNames).not.toContain('ae_tool_quote')
    for (const mentionedName of mentionedNames) {
      expect(offeredNames.has(mentionedName)).toBe(true)
    }
  })

  it('omits Tool execution from anonymous chat while preserving public reads', () => {
    const agent = createChatAgent(mockModel())
    expect(Object.keys(agent.options.tools ?? {})).toEqual([
      ...CHAT_TOOL_IDS.slice(0, 4).map((toolId) => CHAT_TOOL_NAME_MAP.canonicalToProvider[toolId]),
      CHAT_TOOL_NAME_MAP.canonicalToProvider['chat.clarify'],
    ])
    expect(agent.options.tools).not.toHaveProperty(
      CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.call'],
    )
    expect(agent.options.tools).not.toHaveProperty(
      CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote'],
    )
  })
  it('does not expose payable tools for a Clerk principal', () => {
    const clerk = { kind: 'clerk' } as unknown as TrustedChatAuthority
    const tools = createChatAgent(mockModel(), clerk).options.tools
    expect(tools).toHaveProperty(CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search'])
    expect(tools).not.toHaveProperty(CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote'])
    expect(tools).not.toHaveProperty(CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.call'])
  })

  it('quotes with the trusted key turn and credential locator', async () => {
    const committed = {
      kind: 'committed' as const,
      quoteRef: COMMITMENT_REF,
      toolRef: OPERATION_REF,
      toolVersion: 1,
      expiresAt: Date.now() + 60_000,
      normalizedInput: { company: 'Acme' },
      price: { currency: 'AUD' as const, units: '1250000', exponent: 6 as const },
      account: {
        accountRef: `acc_${'2'.repeat(32)}`,
        available: { currency: 'AUD' as const, units: '5000000', exponent: 6 as const },
      },
      budget: {
        principalRef: `prn_${'1'.repeat(32)}`,
        maximumPerCall: { currency: 'AUD' as const, units: '2000000', exponent: 6 as const },
      },
      policyRefs: ['commercial-policy:sandbox:v1'],
      evidenceDigest: `sha256:${'c'.repeat(64)}`,
      continuation: {
        action: 'tool.call' as const,
        method: 'POST' as const,
        path: '/api/v1/tools/call' as const,
        input: { quoteRef: COMMITMENT_REF, idempotencyKey: 'chat-commitment-one' },
      },
    }
    const runQuery = vi.fn(async (_reference: Parameters<ToolCtx['runQuery']>[0], _args: unknown) => true)
    const runAction = vi.fn(async (_reference: Parameters<ToolCtx['runAction']>[0], _args: unknown) => committed)
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({
      runQuery: runQuery as ToolCtx['runQuery'],
      runAction: runAction as ToolCtx['runAction'],
    })

    await expect(invokeTool(agent, 'tool.quote', ctx, {
      toolRef: OPERATION_REF,
      input: { company: 'Acme' },
    })).resolves.toEqual(committed)
    expect(runQuery).toHaveBeenCalledTimes(1)
    expect(getFunctionName(runQuery.mock.calls[0]![0])).toBe('chatTurns:authorizePayableTool')
    expect(runQuery.mock.calls[0]![1]).toEqual({
      authority: AUTHORITY,
      toolRef: OPERATION_REF,
    })
    const digest = canonicalDigest({
      turnRef: AUTHORITY.turnRef,
      credentialId: AUTHORITY.credentialLocator,
      operationRef: OPERATION_REF,
      input: { company: 'Acme' },
    })
    expect(runAction).toHaveBeenCalledTimes(1)
    expect(getFunctionName(runAction.mock.calls[0]![0])).toBe('chatQuote:quote')
    expect(runAction.mock.calls[0]![1]).toEqual({
      authority: AUTHORITY,
      operationKey: digest,
      correlationId: `chat-inspect-corr:${digest}`,
      toolRef: OPERATION_REF,
      input: { company: 'Acme' },
    })
    expect(runAction.mock.calls[0]![1]).not.toHaveProperty('principal')
  })

  it('refuses a canceled key turn before dispatching a Quote', async () => {
    const runQuery = vi.fn(async (_reference: Parameters<ToolCtx['runQuery']>[0], _args: unknown) => false)
    const runAction = vi.fn()
    const agent = createChatAgent(mockModel(), AUTHORITY)
    await expect(invokeTool(agent, 'tool.quote', toolCtx({
      runQuery: runQuery as ToolCtx['runQuery'],
      runAction: runAction as ToolCtx['runAction'],
    }), { toolRef: OPERATION_REF, input: { company: 'Acme' } })).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'tool.quote',
      reason: 'turn_stopped',
    })
    expect(runQuery).toHaveBeenCalledTimes(1)
    expect(getFunctionName(runQuery.mock.calls[0]![0])).toBe('chatTurns:authorizePayableTool')
    expect(runQuery.mock.calls[0]![1]).toEqual({ authority: AUTHORITY, toolRef: OPERATION_REF })
    expect(runAction).not.toHaveBeenCalled()
  })

  it('lets the AI SDK reject canonical invalid provider input before native dispatch', async () => {
    const runAction = vi.fn()
    const providerToolName = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
    const model = mockModel({
      contentSteps: [[{
        type: 'tool-call',
        toolCallId: 'invalid-search',
        toolName: providerToolName,
        input: JSON.stringify({ query: 42 }),
      }]],
    })
    const agent = createChatAgent(model)
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })
    const tools = Object.fromEntries(Object.entries(agent.options.tools ?? {}).map(
      ([name, tool]) => [name, { ...tool, ctx }],
    )) as ToolSet

    const result = await generateText({ model, prompt: 'Search operations.', tools })

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolResults).toHaveLength(0)
    expect(runAction).not.toHaveBeenCalled()
  })

  it('dispatches all reads through their shared Convex catalogue actions', async () => {
    const runAction = vi.fn(async (reference) => nativeReadResult(getFunctionName(reference)))
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })

    await invokeTool(agent, 'registry.tools.list', ctx, {})
    await invokeTool(agent, 'registry.tools.search', ctx, { query: 'weather' })
    await invokeTool(agent, 'registry.tools.describe', ctx, { toolRef: OPERATION_REF })
    await invokeTool(agent, 'registry.tools.compare', ctx, { toolRefs: [OPERATION_REF] })

    expect(runAction.mock.calls.map(([reference]) => getFunctionName(reference))).toEqual([
      getFunctionName(api.capabilityToolCatalog.search),
      getFunctionName(api.capabilityToolCatalog.search),
      getFunctionName(api.capabilityToolCatalog.detail),
      getFunctionName(api.capabilityToolCatalog.compare),
    ])
  })

  it('classifies and re-ranks Tool search results before exposing them to the chat model', async () => {
    const source = misorderedSearchResult(ERC20_QUERY)
    const reranked = serializeToolSearchResult({
      ...source,
      items: [TOOL_CRYPTO_TX, TOOL_CURRENCY, TOOL_TIMEZONE],
      ranking: [
        { toolRef: TOOL_CRYPTO_TX.toolRef, rank: 1, score: 0.94 },
        { toolRef: TOOL_CURRENCY.toolRef, rank: 2, score: 0.11 },
        { toolRef: TOOL_TIMEZONE.toolRef, rank: 3, score: 0.08 },
      ],
    })
    const runAction = vi.fn(async (reference, _args?: unknown) => {
      const name = getFunctionName(reference)
      if (name === getFunctionName(api.capabilityToolCatalog.search)) {
        return serializeToolSearchResult(source)
      }
      if (name === getFunctionName(internal.capabilityToolCatalog.presentSearch)) {
        return { result: reranked, use: 'registry.tools.compare' as const }
      }
      throw new Error(`Unexpected action: ${name}`)
    })
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })

    const result = await invokeTool(
      agent,
      'registry.tools.search',
      ctx,
      { query: ERC20_QUERY },
      [{ role: 'user', content: 'Compare two company-lookup tools' }],
    ) as { kind: string; results: readonly { toolRef: string }[] }

    expect(result.kind).toBe('matched')
    expect(result.results.map(({ toolRef }) => toolRef)).toEqual([TOOL_CRYPTO_TX.toolRef])
    expect(runAction.mock.calls[1]?.[1]).toMatchObject({
      query: ERC20_QUERY,
      request: 'Compare two company-lookup tools',
    })
    expect(runAction.mock.calls.map(([reference]) => getFunctionName(reference))).toEqual([
      getFunctionName(api.capabilityToolCatalog.search),
      getFunctionName(internal.capabilityToolCatalog.presentSearch),
    ])
  })

  it('keeps testnet and degraded Tools out of an ordinary chat recommendation', async () => {
    const testnet = { ...TOOL_TIMEZONE, payment: {
      protocol: 'x402' as const, scheme: 'exact' as const, network: 'eip155:84532', asset: 'USDC', currency: 'USDC',
    } }
    const degraded = { ...TOOL_CURRENCY, availability: {
      posture: 'routeable' as const, observedAt: 1, validUntil: 2, lastHealthyAt: 1,
      reason: 'inspection_required' as const,
    } }
    const source = { ...misorderedSearchResult('weather'), items: [TOOL_CRYPTO_TX, testnet, degraded] }
    const presented = serializeToolSearchResult({
      ...source,
      ranking: source.items.map((tool, index) => ({ toolRef: tool.toolRef, rank: index + 1, score: 0.9 })),
    })
    const runAction = vi.fn(async reference => getFunctionName(reference) === 'capabilityToolCatalog:search'
      ? serializeToolSearchResult(source) : { result: presented, use: 'registry.tools.compare' })
    const result = await invokeTool(
      createChatAgent(mockModel()), 'registry.tools.search',
      toolCtx({ runAction: runAction as ToolCtx['runAction'] }),
      { query: 'weather' }, [{ role: 'user', content: 'Compare weather choices for Sydney' }],
    ) as { kind: string; results: readonly { toolRef: string; network: string; verification: string }[] }
    expect(result.kind).toBe('matched')
    expect(result.results.map(item => item.toolRef)).toEqual([TOOL_CRYPTO_TX.toolRef])
  })

  it('rejects invalid canonical output and refuses oversized model results', async () => {
    const invalidAgent = createChatAgent(mockModel())
    const invalidCtx = toolCtx({
      runAction: vi.fn(async () => ({ kind: 'forged' })) as ToolCtx['runAction'],
    })
    await expect(invokeTool(
      invalidAgent,
      'registry.tools.search',
      invalidCtx,
      { query: 'weather' },
    )).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'registry.tools.search',
      reason: 'source_output_invalid',
    })

    const largeAgent = createChatAgent(mockModel())
    const largeCtx = toolCtx({
      runAction: vi.fn(async () => ({
        ...noCandidates,
        query: 'x'.repeat(MAX_CHAT_TOOL_RESULT_BYTES),
      })) as ToolCtx['runAction'],
    })
    await expect(invokeTool(
      largeAgent,
      'registry.tools.search',
      largeCtx,
      { query: 'weather' },
    )).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'registry.tools.search',
      reason: 'result_too_large',
    })
  })

  it('deduplicates near-identical searches and caps distinct lookups at two', async () => {
    const runAction = vi.fn(async () => noCandidates)
    const agent = createChatAgent(mockModel())
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })
    expect(await invokeTool(agent, 'registry.tools.search', ctx, { query: 'Sydney weather APIs' })).toMatchObject({ kind: 'noMatch' })
    expect(await invokeTool(agent, 'registry.tools.search', ctx, { query: 'Weather API for Sydney' })).toMatchObject({
      kind: 'chat_tool_refused', reason: 'search_repeated',
    })
    expect(await invokeTool(agent, 'registry.tools.search', ctx, { query: 'forecast data NSW' })).toMatchObject({ kind: 'noMatch' })
    expect(await invokeTool(agent, 'registry.tools.search', ctx, { query: 'climate history NSW' })).toMatchObject({
      kind: 'chat_tool_refused', reason: 'search_limit',
    })
    expect(runAction).toHaveBeenCalledTimes(2)
  })

  it('does not crawl search pages unless the person asks for another page', async () => {
    const runAction = vi.fn(async () => noCandidates)
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })
    const agent = createChatAgent(mockModel())
    expect(await invokeTool(agent, 'registry.tools.search', ctx,
      { query: 'weather', cursor: 'next' }, [{ role: 'user', content: 'Find weather APIs' }])).toMatchObject({
      kind: 'chat_tool_refused', reason: 'paging_not_requested',
    })
    expect(runAction).not.toHaveBeenCalled()
    expect(await invokeTool(agent, 'registry.tools.search', ctx,
      { query: 'weather', cursor: 'next' }, [{ role: 'user', content: 'Show the next page of weather APIs' }])).toMatchObject({
      kind: 'noMatch',
    })
    expect(runAction).toHaveBeenCalledTimes(1)
  })

  it('lets a shortlist journey reach comparison after two searches and three detail reads', async () => {
    const runAction = vi.fn(async reference => nativeReadResult(getFunctionName(reference)))
    const agent = createChatAgent(mockModel())
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })
    for (const query of ['OCR', 'scanned PDFs']) {
      expect(await invokeTool(agent, 'registry.tools.search', ctx, { query })).toMatchObject({ kind: 'noMatch', results: [] })
    }
    for (let index = 0; index < 3; index += 1) {
      expect(await invokeTool(agent, 'registry.tools.describe', ctx, { toolRef: OPERATION_REF })).toMatchObject({ kind: 'not_found' })
    }
    const result = await invokeTool(agent, 'registry.tools.compare', ctx, { toolRefs: [OPERATION_REF] })
    expect(result).toMatchObject({ kind: 'unavailable' })
    expect(runAction).toHaveBeenCalledTimes(6)
    expect(getFunctionName(runAction.mock.calls[5]![0])).toBe('capabilityToolCatalog:compare')
  })

  it('reserves the single execute slot before parallel work awaits', async () => {
    let release: ((value: unknown) => void) | undefined
    const firstExecution = new Promise<unknown>((resolve) => {
      release = resolve
    })
    const runAction = vi.fn(async (_reference: Parameters<ToolCtx['runAction']>[0], _args: unknown) => await firstExecution)
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })

    const first = invokeTool(agent, 'tool.call', ctx, { quoteRef: COMMITMENT_REF })
    const second = invokeTool(agent, 'tool.call', ctx, { quoteRef: COMMITMENT_REF })

    await expect(second).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'tool.call',
      reason: 'execute_limit',
    })
    release?.({
      kind: 'refused',
      toolRef: OPERATION_REF,
      code: 'grant_not_found',
      retryable: false,
    })
    await expect(first).resolves.toMatchObject({
      kind: 'refused',
      code: 'grant_not_found',
    })
    const digest = canonicalDigest({
      turnRef: AUTHORITY.turnRef,
      credentialId: AUTHORITY.credentialLocator,
      commitmentRef: COMMITMENT_REF,
    })
    expect(runAction).toHaveBeenCalledTimes(1)
    expect(getFunctionName(runAction.mock.calls[0]![0])).toBe('chatCall:call')
    expect(runAction.mock.calls[0]![1]).toEqual({
      authority: AUTHORITY,
      operationKey: COMMITMENT_REF,
      correlationId: `chat-invoke-corr:${digest}`,
      idempotencyKey: `chat-invoke:${digest}`,
      quoteRef: COMMITMENT_REF,
    })
  })

  it('fails composition when a canonical contract no longer declares the chat surface', () => {
    const surfaces = registryToolsSearchContract.surfaces as unknown as string[]
    const index = surfaces.indexOf('chat')
    expect(index).toBeGreaterThanOrEqual(0)
    surfaces.splice(index, 1)
    try {
      expect(() => createChatAgent(mockModel())).toThrow(
        'Chat Action is unavailable: registry.tools.search',
      )
    } finally {
      surfaces.splice(index, 0, 'chat')
    }
  })

  it('sanitizes accepted strings and fails closed at both serialization boundaries', async () => {
    const schemaAgent = createChatAgent(mockModel())
    const safeParse = vi.spyOn(registryToolsSearchContract.outputSchema, 'safeParse')
      .mockReturnValueOnce({ success: false } as never)
    try {
      await expect(invokeTool(
        schemaAgent,
        'registry.tools.search',
        toolCtx({ runAction: vi.fn(async () => noCandidates) as ToolCtx['runAction'] }),
        { query: 'weather' },
      )).resolves.toEqual({
        kind: 'chat_tool_refused',
        toolId: 'registry.tools.search',
        reason: 'source_output_invalid',
      })
    } finally {
      safeParse.mockRestore()
    }

    const sanitizedAgent = createChatAgent(mockModel())
    const sanitizedCtx = toolCtx({
      runAction: vi.fn(async () => ({
        ...noCandidates,
        query: '<user>quoted</user><>',
      })) as ToolCtx['runAction'],
    })
    await expect(invokeTool(
      sanitizedAgent,
      'registry.tools.search',
      sanitizedCtx,
      { query: 'weather' },
    )).resolves.toMatchObject({ query: '[data-tag]quoted[data-tag]‹›' })

    const stringifyAgent = createChatAgent(mockModel())
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw new TypeError('hostile serialization')
    })
    try {
      await expect(invokeTool(
        stringifyAgent,
        'registry.tools.search',
        toolCtx({ runAction: vi.fn(async () => noCandidates) as ToolCtx['runAction'] }),
        { query: 'weather' },
      )).resolves.toEqual({
        kind: 'chat_tool_refused',
        toolId: 'registry.tools.search',
        reason: 'source_output_invalid',
      })
    } finally {
      stringify.mockRestore()
    }

    const parseAgent = createChatAgent(mockModel())
    const parse = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => ({ kind: 'forged' }))
    try {
      await expect(invokeTool(
        parseAgent,
        'registry.tools.search',
        toolCtx({ runAction: vi.fn(async () => noCandidates) as ToolCtx['runAction'] }),
        { query: 'weather' },
      )).resolves.toEqual({
        kind: 'chat_tool_refused',
        toolId: 'registry.tools.search',
        reason: 'source_output_invalid',
      })
    } finally {
      parse.mockRestore()
    }
  })

  it('enforces the shared call budget before every remaining native handler', async () => {
    const runAction = vi.fn(async (reference) => nativeReadResult(getFunctionName(reference)))
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })
    for (let index = 0; index < MAX_CHAT_TOOL_CALLS; index += 1) {
      await invokeTool(agent, 'registry.tools.describe', ctx, { toolRef: OPERATION_REF })
    }
    for (const [toolId, input] of [
      ['registry.tools.list', {}],
      ['registry.tools.describe', { toolRef: OPERATION_REF }],
      ['registry.tools.compare', { toolRefs: [OPERATION_REF] }],
    ] as const) {
      await expect(invokeTool(agent, toolId, ctx, input)).resolves.toEqual({
        kind: 'chat_tool_refused',
        toolId,
        reason: 'tool_limit',
      })
    }
    expect(runAction).toHaveBeenCalledTimes(MAX_CHAT_TOOL_CALLS)
  })
})
