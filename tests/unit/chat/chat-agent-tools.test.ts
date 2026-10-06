import { mockModel, type ToolCtx } from '@convex-dev/agent'
import { generateText, stepCountIs, type ToolSet, type ModelMessage } from 'ai'
import { getFunctionName, type FunctionReturnType } from 'convex/server'
import { z } from 'zod'
import { convexToJson, type Value } from 'convex/values'
import { projectToolCard, serializeToolCard } from '@/modules/chat/tool-card'
import { projectGenerativeTurn } from '@/components/ae/chat/presentation'
import { chatClarifyInputSchema } from '@/modules/chat/agent-turn.contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAT_TOOL_IDS, CHAT_TOOL_NAME_MAP, type ChatToolId } from '@/modules/chat/tool-card'
import { createChatAgent } from '../../../convex/lib/chat/tools/agent'
import { readChatSearchPage } from '../../../convex/lib/chat/tools/search'
import {
  chatNoMatchSearchCount,
  chatSearchResolution,
  chatActionMessages,
  hasChatContext,
  MAX_CHAT_TOOL_CALLS,
  prepareChatToolStep,
} from '../../../convex/lib/chat/tools/step'
import { formatDetailRequest } from '@/modules/chat/run-request'
import { api, internal } from '../../../convex/_generated/api'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { serializeToolSearchResult, serializeToolDetailResult, serializeToolCompareResult } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { registryToolsSearchContract } from '@/modules/registry/tool-action-contracts'
import { isDeploymentToolChoice } from '@/modules/registry/public'
import {
  ERC20_QUERY,
  TOOL_CRYPTO_TX,
  TOOL_CURRENCY,
  TOOL_TIMEZONE,
  misorderedSearchResult,
} from '../../helpers/tool-search-rerank-fixtures'

const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'))
afterEach(() => vi.unstubAllEnvs())

it('selects only the declared deployment environment, including native Tools without x402 payment', () => {
  const native = { ...TOOL_TIMEZONE, provenance: { ...TOOL_TIMEZONE.provenance, sourceKind: 'openapi_http' as const } }
  const sandbox = { ...native, runtimeEnvironment: 'sandbox' as const }
  expect(isDeploymentToolChoice(native, 'production')).toBe(true)
  expect(isDeploymentToolChoice(sandbox, 'sandbox')).toBe(true)
  expect(isDeploymentToolChoice(native, 'sandbox')).toBe(false)
  expect(isDeploymentToolChoice(sandbox, 'production')).toBe(false)
  expect(isDeploymentToolChoice(native, undefined)).toBe(false)
})
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

