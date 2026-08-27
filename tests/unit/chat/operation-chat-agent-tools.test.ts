import { mockModel, type ToolCtx } from '@convex-dev/agent'
import { generateText, type ToolSet } from 'ai'
import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import {
  CHAT_TOOL_IDS,
  CHAT_TOOL_NAME_MAP,
  createChatAgent,
  MAX_CHAT_TOOL_CALLS,
  MAX_CHAT_TOOL_RESULT_BYTES,
  type ChatToolId,
} from '../../../convex/chatTools'
import { api } from '../../../convex/_generated/api'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'
import { registryOperationsSearchContract } from '@/modules/registry/operation-action-contracts'

const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
const AUTHORITY = {
  principalRef: `prn_${'1'.repeat(32)}`,
  accountRef: `acc_${'2'.repeat(32)}`,
  legacyOwnerId: 'owners:chat-authority',
  legacyOwnerLocator: 'user_chat-authority',
  revision: {
    binding: 1, credential: 1, principal: 1, account: 1, access: 1,
    currentOwnership: 1, currentOwnerPrincipal: 1, compatibilityUpdatedAt: 1,
  },
  provenance: {
    providerNamespace: 'clerk/user',
    bindingRef: `eib_${'3'.repeat(32)}`,
    credentialRef: `crd_${'4'.repeat(32)}`,
    credentialGeneration: 1,
    accessKind: 'ownership',
    accessRef: `own_${'5'.repeat(32)}`,
    currentOwnershipRef: `own_${'5'.repeat(32)}`,
    resolvedAt: 1,
  },
} as unknown as InteractiveBusinessAuthorityContext

const noCandidates = {
  kind: 'no_candidates',
  schemaVersion: 'registry-operations:v1',
  query: 'weather',
  appliedFilters: {},
  matchedCount: 0,
  ranking: [],
  navigation: [],
} as const

const notFound = {
  kind: 'not_found',
  schemaVersion: 'registry-operations:v1',
  operationRef: OPERATION_REF,
  navigation: [],
} as const

const compareUnavailable = {
  kind: 'unavailable',
  schemaVersion: 'registry-operations:v1',
  reason: 'operation_not_found',
  navigation: [],
} as const

const inspectUnavailable = {
  kind: 'unavailable',
  schemaVersion: 'registry-operations:v1',
  reason: 'operation_not_found',
  navigation: [],
} as const

function toolCtx(input: Readonly<{
  runQuery?: ToolCtx['runQuery']
  runAction?: ToolCtx['runAction']
}> = {}): ToolCtx {
  return {
    runQuery: input.runQuery ?? vi.fn(),
    runAction: input.runAction ?? vi.fn(),
  } as unknown as ToolCtx
}

async function invokeTool(
  agent: ReturnType<typeof createChatAgent>,
  toolId: ChatToolId,
  ctx: ToolCtx,
  input: unknown,
): Promise<unknown> {
  const providerToolName = CHAT_TOOL_NAME_MAP.canonicalToProvider[toolId]
  const tool = agent.options.tools?.[providerToolName]
  if (tool === undefined || typeof tool.execute !== 'function') {
    throw new Error(`Missing executable chat tool: ${toolId}`)
  }
  const bound = { ...tool, ctx }
  return await Reflect.apply(tool.execute, bound, [
    input,
    { toolCallId: `test:${toolId}`, messages: [] },
  ])
}

function nativeReadResult(functionName: string): unknown {
  switch (functionName) {
    case 'capabilitySupplyOperations:search':
      return noCandidates
    case 'capabilitySupplyOperations:detail':
      return notFound
    case 'capabilitySupplyOperations:compare':
      return compareUnavailable
    case 'capabilitySupplyOperations:inspectPlan':
      return inspectUnavailable
    default:
      throw new Error(`Unexpected native query: ${functionName}`)
  }
}

