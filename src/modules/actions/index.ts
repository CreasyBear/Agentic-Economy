/**
 * Central action registry for AE.
 *
 * Registered actions are explicit public machine-operation contracts. They do
 * not cover every backend write: owner/admin/provider/telemetry flows that
 * depend on authenticated route context, webhook signatures, or source-write
 * admission remain TanStack server-function or route-handler exceptions.
 *
 * To add an action-backed surface: create `<module>/<module>.actions.ts`
 * exporting its action consts, then add the import and an entry below. Do not
 * rely on module-eval side effects; production bundlers can tree-shake them.
 */

export { CURRENT_TOOL_PROJECTION_NAVIGATION } from './contract'

import { describeActionForAgent, type AgentToolDescriptor, type AnyAction } from '@/modules/common/action'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import {
  agentAccountActivityAction,
  agentAccountBalanceAction,
  agentAccountSelfAction,
} from '@/modules/agent-access/account.actions'
import {
  supplyCallsAction,
  supplyConnectionConnectAction,
  supplyConnectionDetailAction,
  supplyConnectionListAction,
  supplyConnectionReconnectAction,
  supplyConnectionRevokeAction,
  supplyEarningsAction,
  supplyOffboardingStatusAction,
  supplyToolsListAction,
  supplyPublishAction,
  supplyRecheckAction,
  supplyRepublishAction,
  supplySourcePreviewAction,
  supplyStatusAction,
  supplyWithdrawAction,
} from '@/modules/capability-supply/supply-actions'
import {
  registryDetailAction,
  registrySearchAction,
} from '@/modules/registry/registry.actions'
import {
  registryToolsCompareAction,
  registryToolsDescribeAction,
  registryToolsListAction,
  registryToolsSearchAction,
} from '@/modules/registry/tools.actions'
import {
  callCancelAction,
  callReconcileAction,
  callStatusAction,
} from '@/modules/capability-execution/call-recovery.actions'
import { callAction } from '@/modules/capability-execution/call.actions'
import {
  toolQuoteAction,
  TOOL_QUOTE_ROUTE_CONTRACT,
} from '@/modules/capability-execution/quote.actions'
import { callListAction } from '@/modules/capability-execution/call-history.actions'
import {
  marketRequestCreateAction,
  marketRequestListAction,
  marketRequestStatusAction,
} from '@/modules/market-demand/market-demand.actions'
import {
  fundingHandoffConfigAction,
  fundingHandoffCreateAction,
  fundingHandoffStatusAction,
} from '@/modules/money/funding-handoff.actions'

const toolMarketReadActions: readonly AnyAction[] = [
  registryToolsListAction,
  registryToolsSearchAction,
  registryToolsDescribeAction,
  registryToolsCompareAction,
]

const registeredActions: readonly AnyAction[] = [
  registrySearchAction,
  registryDetailAction,
  ...toolMarketReadActions,
  agentAccountSelfAction,
  agentAccountBalanceAction,
  agentAccountActivityAction,
  fundingHandoffConfigAction,
  fundingHandoffCreateAction,
  fundingHandoffStatusAction,
  marketRequestCreateAction,
  marketRequestListAction,
  marketRequestStatusAction,
  toolQuoteAction,
  callAction,
  callListAction,
  callStatusAction,
  callCancelAction,
  callReconcileAction,
  supplySourcePreviewAction,
  supplyToolsListAction,
  supplyStatusAction,
  supplyPublishAction,
  supplyWithdrawAction,
  supplyRecheckAction,
  supplyRepublishAction,
  supplyEarningsAction,
  supplyCallsAction,
  supplyConnectionListAction,
  supplyConnectionDetailAction,
  supplyConnectionConnectAction,
  supplyConnectionReconnectAction,
  supplyConnectionRevokeAction,
  supplyOffboardingStatusAction,
]

assertUniqueActionIds(registeredActions)

const actions: readonly AnyAction[] = registeredActions

export function listActions(): readonly AnyAction[] {
  return actions
}

export function findAction(id: string): AnyAction | undefined {
  return registeredActions.find((action) => action.id === id)
}

