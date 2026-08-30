import { describe, expect, it } from 'vitest'

import {
  findAction,
  listActions,
  listMcpActions,
  listOperationRouteDescriptors,
} from '@/modules/actions'
import { OPERATION_MARKET_ACTION_ENTRIES } from '@/modules/registry/operation-entry'
import { MARKET_OPERATION_COMMAND_DESCRIPTORS } from '../../tools/ae/commands/market-operations'
import { runCompareCommand } from '../../tools/ae/commands/compare'
import { runInspectCommand } from '../../tools/ae/commands/inspect'
import { runInspectPlanCommand } from '../../tools/ae/commands/inspect-plan'
import { runSearchCommand } from '../../tools/ae/commands/search'
import { invokeCommandDescriptor, runInvokeCommand } from '../../tools/ae/commands/invoke'
import { ACCOUNT_COMMAND_DESCRIPTORS, accountCommandDescriptor } from '../../tools/ae/commands/account'
import { CLI_ACTION_ADAPTERS } from '../../tools/ae/commands/action-adapters'
import {
  AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS,
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
} from '@/modules/agent-access/account.actions'
import { SUPPLY_ACTION_ROUTE_CONTRACTS } from '@/modules/capability-supply/supply-actions'
import { SUPPLY_COMMAND_DESCRIPTORS } from '../../tools/ae/commands/supply'

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

const chatActionIds = [
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
  'operation.invoke',
] as const

describe('operation surface conformance', () => {
  it('requires one concrete CLI adapter for every action declaring the CLI surface', () => {
    const declared = listActions()
      .filter(({ surfaces }) => surfaces.includes('cli'))
      .map(({ id }) => id)
      .toSorted()
    const adapted = CLI_ACTION_ADAPTERS.map(({ actionId }) => actionId).toSorted()

    expect(new Set(adapted).size).toBe(adapted.length)
    expect(adapted).toEqual(declared)
    for (const adapter of CLI_ACTION_ADAPTERS) {
      expect(findAction(adapter.actionId), `CLI adapter ${adapter.command} has no registered action`).toBeDefined()
      expect(adapter.path).toMatch(/^\/api\/v1\//u)
    }
  })
  it('projects current agent account identity through one HTTP, MCP, and CLI contract', () => {
    const action = findAction(AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.actionId)
    expect(action).toBeDefined()
    if (action === undefined) return

    expect(action.surfaces).toEqual(['http', 'mcp', 'cli'])
    expect(listMcpActions().map(({ id }) => id)).toContain(action.id)
    expect(accountCommandDescriptor).toMatchObject({
      actionId: action.id,
      command: 'account',
      subcommand: 'status',
      method: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.method,
      path: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.path,
    })
    expect(accountCommandDescriptor.outputSchema).toBe(action.outputSchema)
  })
  it('projects buyer balance and activity through one account action spine', () => {
    const routes = Object.values(AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS)
    expect(ACCOUNT_COMMAND_DESCRIPTORS).toHaveLength(routes.length)
    for (const descriptor of ACCOUNT_COMMAND_DESCRIPTORS) {
      const action = findAction(descriptor.actionId)
      expect(action).toBeDefined()
      if (action === undefined) continue
      expect(action.surfaces).toEqual(['http', 'mcp', 'cli'])
      expect(action.credentialAdmission?.scope).toBe('market_operations:invoke')
      expect(descriptor.method).toBe('POST')
      expect(descriptor.path).toMatch(/^\/api\/v1\/account\//u)
      expect(descriptor.action.schema).toBe(action.schema)
      expect(descriptor.action.outputSchema).toBe(action.outputSchema)
    }
  })
  it('projects the supplier Operation lifecycle through one action spine', () => {
    const routes = Object.values(SUPPLY_ACTION_ROUTE_CONTRACTS)
    expect(SUPPLY_COMMAND_DESCRIPTORS).toHaveLength(routes.length)
    for (const descriptor of SUPPLY_COMMAND_DESCRIPTORS) {
      const action = findAction(descriptor.actionId)
      expect(action, `Supplier action ${descriptor.actionId} is not registered`).toBeDefined()
      if (action === undefined) continue
      expect(action.surfaces).toEqual(['http', 'mcp', 'cli'])
      expect(action.credentialAdmission?.scope).toBe('market_supply:manage')
      expect(descriptor.route.actionId).toBe(action.id)
      expect(descriptor.route.method).toBe('POST')
      expect(descriptor.route.path).toMatch(/^\/api\/v1\/supply\//u)
      expect(descriptor.action.schema).toBe(action.schema)
      expect(descriptor.action.outputSchema).toBe(action.outputSchema)
    }
  })
  it('projects operation reads across chat, HTTP, agent JSON, MCP, and CLI', () => {
    const marketEntryIds = OPERATION_MARKET_ACTION_ENTRIES.map((entry) => entry.actionId)
    expect(operationMarketCliCommands.map(({ actionId }) => actionId)).toEqual(marketEntryIds)
    expect(MARKET_OPERATION_COMMAND_DESCRIPTORS.map(({ actionId }) => actionId)).toEqual(marketEntryIds)
    expect(MARKET_OPERATION_COMMAND_DESCRIPTORS.map(({ actionId, command, path }) => ({
      actionId,
      command,
      path,
    }))).toEqual(operationMarketCliCommands)
    expect(chatActionIds.slice(0, 4)).toEqual(marketEntryIds)

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
        expect.arrayContaining(['http', 'agentJson', 'chat', 'cli', 'mcp']),
      )
      expect(listMcpActions().map((candidate) => candidate.id)).toContain(action.id)
    }
  })

  it('keeps invocation on the canonical paid lifecycle surfaces', () => {
    const invokeId = 'operation.invoke' as const
    const mcpActionIds = listMcpActions().map((action) => action.id)
    const operationRouteDescriptors = listOperationRouteDescriptors()
    const operationRouteActionIds = operationRouteDescriptors.map((route) => route.actionId)

    const invoke = findAction(invokeId)
    expect(invoke).toBeDefined()
    if (invoke === undefined) return
    expect(invoke.surfaces).toEqual(['http', 'mcp', 'cli', 'chat'])
    expect(mcpActionIds).toContain(invokeId)
    expect(operationRouteActionIds).toContain(invokeId)

    const invokeRoute = operationRouteDescriptors.find((route) => route.actionId === invokeId)
    expect(invokeRoute).toBeDefined()
    if (invokeRoute === undefined) return
    expect(invokeCommandDescriptor.command).toBe('call')
    expect(invokeCommandDescriptor.actionId).toBe(invoke.id)
    expect(invokeCommandDescriptor.actionId).toBe(invokeRoute.actionId)
    expect(invokeCommandDescriptor.path).toBe(invokeRoute.path)
    expect(invokeCommandDescriptor.method).toBe(invokeRoute.method)
    expect(invokeCommandDescriptor.inputSchema).toBe(invoke.schema)
    expect(invokeCommandDescriptor.outputSchema).toBe(invoke.outputSchema)
    expect(invokeCommandDescriptor.run).toBe(runInvokeCommand)

    const chatActions = listActions().filter((action) => action.surfaces.includes('chat'))
    expect(chatActions.map(({ id }) => id)).toEqual(chatActionIds)
    for (const action of chatActions) {
      expect(action.surfaces).toContain('mcp')
      if (action.id.startsWith('registry.operations.')) expect(action.surfaces).toContain('cli')
    }
  })
})
