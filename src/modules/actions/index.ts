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

import type { AnyAction } from '@/modules/common/action'
import { collectSuppliedCandidateQuoteAction } from '@/modules/capability-supply/supplied-quote.actions'
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
import { sandboxCheckupQuoteAction } from '@/modules/sandbox-supply/sandbox-supply.actions'
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
import { updateOwnerNotificationPreferencesAction } from '@/modules/settings/settings.actions'
import { storefrontEnrichDraftAction, storefrontImportDraftAction, webDiscoverAction } from '@/modules/storefront/storefront.actions'
import { studyCompleteAction, studyInspectAction, studyStartAction } from '@/modules/study/study.actions'
import { workTreeCreateAction, workTreeInspectAction } from '@/modules/work-tree/work-tree.actions'
import { workTreeApplyAction, workTreeDecideAction } from '@/modules/work-tree/work-tree-agent.actions'
import {
  workTreeFinalizeRepeatUseAction,
  workTreeInspectRepeatUseAction,
  workTreeReconcileRepeatUseAction,
  workTreeReserveRepeatUseAction,
} from '@/modules/work-tree/work-tree-repeat.actions'

const actions: readonly AnyAction[] = [
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
  sandboxCheckupQuoteAction,
  storefrontImportDraftAction,
  storefrontEnrichDraftAction,
  studyStartAction,
  studyInspectAction,
  studyCompleteAction,
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
]

assertUniqueActionIds(actions)

export function listActions(): readonly AnyAction[] {
  return actions
}

export function findAction(id: string): AnyAction | undefined {
  return actions.find((action) => action.id === id)
}

/** Actions exposed on the anonymous MCP host; the adapter enforces read-only admission. */
export function listMcpActions(): readonly AnyAction[] {
  return actions.filter((action) => action.surfaces.includes('mcp'))
}

/** Deterministic MCP tool name: one derivation, never a hand-maintained map. */
export function mcpToolName(action: AnyAction): string {
  return `ae_${action.id.replace(/\./g, '_')}`
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
  type ActionAuthorityRequirement,
  type ActionConsequenceClass,
  type ActionContext,
  type ActionInvocationContract,
  type ActionParameter,
  type ActionRetryClass,
  type ActionSurface,
  type AgentToolDescriptor,
  type AnyAction,
} from '@/modules/common/action'