/** Actions exposed on the anonymous MCP host; the adapter enforces read-only admission. */
export function listMcpActions(): readonly AnyAction[] {
  return actions.filter((action) =>
    action.surfaces.includes('mcp') && action.id !== 'registry.search' && action.id !== 'registry.detail'
  )
}

/** True only for one of the registered public Tool catalogue reads. */
export function isToolMarketReadAction(action: AnyAction): boolean {
  return toolMarketReadActions.some((candidate) => candidate === action)
}

/** Deterministic MCP tool name: one derivation, never a hand-maintained map. */
export function mcpToolName(action: AnyAction): string {
  return `ae_${action.id.replace(/\./g, '_')}`
}
export type PublicMcpActionDescriptor = AgentToolDescriptor & Readonly<{
  toolName: string
}>

export function listMcpActionDescriptors(): readonly PublicMcpActionDescriptor[] {
  return listMcpActions().map((action) => ({
    ...describeActionForAgent(action),
    toolName: mcpToolName(action),
  }))
}

const toolCallRouteContracts = [
  TOOL_QUOTE_ROUTE_CONTRACT,
  CALL_ROUTE_CONTRACT.call,
  CALL_ROUTE_CONTRACT.list,
  CALL_ROUTE_CONTRACT.status,
  CALL_ROUTE_CONTRACT.cancel,
  CALL_ROUTE_CONTRACT.reconcile,
] as const

type ToolCallRouteContractEntry = (typeof toolCallRouteContracts)[number]

type PublicCallRouteDescriptorBase = Pick<
  ToolCallRouteContractEntry,
  'actionId' | 'contractVersion' | 'method' | 'path' | 'routerPath' | 'requiredHeaders'
>

export type PublicCallRouteDescriptor = PublicCallRouteDescriptorBase & Readonly<{
  inputJsonSchema?: AgentToolDescriptor['inputJsonSchema']
  outputJsonSchema?: AgentToolDescriptor['outputJsonSchema']
  mcpToolName?: string
}>

export function listCallRouteDescriptors(): readonly PublicCallRouteDescriptor[] {
  return toolCallRouteContracts.map((route) => {
    const action = findAction(route.actionId)
    if (action === undefined) throw new Error(`Call route action is not registered: ${route.actionId}`)
    const descriptor = describeActionForAgent(action)
    return {
      actionId: route.actionId,
      contractVersion: route.contractVersion,
      method: route.method,
      path: route.path,
      routerPath: route.routerPath,
      requiredHeaders: route.requiredHeaders,
      ...(descriptor.inputJsonSchema === undefined ? {} : { inputJsonSchema: descriptor.inputJsonSchema }),
      ...(descriptor.outputJsonSchema === undefined ? {} : { outputJsonSchema: descriptor.outputJsonSchema }),
      ...(action.surfaces.includes('mcp') ? { mcpToolName: mcpToolName(action) } : {}),
    }
  })
}


function assertUniqueActionIds(registry: readonly AnyAction[]): void {
  const knownIds = new Set<string>()
  for (const action of registry) {
    if (knownIds.has(action.id)) {
      throw new Error(`Action already registered: ${action.id}`)
    }
    knownIds.add(action.id)
  }
}

export {
  defineAction,
  describeActionForAgent,
  describeActionMcpMetadata,
  resolveActionContract,
  type Action,
  type ActionAgentAccessPrincipal,
  type ActionAuthorityRequirement,
  type ActionConsequenceClass,
  type ActionContext,
  type ActionCredentialAdmission,
  type ActionExecutionContract,
  type ActionMcpMetadata,
  type ActionParameter,
  type ActionRetryClass,
  type ActionSurface,
  type AgentToolDescriptor,
  type AnyAction,
} from '@/modules/common/action'

export {
  findStrictToolSchemaViolation,
  type StrictSchemaViolation,
} from './strict-schema'

export {
  actionToToolContract,
  describeActionToolExecutionValidation,
  describeActionToolForModel,
  providerSafeActionToolName,
  type ActionToolContract,
  type ActionToolDescriptorProjection,
  type ActionToolExecuteArgs,
  type ActionToolExecutionValidationMetadata,
  type ActionToolFunctionDescriptor,
  type ActionToolSchemaBundle,
  type ActionToolSchemaDiagnostic,
} from './tool-contract'
