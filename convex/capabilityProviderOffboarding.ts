import { WorkflowManager } from '@convex-dev/workflow'
import { v } from 'convex/values'

import { components } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'
import {
  completeCallDrainHandler,
  drainCallsPageHandler,
  settleObligationsHandler,
} from './lib/capabilitySupply/providerOffboarding/drainAndSettle'
import {
  completeFreezeHandler,
  freezeRouteabilityHandler,
  snapshotConnectionTargetsPageHandler,
  snapshotOfferingTargetsPageHandler,
  withdrawCatalogDocumentsPageHandler,
  withdrawToolTargetsPageHandler,
} from './lib/capabilitySupply/providerOffboarding/freezePages'
import {
  cancelCaseArgs,
  cancelCaseHandler,
  readAgentStatusArgs,
  readAgentStatusHandler,
  readStatusArgs,
  readStatusHandler,
  resumeCaseArgs,
  resumeCaseHandler,
  startCaseArgs,
  startCaseHandler,
} from './lib/capabilitySupply/providerOffboarding/ownerCommands'
import {
  completeConnectionRevocationHandler,
  revokeConnectionsPageHandler,
} from './lib/capabilitySupply/providerOffboarding/revokePages'
import { runProviderOffboardingWorkflow } from './lib/capabilitySupply/providerOffboarding/runWorkflow'
import { resultValue } from './lib/capabilitySupply/providerOffboarding/contracts'
import {
  retireOfferingTargetsPageHandler,
  verifyCallsPageHandler,
  verifyCompletionHandler,
} from './lib/capabilitySupply/providerOffboarding/verifyPages'

const manager = new WorkflowManager(components.workflow)

export const run = manager.define({
  args: { caseRef: v.string() },
  returns: v.string(),
}).handler(runProviderOffboardingWorkflow)

export const startCase = mutation({
  args: startCaseArgs,
  returns: resultValue,
  handler: startCaseHandler,
})

export const readStatus = query({
  args: readStatusArgs,
  returns: resultValue,
  handler: readStatusHandler,
})

export const readAgentStatus = query({
  args: readAgentStatusArgs,
  returns: resultValue,
  handler: readAgentStatusHandler,
})

export const resumeCase = mutation({
  args: resumeCaseArgs,
  returns: resultValue,
  handler: resumeCaseHandler,
})

export const cancelCase = mutation({
  args: cancelCaseArgs,
  returns: resultValue,
  handler: cancelCaseHandler,
})

export const freezeRouteability = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean(), cancelled: v.boolean() }),
  handler: freezeRouteabilityHandler,
})

export const withdrawCatalogDocumentsPage = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ done: v.boolean() }),
  handler: withdrawCatalogDocumentsPageHandler,
})

export const withdrawToolTargetsPage = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean(), done: v.boolean() }),
  handler: withdrawToolTargetsPageHandler,
})

export const snapshotOfferingTargetsPage = internalMutation({
  args: { caseRef: v.string(), afterOfferingRef: v.optional(v.string()) },
  returns: v.object({ done: v.boolean(), nextOfferingRef: v.optional(v.string()) }),
  handler: snapshotOfferingTargetsPageHandler,
})

export const snapshotConnectionTargetsPage = internalMutation({
  args: { caseRef: v.string(), afterConnectionRef: v.optional(v.string()) },
  returns: v.object({ done: v.boolean(), nextConnectionRef: v.optional(v.string()) }),
  handler: snapshotConnectionTargetsPageHandler,
})

export const completeFreeze = internalMutation({
  args: { caseRef: v.string() },
  returns: v.null(),
  handler: completeFreezeHandler,
})

export const drainCallsPage = internalMutation({
  args: { caseRef: v.string(), afterToolRef: v.optional(v.string()) },
  returns: v.object({ ready: v.boolean(), done: v.boolean(), nextToolRef: v.optional(v.string()) }),
  handler: drainCallsPageHandler,
})

export const completeCallDrain = internalMutation({
  args: { caseRef: v.string() },
  returns: v.null(),
  handler: completeCallDrainHandler,
})

export const settleObligations = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean() }),
  handler: settleObligationsHandler,
})

export const revokeConnectionsPage = internalMutation({
  args: { caseRef: v.string(), afterConnectionRef: v.optional(v.string()) },
  returns: v.object({ ready: v.boolean(), done: v.boolean(), nextConnectionRef: v.optional(v.string()) }),
  handler: revokeConnectionsPageHandler,
})

export const completeConnectionRevocation = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean() }),
  handler: completeConnectionRevocationHandler,
})

export const verifyCallsPage = internalMutation({
  args: { caseRef: v.string(), afterToolRef: v.optional(v.string()) },
  returns: v.object({ ready: v.boolean(), done: v.boolean(), nextToolRef: v.optional(v.string()) }),
  handler: verifyCallsPageHandler,
})

export const retireOfferingTargetsPage = internalMutation({
  args: { caseRef: v.string(), afterOfferingRef: v.optional(v.string()) },
  returns: v.object({ ready: v.boolean(), done: v.boolean(), nextOfferingRef: v.optional(v.string()) }),
  handler: retireOfferingTargetsPageHandler,
})

export const verifyCompletion = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean() }),
  handler: verifyCompletionHandler,
})
