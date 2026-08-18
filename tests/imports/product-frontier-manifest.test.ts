import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  findAction,
  listActions,
  listMcpActions,
  listOperationRouteDescriptors,
  mcpToolName,
} from '@/modules/actions'
import { ANSWER_OPERATION_EFFECT_DISPATCH_IDS } from '@/modules/answer/internal/answer-tool-use-agent'
import { ANSWER_OPERATION_EFFECT_TOOL_IDS, ANSWER_READ_TOOL_IDS } from '@/modules/answer-thread/tooling'
import { AnswerToolIdValues } from '@/modules/answer-thread/answer-thread.values'
import { OPERATION_MARKET_ACTION_ENTRIES } from '@/modules/registry/operation-entry'
import { businessServicesPolicy } from '@/modules/product-frontier/business-services-policy'
import { MARKET_OPERATION_COMMAND_DESCRIPTORS } from '../../tools/ae/commands/market-operations'
import { runCompareCommand } from '../../tools/ae/commands/compare'
import { runInspectCommand } from '../../tools/ae/commands/inspect'
import { runInspectPlanCommand } from '../../tools/ae/commands/inspect-plan'
import { runSearchCommand } from '../../tools/ae/commands/search'
import { invokeCommandDescriptor, runInvokeCommand } from '../../tools/ae/commands/invoke'
import { ANSWER_EVAL_COVERAGE_REQUIREMENTS } from '../../eval/answer/lib/cases'

type ProductFrontierManifest = Readonly<{
  schemaVersion: string
  requiredActionIds: readonly string[]
  protectedActionIds: readonly string[]
  requiredMcpTools: readonly Readonly<{
    id: string
    toolName: string
    readOnly: boolean
  }>[]
  evalCoverageTags: readonly string[]
  targetProduct: Readonly<{
    marketAuthority: readonly string[]
    agentAuthority: readonly string[]
    answerLoop: string
    livePaymentLane: string
    providerDirectX402: string
  }>
  quarantineFamilies: readonly Readonly<{
    id: string
    status: string
    evidenceDisposition: string
    successor: string
    actionIds: readonly string[]
  }>[]
  businessServicesPolicy: Readonly<{
    expansion: string
    publicUrls: string
    trafficInstrumentation: string
  }>
}>
const PRODUCT_FRONTIER_MANIFEST_VERSION = 'ae-product-frontier:v2'

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

const productFrontierManifest = JSON.parse(
  readFileSync(
    '.planning/evidence/product-frontier-baseline/product-frontier-manifest.json',
    'utf8',
  ),
) as ProductFrontierManifest

