import { mockModel, type ToolCtx } from '@convex-dev/agent'
import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import {
  CHAT_TOOL_IDS,
  createChatAgent,
  MAX_CHAT_TOOL_CALLS,
  MAX_CHAT_TOOL_RESULT_BYTES,
  type ChatToolId,
} from '../../../convex/chatTools'
import { api } from '../../../convex/_generated/api'

const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`

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
  const tool = agent.options.tools?.[toolId]
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
    const agent = createChatAgent(mockModel())

    expect(Object.keys(agent.options.tools ?? {})).toEqual(CHAT_TOOL_IDS)
    expect(agent.options.contextOptions).toEqual({ recentMessages: 20 })
    expect(agent.options.stopWhen).toBeTypeOf('function')
  })

  it('rejects canonical invalid input before native dispatch', async () => {
    const runQuery = vi.fn()
    const agent = createChatAgent(mockModel())

    await expect(invokeTool(
      agent,
      'registry.operations.search',
      toolCtx({ runQuery: runQuery as ToolCtx['runQuery'] }),
      { query: 42 },
    )).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'registry.operations.search',
      reason: 'input_invalid',
    })
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('dispatches all reads through their native Convex queries', async () => {
    const runQuery = vi.fn(async (reference) => nativeReadResult(getFunctionName(reference)))
    const agent = createChatAgent(mockModel())
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
    const agent = createChatAgent(mockModel())
    const ctx = toolCtx({ runAction: runAction as ToolCtx['runAction'] })

    const first = invokeTool(agent, 'operation.execute', ctx, { operationRef: OPERATION_REF })
    const second = invokeTool(agent, 'operation.execute', ctx, { operationRef: OPERATION_REF })

    await expect(second).resolves.toEqual({
      kind: 'chat_tool_refused',
      toolId: 'operation.execute',
      reason: 'execute_limit',
    })
    release?.({
      kind: 'refused',
      operationRef: OPERATION_REF,
      reason: 'operation_not_found',
    })
    await expect(first).resolves.toMatchObject({
      kind: 'refused',
      reason: 'operation_not_found',
    })
    expect(runAction).toHaveBeenCalledTimes(1)
  })
})
