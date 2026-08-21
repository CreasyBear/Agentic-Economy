import { describe, expect, it } from 'vitest'

import {
  findAction,
  listActions,
  listMcpActions,
  listOperationRouteDescriptors,
} from '@/modules/actions'
import { ANSWER_OPERATION_EFFECT_DISPATCH_IDS } from '@/modules/answer/internal/answer-tool-use-agent'
import { ANSWER_OPERATION_EFFECT_TOOL_IDS, ANSWER_READ_TOOL_IDS } from '@/modules/answer-thread/tooling'
import { AnswerToolIdValues } from '@/modules/answer-thread/answer-thread.values'
import { OPERATION_MARKET_ACTION_ENTRIES } from '@/modules/registry/operation-entry'
import { MARKET_OPERATION_COMMAND_DESCRIPTORS } from '../../tools/ae/commands/market-operations'
import { runCompareCommand } from '../../tools/ae/commands/compare'
import { runInspectCommand } from '../../tools/ae/commands/inspect'
import { runInspectPlanCommand } from '../../tools/ae/commands/inspect-plan'
import { runSearchCommand } from '../../tools/ae/commands/search'
import { invokeCommandDescriptor, runInvokeCommand } from '../../tools/ae/commands/invoke'

const operationMarketCliCommands = [
  { actionId: 'registry.operations.search', command: 'search', path: '/api/v1/market-operations/search' },
  { actionId: 'registry.operations.detail', command: 'inspect', path: '/api/v1/market-operations/detail' },
  { actionId: 'registry.operations.compare', command: 'compare', path: '/api/v1/market-operations/compare' },
  { actionId: 'registry.operations.inspectPlan', command: 'inspect-plan', path: '/api/v1/market-operations/inspect-plan' },
] as const

const operationMarketCliRunners = [
  runSearchCommand,
  runInspectCommand,
  runCompareCommand,
  runInspectPlanCommand,
] as const

describe('operation surface conformance', () => {
  it('projects operation reads across Answer, HTTP, agent JSON, MCP, and CLI', () => {
    const marketEntryIds = OPERATION_MARKET_ACTION_ENTRIES.map((entry) => entry.actionId)
    expect(operationMarketCliCommands.map(({ actionId }) => actionId)).toEqual(marketEntryIds)
    expect(MARKET_OPERATION_COMMAND_DESCRIPTORS.map(({ actionId }) => actionId)).toEqual(marketEntryIds)
    expect(MARKET_OPERATION_COMMAND_DESCRIPTORS.map(({ actionId, command, path }) => ({
      actionId,
      command,
      path,
    }))).toEqual(operationMarketCliCommands)
    expect(ANSWER_READ_TOOL_IDS.filter((id) => id.startsWith('registry.operations.'))).toEqual(marketEntryIds)

    for (const [index, descriptor] of MARKET_OPERATION_COMMAND_DESCRIPTORS.entries()) {
      const entry = OPERATION_MARKET_ACTION_ENTRIES[index]
      expect(entry).toBeDefined()
      if (entry === undefined) continue
      expect(descriptor.actionId).toBe(entry.actionId)
      expect(descriptor.path).toBe(entry.pathTemplate)

      const action = findAction(descriptor.actionId)
      expect(action, `Market action ${descriptor.actionId} is not registered`).toBeDefined()
      if (action === undefined) continue
      expect(descriptor.inputSchema).toBe(action.schema)
      expect(descriptor.outputSchema).toBe(action.outputSchema)
      expect(descriptor.run).toBe(operationMarketCliRunners[index])
      expect(action.surfaces).toEqual(
        expect.arrayContaining(['http', 'agentJson', 'answerThread', 'cli', 'mcp']),
      )
      expect(listMcpActions().map((candidate) => candidate.id)).toContain(action.id)
    }
  })

  it('keeps invocation on the canonical paid lifecycle surfaces', () => {
    const directOperationIds = ANSWER_OPERATION_EFFECT_DISPATCH_IDS
    expect(directOperationIds).toBe(ANSWER_OPERATION_EFFECT_TOOL_IDS)
    expect(directOperationIds).toEqual(ANSWER_OPERATION_EFFECT_TOOL_IDS)
    const [executeId, invokeId] = directOperationIds
    const mcpActionIds = listMcpActions().map((action) => action.id)
    const operationRouteDescriptors = listOperationRouteDescriptors()
    const operationRouteActionIds = operationRouteDescriptors.map((route) => route.actionId)

    for (const id of directOperationIds) {
      expect(mcpActionIds).toContain(id)
      expect(AnswerToolIdValues).toContain(id)
    }
    expect(ANSWER_READ_TOOL_IDS).toContain(executeId)
    expect(ANSWER_READ_TOOL_IDS).not.toContain(invokeId)

    const execute = findAction(executeId)
    expect(execute).toBeDefined()
    expect(execute?.surfaces).toEqual(['mcp'])
    expect(operationRouteActionIds).not.toContain(executeId)

    const invoke = findAction(invokeId)
    expect(invoke).toBeDefined()
    if (invoke === undefined) return
    expect(invoke.surfaces).toEqual(['http', 'mcp', 'cli'])
    expect(mcpActionIds).toContain(invokeId)
    expect(operationRouteActionIds).toContain(invokeId)

    const invokeRoute = operationRouteDescriptors.find((route) => route.actionId === invokeId)
    expect(invokeRoute).toBeDefined()
    if (invokeRoute === undefined) return
    expect(invokeCommandDescriptor.command).toBe('invoke')
    expect(invokeCommandDescriptor.actionId).toBe(invoke.id)
    expect(invokeCommandDescriptor.actionId).toBe(invokeRoute.actionId)
    expect(invokeCommandDescriptor.path).toBe(invokeRoute.path)
    expect(invokeCommandDescriptor.method).toBe(invokeRoute.method)
    expect(invokeCommandDescriptor.inputSchema).toBe(invoke.schema)
    expect(invokeCommandDescriptor.outputSchema).toBe(invoke.outputSchema)
    expect(invokeCommandDescriptor.run).toBe(runInvokeCommand)

    for (const action of listActions()) {
      const isRegistryOperation = action.id.startsWith('registry.operations.')
      const isOperation = action.id.startsWith('operation.')
      if ((!isRegistryOperation && !isOperation) || !action.surfaces.includes('answerThread')) continue
      expect(action.surfaces).toContain('mcp')
      if (isRegistryOperation) expect(action.surfaces).toContain('cli')
    }
  })
})

