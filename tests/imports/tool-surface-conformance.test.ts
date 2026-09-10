import { describe, expect, it } from 'vitest'

import {
  findAction,
  listActions,
  listMcpActions,
  listCallRouteDescriptors,
} from '@/modules/actions'
import { TOOL_MARKET_ACTION_ENTRIES } from '@/modules/registry/tool-entry'
import { MARKET_TOOL_COMMAND_DESCRIPTORS } from '../../tools/ae/commands/market-tools'
import { runCompareCommand } from '../../tools/ae/commands/compare'
import { runDescribeCommand } from '../../tools/ae/commands/describe'
import { runListCommand } from '../../tools/ae/commands/list'
import { runSearchCommand } from '../../tools/ae/commands/search'
import { callCommandDescriptor, runCallCommand } from '../../tools/ae/commands/call'
import { ACCOUNT_COMMAND_DESCRIPTORS, accountCommandDescriptor } from '../../tools/ae/commands/account'
import { CLI_ACTION_ADAPTERS } from '../../tools/ae/commands/action-adapters'
import {
  AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS,
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
} from '@/modules/agent-access/account.actions'
import { SUPPLY_ACTION_ROUTE_CONTRACTS } from '@/modules/capability-supply/supply-actions'
import { SUPPLY_COMMAND_DESCRIPTORS } from '../../tools/ae/commands/supply'

const toolMarketCliCommands = [
  { actionId: 'registry.tools.list', command: 'list', path: '/api/v1/market-tools/list' },
  { actionId: 'registry.tools.search', command: 'search', path: '/api/v1/market-tools/search' },
  { actionId: 'registry.tools.describe', command: 'describe', path: '/api/v1/market-tools/describe' },
  { actionId: 'registry.tools.compare', command: 'compare', path: '/api/v1/market-tools/compare' },
] as const

const toolMarketCliRunners = [
  runListCommand,
  runSearchCommand,
  runDescribeCommand,
  runCompareCommand,
] as const

const chatActionIds = [
  'registry.tools.list',
  'registry.tools.search',
  'registry.tools.describe',
  'registry.tools.compare',
  'tool.quote',
  'tool.call',
] as const

describe('Tool surface conformance', () => {
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
      expect(action.credentialAdmission?.scope).toBe('market_tools:call')
      expect(descriptor.method).toBe('POST')
      expect(descriptor.path).toMatch(/^\/api\/v1\/account\//u)
      expect(descriptor.action.schema).toBe(action.schema)
      expect(descriptor.action.outputSchema).toBe(action.outputSchema)
    }
  })
  it('projects the Provider supply lifecycle through one action spine', () => {
    const routes = Object.values(SUPPLY_ACTION_ROUTE_CONTRACTS)
    expect(SUPPLY_COMMAND_DESCRIPTORS).toHaveLength(routes.length)
    for (const descriptor of SUPPLY_COMMAND_DESCRIPTORS) {
      const action = findAction(descriptor.actionId)
      expect(action, `Provider action ${descriptor.actionId} is not registered`).toBeDefined()
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
  it('projects Tool reads across chat, HTTP, agent JSON, MCP, and CLI', () => {
    const marketEntryIds = TOOL_MARKET_ACTION_ENTRIES.map((entry) => entry.actionId)
    expect(toolMarketCliCommands.map(({ actionId }) => actionId)).toEqual(marketEntryIds)
    expect(MARKET_TOOL_COMMAND_DESCRIPTORS.map(({ actionId }) => actionId)).toEqual(marketEntryIds)
    expect(MARKET_TOOL_COMMAND_DESCRIPTORS.map(({ actionId, command, path }) => ({
      actionId,
      command,
      path,
    }))).toEqual(toolMarketCliCommands)
    expect(chatActionIds.slice(0, 4)).toEqual(marketEntryIds)

    for (const [index, descriptor] of MARKET_TOOL_COMMAND_DESCRIPTORS.entries()) {
      const entry = TOOL_MARKET_ACTION_ENTRIES[index]
      expect(entry).toBeDefined()
      if (entry === undefined) continue
      expect(descriptor.actionId).toBe(entry.actionId)
      expect(descriptor.path).toBe(entry.pathTemplate)

      const action = findAction(descriptor.actionId)
      expect(action, `Market action ${descriptor.actionId} is not registered`).toBeDefined()
      if (action === undefined) continue
      expect(descriptor.inputSchema).toBe(action.schema)
      expect(descriptor.outputSchema).toBe(action.outputSchema)
      expect(descriptor.run).toBe(toolMarketCliRunners[index])
      expect(action.surfaces).toEqual(
        expect.arrayContaining(['http', 'agentJson', 'chat', 'cli', 'mcp']),
      )
      expect(listMcpActions().map((candidate) => candidate.id)).toContain(action.id)
    }
  })

  it('keeps the Call lifecycle on the canonical paid surfaces', () => {
    const callId = 'tool.call' as const
    const mcpActionIds = listMcpActions().map((action) => action.id)
    const callRouteDescriptors = listCallRouteDescriptors()
    const callRouteActionIds = callRouteDescriptors.map((route) => route.actionId)

    const call = findAction(callId)
    expect(call).toBeDefined()
    if (call === undefined) return
    expect(call.surfaces).toEqual(['http', 'mcp', 'cli', 'chat'])
    expect(mcpActionIds).toContain(callId)
    expect(callRouteActionIds).toContain(callId)

    const callRoute = callRouteDescriptors.find((route) => route.actionId === callId)
    expect(callRoute).toBeDefined()
    if (callRoute === undefined) return
    expect(callCommandDescriptor.command).toBe('call')
    expect(callCommandDescriptor.actionId).toBe(call.id)
    expect(callCommandDescriptor.actionId).toBe(callRoute.actionId)
    expect(callCommandDescriptor.path).toBe(callRoute.path)
    expect(callCommandDescriptor.method).toBe(callRoute.method)
    expect(callCommandDescriptor.inputSchema).toBe(call.schema)
    expect(callCommandDescriptor.outputSchema).toBe(call.outputSchema)
    expect(callCommandDescriptor.run).toBe(runCallCommand)

    const chatActions = listActions().filter((action) => action.surfaces.includes('chat'))
    expect(chatActions.map(({ id }) => id)).toEqual(chatActionIds)
    for (const action of chatActions) {
      expect(action.surfaces).toContain('mcp')
      if (action.id.startsWith('registry.tools.')) expect(action.surfaces).toContain('cli')
    }
  })
})
