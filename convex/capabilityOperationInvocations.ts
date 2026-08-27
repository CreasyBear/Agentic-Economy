import { v } from 'convex/values'
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
  invokeArgs,
  openDispatchValue,
  operationDispatchMutationArgs,
  operationDispatchMutationResult,
  pendingApprovalView,
  principalAndSourceArgs,
  principalValue,
  projectRecoveryArgs,
  providerLeaseAuthorityValue,
  reconciledInvocationAuthorityResult,
  recordArgs,
  recoveryValue,
  replayValue,
  reserveArgs,
  reserveResult,
  workCompletionArgs,
} from './lib/operationInvocations/contracts'
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
} from './lib/operationInvocations/reconciliation'
import {
  canonicalAgentCancelHandler,
  canonicalAgentInvokeHandler,
  canonicalAgentReconcileHandler,
  canonicalAgentStatusHandler,
  canonicalOwnerApprovalDecisionHandler,
  canonicalOwnerApprovalListHandler,
  canonicalOwnerCancelHandler,
  canonicalOwnerReconcileHandler,
  canonicalOwnerStatusHandler,
  reconcileInvocationWorkloadAuthorityHandler,
  resolveInvocationAgentAuthorityHandler,
} from './lib/operationInvocations/authorityHandlers'
import {
  abandonHandler,
  admitHandler,
  reserveHandler,
} from './lib/operationInvocations/admission'
import {
  dispatchHandler,
  openDispatchHandler,
} from './lib/operationInvocations/dispatch'
import {
  readOwnerRecoveryHandler,
  readProviderLeaseAuthorityHandler,
  readRecoveryHandler,
  readReplayHandler,
} from './lib/operationInvocations/invokeActions'
import {
  jsonObject,
  operationResultValue,
  reconciliationEvidenceValue,
  recoveryResultValue,
  statusResultValue,
} from '@/modules/capability-execution/convex'
export const resolveInvocationAgentAuthority = internalMutation({
  args: {
    principal: principalValue,
    operationRef: v.optional(v.string()),
    invocationRef: v.optional(v.string()),
  },
  returns: v.union(principalValue, v.null()),
  handler: resolveInvocationAgentAuthorityHandler,
})

export const reconcileInvocationWorkloadAuthority = internalMutation({
  args: { invocationRef: v.string() },
  returns: reconciledInvocationAuthorityResult,
  handler: reconcileInvocationWorkloadAuthorityHandler,
})

export const admit = internalMutation({
  args: { ...principalAndSourceArgs, operationRef: v.string(), input: jsonObject, idempotencyKey: v.string() },
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
  args: operationDispatchMutationArgs,
  returns: operationDispatchMutationResult,
  handler: claimDispatchWithReconciliationInitialization,
})

export const finalizeDispatch = internalMutation({
  args: finalizeDispatchArgs,
  returns: operationDispatchMutationResult,
  handler: finalizeDispatchWithReconciliationInitialization,
})

export const cancelBeforeClaim = internalMutation({
  args: cancelBeforeClaimArgs,
  returns: operationDispatchMutationResult,
  handler: cancelBeforeClaimWithReconciliationInitialization,
})

export const listPendingOperationApprovals = query({
  args: {},
  returns: v.array(pendingApprovalView),
  handler: canonicalOwnerApprovalListHandler,
})

export const decideOperationApproval = mutation({
  args: { invocationRef: v.string(), decision: approvalDecision },
  returns: approvalDecisionResult,
  handler: canonicalOwnerApprovalDecisionHandler,
})

export const openDispatch = internalQuery({
  args: { invocationRef: v.string() },
  returns: v.union(openDispatchValue, v.null()),
  handler: openDispatchHandler,
})

export const readReplay = internalQuery({
  args: { invocationRef: v.string(), principalId: v.string(), credentialId: v.string() },
  returns: v.union(replayValue, v.null()),
  handler: readReplayHandler,
})

export const readRecovery = internalQuery({
  args: { invocationRef: v.string(), principalId: v.string(), credentialId: v.string() },
  returns: v.union(recoveryValue, v.null()),
  handler: readRecoveryHandler,
})

export const readOwnerRecovery = internalQuery({
  args: { invocationRef: v.string() },
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
  args: { invocationRef: v.string(), leaseOwner: v.string(), now: v.number() },
  returns: reconciliationClaimResult,
  handler: claimAutomaticReconciliationCandidateHandler,
})

export const finishAutomaticReconciliation = internalMutation({
  args: {
    invocationRef: v.string(),
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

export const completeWork = internalMutation({
  args: workCompletionArgs,
  returns: v.null(),
  handler: completeWorkWithReconciliationInitialization,
})

export const invoke = action({
  args: invokeArgs,
  returns: operationResultValue,
  handler: canonicalAgentInvokeHandler,
})

export const readInvocationStatus = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string() },
  returns: statusResultValue,
  handler: canonicalAgentStatusHandler,
})

export const cancelInvocation = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: canonicalAgentCancelHandler,
})

export const reconcileInvocation = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string(), idempotencyKey: v.string(), evidence: reconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: canonicalAgentReconcileHandler,
})

export const readOwnerInvocationStatus = action({
  args: { invocationRef: v.string() },
  returns: statusResultValue,
  handler: canonicalOwnerStatusHandler,
})

export const cancelOwnerInvocation = action({
  args: { invocationRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: canonicalOwnerCancelHandler,
})

export const reconcileOwnerInvocation = action({
  args: { invocationRef: v.string(), idempotencyKey: v.string(), evidence: reconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: canonicalOwnerReconcileHandler,
})
