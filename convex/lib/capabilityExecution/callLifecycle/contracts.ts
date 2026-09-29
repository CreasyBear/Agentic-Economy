import type { Doc } from '../../../_generated/dataModel'
import { paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'
import { vOnCompleteArgs } from '@convex-dev/workpool'
import { sourceWriteArgs } from '../../../lib/security/sourceWrite/contracts'
import { actionExecutionTransactArgs } from '../../../lib/actionExecution/control/contracts'
import {
  callAuthorityValue,
  callResultValue,
  sellerOnboardingCanaryExecutionEnvelopeValue,
  usageValue,
  statusResultValue,
} from '@/modules/capability-execution/convex'

export const environment = v.union(v.literal('sandbox'), v.literal('production'))
export const ownerCallContextValue = v.object({
  purpose: v.null(),
  agent: v.object({ principalRef: v.string(), applicationRef: v.string(), currentDisplayName: v.union(v.string(), v.null()) }),
  recordedTool: v.union(
    v.object({ kind: v.literal('available'), basis: v.literal('call_snapshot'), name: v.string(), providerRef: v.string(), providerName: v.null() }),
    v.object({ kind: v.literal('unavailable') }),
  ),
  reconciliation: v.object({ canSubmitEvidence: v.literal(true), permissionBasis: v.literal('account_owner'), requiresVerifiedEvidence: v.literal(true) }),
})
export const ownerCallStatusResultValue = v.union(
  statusResultValue.members[0].extend({ ownerContext: v.optional(v.union(ownerCallContextValue, v.null())) }),
  statusResultValue.members[1],
  statusResultValue.members[2],
)
export const authorityMode = v.union(
  v.literal('read_only'),
  v.literal('approval_required'),
  v.literal('spending_policy'),
  v.literal('unrestricted_test_only'),
)
export const principalValue = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
})
export const providerLeaseAuthorityValue = v.object({
  connectionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  approvalDecisionRef: v.string(),
  approvalDecisionDigest: v.string(),
})
export const currentProviderConnectionAuthorityValue = v.union(
  v.object({ kind: v.literal('credentialless_x402') }),
  v.object({ kind: v.literal('credentialed') }),
  v.null(),
)
export const dispatchState = v.union(
  v.literal('enqueued'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('reconciliation_required'),
)
export const dispatchResult = v.union(
  v.object({ kind: v.literal('enqueued'), workId: v.string() }),
  v.object({ kind: v.literal('replayed'), workId: v.string() }),
  v.object({ kind: v.literal('refused') }),
)
export const callDispatchMutationResult = v.union(
  v.object({
    kind: v.union(v.literal('applied'), v.literal('duplicate')),
    attemptRef: v.string(),
    effectGeneration: v.number(),
  }),
  v.object({ kind: v.literal('claimed') }),
  v.object({ kind: v.literal('cancelled'), workId: v.optional(v.string()) }),
  v.object({ kind: v.literal('reconciliation_required'), attemptRef: v.string(), effectGeneration: v.number() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)
export type CallDispatchMutationResult = Infer<typeof callDispatchMutationResult>
export const dispatchArgs = {
  callRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  toolRef: v.string(),
  authority: v.optional(callAuthorityValue),
  now: v.number(),
} as const
export const openDispatchValue = v.object({
  committedPaymentRequiredJson: v.optional(v.string()),
  sourceUsdcUnits: v.optional(v.string()),
  x402RequirementDigest: v.optional(v.string()),
  quoteRef: v.optional(v.string()),
  callRef: v.string(),
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  dispatchedCredentialId: v.optional(v.string()),
  applicationRef: v.string(),
  environment,
  state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
  toolRef: v.string(),
  sellerOnboardingCanary: v.optional(sellerOnboardingCanaryExecutionEnvelopeValue),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  requestDigest: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  policyDigest: v.string(),
  grantExpiresAt: v.number(),
  toolJson: v.string(),
  inputJson: v.string(),
  authority: v.optional(callAuthorityValue),
  workId: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  dispatchState: v.optional(dispatchState),
})
export const callDispatchProjectionValue = v.object({
  state: v.union(v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required')),
  result: v.optional(callResultValue),
  usage: v.optional(usageValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  dispatchState: v.union(v.literal('completed'), v.literal('failed'), v.literal('reconciliation_required')),
})
export const callDispatchMutationArgs = {
  dispatch: openDispatchValue,
  command: v.object(actionExecutionTransactArgs),
} as const
export const cancelBeforeClaimArgs = {
  callRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  idempotencyKey: v.string(),
} as const
export const finalizeDispatchArgs = {
  dispatch: openDispatchValue,
  command: v.object(actionExecutionTransactArgs),
  projection: callDispatchProjectionValue,
} as const
export type CallDispatchCommand = Infer<typeof callDispatchMutationArgs.command>
export type CallDispatchProjection = Infer<typeof callDispatchProjectionValue>
export type CallDispatchProjectionShape = CallDispatchProjection
export const recordArgs = {
  callRef: v.string(), principalId: v.string(), state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
  result: v.optional(callResultValue), usage: v.optional(usageValue), evidenceHash: v.optional(v.string()), attemptRef: v.optional(v.string()),
  dispatchState: v.optional(dispatchState), now: v.number(),
} as const
export const replayValue = v.object({
  toolRef: v.string(),
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  result: v.optional(callResultValue),
  usage: v.optional(usageValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
})
export const recoveryValue = v.object({
  quoteRef: v.optional(v.string()),
  callRef: v.string(),
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  toolRef: v.string(),
  sellerOnboardingCanary: v.optional(sellerOnboardingCanaryExecutionEnvelopeValue),
  inputDigest: v.string(),
  requestDigest: v.string(),
  grantGeneration: v.number(),
  grantRef: v.string(),
  toolJson: v.string(),
  inputJson: v.string(),
  result: v.optional(callResultValue),
  usage: v.optional(usageValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  updatedAt: v.number(),
})
export const projectRecoveryArgs = {
  callRef: v.string(),
  principalId: v.string(),
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  result: v.optional(callResultValue),
  attemptRef: v.optional(v.string()),
  dispatchState: v.optional(dispatchState),
  clearResult: v.boolean(),
  clearWorkId: v.boolean(),
  clearAttemptRef: v.boolean(),
  clearEvidenceHash: v.boolean(),
  clearDispatchState: v.boolean(),
  now: v.number(),
} as const
export const principalAndSourceArgs = {
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
  principal: principalValue,
} as const
export const callState = v.union(
  v.literal('pending'),
  v.literal('completed'),
  v.literal('refused'),
  v.literal('reconciliation_required'),
  v.literal('cancelled'),
)
export const callSummaryValue = v.object({
  callRef: v.string(),
  toolRef: v.string(),
  state: callState,
  resultKind: v.optional(v.union(
    v.literal('completed'),
    v.literal('pending'),
    v.literal('needs_authority'),
    v.literal('reconciliation_required'),
    v.literal('refused'),
  )),
  usage: v.optional(usageValue),
  receiptRef: v.optional(v.string()),
  evidenceHash: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const callSummaryPageValue = paginationResultValidator(callSummaryValue)
export const workCompletionArgs = vOnCompleteArgs(v.object({ callRef: v.string() }))

export type CallPrincipal = Infer<typeof principalValue>
export type CallRow = Doc<'capabilityCalls'>
export type GrantRow = Doc<'agentAccessGrants'>
export type CurrentAgentAuthority = Readonly<{
  principal: CallPrincipal
  grantRef: string
  grantGeneration: number
  policyDigest: string
  expiresAt: number
}>

export const reconciledCallAuthorityValue = v.object({
  principalId: v.string(),
  accountRef: v.string(),
  credentialId: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  policyDigest: v.string(),
  expiresAt: v.number(),
})
export type ReconciledCallAuthority = Infer<typeof reconciledCallAuthorityValue>
export const reconciledCallAuthorityResult = v.union(
  v.object({ kind: v.literal('authorized'), authority: reconciledCallAuthorityValue }),
  v.object({ kind: v.literal('refused') }),
)
export const recordResult = v.object({ kind: v.literal('recorded') })
