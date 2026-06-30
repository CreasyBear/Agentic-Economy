/**
 * Central action registry for AE.
 *
 * Imports every module's action consts into one array and exposes
 * `listActions` / `findAction` / `listAgentToolActions` over it. Registration is
 * explicit (not via module-eval side-effects) so the production bundler cannot
 * tree-shake it.
 *
 * To add a module: create `<module>/<module>.actions.ts` exporting its action
 * consts, then add the import and an entry in `actions` below.
 */

import type { AnyAction } from '@/modules/common/action'
import {
  closeOwnerInquiryAction,
  markOwnerInquiryReadAction,
  readOwnerInboxAction,
  readOwnerInquiryThreadAction,
  replyOwnerInquiryAction,
  submitInquiryAction,
} from '@/modules/inquiries/inquiry.actions'
import {
  registryDetailAction,
  registrySearchAction,
} from '@/modules/registry/registry.actions'

const actions: readonly AnyAction[] = [
  submitInquiryAction,
  registrySearchAction,
  registryDetailAction,
  readOwnerInboxAction,
  readOwnerInquiryThreadAction,
  replyOwnerInquiryAction,
  markOwnerInquiryReadAction,
  closeOwnerInquiryAction,
]

assertUniqueActionIds(actions)

export function listActions(): readonly AnyAction[] {
  return actions
}

export function listAgentToolActions(): readonly AnyAction[] {
  return actions.filter((action) => action.surfaces.includes('agentTools'))
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