function externalDetailFixture(): Extract<FunctionReturnType<typeof api.x402DirectoryIndex.detailById>, { kind: 'found' }> {
  return {
    kind: 'found', coverage: { source: 'coinbase', generation: 'detail-test', indexedTotal: 1,
      reportedTotal: 1, reportedTotalAtStart: 1, sourceChangedDuringScan: false, duplicateObservations: 0,
      pagesFetched: 1, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' },
    item: { category: 'Search', categorySource: 'provider_declared', observedAt: 2, sourceDigest: 'test-digest',
      entry: { resource: 'https://provider.example/search', title: 'Search the web', description: 'Searches web pages',
        provider: 'Provider', protocol: 'http', metadataJson: '{}', prices: [],
        input: { fields: [{ name: 'q', path: 'q', location: 'queryParams', source: 'schema', type: 'string', required: true }],
          schemaJson: '{"$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"q":{"type":"string"}}}' },
        output: { fields: [] },
      },
    },
  }
}

function toolCtx(input: Readonly<{
  runQuery?: ToolCtx['runQuery']
  runAction?: ToolCtx['runAction']
  runMutation?: ToolCtx['runMutation']
}> = {}): ToolCtx {
  return {
    runQuery: input.runQuery ?? vi.fn(async (reference) => {
      const name = getFunctionName(reference)
      if (name === 'marketListingEvidence:selectionEvidenceInternal') return []
      if (name === 'x402DirectoryIndex:searchCompactInternal') {
        return { kind: 'ok', page: [], isDone: true, continueCursor: '', coverage: { generation: 'test', completedAt: 1 } }
      }
      return true
    }),
    runAction: input.runAction ?? vi.fn(),
    runMutation: input.runMutation ?? vi.fn(),
  } as unknown as ToolCtx
}

it('does not begin a cancelled page read or return a page after cancellation', async () => {
  const controller = new AbortController()
  const runAction = vi.fn(async () => noCandidates)
  controller.abort(new Error('page_cancelled'))
  await expect(readChatSearchPage(toolCtx({ runAction }), { query: 'weather', cursor: 'next' }, undefined,
    controller.signal)).rejects.toThrow('page_cancelled')
  expect(runAction).not.toHaveBeenCalled()

  const duringRead = new AbortController()
  runAction.mockImplementation(async () => {
    duringRead.abort(new Error('page_cancelled_during_read'))
    return noCandidates
  })
  await expect(readChatSearchPage(toolCtx({ runAction }), { query: 'weather', cursor: 'next' }, undefined,
    duringRead.signal)).rejects.toThrow('page_cancelled_during_read')
  expect(runAction).toHaveBeenCalledOnce()
})

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
    case 'capabilityToolCatalog:searchInternal':
      return noCandidates
    case 'capabilityToolCatalog:detailInternal':
      return notFound
    case 'capabilityToolCatalog:compareInternal':
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
    const matched = { toolResults: [{ toolName: search, output: { kind: 'match' } }] }
    expect(prepareChatToolStep({ stepNumber: 0, steps: [] }).toolChoice).toBe('required')
    expect(prepareChatToolStep({ stepNumber: 1, steps: [noMatch] })).toEqual({
      toolChoice: 'required', activeTools: [search],
    })
    expect(chatNoMatchSearchCount([noMatch, noMatch])).toBe(2)
    expect(chatNoMatchSearchCount([noMatch, matched])).toBe(0)
    expect(prepareChatToolStep({ stepNumber: 2, steps: [noMatch, matched] }).toolChoice).toBe('auto')
  })

  it('keeps scoped answers honest without leaking opaque pagination tokens into prose', () => {
    const search = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
    const step = (output: unknown) => [{ toolResults: [{ toolName: search, output }] }]
    const scoped = { kind: 'scoped', next: [{ action: 'next-page', args: { query: 'timezone', cursor: 'x402:cursor-2' } }] }
    expect(chatNoMatchSearchCount(step(scoped))).toBe(0)
    expect(prepareChatToolStep({ stepNumber: 1, steps: step(scoped) }).toolChoice).toBe('auto')
    expect(chatSearchResolution(step(scoped))).toContain('No match for that yet')
    expect(chatSearchResolution(step(scoped))).not.toMatch(/next page|closest matches/iu)
    expect(chatSearchResolution(step(scoped))).not.toContain('x402:cursor-2')
    const completeExternal = { kind: 'scoped', results: [{ title: 'External Timezone' }], assessed: { coverage: 'complete' },
      next: [{ action: 'broaden', args: { query: 'timezone' } }] }
    const externalResolution = chatSearchResolution(step(completeExternal))
    expect(externalResolution).toContain('need inspection before I can recommend one')
    expect(externalResolution).not.toContain('Only part')
    expect(externalResolution).not.toContain('Next page')
    expect(chatSearchResolution(step({ kind: 'unavailable', next: [{ action: 'retry', args: { query: 'timezone' } }] }))).toContain('retry “timezone”')
    expect(chatSearchResolution(step({ kind: 'noMatch', next: [{ action: 'broaden', args: { query: 'timezone' } }] }))).toContain('No suitable Tool')
    expect(chatSearchResolution([...step(scoped), ...step({ kind: 'match', results: [{ title: 'Timezone Converter', summary: 'Converts dates between timezones' }] })])).toBeNull()

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
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']}`,
      state: 'output-available', output,
    })
    expect(card).toMatchObject({ state: 'complete', toolRefs: [OPERATION_REF] })
    if (card === null) throw new Error('missing detail card')
    expect(projectGenerativeTurn({ id: 'detail', role: 'assistant', text: 'Tool details', tools: [card], blocks: [] })
      .options.options).toMatchObject([{ id: OPERATION_REF, name: TOOL_CURRENCY.listing.label,
      outcome: TOOL_CURRENCY.summary, reviewInputs: true }])
  })

  it('reads an external detail without resolving or admitting its listing', async () => {
    const id = `registry:${'c'.repeat(64)}`
    const detail = externalDetailFixture()
    const input = detail.item.entry.input
    const runQuery = vi.fn(async () => detail)
    const runAction = vi.fn(async () => { throw new Error('Read-only detail must not resolve or admit supply') })
    const result = await invokeTool(createChatAgent(mockModel()), 'registry.tools.describe', toolCtx({ runQuery, runAction }), { toolRef: id })
    const output: unknown = typeof result === 'string' ? JSON.parse(result) : result
    expect(output).toMatchObject({ kind: 'external', tool: { id, toolRef: id, title: 'Search the web', access: 'external_listing', input } })
    expect(runQuery).toHaveBeenCalledOnce()
    expect(runAction).not.toHaveBeenCalled()
  })

  it('uses an already-admitted directory join without resolving and bounds external detail bytes', async () => {
    const id = `registry:${'c'.repeat(64)}`
    const joined = externalDetailFixture()
    joined.item.toolRef = OPERATION_REF
    const runAction = vi.fn(async () => notFound)
    const runQuery = vi.fn(async () => joined)
    const result = await invokeTool(createChatAgent(mockModel()), 'registry.tools.describe', toolCtx({ runQuery, runAction }), { toolRef: id })
    expect(result).toMatchObject({ kind: 'not_found', toolRef: OPERATION_REF })
    expect(runAction).toHaveBeenCalledExactlyOnceWith(internal.capabilityToolCatalog.detailInternal, { toolRef: OPERATION_REF })
    const oversized = externalDetailFixture()
    oversized.item.entry.input!.schemaJson = 'x'.repeat(64 * 1024)
    const readOnlyAction = vi.fn(async () => { throw new Error('External inspection cannot admit') })
    expect(await invokeTool(createChatAgent(mockModel()), 'registry.tools.describe', toolCtx({
      runQuery: vi.fn(async () => oversized), runAction: readOnlyAction,
    }), { toolRef: id })).toMatchObject({ kind: 'chat_tool_refused', reason: 'result_too_large' })
    expect(readOnlyAction).not.toHaveBeenCalled()
  })

  it('rejects a substituted reference before reading an explicitly selected detail', async () => {
    const selected = `operation:v1:${'c'.repeat(64)}`
    const runAction = vi.fn(async () => notFound)
    const result = await invokeTool(createChatAgent(mockModel()), 'registry.tools.describe', toolCtx({ runAction }), { toolRef: OPERATION_REF }, [{ role: 'user', content: `Inspect Tool ${selected} with this exact title: "Selected Tool".` }])
    expect(result).toMatchObject({ kind: 'chat_tool_refused', reason: 'selected_tool_mismatch' })
    expect(runAction).not.toHaveBeenCalled()
  })

  it('keeps exact detail enforcement for an escaped title longer than the search text bound', async () => {
    const selected = `operation:v1:${'c'.repeat(64)}`
    const prompt = formatDetailRequest(selected, '\\'.repeat(200))
    expect(prompt.length).toBeGreaterThan(500)
    expect(prepareChatToolStep({ stepNumber: 0, steps: [], messages: [{ role: 'user', content: prompt }] })).toMatchObject({ toolChoice: 'required', activeTools: ['registry_tools_describe'] })
    const runAction = vi.fn(async () => notFound)
    expect(await invokeTool(createChatAgent(mockModel()), 'registry.tools.describe', toolCtx({ runAction }), { toolRef: OPERATION_REF }, [{ role: 'user', content: prompt }])).toMatchObject({ reason: 'selected_tool_mismatch' })
    expect(runAction).not.toHaveBeenCalled()
  })

  it('uses current-turn action facts instead of historical detail and rejects hint-only grounding', () => {
    const describe = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']
    const search = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
    const result = (toolName: string, output: unknown): ModelMessage => ({ role: 'tool', content: [{ type: 'tool-result', toolCallId: toolName, toolName, output: { type: 'json', value: output as never } }] })
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Old detail' },
      result(describe, { kind: 'found', tool: { toolRef: OPERATION_REF, title: 'Historical ready', healthStatus: 'operational' } }),
      { role: 'user', content: 'Find current supply' },
    ]
    const latest = { kind: 'match', results: [{ id: OPERATION_REF, toolRef: OPERATION_REF, title: 'Current unavailable', source: 'current', access: 'unavailable', readiness: 'unavailable' }] }
    const actions = chatActionMessages(messages, [{ toolResults: [{ toolName: search, output: latest }] }])
      .findLast(message => message.role === 'system')?.content
    expect(actions).toContain('Current unavailable')
    expect(actions).not.toContain('Historical ready')
    expect(actions).not.toContain('Review inputs')
    expect(actions).not.toContain('Compare')
    expect(hasChatContext([{ role: 'assistant', content: 'Tool cards shown (reference data): []' }, { role: 'user', content: 'Explain that Tool' }])).toBe(false)
  })

  it('does not expose or execute a Call during exact selected detail with key-backed authority', async () => {
    const prompt = formatDetailRequest(OPERATION_REF, 'Selected Tool')
    const model = mockModel({ contentSteps: [
      [{ type: 'tool-call', toolCallId: 'unauthorized-detail-call', toolName: 'tool_call', input: JSON.stringify({ quoteRef: COMMITMENT_REF }) }],
      [{ type: 'text', text: 'The detail request cannot perform a Call.' }],
    ] })
    const agent = createChatAgent(model, AUTHORITY)
    const runAction = vi.fn(async () => { throw new Error('Detail cannot purchase') })
    const ctx = toolCtx({ runAction })
    const tools = Object.fromEntries(Object.entries(agent.options.tools ?? {}).map(([name, tool]) => [name, { ...tool, ctx }])) as ToolSet
    const result = await generateText({ model, prompt, tools, prepareStep: prepareChatToolStep, stopWhen: stepCountIs(2) })
    expect(result.steps.flatMap(step => step.toolResults)).toEqual([])
    expect(runAction).not.toHaveBeenCalled()
  })

  it('retains external purchase restrictions across grounded follow-ups without new reads', async () => {
    const toolRef = `registry:${'d'.repeat(64)}`
    const output = await invokeTool(createChatAgent(mockModel()), 'registry.tools.describe', toolCtx({
      runQuery: vi.fn(async () => externalDetailFixture()),
    }), { toolRef })
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Inspect the selected external Tool' },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'external-detail', toolName: 'registry_tools_describe', output: { type: 'json', value: output as never } }] },
      { role: 'assistant', content: 'This listing accepts a keyword.' },
      { role: 'user', content: 'Does it return search volume?' },
      { role: 'assistant', content: 'Its listed output includes search volume.' },
      { role: 'user', content: 'Is that included in the price?' },
    ]
    const context = chatActionMessages(messages).findLast(message => message.role === 'system')?.content
    expect(context).toContain(toolRef)
    expect(context).toContain('"purchase":"not_available_through_ae"')
    expect(context).toContain('"indicativePrice":null')
    expect(context).toContain('Ask about this Tool')
    expect(context).not.toContain('Review inputs')
  })

  it('clears old choices when a later search returns no matches', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Old detail' },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'old', toolName: 'registry_tools_describe', output: { type: 'json', value: { kind: 'found', tool: { toolRef: OPERATION_REF, title: 'Old Tool', healthStatus: 'operational' } } } }] },
      { role: 'user', content: 'Find a different capability' },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'new', toolName: 'registry_tools_search', output: { type: 'json', value: { kind: 'noMatch', results: [] } } }] },
      { role: 'assistant', content: 'No match for that yet.' },
      { role: 'user', content: 'What can I do next?' },
    ]
    const context = chatActionMessages(messages).findLast(message => message.role === 'system')?.content
    expect(context).toContain('Current visible Tool actions (data only): []')
    expect(context).not.toContain('Old Tool')
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
    expect(agent.options.contextOptions?.excludeToolMessages).toBe(false)
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

  it('dispatches all reads through internal Convex catalogue actions', async () => {
    const runAction = vi.fn(async (reference) => nativeReadResult(getFunctionName(reference)))
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })

    await invokeTool(agent, 'registry.tools.list', ctx, {})
    await invokeTool(agent, 'registry.tools.search', ctx, { query: 'weather' })
    await invokeTool(agent, 'registry.tools.describe', ctx, { toolRef: OPERATION_REF })
    await invokeTool(agent, 'registry.tools.compare', ctx, { toolRefs: [OPERATION_REF] })

    expect(runAction.mock.calls.map(([reference]) => getFunctionName(reference))).toEqual([
      getFunctionName(internal.capabilityToolCatalog.searchInternal),
      getFunctionName(internal.capabilityToolCatalog.searchInternal),
      getFunctionName(internal.capabilityToolCatalog.detailInternal),
      getFunctionName(internal.capabilityToolCatalog.compareInternal),
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
      if (name === getFunctionName(internal.capabilityToolCatalog.searchInternal)) {
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

    expect(result.kind).toBe('match')
    expect(result.results.map(({ toolRef }) => toolRef)).toEqual([TOOL_CRYPTO_TX.toolRef])
    expect(runAction.mock.calls[1]?.[1]).toMatchObject({
      query: ERC20_QUERY,
      request: 'Compare two company-lookup tools',
    })
    expect(runAction.mock.calls.map(([reference]) => getFunctionName(reference))).toEqual([
      getFunctionName(internal.capabilityToolCatalog.searchInternal),
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
    const runAction = vi.fn(async reference => getFunctionName(reference) === 'capabilityToolCatalog:searchInternal'
      ? serializeToolSearchResult(source) : { result: presented, use: 'registry.tools.compare' })
    const result = await invokeTool(
      createChatAgent(mockModel()), 'registry.tools.search',
      toolCtx({ runAction: runAction as ToolCtx['runAction'] }),
      { query: 'weather' }, [{ role: 'user', content: 'Compare weather choices for Sydney' }],
    ) as { kind: string; results: readonly { toolRef: string; network: string; verification: string }[] }
    expect(result.kind).toBe('match')
    expect(result.results.map(item => item.toolRef)).toEqual([TOOL_CRYPTO_TX.toolRef])
    const explicitTestnet = await invokeTool(
      createChatAgent(mockModel()), 'registry.tools.search',
      toolCtx({ runAction: runAction as ToolCtx['runAction'] }),
      { query: 'weather' }, [{ role: 'user', content: 'Show testnet weather choices' }],
    ) as { kind: string; results: readonly { toolRef: string }[] }
    expect(explicitTestnet.results.map(item => item.toolRef)).toEqual([TOOL_CRYPTO_TX.toolRef])
  })

  it('shows compact Bazaar rows as scoped external leads with an exact next page, never an AE Call', async () => {
    const runAction = vi.fn()
    const runQuery = vi.fn(async (reference, _args: unknown) => {
      expect(getFunctionName(reference)).toBe('x402DirectoryIndex:searchCompactInternal')
      return {
        kind: 'ok', coverage: { generation: 'bazaar-7', completedAt: 100 },
        page: [
          { id: 'directory-entry-7', source: 'coinbase', network: 'eip155:8453', title: 'Timezone API', summary: 'Convert timezones',
            provider: 'External provider', actionClass: 'transform', objectClass: 'location', completedAt: 100 },
          { id: 'wrong-network', source: 'coinbase', network: 'eip155:84532', title: 'Timezone API', summary: 'Convert timezones',
            provider: 'External provider', actionClass: 'transform', objectClass: 'location', completedAt: 100 },
        ],
        continueCursor: 'native-page-2', isDone: false,
      }
    })
    const result = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search', toolCtx({
      runQuery: runQuery as ToolCtx['runQuery'], runAction: runAction as ToolCtx['runAction'],
    }), { query: 'convert timezone', source: 'coinbase' })
    expect(result).toMatchObject({
      kind: 'scoped', assessed: { source: 'coinbase', coverage: 'partial', generation: 'bazaar-7' },
      results: [{ id: 'directory-entry-7', access: 'external_listing', price: { kind: 'unavailable' },
        next: [{ action: 'describe-external', args: { id: 'directory-entry-7' } }] }],
      next: [{ action: 'next-page', args: { query: 'convert timezone', cursor: 'x402:native-page-2' } }],
    })
    expect(runQuery.mock.calls[0]?.[1]).toMatchObject({ network: 'eip155:8453' })
    expect(runAction).not.toHaveBeenCalled()
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output: result,
    })
    expect(card).toMatchObject({ kind: 'choices', verdict: 'scoped',
      choices: [{ access: 'external_listing', detailHref: '/api/v1/registry/detail?id=directory-entry-7' }] })
    expect(projectToolCard(serializeToolCard(card!))).toMatchObject({ kind: 'choices',
      choices: [{ access: 'external_listing', detailHref: '/api/v1/registry/detail?id=directory-entry-7' }] })
  })

  it('never declares a completed no-match when the directory page is unavailable', async () => {
    const runQuery = vi.fn(async () => ({ kind: 'unavailable', reason: 'index_unavailable' }))
    const result = await invokeTool(
      createChatAgent(mockModel()), 'registry.tools.search',
      toolCtx({ runQuery: runQuery as ToolCtx['runQuery'] }),
      { query: 'weather', source: 'coinbase', cursor: 'x402:native-page-2' },
      [{ role: 'user', content: 'Show more weather Tools' }],
    )
    expect(result).toMatchObject({
      kind: 'scoped', results: [], partialResults: true,
      assessed: { scope: 'page', coverage: 'partial' },
    })
  })

  it('executes the stored next page with original query and options despite model-supplied arguments', async () => {
    const searchTurn = { turnRef: 'turn_12345678-1234-1234-1234-123456789abc',
      threadId: 'thread-one', promptMessageId: 'prompt-two' }
    const signedCursor = `sc1.${searchTurn.turnRef}.${'a'.repeat(64)}`
    const runAction = vi.fn()
    const runQuery = vi.fn(async (_reference: unknown, _args: unknown) => ({
      kind: 'ok', coverage: { generation: 'bazaar-8', completedAt: 101 },
      page: [{ id: 'directory-entry-8', source: 'coinbase', network: 'eip155:8453', title: 'Forecast API', summary: 'City forecasts',
        provider: 'External provider', actionClass: 'retrieve', objectClass: 'location' }],
      continueCursor: 'native-page-3', isDone: false,
    }))
    const runMutation = vi.fn(async (_reference: unknown, _args: unknown) => signedCursor)
    const capturedUIOutput = vi.fn()
    const result = await invokeTool(createChatAgent(
      mockModel(), undefined,
      { query: 'weather in Sydney', cursor: 'x402:native-page-2',
        inputJson: JSON.stringify({ source: 'coinbase', limit: 8 }) },
      searchTurn, capturedUIOutput,
    ), 'registry.tools.search', toolCtx({
      runQuery: runQuery as ToolCtx['runQuery'],
      runAction: runAction as ToolCtx['runAction'],
      runMutation: runMutation as ToolCtx['runMutation'],
    }), { query: 'bank account', cursor: 'x402:foreign-cursor', source: 'current' },
    [{ role: 'user', content: 'Show more results' }])
    expect(runAction).not.toHaveBeenCalled()
    expect(runQuery.mock.calls[0]?.[1]).toMatchObject({
      query: 'weather in Sydney', paginationOpts: { cursor: 'native-page-2', numItems: 4 },
    })
    expect(runMutation.mock.calls[0]?.[1]).toEqual({
      ...searchTurn, query: 'weather in Sydney', cursor: 'x402:native-page-3',
      inputJson: JSON.stringify({ source: 'coinbase', limit: 4 }),
    })
    expect(result).toMatchObject({
      kind: 'scoped', assessed: { coverage: 'partial' },
      next: [{ action: 'next-page', args: { query: 'weather in Sydney', cursor: signedCursor } }],
      pagination: { nextCursor: signedCursor, hasMore: true },
    })
    expect(capturedUIOutput).toHaveBeenCalledExactlyOnceWith('test:registry.tools.search',
      expect.objectContaining({ next: [{ action: 'next-page', args:
        { query: 'weather in Sydney', cursor: signedCursor }, authority: 'public' }] }))
    expect(JSON.stringify(result)).not.toContain('native-page-3')
    expect(JSON.stringify(result)).not.toContain('bank account')
    const tool = createChatAgent(mockModel()).options.tools?.[CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']]
    if (tool?.toModelOutput === undefined) throw new Error('search_model_projection_missing')
    const modelOutput = await Reflect.apply(tool.toModelOutput, { ...tool, ctx: toolCtx() }, [{
      toolCallId: 'next-page', input: {}, output: result,
    }])
    expect(JSON.stringify(modelOutput)).not.toContain(signedCursor)
    expect(JSON.stringify(modelOutput)).not.toContain('nextCursor')
    expect(JSON.stringify(modelOutput)).toContain('Forecast API')
  })

  it('uses the canonical indexed query rather than a bounded empty-query inventory', async () => {
    const query = 'convert time between timezones'
    const source = serializeToolSearchResult({
      ...misorderedSearchResult(query), items: [TOOL_TIMEZONE], pagination: { limit: 8, hasMore: false },
    })
    const runAction = vi.fn(async (reference, args: { query?: string }) => {
      const name = getFunctionName(reference)
      if (name === 'capabilityToolCatalog:searchInternal') {
        expect(args.query).toBe(query)
        return source
      }
      if (name === 'capabilityToolCatalog:presentSearch') return { result: serializeToolSearchResult({
        ...misorderedSearchResult(query), items: [TOOL_TIMEZONE],
        ranking: [{ toolRef: TOOL_TIMEZONE.toolRef, rank: 1, score: 0.9 }],
        pagination: { limit: 8, hasMore: false },
      }), use: 'registry.tools.search' }
      throw new Error(`Unexpected action: ${name}`)
    })
    const result = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search', toolCtx({
      runAction: runAction as ToolCtx['runAction'],
      runQuery: vi.fn(async reference => getFunctionName(reference) === 'marketListingEvidence:selectionEvidenceInternal'
        ? [] : { kind: 'ok', page: [], isDone: true, continueCursor: '',
          coverage: { generation: 'test', completedAt: 1 } }) as ToolCtx['runQuery'],
    }), { query })
    expect(result).toMatchObject({ kind: 'match', results: [{ id: TOOL_TIMEZONE.toolRef }] })
    expect(runAction).toHaveBeenCalledTimes(2)
  })


  it('shrinks oversized chat search pages with a cursor that preserves every external listing', async () => {
    const query = 'timezone conversion'
    const ids = Array.from({ length: 4 }, (_, index) => `entry-${index}-${'x'.repeat(4800)}`)
    const runQuery = vi.fn(async (_reference, args: { paginationOpts: { cursor: string | null; numItems: number } }) => {
      const start = args.paginationOpts.cursor === null ? 0 : Number(args.paginationOpts.cursor.slice('native-'.length))
      const selected = ids.slice(start, start + args.paginationOpts.numItems)
      return {
        kind: 'ok', page: selected.map(id => ({ id, source: 'coinbase', network: 'eip155:8453', title: 'Timezone',
          summary: 'Convert timezones', provider: 'External provider',
          actionClass: 'transform', objectClass: 'location', completedAt: 100 })),
        isDone: start + selected.length === ids.length, continueCursor: `native-${start + selected.length}`,
        coverage: { generation: 'bazaar-7', completedAt: 100 },
      }
    })
    const ctx = toolCtx({ runQuery: runQuery as ToolCtx['runQuery'],
      runAction: vi.fn(async () => { throw new Error('Explicit Bazaar source must not read admitted Tools') }) as ToolCtx['runAction'] })
    const observed: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < ids.length; page += 1) {
      const output = registryToolsSearchContract.outputSchema.parse(
        await invokeTool(createChatAgent(mockModel()), 'registry.tools.search', ctx,
          { query, source: 'coinbase', ...(cursor === undefined ? {} : { cursor }) },
          cursor === undefined ? [] : [{ role: 'user', content: 'Show the next page of timezone conversion APIs' }]))
      expect(output.kind).toBe('scoped')
      if (output.kind !== 'scoped') throw new Error('Lost scoped Bazaar page')
      expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThanOrEqual(16 * 1024)
      observed.push(...output.results.map(row => row.id))
      cursor = output.pagination.nextCursor
    }
    expect(observed).toEqual(ids)
    expect(cursor).toBeUndefined()
  })

  it('reports capacity instead of returning an oversized single external listing', async () => {
    const result = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search', toolCtx({
      runAction: vi.fn(async () => { throw new Error('Explicit Bazaar source must not read admitted Tools') }) as ToolCtx['runAction'],
      runQuery: vi.fn(async () => ({
        kind: 'ok', page: [{ id: `entry-${'x'.repeat(7000)}`, source: 'coinbase', network: 'eip155:8453', title: 'Timezone',
          summary: 'Convert timezones', provider: 'External provider', actionClass: 'transform',
          objectClass: 'location', completedAt: 100 }], isDone: true, continueCursor: '',
        coverage: { generation: 'bazaar-7', completedAt: 100 },
      })) as ToolCtx['runQuery'],
    }), { query: 'timezone conversion', source: 'coinbase' })
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'capacity_exceeded', results: [] })
  })


  it('continues admitted search after an unsuitable page instead of skipping to Bazaar', async () => {
    const query = 'currency conversion'
    const first = serializeToolSearchResult({
      ...misorderedSearchResult(query), items: [TOOL_TIMEZONE],
      pagination: { limit: 8, hasMore: true, nextCursor: 'admitted-tail' }, partialResults: true,
    })
    const tail = serializeToolSearchResult({
      ...misorderedSearchResult(query), items: [TOOL_CURRENCY],
      pagination: { limit: 8, hasMore: false },
    })
    let onTail = false
    const runAction = vi.fn(async (reference, args: { query?: string; cursor?: string }) => {
      if (getFunctionName(reference) === 'capabilityToolCatalog:searchInternal') {
        if (args.query === '') return first
        onTail = args.cursor === 'admitted-tail'
        return onTail ? tail : first
      }
      if (getFunctionName(reference) === 'capabilityToolCatalog:presentSearch') {
        const tool = onTail ? TOOL_CURRENCY : TOOL_TIMEZONE
        return { result: serializeToolSearchResult({
          ...misorderedSearchResult(query), items: [tool],
          ranking: [{ toolRef: tool.toolRef, rank: 1, score: onTail ? 0.9 : 0.1 }],
          pagination: onTail ? { limit: 8, hasMore: false } : { limit: 8, hasMore: true, nextCursor: 'admitted-tail' },
          ...(onTail ? {} : { partialResults: true }),
        }), use: 'registry.tools.search' }
      }
      throw new Error('Unexpected action')
    })
    const runQuery = vi.fn(async reference => getFunctionName(reference) === 'marketListingEvidence:selectionEvidenceInternal'
      ? [] : {
        kind: 'ok', page: [], isDone: true, continueCursor: '',
        coverage: { generation: 'bazaar-7', completedAt: 100 },
      })
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'], runQuery: runQuery as ToolCtx['runQuery'] })
    const firstPage = registryToolsSearchContract.outputSchema.parse(
      await invokeTool(createChatAgent(mockModel()), 'registry.tools.search', ctx, { query }))
    expect(firstPage).toMatchObject({ kind: 'scoped', results: [], pagination: { nextCursor: 'admitted-tail' } })
    expect(runQuery).not.toHaveBeenCalled()
    const secondPage = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search', ctx,
      { query, cursor: 'admitted-tail' }, [{ role: 'user', content: 'Show the next page of currency APIs' }])
    expect(secondPage).toMatchObject({ kind: 'match', results: [{ id: TOOL_CURRENCY.toolRef }] })
  })

  it('only says no-match for a complete admitted inventory, and keeps an unassessed tail scoped', async () => {
    const query = 'unusual document task'
    const current = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search', toolCtx({
      runAction: vi.fn(async () => noCandidates) as ToolCtx['runAction'],
      runQuery: vi.fn(async () => { throw new Error('Current-only search must not read Bazaar') }) as ToolCtx['runQuery'],
    }), { query, source: 'current' })
    expect(current).toMatchObject({ kind: 'noMatch', assessed: { source: 'current', coverage: 'complete' },
      next: [{ action: 'broaden', args: { query } }] })

    const all = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search', toolCtx({
      runAction: vi.fn(async () => noCandidates) as ToolCtx['runAction'],
      runQuery: vi.fn(async () => ({
        kind: 'ok', page: [], continueCursor: '', isDone: true,
        coverage: { generation: 'bazaar-7', completedAt: 100 },
      })) as ToolCtx['runQuery'],
    }), { query })
    expect(all).toMatchObject({ kind: 'noMatch', assessed: { source: 'all', coverage: 'complete' },
      next: [{ action: 'broaden', args: { query } }] })

    const runAction = vi.fn(async (reference, args: { query: string }) => {
      expect(getFunctionName(reference)).toBe('capabilityToolCatalog:searchInternal')
      expect(args.query).toBe(query)
      return serializeToolSearchResult({
        ...misorderedSearchResult(query), items: [], pagination: { limit: 8, hasMore: true, nextCursor: 'admitted-next' },
      })
    })
    const scoped = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search',
      toolCtx({ runAction: runAction as ToolCtx['runAction'] }), { query, source: 'current' })
    expect(scoped).toMatchObject({ kind: 'scoped', assessed: { coverage: 'partial' }, results: [],
      next: [{ action: 'next-page', args: { cursor: 'admitted-next' } }] })
  })

  it('keeps admitted matches when selection evidence is unavailable', async () => {
    const query = 'convert time between timezones'
    const source = serializeToolSearchResult({
      ...misorderedSearchResult(query), items: [TOOL_TIMEZONE], pagination: { limit: 8, hasMore: false },
    })
    const presented = serializeToolSearchResult({
      ...misorderedSearchResult(query), items: [TOOL_TIMEZONE],
      ranking: [{ toolRef: TOOL_TIMEZONE.toolRef, rank: 1, score: 0.9 }],
      pagination: { limit: 8, hasMore: false },
    })
    const runAction = vi.fn(async reference => {
      const name = getFunctionName(reference)
      if (name === 'capabilityToolCatalog:searchInternal') return source
      if (name === 'capabilityToolCatalog:presentSearch') return { result: presented, use: 'registry.tools.search' }
      throw new Error(`Unexpected action: ${name}`)
    })
    const runQuery = vi.fn(async () => { throw new Error('selection evidence unavailable') })
    const result = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search', toolCtx({
      runAction: runAction as ToolCtx['runAction'], runQuery: runQuery as ToolCtx['runQuery'],
    }), { query, source: 'current' })

    expect(result).toMatchObject({ kind: 'match', results: [{ id: TOOL_TIMEZONE.toolRef }] })
    expect(runQuery).toHaveBeenCalledWith(internal.marketListingEvidence.selectionEvidenceInternal, {
      toolRefs: [TOOL_TIMEZONE.toolRef],
    })
  })

  it('serves lexical indexed matches if Jev times out, but refuses a missing index', async () => {
    const source = misorderedSearchResult('token transfer')
    const unavailableRanker = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search',
      toolCtx({ runAction: vi.fn(async reference => {
        if (getFunctionName(reference) === 'capabilityToolCatalog:presentSearch') throw new Error('ranker timeout')
        return serializeToolSearchResult(source)
      }) as ToolCtx['runAction'] }), { query: 'token transfer', source: 'current' })
    expect(unavailableRanker).toMatchObject({ kind: 'match', results: [{ id: TOOL_CRYPTO_TX.toolRef }] })
    const unavailableIndex = await invokeTool(createChatAgent(mockModel()), 'registry.tools.search',
      toolCtx({ runAction: vi.fn(async () => serializeToolSearchResult({
        kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: 'source_unavailable', navigation: [],
      })) as ToolCtx['runAction'] }), { query: 'token transfer', source: 'current' })
    expect(unavailableIndex).toMatchObject({ kind: 'unavailable', results: [],
      next: [{ action: 'retry', args: { query: 'token transfer' } }] })
  })

  it('refuses invalid catalogue responses rather than presenting a recommendation', async () => {
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

  it('projects native comparison evidence into a usable chat comparison', async () => {
    const runAction = vi.fn(async () => serializeToolCompareResult({
      kind: 'ok', schemaVersion: 'registry-tools:v3', tools: [TOOL_TIMEZONE],
      facts: [], navigation: [],
    }))
    const result = await invokeTool(createChatAgent(mockModel()), 'registry.tools.compare',
      toolCtx({ runAction: runAction as ToolCtx['runAction'] }), { toolRefs: [TOOL_TIMEZONE.toolRef] })
    expect(result).toMatchObject({
      kind: 'ok', tools: [{ toolRef: TOOL_TIMEZONE.toolRef, title: TOOL_TIMEZONE.listing.label }],
    })
    expect(runAction).toHaveBeenCalledExactlyOnceWith(internal.capabilityToolCatalog.compareInternal,
      { toolRefs: [TOOL_TIMEZONE.toolRef] })
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
    expect(getFunctionName(runAction.mock.calls[5]![0])).toBe('capabilityToolCatalog:compareInternal')
  })

  it.each([['tool.plan.run', 'tool.call'], ['tool.call', 'tool.plan.run']] as const)('shares the execute slot across %s then %s', async (firstId, secondId) => {
    let finish: ((value: unknown) => void) | undefined
    const waiting = new Promise<unknown>(resolve => { finish = resolve })
    const runAction = vi.fn(async () => waiting)
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })
    const input = (id: typeof firstId) => id === 'tool.call' ? { quoteRef: COMMITMENT_REF }
      : { planRef: 'plan-one', approvedTotalAudUnits: '1200' }
    const first = invokeTool(agent, firstId, ctx, input(firstId))
    await expect(invokeTool(agent, secondId, ctx, input(secondId))).resolves.toMatchObject({
      kind: 'chat_tool_refused', toolId: secondId, reason: 'execute_limit',
    })
    finish?.(firstId === 'tool.call' ? { kind: 'refused', code: 'grant_not_found', retryable: false }
      : { kind: 'awaiting_approval', planRef: 'plan-one', state: 'awaiting_approval' })
    await first
    expect(runAction).toHaveBeenCalledOnce()
    if (firstId === 'tool.plan.run') expect(runAction.mock.calls[0]).toBeDefined()
  })

  it('projects a Plan approval card with a scoped link and no invented charge', () => {
    const part = { type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.plan.run']}`, state: 'output-available',
      output: { kind: 'awaiting_approval', planRef: 'plan-one', state: 'awaiting_approval' } }
    const card = projectToolCard(part)
    expect(card).toMatchObject({ kind: 'status', planRef: 'plan-one', summary: expect.stringContaining('No credit is held') })
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

  it('fails closed when validation or serialization rejects a Tool result', async () => {
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
