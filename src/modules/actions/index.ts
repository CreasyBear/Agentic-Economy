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

import { describeActionForAgent, type AgentToolDescriptor, type AnyAction } from '@/modules/common/action'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { collectSuppliedCandidateQuoteAction } from '@/modules/capability-supply/supplied-quote.actions'
import {
  supplyEarningsAction,
  supplyPublishAction,
  supplyWithdrawAction,
} from '@/modules/capability-supply/supply-actions'
import {
  customerRequestCancelAction,
  customerRequestConfirmAction,
  customerRequestInspectEvidenceAction,
  customerRequestInspectRepeatPermissionAction,
  customerRequestListConnectedAssistantsAction,
  customerRequestAllowRepeatPermissionAction,
  customerRequestReportProblemAction,
  customerRequestReplyProblemAction,
  customerRequestRunAction,
  customerRequestUseRepeatPermissionAction,
  customerRequestWithdrawRepeatPermissionAction,
} from '@/modules/customer-request/customer-request.actions'
import { customerRequestPlanPreviewAction } from '@/modules/customer-request/plan-preview.actions'
import { demandCaptureAction } from '@/modules/demand/demand.actions'
import { readCustomerRecordAction, submitInquiryAction } from '@/modules/inquiries/inquiry.actions'
import {
  registryDetailAction,
  registryListAction,
  registrySearchAction,
  registryServicesDetailAction,
  registryServicesListAction,
  registryServicesSearchAction,
} from '@/modules/registry/registry.actions'
import {
  registryOperationsCompareAction,
  registryOperationsDetailAction,
  registryOperationsInspectPlanAction,
  registryOperationsSearchAction,
} from '@/modules/registry/operations.actions'
import { operationExecuteAction } from '@/modules/capability-execution/operation-execute-mcp.actions'
import {
  operationCancelAction,
  operationReconcileAction,
  operationStatusAction,
} from '@/modules/capability-execution/operation-recovery.actions'
import { operationInvokeAction } from '@/modules/capability-execution/operation-invoke.actions'
import { updateOwnerNotificationPreferencesAction } from '@/modules/settings/settings.actions'
import { storefrontEnrichDraftAction, storefrontImportDraftAction, webDiscoverAction } from '@/modules/storefront/storefront.actions'
import { studyInspectAction, studyStartAction } from '@/modules/study/study.actions'
import { workTreeCreateAction, workTreeInspectAction } from '@/modules/work-tree/work-tree.actions'
import { workTreeApplyAction, workTreeDecideAction } from '@/modules/work-tree/work-tree-agent.actions'
import {
  workTreeFinalizeRepeatUseAction,
  workTreeInspectRepeatUseAction,
  workTreeReconcileRepeatUseAction,
  workTreeReserveRepeatUseAction,
} from '@/modules/work-tree/work-tree-repeat.actions'
import { isQuarantineFamilyActionId } from '@/modules/product-frontier/quarantine-write-admission'

const registeredActions: readonly AnyAction[] = [
  collectSuppliedCandidateQuoteAction,
  customerRequestConfirmAction,
  customerRequestRunAction,
  customerRequestCancelAction,
  customerRequestReportProblemAction,
  customerRequestReplyProblemAction,
  customerRequestInspectEvidenceAction,
  customerRequestAllowRepeatPermissionAction,
  customerRequestUseRepeatPermissionAction,
  customerRequestInspectRepeatPermissionAction,
  customerRequestPlanPreviewAction,
  customerRequestListConnectedAssistantsAction,
  customerRequestWithdrawRepeatPermissionAction,
  submitInquiryAction,
  readCustomerRecordAction,
  registryListAction,
  registryServicesDetailAction,
  registryServicesListAction,
  registryServicesSearchAction,
  registrySearchAction,
  registryDetailAction,
  registryOperationsSearchAction,
  registryOperationsDetailAction,
  registryOperationsCompareAction,
  registryOperationsInspectPlanAction,
  operationExecuteAction,
  operationInvokeAction,
  operationStatusAction,
  operationCancelAction,
  operationReconcileAction,
  storefrontEnrichDraftAction,
  studyStartAction,
  studyInspectAction,

  webDiscoverAction,
  demandCaptureAction,
  workTreeCreateAction,
  workTreeInspectAction,
  workTreeApplyAction,
  workTreeDecideAction,
  workTreeReserveRepeatUseAction,
  workTreeFinalizeRepeatUseAction,
  workTreeReconcileRepeatUseAction,
  workTreeInspectRepeatUseAction,
  updateOwnerNotificationPreferencesAction,
  supplyPublishAction,
  supplyWithdrawAction,
  supplyEarningsAction,
]

assertUniqueActionIds(registeredActions)

const actions: readonly AnyAction[] = registeredActions.filter(
  (action) => !isQuarantineFamilyActionId(action.id),
)

export function listActions(): readonly AnyAction[] {
  return actions
}

export function findAction(id: string): AnyAction | undefined {
  return registeredActions.find((action) => action.id === id)
}

/** Actions exposed on the anonymous MCP host; the adapter enforces read-only admission. */
export function listMcpActions(): readonly AnyAction[] {
  return actions.filter((action) => action.surfaces.includes('mcp'))
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

const operationRouteContracts = [
  OPERATION_INVOKE_ROUTE_CONTRACT.invoke,
  OPERATION_INVOKE_ROUTE_CONTRACT.status,
  OPERATION_INVOKE_ROUTE_CONTRACT.cancel,
  OPERATION_INVOKE_ROUTE_CONTRACT.reconcile,
] as const

type OperationRouteContractEntry = (typeof operationRouteContracts)[number]

type PublicOperationRouteDescriptorBase = Pick<
  OperationRouteContractEntry,
  'actionId' | 'contractVersion' | 'method' | 'path' | 'routerPath' | 'requiredHeaders'
>

export type PublicOperationRouteDescriptor = PublicOperationRouteDescriptorBase & Readonly<{
  inputJsonSchema?: AgentToolDescriptor['inputJsonSchema']
  outputJsonSchema?: AgentToolDescriptor['outputJsonSchema']
  mcpToolName?: string
}>

export function listOperationRouteDescriptors(): readonly PublicOperationRouteDescriptor[] {
  return operationRouteContracts.map((route) => {
    const action = findAction(route.actionId)
    if (action === undefined) throw new Error(`Operation route action is not registered: ${route.actionId}`)
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
  resolveActionContract,
  type Action,
  type ActionAgentAccessPrincipal,
  type ActionAuthorityRequirement,
  type ActionConsequenceClass,
  type ActionContext,
  type ActionCredentialAdmission,
  type ActionInvocationContract,
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
  type ActionToolContract,
  type ActionToolDescriptorProjection,
  type ActionToolExecuteArgs,
  type ActionToolExecutionValidationMetadata,
  type ActionToolFunctionDescriptor,
  type ActionToolSchemaBundle,
  type ActionToolSchemaDiagnostic,
} from './tool-contract'
