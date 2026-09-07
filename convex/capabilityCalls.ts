import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import {
  approvalDecision,
  approvalDecisionResult,
  abandonArgs,
  abandonResult,
  cancelBeforeClaimArgs,
  dispatchArgs,
  dispatchResult,
  finalizeDispatchArgs,
  callArgs,
  openDispatchValue,
  callDispatchMutationArgs,
  callDispatchMutationResult,
  pendingApprovalView,
  callState,
  callSummaryPageValue,
  principalAndSourceArgs,
  principalValue,
  currentProviderConnectionAuthorityValue,
  projectRecoveryArgs,
  providerLeaseAuthorityValue,
  reconciledCallAuthorityResult,
  recordArgs,
  recoveryValue,
  replayValue,
  reserveArgs,
  reserveResult,
  workCompletionArgs,
} from './lib/callLifecycle/contracts'
import {
  reconciliationCandidateValue,
  reconciliationClaimResult,
  reconciliationFinishOutcome,
  reconciliationFinishResult,
  reconciliationReason,
  claimAutomaticReconciliationCandidateHandler,
  claimDispatchWithReconciliationInitialization,
  completeWorkWithReconciliationInitialization,
  finishAutomaticReconciliationHandler,
  finalizeDispatchWithReconciliationInitialization,
  cancelBeforeClaimWithReconciliationInitialization,
  listDueAutomaticReconciliationCandidatesHandler,
  projectRecoveryWithReconciliationInitialization,
  recordWithReconciliationInitialization,
} from './lib/callLifecycle/reconciliation'
import {
  canonicalAgentCancelHandler,
  canonicalAgentCallHandler,
  canonicalAgentListHandler,
  canonicalAgentReconcileHandler,
  canonicalAgentStatusHandler,
  canonicalOwnerApprovalDecisionHandler,
  canonicalOwnerApprovalListHandler,
  canonicalOwnerCancelHandler,
  canonicalOwnerReconcileHandler,
  canonicalOwnerStatusHandler,
  reconcileCallWorkloadAuthorityHandler,
  resolveCallAgentAuthorityHandler,
} from './lib/callLifecycle/authorityHandlers'
import {
  abandonHandler,
  admitHandler,
  reserveHandler,
} from './lib/callLifecycle/admission'
import {
  dispatchHandler,
  openDispatchHandler,
} from './lib/callLifecycle/dispatch'
import {
  readOwnerRecoveryHandler,
  listAgentCallSummariesHandler,
  readCurrentProviderConnectionAuthorityHandler,
  readProviderLeaseAuthorityHandler,
  readRecoveryHandler,
  readReplayHandler,
} from './lib/callLifecycle/callActions'
import {
  jsonObject,
  callResultValue,
  reconciliationEvidenceValue,
  recoveryResultValue,
  statusResultValue,
  x402PaymentReconciliationEvidenceValue,
} from '@/modules/capability-execution/convex'

const callReconciliationEvidenceValue = v.union(
  reconciliationEvidenceValue,
  x402PaymentReconciliationEvidenceValue,
)
export const resolveCallAgentAuthority = internalMutation({
  args: {
    principal: principalValue,
    toolRef: v.optional(v.string()),
    callRef: v.optional(v.string()),
    receiptList: v.optional(v.literal(true)),
  },
  returns: v.union(principalValue, v.null()),
  handler: resolveCallAgentAuthorityHandler,
})

export const reconcileCallWorkloadAuthority = internalMutation({
  args: { callRef: v.string() },
  returns: reconciledCallAuthorityResult,
  handler: reconcileCallWorkloadAuthorityHandler,
})

export const admit = internalMutation({
  args: { ...principalAndSourceArgs, toolRef: v.string(), input: jsonObject, idempotencyKey: v.string() },
  returns: v.object({ kind: v.literal('accepted') }),
  handler: admitHandler,
})

export const reserve = internalMutation({
  args: reserveArgs,
  returns: reserveResult,
  handler: reserveHandler,
})

export const abandon = internalMutation({
  args: abandonArgs,
  returns: abandonResult,
  handler: abandonHandler,
})

export const dispatch = internalMutation({
  args: dispatchArgs,
  returns: dispatchResult,
  handler: dispatchHandler,
})

export const claimDispatch = internalMutation({
  args: callDispatchMutationArgs,
  returns: callDispatchMutationResult,
  handler: claimDispatchWithReconciliationInitialization,
})

export const finalizeDispatch = internalMutation({
  args: finalizeDispatchArgs,
  returns: callDispatchMutationResult,
  handler: finalizeDispatchWithReconciliationInitialization,
})

export const cancelBeforeClaim = internalMutation({
  args: cancelBeforeClaimArgs,
  returns: callDispatchMutationResult,
  handler: cancelBeforeClaimWithReconciliationInitialization,
})

