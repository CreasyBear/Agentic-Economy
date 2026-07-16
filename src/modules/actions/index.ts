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
import { demandCaptureAction } from '@/modules/demand/demand.actions'
import { readCustomerRecordAction, submitInquiryAction } from '@/modules/inquiries/inquiry.actions'
import {
  registryDetailAction,
  registryListAction,
  registrySearchAction,
} from '@/modules/registry/registry.actions'
import { updateOwnerNotificationPreferencesAction } from '@/modules/settings/settings.actions'
import { storefrontImportDraftAction } from '@/modules/storefront/storefront.actions'

const actions: readonly AnyAction[] = [
  customerRequestConfirmAction,
  customerRequestRunAction,
  customerRequestCancelAction,
  customerRequestReportProblemAction,
  customerRequestReplyProblemAction,
  customerRequestInspectEvidenceAction,
  customerRequestAllowRepeatPermissionAction,
  customerRequestUseRepeatPermissionAction,
  customerRequestInspectRepeatPermissionAction,
  customerRequestListConnectedAssistantsAction,
  customerRequestWithdrawRepeatPermissionAction,
  submitInquiryAction,
  readCustomerRecordAction,
  registryListAction,
  registrySearchAction,
  registryDetailAction,
  storefrontImportDraftAction,
  demandCaptureAction,
  updateOwnerNotificationPreferencesAction,
]

assertUniqueActionIds(actions)

export function listActions(): readonly AnyAction[] {
  return actions
}

export function findAction(id: string): AnyAction | undefined {
  return actions.find((action) => action.id === id)
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
  type Action,
  type ActionContext,
  type ActionParameter,
  type ActionSurface,
  type AgentToolDescriptor,
  type AnyAction,
} from '@/modules/common/action'