describe('product frontier manifest', () => {
  it('passes the structural positive frontier floor', () => {
    const output = execFileSync(process.execPath, ['tools/release/verify-product-frontier.mjs'], {
      encoding: 'utf8',
    })
    expect(JSON.parse(output)).toEqual({ ok: true, errors: [] })
  })

  it('pins the founder-approved v2 target and quarantine receipt', () => {
    expect(productFrontierManifest.targetProduct).toEqual({
      marketAuthority: [
        'operation-contract',
        'authorization',
        'durable-invocation',
        'delivery-evidence',
        'brokered-money',
      ],
      agentAuthority: ['planning', 'orchestration'],
      answerLoop: 'bounded-shared-market-tool-loop',
      livePaymentLane: 'ae-brokered',
      providerDirectX402: 'discovery-metadata-only',
    })
    expect(productFrontierManifest.quarantineFamilies).toEqual([
      {
        id: 'customer-request',
        status: 'approved-pending-deprecation',
        evidenceDisposition: 'retain-read-only',
        successor: 'registry.operations.* + operation.invoke/status/cancel/reconcile for atomic market work; no replacement for legacy planning/problem/repeat/assistant orchestration',
        actionIds: [
          'customerRequest.confirm',
          'customerRequest.run',
          'customerRequest.cancel',
          'customerRequest.reportProblem',
          'customerRequest.replyProblem',
          'customerRequest.inspectEvidence',
          'customerRequest.allowRepeatPermission',
          'customerRequest.useRepeatPermission',
          'customerRequest.inspectRepeatPermission',
          'customerRequest.planPreview',
          'customerRequest.listConnectedAssistants',
          'customerRequest.withdrawRepeatPermission',
        ],
      },
      {
        id: 'inquiries',
        status: 'approved-pending-deprecation',
        evidenceDisposition: 'retain-read-only',
        successor: 'published provider contact channels',
        actionIds: ['inquiry.submit', 'inquiry.readCustomerRecord'],
      },
      {
        id: 'study',
        status: 'approved-pending-deprecation',
        evidenceDisposition: 'retain-read-only',
        successor: 'consuming-agent planning and orchestration',
        actionIds: ['study.start', 'study.inspect'],
      },
      {
        id: 'work-tree',
        status: 'approved-pending-deprecation',
        evidenceDisposition: 'retain-read-only',
        successor: 'consuming-agent planning and orchestration',
        actionIds: [
          'workTree.create',
          'workTree.inspect',
          'workTree.apply',
          'workTree.decide',
          'workTree.reserveRepeatUse',
          'workTree.finalizeRepeatUse',
          'workTree.reconcileRepeatUse',
          'workTree.inspectRepeatUse',
        ],
      },
    ])
    expect(productFrontierManifest.businessServicesPolicy).toEqual(businessServicesPolicy)
  })

  it('keeps the live action registry at or above the frozen frontier floor', () => {
    expect(productFrontierManifest.schemaVersion).toBe(PRODUCT_FRONTIER_MANIFEST_VERSION)
    const liveIds = listActions().map((action) => action.id)
    expect(liveIds).toEqual(productFrontierManifest.requiredActionIds)
    for (const id of productFrontierManifest.protectedActionIds) {
      expect(liveIds).toContain(id)
    }
  })

  it('keeps MCP tool names identical to the frozen frontier descriptors', () => {
    const live = listMcpActions().map((action) => ({
      id: action.id,
      toolName: mcpToolName(action),
      readOnly: action.readOnly,
    }))
    expect(live).toEqual(productFrontierManifest.requiredMcpTools)
  })

  it('keeps Answer eval coverage tags at the frontier floor', () => {
    expect(ANSWER_EVAL_COVERAGE_REQUIREMENTS.map((requirement) => requirement.tag)).toEqual(
      productFrontierManifest.evalCoverageTags,
    )
  })

  it('deregisters quarantine actions from the public inventory after notice', () => {
    const liveIds = listActions().map((action) => action.id)
    for (const family of productFrontierManifest.quarantineFamilies) {
      for (const actionId of family.actionIds) {
        expect(liveIds).not.toContain(actionId)
        expect(findAction(actionId), `HTTP door implementation for ${actionId} must remain findable`).toBeDefined()
      }
    }
  })
  it('keeps operation-read descriptors on the canonical Market Operation frontier', () => {
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
    }
  })

  it.each(operationMarketCliCommands)(
    'projects $actionId across Answer, HTTP, agent JSON, MCP, and CLI',
    ({ actionId, command }) => {
      const action = findAction(actionId)
      expect(action, `Market action ${actionId} is not registered`).toBeDefined()
      if (action === undefined) return

      const descriptor = MARKET_OPERATION_COMMAND_DESCRIPTORS.find((candidate) => candidate.actionId === actionId)
      expect(descriptor, `CLI descriptor for ${actionId} is not registered`).toBeDefined()
      if (descriptor === undefined) return

      expect(descriptor.command).toBe(command)
      expect(action.surfaces).toEqual(
        expect.arrayContaining(['http', 'agentJson', 'answerThread', 'cli', 'mcp']),
      )
      expect(listMcpActions().map((candidate) => candidate.id)).toContain(actionId)
    },
  )

  it('fences direct operation execution and lifecycle surfaces', () => {
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
      expect(ANSWER_READ_TOOL_IDS).not.toContain(id)
    }

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


function findActionId(id: string): string | undefined {
  return listActions().find((action) => action.id === id)?.id
}