export const listPendingCallApprovals = query({
  args: {},
  returns: v.array(pendingApprovalView),
  handler: canonicalOwnerApprovalListHandler,
})

export const decideCallApproval = mutation({
  args: { callRef: v.string(), decision: approvalDecision },
  returns: approvalDecisionResult,
  handler: canonicalOwnerApprovalDecisionHandler,
})

export const openDispatch = internalQuery({
  args: { callRef: v.string() },
  returns: v.union(openDispatchValue, v.null()),
  handler: openDispatchHandler,
})

export const readReplay = internalQuery({
  args: { callRef: v.string(), principalId: v.string(), credentialId: v.string() },
  returns: v.union(replayValue, v.null()),
  handler: readReplayHandler,
})

export const readRecovery = internalQuery({
  args: { callRef: v.string(), principalId: v.string(), credentialId: v.string() },
  returns: v.union(recoveryValue, v.null()),
  handler: readRecoveryHandler,
})

export const readOwnerRecovery = internalQuery({
  args: { callRef: v.string() },
  returns: v.union(recoveryValue, v.null()),
  handler: readOwnerRecoveryHandler,
})

export const record = internalMutation({
  args: recordArgs,
  returns: v.object({ kind: v.literal('recorded') }),
  handler: recordWithReconciliationInitialization,
})

export const projectRecovery = internalMutation({
  args: projectRecoveryArgs,
  returns: v.object({ kind: v.literal('recorded') }),
  handler: projectRecoveryWithReconciliationInitialization,
})

export const listDueAutomaticReconciliationCandidates = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(reconciliationCandidateValue),
  handler: listDueAutomaticReconciliationCandidatesHandler,
})

export const claimAutomaticReconciliationCandidate = internalMutation({
  args: { callRef: v.string(), leaseOwner: v.string(), now: v.number() },
  returns: reconciliationClaimResult,
  handler: claimAutomaticReconciliationCandidateHandler,
})

export const finishAutomaticReconciliation = internalMutation({
  args: {
    callRef: v.string(),
    leaseOwner: v.string(),
    now: v.number(),
    outcome: reconciliationFinishOutcome,
    reason: v.optional(reconciliationReason),
  },
  returns: reconciliationFinishResult,
  handler: finishAutomaticReconciliationHandler,
})

export const readProviderLeaseAuthority = internalQuery({
  args: { connectionRef: v.string(), authorityGeneration: v.number() },
  returns: v.union(providerLeaseAuthorityValue, v.null()),
  handler: readProviderLeaseAuthorityHandler,
})

export const readCurrentProviderConnectionAuthority = internalQuery({
  args: {
    connectionRef: v.string(),
    providerRef: v.string(),
    adapterId: v.string(),
    authorityGeneration: v.number(),
    authorityDigest: v.string(),
    resourceUrl: v.string(),
    now: v.number(),
  },
  returns: currentProviderConnectionAuthorityValue,
  handler: readCurrentProviderConnectionAuthorityHandler,
})

export const completeWork = internalMutation({
  args: workCompletionArgs,
  returns: v.null(),
  handler: completeWorkWithReconciliationInitialization,
})

export const call = action({
  args: callArgs,
  returns: callResultValue,
  handler: canonicalAgentCallHandler,
})

export const readCallStatus = action({
  args: { ...principalAndSourceArgs, callRef: v.string(), afterVersion: v.optional(v.number()) },
  returns: statusResultValue,
  handler: canonicalAgentStatusHandler,
})

export const listAgentCallSummaries = internalQuery({
  args: {
    principalId: v.string(),
    credentialId: v.string(),
    applicationRef: v.string(),
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    state: v.optional(callState),
    paginationOpts: paginationOptsValidator,
  },
  returns: callSummaryPageValue,
  handler: listAgentCallSummariesHandler,
})

export const listCalls = action({
  args: {
    ...principalAndSourceArgs,
    state: v.optional(callState),
    paginationOpts: paginationOptsValidator,
  },
  returns: callSummaryPageValue,
  handler: canonicalAgentListHandler,
})

export const cancelCall = action({
  args: { ...principalAndSourceArgs, callRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: canonicalAgentCancelHandler,
})

export const reconcileCall = action({
  args: { ...principalAndSourceArgs, callRef: v.string(), idempotencyKey: v.string(), evidence: callReconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: canonicalAgentReconcileHandler,
})

export const readOwnerCallStatus = action({
  args: { callRef: v.string() },
  returns: statusResultValue,
  handler: canonicalOwnerStatusHandler,
})

export const cancelOwnerCall = action({
  args: { callRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: canonicalOwnerCancelHandler,
})

export const reconcileOwnerCall = action({
  args: { callRef: v.string(), idempotencyKey: v.string(), evidence: callReconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: canonicalOwnerReconcileHandler,
})