describe('Operation chat Agent tools', () => {
  it('exports exactly the five canonical tools and bounded Agent defaults', () => {
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
      /\b(?:ae_)?(?:registry|operation)_[A-Za-z0-9_-]+\b/g,
    ) ?? []

    expect(mentionedNames).toContain(
      CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.operations.detail'],
    )
    expect(mentionedNames).not.toContain('ae_registry_operations_detail')
    for (const mentionedName of mentionedNames) {
      expect(offeredNames.has(mentionedName)).toBe(true)
    }
  })

  it('omits operation execution from anonymous chat while preserving public reads', () => {
    const agent = createChatAgent(mockModel())
    expect(Object.keys(agent.options.tools ?? {})).toEqual(
      CHAT_TOOL_IDS.slice(0, 4).map((toolId) => CHAT_TOOL_NAME_MAP.canonicalToProvider[toolId]),
    )
    expect(agent.options.tools).not.toHaveProperty(
      CHAT_TOOL_NAME_MAP.canonicalToProvider['operation.invoke'],
    )
  })

  it('lets the AI SDK reject canonical invalid provider input before native dispatch', async () => {
    const runQuery = vi.fn()
    const providerToolName = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.operations.search']
    const model = mockModel({
      contentSteps: [[{
        type: 'tool-call',
        toolCallId: 'invalid-search',
        toolName: providerToolName,
        input: JSON.stringify({ query: 42 }),
      }]],
    })
    const agent = createChatAgent(model)
    const ctx = toolCtx({ runQuery: runQuery as ToolCtx['runQuery'] })
    const tools = Object.fromEntries(Object.entries(agent.options.tools ?? {}).map(
      ([name, tool]) => [name, { ...tool, ctx }],
    )) as ToolSet

    const result = await generateText({ model, prompt: 'Search operations.', tools })

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolResults).toHaveLength(0)
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('dispatches all reads through their native Convex queries', async () => {
    const runQuery = vi.fn(async (reference) => nativeReadResult(getFunctionName(reference)))
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({ runQuery: runQuery as ToolCtx['runQuery'] })

    await invokeTool(agent, 'registry.operations.search', ctx, { query: 'weather' })
    await invokeTool(agent, 'registry.operations.detail', ctx, { operationRef: OPERATION_REF })
    await invokeTool(agent, 'registry.operations.compare', ctx, { operationRefs: [OPERATION_REF] })
    await invokeTool(agent, 'registry.operations.inspectPlan', ctx, { operationRefs: [OPERATION_REF] })

    expect(runQuery.mock.calls.map(([reference]) => getFunctionName(reference))).toEqual([
      getFunctionName(api.capabilitySupplyOperations.search),
      getFunctionName(api.capabilitySupplyOperations.detail),
      getFunctionName(api.capabilitySupplyOperations.compare),
      getFunctionName(api.capabilitySupplyOperations.inspectPlan),
    ])
  })

  it('rejects invalid canonical output and refuses oversized model results', async () => {
    const invalidAgent = createChatAgent(mockModel())
    const invalidCtx = toolCtx({
      runQuery: vi.fn(async () => ({ kind: 'forged' })) as ToolCtx['runQuery'],
    })
    await expect(invokeTool(
      invalidAgent,
      'registry.operations.search',
      invalidCtx,
      { query: 'weather' },
    )).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'registry.operations.search',
      reason: 'source_output_invalid',
    })

    const largeAgent = createChatAgent(mockModel())
    const largeCtx = toolCtx({
      runQuery: vi.fn(async () => ({
        ...noCandidates,
        query: 'x'.repeat(MAX_CHAT_TOOL_RESULT_BYTES),
      })) as ToolCtx['runQuery'],
    })
    await expect(invokeTool(
      largeAgent,
      'registry.operations.search',
      largeCtx,
      { query: 'weather' },
    )).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'registry.operations.search',
      reason: 'result_too_large',
    })
  })

  it('enforces four total tool calls per Agent factory invocation', async () => {
    const runQuery = vi.fn(async () => noCandidates)
    const agent = createChatAgent(mockModel())
    const ctx = toolCtx({ runQuery: runQuery as ToolCtx['runQuery'] })

    for (let index = 0; index < MAX_CHAT_TOOL_CALLS; index += 1) {
      await expect(invokeTool(
        agent,
        'registry.operations.search',
        ctx,
        { query: 'weather' },
      )).resolves.toMatchObject({ kind: 'no_candidates' })
    }
    await expect(invokeTool(
      agent,
      'registry.operations.search',
      ctx,
      { query: 'weather' },
    )).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'registry.operations.search',
      reason: 'tool_limit',
    })
    expect(runQuery).toHaveBeenCalledTimes(MAX_CHAT_TOOL_CALLS)
  })

  it('reserves the single execute slot before parallel work awaits', async () => {
    let release: ((value: unknown) => void) | undefined
    const firstExecution = new Promise<unknown>((resolve) => {
      release = resolve
    })
    const runAction = vi.fn(async () => await firstExecution)
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })

    const first = invokeTool(agent, 'operation.invoke', ctx, { operationRef: OPERATION_REF, input: {} })
    const second = invokeTool(agent, 'operation.invoke', ctx, { operationRef: OPERATION_REF, input: {} })

    await expect(second).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'operation.invoke',
      reason: 'execute_limit',
    })
    release?.({
      kind: 'refused',
      operationRef: OPERATION_REF,
      code: 'grant_not_found',
      retryable: false,
    })
    await expect(first).resolves.toMatchObject({
      kind: 'refused',
      code: 'grant_not_found',
    })
    expect(runAction).toHaveBeenCalledTimes(1)
  })

  it('fails composition when a canonical contract no longer declares the chat surface', () => {
    const surfaces = registryOperationsSearchContract.surfaces as unknown as string[]
    const index = surfaces.indexOf('chat')
    expect(index).toBeGreaterThanOrEqual(0)
    surfaces.splice(index, 1)
    try {
      expect(() => createChatAgent(mockModel())).toThrow(
        'Chat Action is unavailable: registry.operations.search',
      )
    } finally {
      surfaces.splice(index, 0, 'chat')
    }
  })

  it('sanitizes accepted strings and fails closed at both serialization boundaries', async () => {
    const schemaAgent = createChatAgent(mockModel())
    const safeParse = vi.spyOn(registryOperationsSearchContract.outputSchema, 'safeParse')
      .mockReturnValueOnce({ success: false } as never)
    try {
      await expect(invokeTool(
        schemaAgent,
        'registry.operations.search',
        toolCtx({ runQuery: vi.fn(async () => noCandidates) as ToolCtx['runQuery'] }),
        { query: 'weather' },
      )).resolves.toEqual({
        kind: 'chat_tool_refused',
        toolId: 'registry.operations.search',
        reason: 'source_output_invalid',
      })
    } finally {
      safeParse.mockRestore()
    }

    const sanitizedAgent = createChatAgent(mockModel())
    const sanitizedCtx = toolCtx({
      runQuery: vi.fn(async () => ({
        ...noCandidates,
        query: '<user>quoted</user><>',
      })) as ToolCtx['runQuery'],
    })
    await expect(invokeTool(
      sanitizedAgent,
      'registry.operations.search',
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
        'registry.operations.search',
        toolCtx({ runQuery: vi.fn(async () => noCandidates) as ToolCtx['runQuery'] }),
        { query: 'weather' },
      )).resolves.toEqual({
        kind: 'chat_tool_refused',
        toolId: 'registry.operations.search',
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
        'registry.operations.search',
        toolCtx({ runQuery: vi.fn(async () => noCandidates) as ToolCtx['runQuery'] }),
        { query: 'weather' },
      )).resolves.toEqual({
        kind: 'chat_tool_refused',
        toolId: 'registry.operations.search',
        reason: 'source_output_invalid',
      })
    } finally {
      parse.mockRestore()
    }
  })

  it('enforces the shared call budget before every remaining native handler', async () => {
    const runQuery = vi.fn(async (reference) => nativeReadResult(getFunctionName(reference)))
    const agent = createChatAgent(mockModel(), AUTHORITY)
    const ctx = toolCtx({ runQuery: runQuery as ToolCtx['runQuery'] })
    for (let index = 0; index < MAX_CHAT_TOOL_CALLS; index += 1) {
      await invokeTool(agent, 'registry.operations.search', ctx, { query: 'weather' })
    }
    for (const [toolId, input] of [
      ['registry.operations.detail', { operationRef: OPERATION_REF }],
      ['registry.operations.compare', { operationRefs: [OPERATION_REF] }],
      ['registry.operations.inspectPlan', { operationRefs: [OPERATION_REF] }],
    ] as const) {
      await expect(invokeTool(agent, toolId, ctx, input)).resolves.toEqual({
        kind: 'chat_tool_refused',
        toolId,
        reason: 'tool_limit',
      })
    }
    expect(runQuery).toHaveBeenCalledTimes(MAX_CHAT_TOOL_CALLS)
  })
})
