"use node";

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'

import type { StableHashValue } from '@/modules/common/stable-hash'
import { Agent, fetch as guardedFetch } from 'undici'
import { v, type Infer } from 'convex/values'
import type { OperationDispatchCommand, OperationDispatchProjection } from './capabilityOperationInvocations'

import {
  buildCanonicalClaimCommand,
  buildCanonicalTerminalOutcomeCommand,
  createDurableActionInvocationTracer,
  persistCanonicalReleaseFence,
  readPublicInvocationStatus,
  cancelPublicInvocation,
  reconcilePublicInvocation,
  type CanonicalClaimInput,
  type CanonicalClaimSnapshot,
  type CanonicalTerminalOutcome,
  type DurableActionInvocationPort,
  type PublicInvocationStatus,
  type ReconciliationEvidence,
} from '@/modules/action-invocation'
import {
  buildDynamicPublishedInput,
  createDynamicPublishedAction,
  type DynamicPublishedInvocationInput,
  type DynamicPublishedInvocationResult,
} from '@/modules/action-invocation/dynamic-published-contract'
import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type ProviderConnectionAuthorityReader,
  type ProviderConnectionAuthorityValidator,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type RouteTransportObservation,
  type RouteTransportRuntime,
  type X402PaymentSignatureRequest,
  type X402PreparedAuthorization,
  type X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import {
  chargeSettlementOutcome,
  paymentLaneAdmission,
  paymentObservationDigest,
  readGuardedX402EvmReceipt,
  readX402PaymentPayer,
  transportObservationDigest,
  verifyExactEvmX402Settlement,
  x402ActionEffectStatus,
  x402SettlementStatusForObservation,
  type EconomicRail,
} from '@/modules/capability-supply/server'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  exactAmountSchema,
  pricingConfigDigest,
  type ExactAmount,
  type MoneyAcceptedInvocationCharge,
} from '@/modules/money/public'
import type {
  ExternalSpendIdentity,
  ExternalSpendSettlementStatus,
} from '@/modules/money/public'
import {
  materializeRuntimePublishedOperation,
  parsePublishedOperationSnapshot,
  publishedOperationMaterialMatches,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import {
  operationResultValue,
  reconciliationEvidenceValue,
  recoveryResultValue,
  usageValue,
  type OperationInvokePersistedAuthority,
} from '@/modules/capability-execution/convex'
import {
  isPrincipalEnvironmentCompatibleWithOperation,
  operationEnvironmentMismatchNextAction,
} from '@/modules/capability-execution/operation-invoke'
import {
  x402PaymentReconciliationEvidenceValue,
} from '@/modules/customer-request/convex'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import {
  createEvmX402PaymentSignature,
  credentialFromEnvironment,
  signRouteTransportCall,
  x402PaymentCredentialRefFromEnvironment,
} from '@/modules/capability-supply/server'
import { internalAction, type ActionCtx, env } from './_generated/server'
import { internal } from './_generated/api'

import type { WorkId } from '@convex-dev/workpool'
import { customerRequestRouteWorkpool } from './customerRequestRouteWorkpool'
const workerResult = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('none') }),
)
type WorkerResult = Infer<typeof workerResult>
type WorkerRecoveryResult = Infer<typeof recoveryResultValue>

type OpenDispatch = Readonly<{
  invocationRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  operationRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  grantRef: string
  operationJson: string
  inputJson: string
  workId?: string
  attemptRef?: string
  dispatchState?: 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'
  authority?: OperationInvokePersistedAuthority
}>
function configuredX402RpcUrl(network: string): URL | undefined {
  const raw = env.AE_X402_RPC_URLS_JSON?.trim()
  if (raw === undefined || raw.length === 0 || raw.length > 16_384) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || typeof parsed[network] !== 'string') return undefined
    const url = new URL(parsed[network])
    return url.protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

async function readX402EvmReceipt(
  network: string,
  transactionHash: string,
  dispatcher: Agent,
): ReturnType<typeof readGuardedX402EvmReceipt> {
  const target = configuredX402RpcUrl(network)
  return target === undefined
    ? Promise.resolve(undefined)
    : readGuardedX402EvmReceipt({
        target,
        network,
        transactionHash,
        dispatcher,
      })
}
type OperationInvocationAttemptIdentityInput = Readonly<{
  invocationRef: string
  principalId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  operationRef: string
  idempotencyKey: string
  inputDigest: string
  attemptRef: string
  effectGeneration: number
}>

export function operationInvocationAttemptIdentityMaterial(
  input: OperationInvocationAttemptIdentityInput,
): StableHashValue {
  return {
    format: 'operation-invocation-attempt:v1',
    invocationRef: input.invocationRef,
    principalId: input.principalId,
    credentialId: input.credentialId,
    applicationRef: input.applicationRef,
    environment: input.environment,
    operationRef: input.operationRef,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    attemptRef: input.attemptRef,
    effectGeneration: input.effectGeneration,
  }
}

export function operationInvocationAttemptIdentityDigest(
  input: OperationInvocationAttemptIdentityInput,
): string {
  return canonicalDigest(operationInvocationAttemptIdentityMaterial(input))
}
type ContractOutputValidation =
  | Readonly<{ valid: false }>
  | Readonly<{ valid: true; output: StableHashValue }>
type ChargeSettlementResult =
  | Readonly<{ kind: 'settled'; outcome: 'not_released' | 'released' }>
  | Readonly<{ kind: 'reconciliation_required' }>
type ExternalSpendSettlement =
  | Readonly<{ kind: 'settled'; settlementStatus: 'settled' | 'not_settled' }>
  | Readonly<{ kind: 'reconciliation_required' }>
type WorkerAcceptedCharge = Omit<MoneyAcceptedInvocationCharge, 'transactionRef' | 'providerNet' | 'rake'> & Readonly<{
  transactionRef?: string | undefined
  providerNet?: ExactAmount | undefined
  rake?: ExactAmount | undefined
}>

export function x402ExternalSpendIdentity(input: Readonly<{
  dispatch: Pick<OpenDispatch, 'invocationRef' | 'principalId' | 'credentialId' | 'grantRef' | 'grantGeneration' | 'environment' | 'operationRef'>
  attemptRef: string
  effectGeneration: number
  providerRef: string
  paymentIdentifier: string
  challengeDigest: string
  selectedRequirementJson: string
  amount: ExactAmount
}>): ExternalSpendIdentity {
  const idempotencyDigest = canonicalDigest({
    format: 'ae.x402.external-spend-identity:v1',
    invocationRef: input.dispatch.invocationRef,
    principalId: input.dispatch.principalId,
    credentialId: input.dispatch.credentialId,
    grantRef: input.dispatch.grantRef,
    grantGeneration: input.dispatch.grantGeneration,
    environment: input.dispatch.environment,
    attemptRef: input.attemptRef,
    effectGeneration: input.effectGeneration,
    operationRef: input.dispatch.operationRef,
    providerRef: input.providerRef,
    paymentIdentifier: input.paymentIdentifier,
    challengeDigest: input.challengeDigest,
    selectedRequirementJson: input.selectedRequirementJson,
    amount: input.amount,
  } as StableHashValue)
  return {
    reservationRef: `external-spend:${idempotencyDigest}`,
    principalId: input.dispatch.principalId,
    credentialId: input.dispatch.credentialId,
    grantRef: input.dispatch.grantRef,
    grantGeneration: input.dispatch.grantGeneration,
    environment: input.dispatch.environment,
    invocationRef: input.dispatch.invocationRef,
    attemptRef: input.attemptRef,
    effectGeneration: input.effectGeneration,
    operationRef: input.dispatch.operationRef,
    providerRef: input.providerRef,
    paymentIdentifier: input.paymentIdentifier,
    challengeDigest: input.challengeDigest,
    idempotencyDigest,
    amount: input.amount,
  }
}

const recoveryArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  mode: v.union(v.literal('status'), v.literal('cancel'), v.literal('reconcile')),
  idempotencyKey: v.optional(v.string()),
  evidence: v.optional(v.union(reconciliationEvidenceValue, x402PaymentReconciliationEvidenceValue)),
} as const


type CanonicalPort = Pick<
  DurableActionInvocationPort<DynamicPublishedInvocationResult>,
  'transact' | 'readControl' | 'readAttempt' | 'readAttempts' | 'readHistory' | 'readHistoryCommand' | 'recordLateObservation'
>
type ProviderRouteBinding = Extract<
  RouteTransportInvocation['binding'],
  { readonly authority: { readonly kind: 'provider_connection' } }
>
type KeylessRouteBinding = Extract<
  RouteTransportInvocation['binding'],
  { readonly authority: { readonly kind: 'keyless' } }
>

type ProviderRouteInvocation = Extract<
  RouteTransportInvocation,
  { readonly binding: ProviderRouteBinding }
>
type KeylessRouteInvocation = Extract<
  RouteTransportInvocation,
  { readonly binding: KeylessRouteBinding }
>

export const run = internalAction({
  args: { invocationRef: v.string() },
  returns: workerResult,
  handler: async (ctx, args): Promise<WorkerResult> => {
    const opened = await ctx.runQuery(internal.capabilityOperationInvocations.openDispatch, args)
    if (opened === null) return { kind: 'none' }
    const dispatch = opened as OpenDispatch
    const port = canonicalPort(ctx)
    const initialControl = await port.readControl(dispatch.invocationRef)
    const initialAttempt = initialControl?.currentAttemptRef === undefined
      ? undefined
      : await port.readAttempt(dispatch.invocationRef, initialControl.currentAttemptRef)
    const initialSnapshot = initialControl === undefined || initialAttempt === undefined
      ? undefined
      : { control: initialControl, attempt: initialAttempt }
    if (dispatch.state === 'cancelled') return { kind: 'none' }
    if (dispatch.dispatchState === 'completed' || dispatch.dispatchState === 'reconciliation_required') {
      return { kind: 'none' }
    }
    const initialCanonicalControl = initialControl?.control?.control
    const initialCanonicalState = initialCanonicalControl?.state
    if (initialCanonicalState === 'terminal' || initialCanonicalState === 'reconciliation_required') {
      if (dispatch.state === 'pending') {
        await projectReconciliationRequired(
          ctx,
          dispatch,
          initialControl?.currentAttemptRef ?? dispatch.attemptRef ?? `operation-attempt:${dispatch.invocationRef}:1`,
          new Date().toISOString(),
          initialControl?.currentEffectGeneration ?? 1,
        )
      }
      return { kind: 'none' }
    }
    if (
      initialSnapshot !== undefined
      && initialCanonicalControl !== undefined
      && initialCanonicalControl.state === 'leased'
      && initialCanonicalControl.release === 'possibly_released'
    ) {
      return await convergeReleaseFenceBeforeGates(ctx, dispatch, initialSnapshot)
    }

    const principalRow = await ctx.runQuery(internal.agentAccessPrincipals.getAgentPrincipal, {
      principalId: dispatch.principalId,
    })
    if (
      principalRow === null
      || principalRow.principalId !== dispatch.principalId
      || principalRow.ownerId !== dispatch.ownerId
      || principalRow.credentialId !== dispatch.credentialId
      || principalRow.applicationRef !== dispatch.applicationRef
      || principalRow.environment !== dispatch.environment
      || principalRow.lifecycle !== 'active'
      || principalRow.grantGeneration !== dispatch.grantGeneration
    ) {
      return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'Refresh the agent grant and retry.')
    }
    const principal: AgentAccessPrincipal = {
      principalId: principalRow.principalId,
      ownerId: principalRow.ownerId,
      credentialId: principalRow.credentialId,
      applicationRef: principalRow.applicationRef,
      environment: principalRow.environment,
      scopes: principalRow.scopes,
      authorityMode: principalRow.authorityMode,
    }
    const grant = await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
      credentialId: principal.credentialId,
      environment: principal.environment,
      principalId: principal.principalId,
      applicationRef: principal.applicationRef,
      generation: dispatch.grantGeneration,
      now: Date.now(),
    })
    if (grant === null) return await refuseBeforeClaim(ctx, dispatch, 'grant_not_found', false, 'Refresh the agent grant and retry.')
    const actor = { callerRef: principal.credentialId, principalRef: principal.principalId }
    const initialAttemptRef = `operation-attempt:${dispatch.invocationRef}:1`
    const leaseOwner = `operation-worker:${dispatch.invocationRef}`


    const currentSnapshot = await ctx.runQuery(internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot, {
      operationRef: dispatch.operationRef,
    })
    if (currentSnapshot === null) {
      return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The operation publication changed; retry discovery.')
    }
    const reservedOperation = parsePublishedOperationSnapshot(dispatch.operationJson)
    const currentOperation = parsePublishedOperationSnapshot(currentSnapshot.operationJson)
    if (reservedOperation === undefined || currentOperation === undefined) {
      return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'The admitted operation snapshot is invalid.')
    }
    if (!publishedOperationMaterialMatches(reservedOperation, currentOperation)) {
      return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The operation publication changed; retry discovery.')
    }
    const operation = currentOperation
    let descriptor: RuntimePublishedOperationDescriptor
    let input: Record<string, unknown>
    try {
      descriptor = materializeRuntimePublishedOperation(operation)
      const parsedInput: unknown = JSON.parse(dispatch.inputJson)
      if (!isBoundedJsonValue(parsedInput) || !isRecord(parsedInput)) throw new Error('input_invalid')
      input = parsedInput
    } catch {
      return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'The admitted operation snapshot is invalid.')
    }
    if (!isPrincipalEnvironmentCompatibleWithOperation(principal.environment, operation)) {
      return await refuseBeforeClaim(
        ctx,
        dispatch,
        'environment_mismatch',
        false,
        operationEnvironmentMismatchNextAction,
      )
    }
    if (!descriptor.validateInput(input)) return await refuseBeforeClaim(ctx, dispatch, 'input_invalid', false)
    const isX402 = operation.identity.adapterId === 'x402-fetch:v2'
    const economicRail: EconomicRail = isX402 ? 'provider_direct_x402' : 'ae_internal'
    const laneAdmission = paymentLaneAdmission({ rail: economicRail, environment: dispatch.environment })
    if (laneAdmission.kind === 'refused') {
      return await refuseBeforeClaim(ctx, dispatch, laneAdmission.code, false, 'This operation settles provider-direct; invoke a brokered operation instead.')
    }
    if (isX402 && operation.binding.authority.kind !== 'provider_connection') {
      return await refuseBeforeClaim(ctx, dispatch, 'provider_refused', false, 'x402 payment requires provider connection custody.')
    }
    if (descriptor.price.kind !== 'fixed' || operation.readiness.validUntil <= Date.now()) {
      return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'Only admitted fixed-price operations with current readiness are executable on this worker.')
    }

    const authoritySnapshot = operation.connectionAuthority ?? operation.identity.connectionAuthority
    const connectionAuthority = operation.binding.authority.kind === 'provider_connection'
      ? authoritySnapshot
      : undefined
    if (operation.binding.authority.kind === 'provider_connection') {
      if (
        connectionAuthority === undefined
        || connectionAuthority.connectionRef !== operation.binding.authority.connectionRef
        || connectionAuthority.providerRef !== operation.binding.authority.providerRef
        || connectionAuthority.adapterId !== operation.binding.adapter.adapterId
      ) return await refuseBeforeClaim(ctx, dispatch, 'provider_refused', false, 'Provider connection authority is stale.')
      const approval = await ctx.runQuery(internal.capabilityOperationInvocations.readProviderLeaseAuthority, {
        connectionRef: connectionAuthority.connectionRef,
        authorityGeneration: connectionAuthority.authorityGeneration,
      })
      if (
        approval === null
        || approval.providerRef !== connectionAuthority.providerRef
        || approval.adapterId !== connectionAuthority.adapterId
        || approval.authorityDigest !== connectionAuthority.authorityDigest
      ) return await refuseBeforeClaim(ctx, dispatch, 'provider_refused', false, 'Provider approval is not current.')
    }
    const authorityMaximumSpend = validateOperationInvokeAuthority({
      authority: dispatch.authority,
      dispatch,
      grant,
      principal,
      operation,
      descriptor,
      now: Date.now(),
    })
    if (authorityMaximumSpend === undefined) {
      return await refuseBeforeClaim(ctx, dispatch, 'authority_required', false, 'The accepted authority is missing, expired, or stale.')
    }
    const persistedAuthority = dispatch.authority
    if (persistedAuthority === undefined) {
      return await refuseBeforeClaim(ctx, dispatch, 'authority_required', false, 'The accepted authority is missing, expired, or stale.')
    }
    if (dispatch.grantRef === undefined || dispatch.grantRef !== persistedAuthority.grantRef) {
      return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'The persisted grant identity is missing or stale.')
    }
    const authorityBasis = persistedAuthority.acceptedBasis
    const authorityExpiresAt = persistedAuthority.expiresAt
    const existingControl = initialControl
    const existingAttempt = initialAttempt
    const existingCanonicalControl = existingControl?.control?.control
    const existingState = existingCanonicalControl?.state
    const retainedClaim = initialSnapshot !== undefined
      && existingCanonicalControl !== undefined
      && existingCanonicalControl.state === 'leased'
      && existingCanonicalControl.release !== 'possibly_released'
      ? initialSnapshot
      : undefined
    const retryAttempt = existingState === 'retryable' ? existingAttempt : undefined
    const retrying = retryAttempt !== undefined
    let claimed: CanonicalClaimSnapshot | undefined = retainedClaim
    if (claimed === undefined) {
      const claimAttemptRef = retrying
        ? `operation-attempt:${dispatch.invocationRef}:${retryAttempt.attemptNumber + 1}`
        : initialAttemptRef
      const claimAttemptNumber = retrying ? retryAttempt.attemptNumber + 1 : 1
      const claimEffectGeneration = retrying ? retryAttempt.effectGeneration + 1 : 1
      const claimInvocationVersion = retrying ? existingControl!.invocationVersion + 1 : 1
      const expectedInvocationVersion = retrying ? existingControl!.invocationVersion : null
      const claimInput: CanonicalClaimInput = {
        invocationRef: dispatch.invocationRef,
        sourceRef: `operation-invocation-source:${dispatch.invocationRef}`,
        invocationVersion: claimInvocationVersion,
        expectedInvocationVersion,
        ...(retrying ? { expectedEffectGeneration: retryAttempt.effectGeneration } : {}),
        actor,
        origin: { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
        action: { id: operation.operationId, contractVersion: String(descriptor.version) },
        materialInputDigest: dispatch.inputDigest,
        authority: persistedAuthority,
        attempt: {
          attemptRef: claimAttemptRef,
          attemptNumber: claimAttemptNumber,
          effectGeneration: claimEffectGeneration,
          operationKey: dispatch.operationRef,
          leaseOwner,
          leaseExpiresAt: authorityExpiresAt,
        },
        recordedAt: new Date(Date.now()).toISOString(),
      }
      const claimCommand = buildCanonicalClaimCommand(claimInput)
      const persistedClaimCommand = toOperationDispatchCommand(claimCommand)
      const claimResult = await ctx.runMutation(internal.capabilityOperationInvocations.claimDispatch, {
        dispatch,
        command: persistedClaimCommand,
      })
      if (claimResult.kind === 'refused') {
        return await refuseBeforeClaim(ctx, dispatch, 'invocation_runtime_unavailable', true, claimResult.code)
      }
      claimed = await readCanonicalSnapshot(port, dispatch.invocationRef, claimAttemptRef)
    }
    if (claimed === undefined) return { kind: 'none' }
    const durableAttemptRef = claimed.attempt.attemptRef
    const durableEffectGeneration = claimed.attempt.effectGeneration
    if (claimed.control.control.control.state === 'cancelled') return { kind: 'none' }

    if (Date.parse(authorityExpiresAt) <= Date.now()) {
      return await convergePreRelease(ctx, dispatch, claimed, 'authority_required', false, 'The accepted authority expired before release.')
    }
    const signing = routeCallSigningKey()
    if (signing === undefined) {
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'Route call signing is unavailable.')
    }
    const operationKeyDigest = operationInvocationAttemptIdentityDigest({
      invocationRef: dispatch.invocationRef,
      principalId: dispatch.principalId,
      credentialId: dispatch.credentialId,
      applicationRef: dispatch.applicationRef,
      environment: dispatch.environment,
      operationRef: dispatch.operationRef,
      idempotencyKey: dispatch.idempotencyKey,
      inputDigest: dispatch.inputDigest,
      attemptRef: durableAttemptRef,
      effectGeneration: durableEffectGeneration,
    })
    const baseBinding = {
      adapterId: operation.binding.adapter.adapterId,
      endpointUrl: operation.binding.endpointUrl,
      authority: operation.binding.authority,
      configJson: operation.transport.configJson,
      configDigest: operation.transport.configDigest,
    }
    const callIdentity = signRouteTransportCall({
      dispatchRef: dispatch.invocationRef,
      attemptRef: durableAttemptRef,
      effectGeneration: durableEffectGeneration,
      operationKeyDigest,
      mandateDigest: canonicalDigest(authorityBasis as StableHashValue),
      grantDigest: grant.policyDigest,
      capabilityContractDigest: operation.identity.contractDigest,
      inputDigest: dispatch.inputDigest,
      binding: baseBinding,
      maximumSpend: authorityMaximumSpend,
      expiresAt: Date.parse(authorityExpiresAt),
    }, signing)
    if (callIdentity === undefined) {
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'Route call signing failed.')
    }

    let leaseRef: string | undefined
    let leaseAuthority: Readonly<{ authorityGeneration: number; authorityDigest: string; grantedScopes: readonly string[]; grantedResources: readonly string[]; leaseExpiresAt: number }> | undefined
    const beforeLease = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
    if (beforeLease === undefined) return { kind: 'none' }
    if (beforeLease.control.control.control.state === 'cancelled') return { kind: 'none' }
    if (beforeLease.control.control.control.state === 'reconciliation_required') return { kind: 'none' }
    if (connectionAuthority !== undefined) {
      const authority = await ctx.runQuery(internal.capabilityOperationInvocations.readProviderLeaseAuthority, {
        connectionRef: connectionAuthority.connectionRef,
        authorityGeneration: connectionAuthority.authorityGeneration,
      })
      if (authority === null) return await convergePreRelease(ctx, dispatch, claimed, 'provider_refused', false, 'Provider approval changed before lease issuance.')
      const leaseNow = Date.now()
      const leaseMs = Math.min(30_000, Date.parse(authorityExpiresAt) - leaseNow)
      if (leaseMs < 100) {
        return await convergePreRelease(ctx, dispatch, claimed, 'provider_refused', false, 'Provider authority expires too soon for a connection lease.')
      }
      const lease = await ctx.runMutation(internal.capabilityProviderConnections.issueLease, {
        commandId: `operation-lease:${dispatch.invocationRef}:${durableAttemptRef}`,
        leaseRef: `operation-lease:${dispatch.invocationRef}:${durableAttemptRef}:${durableEffectGeneration}`,
        invocationRef: dispatch.invocationRef,
        operationRef: dispatch.operationRef,
        connectionRef: authority.connectionRef,
        providerRef: authority.providerRef,
        providerAccountRef: authority.providerAccountRef,
        adapterId: authority.adapterId,
        expectedAuthorityGeneration: authority.authorityGeneration,
        expectedAuthorityDigest: authority.authorityDigest,
        requestedScopes: [...authority.grantedScopes],
        grantedScopes: [...authority.grantedScopes],
        requestedResources: [...authority.grantedResources],
        grantedResources: [...authority.grantedResources],
        approvalDecisionRef: authority.approvalDecisionRef,
        readinessValidUntil: operation.readiness.validUntil,
        readinessDigest: operation.readiness.qualificationDigest,
        leaseMs,
        evidenceRefs: [...operation.readiness.evidenceRefs],
        now: leaseNow,
      })
      if (lease.kind !== 'applied' && lease.kind !== 'duplicate') {
        return await convergePreRelease(ctx, dispatch, claimed, 'provider_refused', false, 'Provider connection lease was refused.')
      }
      leaseRef = lease.lease.leaseRef
      leaseAuthority = {
        authorityGeneration: lease.lease.authorityGeneration,
        authorityDigest: lease.lease.authorityDigest,
        grantedScopes: lease.lease.grantedScopes,
        grantedResources: lease.lease.grantedResources,
        leaseExpiresAt: lease.lease.expiresAt,
      }
    }

    const invocation = routeInvocation(
      baseBinding,
      input,
      {
        attemptRef: durableAttemptRef,
        effectGeneration: durableEffectGeneration,
        operationKeyDigest,
        mandateDigest: canonicalDigest(authorityBasis as StableHashValue),
        grantDigest: grant.policyDigest,
        capabilityContractDigest: operation.identity.contractDigest,
        maximumSpend: authorityMaximumSpend,
        expiresAt: Date.parse(authorityExpiresAt),
        callIdentity,
      },
      leaseRef,
      leaseAuthority,
      dispatch.invocationRef,
      dispatch.operationRef,
      operation.readiness.validUntil,
      operation.readiness.qualificationDigest,
      connectionAuthority,
    )
    const preparation = prepareRegisteredRouteTransportInvocation(
      invocation,
      isX402
        ? () => x402PaymentCredentialRefFromEnvironment() !== undefined
        : undefined,
    )
    if (preparation.kind === 'refused') {
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, preparation.observation.failureCode)
    }
    const beforeCharge = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
    if (beforeCharge === undefined) return { kind: 'none' }
    if (
      beforeCharge.control.control.control.state === 'cancelled'
      || beforeCharge.control.control.control.state === 'reconciliation_required'
    ) {
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
      return { kind: 'none' }
    }
    if (!await isPublicHttpTarget(preparation.prepared.endpoint, defaultDnsResolver)) {
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'endpoint_not_public')
    }
    let moneyResult: WorkerAcceptedCharge | undefined
    if (economicRail === 'ae_internal') {
      const operatorAccountVersion = await ctx.runQuery(internal.moneyLedger.readOperatorAccountVersion, {
        ownerId: principal.ownerId,
        currency: authorityMaximumSpend.currency,
      })
      if (operatorAccountVersion === null) {
        await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
        return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'billing_identity_missing')
      }

      const authorizedCharge = await ctx.runMutation(internal.moneyLedger.authorizeInvocationCharge, {
        principalId: principal.principalId,
        amount: authorityMaximumSpend,
        operatorAccountRef: accountRefForOwner(principal.ownerId, authorityMaximumSpend.currency),
        providerAccountRef: accountRefForProvider(operation.identity.businessId, authorityMaximumSpend.currency),
        rakeAccountRef: accountRefForRake(authorityMaximumSpend.currency),
        transactionRef: `operation-money:${dispatch.invocationRef}:${durableAttemptRef}:1`,
        idempotencyKey: `operation-money:${dispatch.invocationRef}:${durableAttemptRef}:1`,
        inputDigest: dispatch.inputDigest,
        expectedAccountVersion: operatorAccountVersion,
        rakeBps: 1_000,
        priceDigest: pricingConfigDigest({ version: 'pricing:v2', unit: 'call', paidAmount: authorityMaximumSpend }),
        priceSourceDigest: pricingConfigDigest({ version: 'pricing:v2', unit: 'call', paidAmount: authorityMaximumSpend }),
        authorityMaximumSpend,
        credentialId: principal.credentialId,
        credentialBudgetGrantRef: dispatch.grantRef,
        credentialBudgetGeneration: dispatch.grantGeneration,
        applicationRef: principal.applicationRef,
        serviceRef: operation.operationId,
        offeringRef: operation.identity.offeringId,
        businessId: operation.identity.businessId,
        invocationRef: dispatch.invocationRef,
        attemptRef: durableAttemptRef,
        operationKey: dispatch.operationRef,
        sourceDigest: operation.materialDigest,
        evidenceRefs: [...operation.readiness.evidenceRefs],
        observedAt: Date.now(),
        freeTier: false,
      })
      if (authorizedCharge.kind !== 'accepted') {
        await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
        return await convergePreRelease(ctx, dispatch, claimed, authorizedCharge.code, authorizedCharge.retryable)
      }
      moneyResult = authorizedCharge
    }
    const reconcileBeforeRelease = async (): Promise<ChargeSettlementResult> => {
      if (moneyResult === undefined) {
        await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
        return { kind: 'settled', outcome: 'not_released' }
      }
      const settlement = await reconcileAcceptedCharge(ctx, dispatch, operation, moneyResult, durableAttemptRef, 'not_released')
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
      return settlement
    }

    const beforeRelease = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
    if (beforeRelease === undefined) return { kind: 'none' }
    if (beforeRelease.control.control.control.state === 'cancelled') {
      const settlement = await reconcileBeforeRelease()
      if (settlement.kind === 'reconciliation_required') {
        return await convergePreRelease(ctx, dispatch, claimed, 'invocation_cancelled', false, undefined, settlement)
      }
      return { kind: 'none' }
    }
    if (Date.parse(authorityExpiresAt) <= Date.now()) {
      const settlement = await reconcileBeforeRelease()
      return await convergePreRelease(
        ctx,
        dispatch,
        claimed,
        'authority_required',
        false,
        'The accepted authority expired before release.',
        settlement,
      )
    }
    let fenced: CanonicalClaimSnapshot | undefined
    try {
      const fencedResult = await persistCanonicalReleaseFence({ snapshot: claimed, recordedAt: new Date().toISOString() }, port)
      if (fencedResult.kind === 'refused') {
        const settlement = await reconcileBeforeRelease()
        return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'release_fence_refused', settlement)
      }
      fenced = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
    } catch {
      const settlement = await reconcileBeforeRelease()
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'release_fence_failed', settlement)
    }
    if (fenced === undefined) {
      const settlement = await reconcileBeforeRelease()
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'release_fence_readback_missing', settlement)
    }
    if (
      fenced.control.control.control.state === 'cancelled'
      || fenced.control.control.control.state === 'reconciliation_required'
    ) return { kind: 'none' }

    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    const send: RouteTransportFetch = async (target, init) => {
      if (Date.parse(authorityExpiresAt) <= Date.now()) throw new Error('operation_authority_expired')
      return await guardedFetch(target, { ...init, dispatcher })
    }
    const readProviderCredential = connectionAuthority === undefined
      ? undefined
      : providerCredentialReader(ctx, connectionAuthority, dispatch)
    const validateProviderAuthority = connectionAuthority === undefined
      ? undefined
      : providerLeaseAuthorityValidator(ctx, connectionAuthority, dispatch)
    const readPaymentAuthorization = async (
      prepared: X402PreparedAuthorization,
      byDigest: boolean,
    ): Promise<string | undefined> => {
      const credentialRef = x402PaymentCredentialRefFromEnvironment()
      const material = byDigest
        ? await ctx.runQuery(
            internal.customerRequestRouteExecution.readX402PaymentAuthorizationByDigest,
            prepared,
          )
        : await ctx.runQuery(
            internal.customerRequestRouteExecution.readX402PaymentAuthorization,
            prepared,
          )
      const expected = material === null
        ? undefined
        : x402ExternalSpendIdentityFromAttempt(
            dispatch,
            operation,
            material,
            durableAttemptRef,
            claimed.attempt.effectGeneration,
          )
      if (
        credentialRef === undefined
        || material === null
        || material.state !== 'prepared'
        || material.credentialRef !== credentialRef
        || material.dispatchRef !== dispatch.invocationRef
        || material.attemptRef !== durableAttemptRef
        || material.effectGeneration !== claimed.attempt.effectGeneration
        || material.paymentIdentifier !== operationKeyDigest
        || expected === undefined
      ) {
        if (expected !== undefined) {
          const cleanupOutcome = await bestEffortReleaseX402ExternalSpend(
            ctx,
            expected,
            [operationKeyDigest],
          )
          if (cleanupOutcome === 'failed') return undefined
        }
        return undefined
      }
      const validation = validateProviderAuthority === undefined || leaseRef === undefined || leaseAuthority === undefined
        ? { kind: 'valid' as const }
        : await validateProviderAuthority({
            leaseRef,
            invocationRef: dispatch.invocationRef,
            operationRef: dispatch.operationRef,
            connectionRef: connectionAuthority!.connectionRef,
            providerRef: connectionAuthority!.providerRef,
            adapterId: connectionAuthority!.adapterId,
            authorityGeneration: connectionAuthority!.authorityGeneration,
            authorityDigest: connectionAuthority!.authorityDigest,
            grantedScopes: leaseAuthority.grantedScopes,
            grantedResources: leaseAuthority.grantedResources,
            readinessValidUntil: operation.readiness.validUntil,
            readinessDigest: operation.readiness.qualificationDigest,
          })
      if (validation.kind !== 'valid') {
        const cleanupOutcome = await bestEffortReleaseX402ExternalSpend(
          ctx,
          expected,
          [operationKeyDigest],
        )
        if (cleanupOutcome === 'failed') return undefined
        return undefined
      }
      const signature = await readX402Authorization(ctx, prepared, byDigest, {
        credentialRef,
        dispatchRef: dispatch.invocationRef,
        attemptRef: durableAttemptRef,
        effectGeneration: claimed.attempt.effectGeneration,
        paymentIdentifier: operationKeyDigest,
      })
      if (signature === undefined || signature.length === 0) {
        const cleanupOutcome = await bestEffortReleaseX402ExternalSpend(
          ctx,
          expected,
          [operationKeyDigest],
        )
        if (cleanupOutcome === 'failed') return undefined
        return undefined
      }
      try {
        await ctx.runMutation(internal.customerRequestRouteExecution.recordX402PaymentSignature, {
          custodyRef: prepared.custodyRef,
          authorizationDigest: prepared.authorizationDigest,
          paymentSignatureDigest: canonicalDigest(signature),
        })
      } catch (error) {
        await bestEffortReleaseX402ExternalSpend(
          ctx,
          expected,
          [operationKeyDigest],
        )
        throw error
      }
      return signature
    }
    const paymentCallbacks: Pick<
      X402RouteTransportRuntime,
      'prepareX402PaymentAuthorization'
      | 'readX402PaymentAuthorization'
      | 'readX402PaymentAuthorizationByDigest'
      | 'markX402PaymentPossiblySubmitted'
      | 'observeX402PaymentAttempt'
      | 'verifyX402Settlement'
    > | undefined = connectionAuthority === undefined
      || leaseRef === undefined
      || leaseAuthority === undefined
      ? undefined
      : {
          verifyX402Settlement: async ({
            response,
            requirement,
            paymentSignature,
          }) => verifyExactEvmX402Settlement({
            response,
            requirement,
            payer: readX402PaymentPayer(paymentSignature),
            receipt: await readX402EvmReceipt(
              requirement.network,
              response.transaction,
              dispatcher,
            ),
          }),
          prepareX402PaymentAuthorization: async (request) => {
            if (
              request.attemptRef !== durableAttemptRef
              || request.effectGeneration !== claimed.attempt.effectGeneration
              || request.paymentIdentifier !== operationKeyDigest
            ) return undefined
            const paymentCredentialRef = x402PaymentCredentialRefFromEnvironment()
            if (paymentCredentialRef === undefined || request.credential !== paymentCredentialRef) return undefined
            const selectedRequirementJson = JSON.stringify(request.selectedRequirement)
            const externalIdentity = x402ExternalSpendIdentity({
              dispatch,
              attemptRef: request.attemptRef,
              effectGeneration: request.effectGeneration,
              providerRef: connectionAuthority.providerRef,
              paymentIdentifier: request.paymentIdentifier,
              challengeDigest: request.challengeDigest,
              selectedRequirementJson,
              amount: request.paymentAmount,
            })
            const reserved = await ctx.runMutation(internal.moneyLedger.reserveExternalInvocationSpend, {
              ...externalIdentity,
              observedAt: Date.now(),
            })
            if (reserved.kind !== 'accepted') return undefined
            try {
              const prepared = await ctx.runMutation(
                internal.customerRequestRouteExecution.prepareX402PaymentAuthorization,
                {
                  dispatchRef: dispatch.invocationRef,
                  operationRef: dispatch.operationRef,
                  inputDigest: dispatch.inputDigest,
                  challengeDigest: request.challengeDigest,
                  attemptRef: request.attemptRef,
                  effectGeneration: request.effectGeneration,
                  paymentIdentifier: request.paymentIdentifier,
                  operationKeyDigest,
                  challengeJson: JSON.stringify(request.challenge),
                  selectedRequirementJson,
                  providerEndpoint: request.challenge.resource.url,
                  credentialRef: paymentCredentialRef,
                  scheme: request.selectedRequirement.scheme,
                  network: request.selectedRequirement.network,
                  asset: request.selectedRequirement.asset,
                  payTo: request.selectedRequirement.payTo,
                  amountUnits: request.paymentAmount.units,
                  currency: request.paymentAmount.currency,
                  exponent: request.paymentAmount.exponent,
                  reservationRef: externalIdentity.reservationRef,
                },
              )
              return prepared
            } catch (error) {
              const attempt = await ctx.runQuery(
                internal.customerRequestRouteExecution.readX402PaymentAttempt,
                {
                  dispatchRef: dispatch.invocationRef,
                  attemptRef: request.attemptRef,
                  effectGeneration: request.effectGeneration,
                },
              ).catch(() => undefined)
              if (attempt === null || attempt?.state === 'prepared') {
                await bestEffortReleaseX402ExternalSpend(
                  ctx,
                  externalIdentity,
                  [operationKeyDigest],
                )
              }
              throw error
            }
          },
          readX402PaymentAuthorization: async (prepared) =>
            await readPaymentAuthorization(prepared, false),
          readX402PaymentAuthorizationByDigest: async (prepared) =>
            await readPaymentAuthorization(prepared, true),
          markX402PaymentPossiblySubmitted: async (event) => {
            const {
              amount,
              settlementEvidence: _settlementEvidence,
              ...paymentEvent
            } = event
            await ctx.runMutation(internal.customerRequestRouteExecution.markX402PaymentPossiblySubmitted, {
              dispatchRef: dispatch.invocationRef,
              effectGeneration: claimed.attempt.effectGeneration,
              ...paymentEvent,
              amountUnits: amount.units,
              currency: amount.currency,
              exponent: amount.exponent,
            })
          },
          observeX402PaymentAttempt: async (event) => {
            const { amount, settlementEvidence, ...paymentEvent } = event
            await ctx.runMutation(internal.customerRequestRouteExecution.observeX402PaymentAttempt, {
              dispatchRef: dispatch.invocationRef,
              effectGeneration: claimed.attempt.effectGeneration,
              ...paymentEvent,
              settlementStatus:
                settlementEvidence?.kind === 'not_submitted'
                  ? 'not_settled'
                  : settlementEvidence?.kind ?? 'unknown',
              ...(settlementEvidence !== undefined
                && settlementEvidence.kind !== 'not_submitted'
                && settlementEvidence.response !== undefined
                ? { settlementResponse: settlementEvidence.response }
                : {}),
              ...(settlementEvidence !== undefined
                && settlementEvidence.kind !== 'not_submitted'
                && settlementEvidence.digest !== undefined
                ? { settlementDigest: settlementEvidence.digest }
                : {}),
              state: event.state === 'reconciliation_required'
                || settlementEvidence?.kind === 'unknown'
                ? 'reconciliation_required'
                : 'observed',
              evidenceRefs: [...event.evidenceRefs],
              amountUnits: amount.units,
              currency: amount.currency,
              exponent: amount.exponent,
            })
          },
        }
    const runtime: RouteTransportRuntime = {
      send,
      resolveCredential: credentialFromEnvironment,
      readX402PaymentCredentialRef: x402PaymentCredentialRefFromEnvironment,
      ...(validateProviderAuthority === undefined ? {} : {
        validateProviderConnectionAuthority: validateProviderAuthority,
      }),
      ...(readProviderCredential === undefined ? {} : {
        readProviderConnectionCredentialRef: readProviderCredential,
      }),
      ...(paymentCallbacks ?? {}),
    }
    let finalGrant
    try {
      finalGrant = await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
        grantRef: persistedAuthority.grantRef,
        ownerId: dispatch.ownerId,
        credentialId: dispatch.credentialId,
        environment: dispatch.environment,
        principalId: dispatch.principalId,
        applicationRef: dispatch.applicationRef,
        generation: dispatch.grantGeneration,
        now: Date.now(),
      })
    } catch {
      const settlement = await reconcileBeforeRelease()
      return await convergePreRelease(
        ctx,
        dispatch,
        claimed,
        'pre_release_failed',
        true,
        'Grant authority could not be revalidated before release.',
        settlement,
      )
    }
    if (
      finalGrant === null
      || finalGrant.grantRef !== persistedAuthority.grantRef
      || finalGrant.ownerId !== dispatch.ownerId
      || finalGrant.credentialId !== dispatch.credentialId
      || finalGrant.principalId !== dispatch.principalId
      || finalGrant.applicationRef !== dispatch.applicationRef
      || finalGrant.environment !== dispatch.environment
      || finalGrant.generation !== dispatch.grantGeneration
      || finalGrant.policyDigest !== grant.policyDigest
      || finalGrant.lifecycle !== 'active'
    ) {
      const settlement = await reconcileBeforeRelease()
      return await convergePreRelease(
        ctx,
        dispatch,
        claimed,
        'grant_generation_stale',
        false,
        'Refresh the agent grant and retry.',
        settlement,
      )
    }
    const beforeSend = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
    if (beforeSend === undefined) return { kind: 'none' }
    if (beforeSend.control.control.control.state === 'cancelled') {
      if (moneyResult !== undefined) await reconcileAcceptedCharge(ctx, dispatch, operation, moneyResult, durableAttemptRef, 'not_released')
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
      return { kind: 'none' }
    }
    if (beforeSend.control.control.control.state === 'reconciliation_required') return { kind: 'none' }
    let acceptedChargeReconciled = moneyResult === undefined
    let finalizationStarted = false
    try {
      let observation: RouteTransportObservation
      try {
        observation = await invokePreparedRouteTransport(preparation.prepared, runtime)
      } catch (error) {
        observation = {
          transport: 'unknown',
          disposition: 'unknown',
          releaseStarted: true,
          requestDigest: preparation.prepared.requestDigest,
          failureCode: `operation_transport_${errorName(error)}`,
        }
      }
      const outputValidation = parseContractOutput(observation, descriptor)
      const deliveryOutcome = chargeSettlementOutcome(observation, economicRail, outputValidation.valid)
      const externalSpendSettlement = isX402
        ? await (async (): Promise<ChargeSettlementResult> => {
            const x402SettlementStatus = x402SettlementStatusForObservation(observation)
            const settlementDigest =
              observation.settlementEvidence?.kind === 'settled'
              || observation.settlementEvidence?.kind === 'not_settled'
                ? observation.settlementEvidence.digest
                : undefined
            const attempt = await ctx.runQuery(
              internal.customerRequestRouteExecution.readX402PaymentAttempt,
              {
                dispatchRef: dispatch.invocationRef,
                attemptRef: durableAttemptRef,
                effectGeneration: durableEffectGeneration,
              },
            )
            const identity = attempt === null
              ? undefined
              : x402ExternalSpendIdentityFromAttempt(
                  dispatch,
                  operation,
                  attempt,
                  durableAttemptRef,
                  durableEffectGeneration,
                )
            const evidenceRefs = [
              ...operation.readiness.evidenceRefs,
              transportObservationDigest(observation),
            ]
            const submissionStatus = observation.paymentSubmissionStatus
              ?? (x402SettlementStatus === 'unknown'
                ? 'unknown'
                : 'observed')
            await ctx.runMutation(internal.customerRequestRouteExecution.recordX402PaymentObservation, {
              dispatchRef: dispatch.invocationRef,
              attemptRef: durableAttemptRef,
              effectGeneration: durableEffectGeneration,
              paymentIdentifier: operationKeyDigest,
              operationRef: dispatch.operationRef,
              inputDigest: dispatch.inputDigest,
              transportObservationDigest: transportObservationDigest(observation),
              transportRequestDigest: observation.requestDigest,
              paymentObservationDigest: paymentObservationDigest(observation, operationKeyDigest),
              settlementStatus: x402SettlementStatus,
              ...(settlementDigest === undefined
                ? {}
                : { paymentResponseDigest: settlementDigest }),
              observedAt: Date.now(),
            })
            const external = identity === undefined
              ? { kind: 'reconciliation_required' as const }
              : await finalizeX402ExternalSpend(
                  ctx,
                  identity,
                  submissionStatus,
                  x402SettlementStatus,
                  settlementDigest,
                  evidenceRefs,
                  observation.providerReceipt === undefined
                    ? undefined
                    : canonicalDigest(observation.providerReceipt),
                )
            return external.kind === 'settled'
              ? {
                  kind: 'settled',
                  outcome: external.settlementStatus === 'settled'
                    ? 'released'
                    : 'not_released',
                }
              : external
          })()
        : undefined
      const settlement = isX402
        ? externalSpendSettlement
        : moneyResult === undefined
          ? deliveryOutcome === 'unknown'
            ? { kind: 'reconciliation_required' as const }
            : { kind: 'settled' as const, outcome: deliveryOutcome }
          : await reconcileAcceptedCharge(
              ctx,
              dispatch,
              operation,
              moneyResult,
              durableAttemptRef,
              deliveryOutcome,
            )
      acceptedChargeReconciled = true
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, observation.releaseStarted, durableAttemptRef, durableEffectGeneration)
      const recordedAt = new Date().toISOString()
      finalizationStarted = true
      await projectOuterResult(
        ctx,
        dispatch,
        operation,
        descriptor,
        observation,
        recordedAt,
        moneyResult,
        settlement,
        durableAttemptRef,
        durableEffectGeneration,
        outputValidation,
        fenced,
      )
      return { kind: 'recorded' }
    } catch (error) {
      if (finalizationStarted) throw error
      if (moneyResult !== undefined && !acceptedChargeReconciled) {
        await reconcileAcceptedCharge(
          ctx,
          dispatch,
          operation,
          moneyResult,
          durableAttemptRef,
          'unknown',
        )
      }
      await settleProviderLease(
        ctx,
        dispatch,
        operation,
        leaseRef,
        leaseAuthority,
        true,
        durableAttemptRef,
        durableEffectGeneration,
      ).catch(() => undefined)
      const recordedAt = new Date().toISOString()
      const unknownObservation: RouteTransportObservation = {
        transport: 'unknown',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: preparation.prepared.requestDigest,
        failureCode: `operation_worker_${errorName(error)}`,
      }
      finalizationStarted = true
      await projectOuterResult(
        ctx,
        dispatch,
        operation,
        descriptor,
        unknownObservation,
        recordedAt,
        moneyResult,
        { kind: 'reconciliation_required' },
        durableAttemptRef,
        durableEffectGeneration,
        { valid: false },
        fenced,
      )
      return { kind: 'recorded' }
    } finally {
      await dispatcher.close().catch(() => undefined)
    }
  },
})
export function validateOperationInvokeAuthority(input: Readonly<{
  authority: OperationInvokePersistedAuthority | undefined
  dispatch: Pick<OpenDispatch, 'invocationRef' | 'operationRef' | 'inputDigest' | 'grantGeneration'>
  grant: Readonly<{ grantRef: string; generation: number; policyDigest: string; expiresAt: number }>
  principal: AgentAccessPrincipal
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  now: number
}>): ExactAmount | undefined {
  const authority = input.authority
  if (authority === undefined || input.descriptor.price.kind !== 'fixed') return undefined
  try {
    const authorityExpiresAt = Date.parse(authority.expiresAt)
    const amount = exactAmountSchema.safeParse(authority.limits.amount)
    if (
      !amount.success
      || !Number.isFinite(authorityExpiresAt)
      || !Number.isSafeInteger(authority.grantGeneration)
      || authority.grantGeneration < 1
      || authorityExpiresAt <= input.now
      || authorityExpiresAt > input.operation.readiness.validUntil
      || authorityExpiresAt > input.grant.expiresAt
      || authority.invocationRef !== input.dispatch.invocationRef
      || authority.operationRef !== input.dispatch.operationRef
      || authority.inputDigest !== input.dispatch.inputDigest
      || authority.grantRef !== input.grant.grantRef
      || authority.grantGeneration !== input.dispatch.grantGeneration
      || authority.grantGeneration !== input.grant.generation
      || authority.grantDigest !== input.grant.policyDigest
      || authority.consequence !== input.descriptor.consequenceClass
      || authority.targetDigest !== canonicalDigest(input.operation.identity as StableHashValue)
      || canonicalDigest(authority.limits as StableHashValue)
        !== canonicalDigest({ amount: input.descriptor.price.amount } as StableHashValue)
      || canonicalDigest(amount.data as StableHashValue)
        !== canonicalDigest(input.descriptor.price.amount as StableHashValue)
    ) return undefined
    const basis = authority.acceptedBasis
    if (basis.kind === 'approve_each') {
      if (basis.authorityRef.trim().length === 0 || authority.reference !== basis.authorityRef) return undefined
    } else if (basis.kind === 'standing_mandate_use') {
      if (
        basis.mandateRef.trim().length === 0
        || basis.authorityUseRef.trim().length === 0
        || basis.grantEvidenceRef.trim().length === 0
        || !Number.isSafeInteger(basis.mandateVersion)
        || basis.mandateVersion < 1
        || !Number.isSafeInteger(basis.mandateGeneration)
        || basis.mandateGeneration !== input.grant.generation
        || authority.reference !== `operation-authority:${input.dispatch.invocationRef}`
      ) return undefined
      if (input.principal.authorityMode === 'full_yolo' && (
        basis.mandateRef !== `agent-access-grant:${input.grant.grantRef}`
        || basis.mandateVersion !== 1
        || basis.authorityUseRef !== `operation-authority-use:${input.dispatch.invocationRef}`
        || basis.grantEvidenceRef !== `agent-access-grant-evidence:${input.grant.policyDigest}`
      )) return undefined
    } else {
      return undefined
    }
    const expectedDecisionDigest = canonicalDigest({
      format: 'operation-invoke-authority:v1',
      invocationRef: authority.invocationRef,
      operationRef: authority.operationRef,
      inputDigest: authority.inputDigest,
      grantRef: authority.grantRef,
      grantGeneration: authority.grantGeneration,
      grantDigest: authority.grantDigest,
      reference: authority.reference,
      targetDigest: authority.targetDigest,
      consequence: authority.consequence,
      limits: authority.limits,
      expiresAt: authority.expiresAt,
      acceptedBasis: authority.acceptedBasis,
    } as StableHashValue)
    return expectedDecisionDigest === authority.decisionDigest ? amount.data : undefined
  } catch {
    return undefined
  }
}

export const recover = internalAction({
  args: recoveryArgs,
  returns: recoveryResultValue,
  handler: async (ctx, args): Promise<Infer<typeof recoveryResultValue>> => {
    if (
      (args.mode === 'status' && (args.idempotencyKey !== undefined || args.evidence !== undefined))
      || (args.mode === 'cancel' && (args.idempotencyKey === undefined || args.evidence !== undefined))
      || (args.mode === 'reconcile' && (args.idempotencyKey !== undefined || args.evidence === undefined))
    ) return recoveryNotFound(args.invocationRef)
    const row = await ctx.runQuery(internal.capabilityOperationInvocations.readRecovery, {
      invocationRef: args.invocationRef,
      principalId: args.principalId,
      credentialId: args.credentialId,
    })
    if (row === null) return recoveryNotFound(args.invocationRef)
    const port = canonicalPort(ctx)
    if (args.mode === 'cancel' && row.state !== 'pending') {
      return row.state === 'cancelled' ? cancelledRecoveryResult(row) : projectPersistedRecovery(row)
    }
    if (args.mode === 'cancel') {
      const idempotencyKey = args.idempotencyKey
      if (idempotencyKey === undefined) return recoveryNotFound(args.invocationRef)
      const decision = await ctx.runMutation(internal.capabilityOperationInvocations.cancelBeforeClaim, {
        invocationRef: row.invocationRef,
        principalId: row.principalId,
        credentialId: row.credentialId,
        idempotencyKey,
      })
      if (decision.kind === 'refused') return recoveryNotFound(args.invocationRef)
      if (decision.kind === 'cancelled') {
        if (decision.workId !== undefined) {
          await customerRequestRouteWorkpool.cancel(ctx, decision.workId as WorkId).catch(() => undefined)
        }
        return cancelledRecoveryResult(row)
      }
      if (decision.kind === 'reconciliation_required') {
        return {
          kind: 'reconciliation_required',
          invocationRef: row.invocationRef,
          operationRef: row.operationRef,
          evidence: {
            attemptRef: decision.attemptRef,
            effectGeneration: decision.effectGeneration,
            requiredAt: new Date(Date.now() + 1_000).toISOString(),
            retry: 'reconcile_before_retry',
            evidenceSource: `operation:${row.operationRef}`,
          },
        }
      }
    }
    const control = await port.readControl(row.invocationRef)
    if (control === undefined) {
      return projectPersistedRecovery(row)
    }
    if (
      control.control.owner.principalRef !== row.principalId
      || control.control.owner.callerRef !== row.credentialId
      || control.control.origin.kind !== 'standalone'
      || control.control.origin.principalRef !== row.principalId
      || control.control.origin.callerRef !== row.credentialId
      || control.control.invocationRef !== row.invocationRef
      || control.sourceRef !== `operation-invocation-source:${row.invocationRef}`
    ) return recoveryNotFound(args.invocationRef)
    if (args.mode === 'status') {
      const status = await readPublicInvocationStatus({
        port,
        invocationRef: row.invocationRef,
        actor: { callerRef: row.credentialId, principalRef: row.principalId },
      })
      if (status.kind === 'refused') return recoveryNotFound(args.invocationRef)
      return projectPureOperationInvocationStatus(row, status)
    }
    let operation: PublishedOperation
    let descriptor: RuntimePublishedOperationDescriptor
    let dynamicInput: DynamicPublishedInvocationInput
    try {
      const parsedOperation = parsePublishedOperationSnapshot(row.operationJson)
      if (parsedOperation === undefined) throw new Error('operation_invalid')
      operation = parsedOperation
      descriptor = materializeRuntimePublishedOperation(operation)
      const parsedInput: unknown = JSON.parse(row.inputJson)
      if (!isBoundedJsonValue(parsedInput)) throw new Error('input_invalid')
      dynamicInput = buildDynamicPublishedInput({
        operation,
        descriptor,
        value: parsedInput,
      })
    } catch {
      return recoveryNotFound(args.invocationRef)
    }
    if (
      operation.operationId !== row.operationRef
      || dynamicInput.inputDigest !== row.inputDigest
      || (control.preparedMaterialDigest !== undefined && control.preparedMaterialDigest !== dynamicInput.inputDigest)
      || control.control.action.id !== operation.operationId
      || control.control.action.contractVersion !== descriptor.version
    ) return recoveryNotFound(args.invocationRef)
    const priceAmount = descriptor.price.kind === 'fixed' ? descriptor.price.amount : undefined
    if (priceAmount === undefined) return recoveryNotFound(args.invocationRef)


    const [attemptRows, historyRows] = await Promise.all([
      port.readAttempts(row.invocationRef, 100),
      port.readHistory(row.invocationRef, 0, 100),
    ])
    if (historyRows.some(({ invocationRef }) => invocationRef !== row.invocationRef)) return recoveryNotFound(args.invocationRef)
    const attempts = attemptRows.map(({ invocationRef: _invocationRef, recordedAt: _recordedAt, ...attempt }) => attempt)
    const prepared = {
      materialInputDigest: dynamicInput.inputDigest,
      target: dynamicInput.target,
      consequence: descriptor.consequenceClass,
      dataUse: {
        fields: descriptor.materialInputPointers,
        limits: { amount: priceAmount },
      },
      preparedAt: control.authorityDecisionAt ?? control.updatedAt,
      freshUntil: control.control.authority?.expiresAt ?? control.updatedAt,
    }
    const action = createDynamicPublishedAction({
      operation,
      descriptor,
      now: () => Date.now(),
      run: async (value) => ({
        kind: 'published_operation_refused' as const,
        sourceDisposition: 'refused' as const,
        operationId: operation.operationId,
        operationVersion: descriptor.version,
        requestDigest: value.inputDigest,
        failureCode: 'recovery_control_only',
      }),
      preReleaseCheck: async (value) => ({
        kind: 'published_operation_refused' as const,
        sourceDisposition: 'refused' as const,
        operationId: operation.operationId,
        operationVersion: descriptor.version,
        requestDigest: value.inputDigest,
        failureCode: 'recovery_control_only',
      }),
    })
    const x402Attempt = operation.identity.adapterId === 'x402-fetch:v2'
      && control.currentAttemptRef !== undefined
      && control.currentEffectGeneration !== undefined
      ? await ctx.runQuery(internal.customerRequestRouteExecution.readX402PaymentAttempt, {
          dispatchRef: row.invocationRef,
          attemptRef: control.currentAttemptRef,
          effectGeneration: control.currentEffectGeneration,
        })
      : null
    const initialSnapshot = {
      format: 'action-invocation-control:development:v1' as const,
      records: [{
        sourceRef: control.sourceRef,
        control: { ...control.control, attempts },
        ...(control.authorityBinding === undefined ? {} : { authorityBinding: control.authorityBinding }),
      }],
    }
    let trustedReconciliationEvidenceDigest: string | undefined
    const tracer = createDurableActionInvocationTracer({
      action,
      port,
      now: () => new Date().toISOString(),
      nextInvocationRef: () => row.invocationRef,
      nextAuthorityRef: () => `operation-authority:${row.invocationRef}`,
      nextAttemptRef: () => `${row.invocationRef}:recovery`,
      resolveSourceState: (sourceRef) => {
        if (sourceRef !== control.sourceRef) throw new Error('operation_recovery_source_ref_mismatch')
        return {
          input: dynamicInput,
          context: {},
          prepared,
          observedResolution: { state: 'pending' as const },
        }
      },
      verifyReconciliationEvidence: (evidence: ReconciliationEvidence): boolean => {
        if (
          evidence.operationRef !== row.operationRef
          || evidence.inputDigest !== row.inputDigest
          || evidence.providerIdentity !== (
            operation.binding.authority.kind === 'provider_connection'
              ? operation.binding.authority.providerRef
              : undefined
          )
        ) return false
        return canonicalDigest(evidence as StableHashValue)
          === trustedReconciliationEvidenceDigest
          || historyRows.some((history) =>
            history.sourceEvidenceRef === evidence.evidenceRef
            && history.observation?.release === evidence.resolution
            && history.observation?.evidenceDigest === evidence.digest)
      },
    }, initialSnapshot)
    const actor = { callerRef: row.credentialId, principalRef: row.principalId }
    const origin = { kind: 'standalone' as const, callerRef: row.credentialId, principalRef: row.principalId }
    const reconcileMoney = async (outcome: 'not_released' | 'released'): Promise<{ kind: 'none' | 'settled' | 'reconciliation_required' }> => {
      const attemptRef = control.currentAttemptRef
        ?? row.attemptRef
        ?? `operation-attempt:${row.invocationRef}:1`
      const transactionRef = `operation-money:${row.invocationRef}:${attemptRef}:1`
      const refundTransactionRef = `operation-money-refund:${row.invocationRef}:${attemptRef}:1`
      const reconciliationDigest = canonicalDigest({
        format: 'operation-money-reconciliation:v1',
        invocationRef: row.invocationRef,
        attemptRef,
        operationRef: row.operationRef,
        inputDigest: row.inputDigest,
        transactionRef,
        outcome,
        sourceDigest: operation.materialDigest,
      } as StableHashValue)
      try {
        return await ctx.runMutation(internal.moneyLedger.reconcileInvocationCharge, {
          invocationRef: row.invocationRef,
          principalId: row.principalId,
          credentialId: row.credentialId,
          attemptRef,
          transactionRef,
          inputDigest: row.inputDigest,
          sourceDigest: operation.materialDigest,
          outcome,
          refundTransactionRef,
          refundIdempotencyKey: refundTransactionRef,
          refundInputDigest: canonicalDigest({
            format: 'operation-money-refund:v1',
            invocationRef: row.invocationRef,
            attemptRef,
            inputDigest: row.inputDigest,
            transactionRef,
            outcome,
          } as StableHashValue),
          evidenceRefs: [
            ...operation.readiness.evidenceRefs,
            `operation-money-reconciliation:${reconciliationDigest}`,
          ],
          observedAt: Date.now(),
        })
      } catch {
        return { kind: 'reconciliation_required' }
      }
    }

    if (args.mode === 'cancel') {
      const idempotencyKey = args.idempotencyKey
      if (idempotencyKey === undefined) return recoveryNotFound(args.invocationRef)
      const cancellation = await cancelPublicInvocation({
        tracer,
        invocationRef: row.invocationRef,
        idempotencyKey,
        actor,
        origin,
      })
      if (cancellation.kind === 'refused') {
        if (cancellation.status === undefined) return recoveryNotFound(args.invocationRef)
        const result = projectPureOperationInvocationStatus(row, cancellation.status)
        await projectRecoveryOuter(ctx, row, result, undefined)
        return result
      }
      if (cancellation.kind === 'cancelled') {
        const money = await reconcileMoney('not_released')
        if (money.kind === 'reconciliation_required') {
          const reconciliation = reconciliationResult(row, cancellation.status, attemptRows, operation.operationId)
          await projectRecoveryOuter(ctx, row, reconciliation, 'reconciliation_required')
          return reconciliation
        }
        const cancelled = cancelledRecoveryResult(row)
        await projectRecoveryOuter(ctx, row, cancelled, 'cancelled', {
          clearResult: true,
          clearWorkId: true,
          clearAttemptRef: true,
          clearEvidenceHash: true,
        })
        return cancelled
      }
      const reconciliation = reconciliationResult(row, cancellation.status, attemptRows, operation.operationId)
      await projectRecoveryOuter(ctx, row, reconciliation, 'reconciliation_required')
      return reconciliation
    }
    const submittedEvidence = args.evidence
    if (submittedEvidence === undefined) return recoveryNotFound(args.invocationRef)
    let evidence: ReconciliationEvidence
    let x402MoneyReconciled = false
    if (submittedEvidence.kind === 'x402_payment_reconciliation') {
      const paymentStatus = await readPublicInvocationStatus({
        port,
        invocationRef: row.invocationRef,
        actor,
      })
      if (paymentStatus.kind === 'refused') return recoveryNotFound(args.invocationRef)
      const providerRef = operation.binding.authority.kind === 'provider_connection'
        ? operation.binding.authority.providerRef
        : undefined
      const externalIdentity = x402Attempt === null || providerRef === undefined
        ? undefined
        : x402ExternalSpendIdentity({
            dispatch: {
              invocationRef: row.invocationRef,
              principalId: row.principalId,
              credentialId: row.credentialId,
              grantRef: row.grantRef,
              grantGeneration: row.grantGeneration,
              environment: row.environment,
              operationRef: row.operationRef,
            },
            attemptRef: submittedEvidence.attemptRef,
            effectGeneration: submittedEvidence.effectGeneration,
            providerRef,
            paymentIdentifier: submittedEvidence.paymentIdentifier,
            challengeDigest: submittedEvidence.challengeDigest,
            selectedRequirementJson: x402Attempt?.selectedRequirementJson ?? '',
            amount: submittedEvidence.amount,
          })
      const observedAt = Date.parse(submittedEvidence.observedAt)
      const { digest: submittedDigest, ...submittedMaterial } = submittedEvidence
      if (
        operation.identity.adapterId !== 'x402-fetch:v2'
        || x402Attempt === null
        || externalIdentity === undefined
        || submittedEvidence.settlementStatus !== 'settled'
        || submittedEvidence.invocationRef !== row.invocationRef
        || submittedEvidence.operationRef !== row.operationRef
        || submittedEvidence.inputDigest !== row.inputDigest
        || submittedEvidence.amount.units !== x402Attempt.amountUnits
        || submittedEvidence.amount.currency !== x402Attempt.currency
        || submittedEvidence.amount.exponent !== x402Attempt.exponent
        || externalIdentity.reservationRef !== submittedEvidence.reservationRef
        || providerRef !== submittedEvidence.providerRef
        || !/^0x[0-9a-fA-F]{64}$/.test(submittedEvidence.transactionHash)
        || (
          x402Attempt.paymentResponseDigest !== undefined
          && x402Attempt.paymentResponseDigest !== submittedEvidence.paymentResponseDigest
        )
        || !Number.isFinite(observedAt)
        || canonicalDigest(submittedMaterial as StableHashValue) !== submittedDigest
      ) {
        const required = reconciliationResult(row, paymentStatus, attemptRows, operation.operationId)
        await projectRecoveryOuter(ctx, row, required, 'reconciliation_required')
        return required
      }
      const paymentSignature = await readX402Authorization(
        ctx,
        {
          custodyRef: x402Attempt.custodyRef,
          authorizationDigest: x402Attempt.authorizationDigest,
        },
        true,
        {
          credentialRef: x402Attempt.credentialRef,
          dispatchRef: row.invocationRef,
          attemptRef: submittedEvidence.attemptRef,
          effectGeneration: submittedEvidence.effectGeneration,
          paymentIdentifier: submittedEvidence.paymentIdentifier,
        },
      )
      let settlementVerified = false
      if (paymentSignature !== undefined) {
        const dispatcher = new Agent({
          connect: { lookup: createGuardedLookup(defaultDnsResolver) },
        })
        try {
          settlementVerified = verifyExactEvmX402Settlement({
            response: {
              success: true,
              transaction: submittedEvidence.transactionHash,
              network: x402Attempt.network,
              amount: x402Attempt.amountUnits,
            },
            requirement: {
              scheme: x402Attempt.scheme,
              network: x402Attempt.network,
              amount: x402Attempt.amountUnits,
              asset: x402Attempt.asset,
              payTo: x402Attempt.payTo,
            },
            payer: readX402PaymentPayer(paymentSignature),
            receipt: await readX402EvmReceipt(
              x402Attempt.network,
              submittedEvidence.transactionHash,
              dispatcher,
            ),
          })
        } finally {
          await dispatcher.close().catch(() => undefined)
        }
      }
      if (!settlementVerified) {
        const required = reconciliationResult(
          row,
          paymentStatus,
          attemptRows,
          operation.operationId,
        )
        await projectRecoveryOuter(ctx, row, required, 'reconciliation_required')
        return required
      }
      const payment = await ctx.runMutation(
        internal.customerRequestRouteExecution.reconcileX402PaymentAttempt,
        {
          dispatchRef: row.invocationRef,
          attemptRef: submittedEvidence.attemptRef,
          effectGeneration: submittedEvidence.effectGeneration,
          operationRef: submittedEvidence.operationRef,
          inputDigest: submittedEvidence.inputDigest,
          evidenceRef: submittedEvidence.evidenceRef,
          evidenceDigest: submittedEvidence.digest,
          reservationRef: submittedEvidence.reservationRef,
          paymentIdentifier: submittedEvidence.paymentIdentifier,
          challengeDigest: submittedEvidence.challengeDigest,
          settlementStatus: submittedEvidence.settlementStatus,
          amountUnits: submittedEvidence.amount.units,
          currency: submittedEvidence.amount.currency,
          exponent: submittedEvidence.amount.exponent,
          paymentResponseDigest: submittedEvidence.paymentResponseDigest,
          transportObservationDigest: submittedEvidence.transportObservationDigest,
          transportRequestDigest: submittedEvidence.requestDigest,
          paymentObservationDigest: submittedEvidence.paymentObservationDigest,
          observedAt,
        },
      )
      const external = payment.kind === 'settled'
        ? await ctx.runMutation(internal.moneyLedger.reconcileExternalInvocationSpend, {
            ...externalIdentity,
            settlementStatus: submittedEvidence.settlementStatus,
            paymentResponseDigest: submittedEvidence.paymentResponseDigest,
            evidenceRef: submittedEvidence.evidenceRef,
            evidenceDigest: submittedEvidence.digest,
            observedAt,
          })
        : { kind: 'refused' as const }
      if (payment.kind !== 'settled' || external.kind !== 'accepted') {
        const required = reconciliationResult(row, paymentStatus, attemptRows, operation.operationId)
        await projectRecoveryOuter(ctx, row, required, 'reconciliation_required')
        return required
      }
      const evidenceMaterial = {
        kind: 'action_invocation_reconciliation' as const,
        version: 1 as const,
        evidenceRef: submittedEvidence.evidenceRef,
        source: submittedEvidence.source,
        invocationRef: submittedEvidence.invocationRef,
        attemptRef: submittedEvidence.attemptRef,
        effectGeneration: submittedEvidence.effectGeneration,
        operationRef: submittedEvidence.operationRef,
        inputDigest: submittedEvidence.inputDigest,
        requestDigest: submittedEvidence.requestDigest,
        providerIdentity: submittedEvidence.providerRef,
        paymentIdentifier: submittedEvidence.paymentIdentifier,
        transportObservationDigest: submittedEvidence.transportObservationDigest,
        paymentObservationDigest: submittedEvidence.paymentObservationDigest,
        resolution: submittedEvidence.settlementStatus === 'settled'
          ? 'released' as const
          : 'not_released' as const,
        observedAt: submittedEvidence.observedAt,
      }
      evidence = {
        ...evidenceMaterial,
        digest: canonicalDigest(evidenceMaterial as StableHashValue),
      }
      trustedReconciliationEvidenceDigest = canonicalDigest(evidence as StableHashValue)
      x402MoneyReconciled = true
    } else {
      evidence = submittedEvidence
    }
    const reconciliation = await reconcilePublicInvocation({
      tracer,
      invocationRef: row.invocationRef,
      attemptRef: evidence.attemptRef,
      actor,
      origin,
      evidence,
    })
    if (reconciliation.kind === 'refused') {
      if (reconciliation.status === undefined) return recoveryNotFound(args.invocationRef)
      const result = projectPureOperationInvocationStatus(row, reconciliation.status)
      await projectRecoveryOuter(ctx, row, result, undefined)
      return result
    }
    if (operation.identity.adapterId === 'x402-fetch:v2' && !x402MoneyReconciled) {
      const required = reconciliationResult(row, reconciliation.status, attemptRows, operation.operationId)
      await projectRecoveryOuter(ctx, row, required, 'reconciliation_required')
      return required
    }
    const money = operation.identity.adapterId === 'x402-fetch:v2'
      ? { kind: 'settled' as const, outcome: evidence.resolution }
      : await reconcileMoney(evidence.resolution)
    if (money.kind === 'reconciliation_required') {
      const required = reconciliationResult(row, reconciliation.status, attemptRows, operation.operationId)
      await projectRecoveryOuter(ctx, row, required, 'reconciliation_required')
      return required
    }
    const result = projectPureOperationInvocationStatus(row, reconciliation.status)
    if (evidence.resolution === 'released') {
      const outcome = reconciliationResult(row, reconciliation.status, attemptRows, operation.operationId)
      await projectRecoveryOuter(ctx, row, outcome, 'reconciliation_required')
      return outcome
    }
    if (reconciliation.status.control !== 'retryable') {
      const required = reconciliationResult(row, reconciliation.status, attemptRows, operation.operationId)
      await projectRecoveryOuter(ctx, row, required, 'reconciliation_required')
      return required
    }
    const retryable = retryableRecoveryResult(row)
    await projectRecoveryOuter(ctx, row, retryable, 'pending', {
      clearResult: true,
      clearWorkId: true,
      clearAttemptRef: true,
      clearEvidenceHash: true,
      clearDispatchState: true,
    })
    return retryable
  },
})
function toOperationDispatchCommand(
  command: Parameters<DurableActionInvocationPort<DynamicPublishedInvocationResult>['transact']>[0],
): OperationDispatchCommand {
  const { commandId, commandDigest, expectedInvocationVersion, expectedEffectGeneration, row, currentAttemptWrite, history } = command
  return {
    commandId,
    commandDigest,
    expectedInvocationVersion,
    ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
    row: {
      ...row,
      control: {
        ...row.control,
        control: row.control.control.state === 'gathering_information'
          ? { ...row.control.control, missingFields: [...row.control.control.missingFields] }
          : row.control.control,
      },
    },
    ...(currentAttemptWrite === undefined ? {} : { currentAttemptWrite }),
    history,
  }
}

function canonicalPort(ctx: ActionCtx): CanonicalPort {
  return {
    transact: async (command: Parameters<DurableActionInvocationPort<DynamicPublishedInvocationResult>['transact']>[0]) => {
      const { commandId, commandDigest, expectedInvocationVersion, expectedEffectGeneration, row, currentAttemptWrite, history } = command
      const mutableRow = {
        ...row,
        control: {
          ...row.control,
          control: row.control.control.state === 'gathering_information'
            ? { ...row.control.control, missingFields: [...row.control.control.missingFields] }
            : row.control.control,
        },
      }
      return await ctx.runMutation(internal.actionInvocationControl.transact, {
        commandId,
        commandDigest,
        expectedInvocationVersion,
        ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
        row: mutableRow,
        ...(currentAttemptWrite === undefined ? {} : { currentAttemptWrite }),
        history,
      })
    },
    readControl: async (invocationRef) => await ctx.runQuery(internal.actionInvocationControl.readControl, { invocationRef }) ?? undefined,
    readAttempt: async (invocationRef, attemptRef) => await ctx.runQuery(internal.actionInvocationControl.readAttempt, { invocationRef, attemptRef }) ?? undefined,
    readAttempts: async (invocationRef, limit) => await ctx.runQuery(internal.actionInvocationControl.readAttempts, { invocationRef, limit }),
    readHistory: async (invocationRef, afterVersion, limit) => await ctx.runQuery(internal.actionInvocationControl.readHistory, { invocationRef, afterVersion, limit }),
    readHistoryCommand: async (invocationRef, commandId) => await ctx.runQuery(internal.actionInvocationControl.readHistoryCommand, { invocationRef, commandId }) ?? undefined,
    recordLateObservation: async (input) => await ctx.runMutation(internal.actionInvocationControl.recordLateObservation, { ...input, recordedAt: new Date().toISOString() }),
  }
}
type RecoveryRow = Readonly<{
  invocationRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  operationRef: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  operationJson: string
  inputJson: string
  result?: Infer<typeof operationResultValue>
  usage?: Infer<typeof usageValue>
  evidenceHash?: string
  attemptRef?: string
}>

function recoveryNotFound(invocationRef: string): WorkerRecoveryResult {
  return { kind: 'refused', invocationRef, code: 'invocation_not_found', retryable: false }
}

export function projectPureOperationInvocationStatus(
  row: RecoveryRow,
  status: PublicInvocationStatus,
): WorkerRecoveryResult {
  const latestAttempt = status.attempts.at(-1)
  const attemptRef = latestAttempt?.attemptRef ?? row.attemptRef
  const effectGeneration = latestAttempt?.effectGeneration
  const staleResult = (
    status.control === 'retryable'
    || (status.control === 'reconciliation_required' && row.result?.kind !== 'reconciliation_required')
    || (status.control === 'terminal' && row.result?.kind === 'pending')
    || (status.control === 'cancelled' && row.result?.kind === 'pending')
  )
  const projectedResult = staleResult ? undefined : row.result
  return {
    kind: 'found',
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    state: status.control,
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(attemptRef === undefined ? {} : { attemptRef }),
    ...(effectGeneration === undefined ? {} : { effectGeneration }),
    ...(projectedResult === undefined ? {} : { result: projectedResult }),
  }
}
function cancelledRecoveryResult(row: RecoveryRow): WorkerRecoveryResult {
  return {
    kind: 'found',
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    state: 'cancelled',
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    result: {
      kind: 'refused',
      operationRef: row.operationRef,
      code: 'invocation_cancelled',
      retryable: false,
    },
  }
}

function retryableRecoveryResult(row: RecoveryRow): WorkerRecoveryResult {
  return {
    kind: 'found',
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    state: 'retryable',
    ...(row.usage === undefined ? {} : { usage: row.usage }),
  }
}

function projectPersistedRecovery(
  row: RecoveryRow,
  state = row.state,
): WorkerRecoveryResult {
  const effectGeneration = row.result?.kind === 'reconciliation_required'
    ? row.result.evidence.effectGeneration
    : undefined
  const projectedResult = state === 'cancelled' && row.result?.kind === 'pending'
    ? undefined
    : row.result
  const publicState: PublicInvocationStatus['control'] = state === 'pending'
    ? row.result?.kind === 'needs_authority'
      ? 'awaiting_authority'
      : row.result?.kind === 'reconciliation_required'
        ? 'reconciliation_required'
        : 'in_progress'
    : state === 'reconciliation_required'
      ? 'reconciliation_required'
      : state === 'cancelled'
        ? 'cancelled'
        : 'terminal'
  return {
    kind: 'found',
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    state: publicState,
    ...(effectGeneration === undefined ? {} : { effectGeneration }),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(projectedResult === undefined ? {} : { result: projectedResult }),
  }
}


function recoveryOuterState(
  row: RecoveryRow,
  status: Readonly<{ state: string }>,
): 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled' {
  if (status.state === 'cancelled') return 'cancelled'
  if (status.state === 'reconciliation_required') return 'reconciliation_required'
  return row.state === 'completed' ? 'completed' : 'pending'
}

type RecoveryAttempt = Readonly<{
  attemptRef: string
  effectGeneration: number
  outcome: Readonly<{ state: string; reconciliationRequiredAt?: string }>
}>

function reconciliationResult(
  row: RecoveryRow,
  status: PublicInvocationStatus,
  attemptRows: readonly RecoveryAttempt[],
  operationId: string,
): WorkerRecoveryResult {
  const currentAttemptRef = status.attempts.at(-1)?.attemptRef ?? row.attemptRef
  const attempt = attemptRows.find(({ attemptRef }) => attemptRef === currentAttemptRef) ?? attemptRows.at(-1)
  const requiredAt = attempt?.outcome.state === 'uncertain' || attempt?.outcome.state === 'timed_out'
    ? attempt.outcome.reconciliationRequiredAt ?? new Date().toISOString()
    : new Date().toISOString()
  return {
    kind: 'reconciliation_required',
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    evidence: {
      attemptRef: attempt?.attemptRef ?? currentAttemptRef ?? `operation-attempt:${row.invocationRef}:1`,
      effectGeneration: attempt?.effectGeneration ?? 1,
      requiredAt,
      retry: 'reconcile_before_retry',
      evidenceSource: `published-operation:${operationId}`,
    },
  }
}

type RecoveryOuterProjectionOptions = Readonly<{
  clearResult?: boolean
  clearWorkId?: boolean
  clearAttemptRef?: boolean
  clearEvidenceHash?: boolean
  clearDispatchState?: boolean
}>

async function projectRecoveryOuter(
  ctx: ActionCtx,
  row: RecoveryRow,
  result: WorkerRecoveryResult,
  stateOverride: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled' | undefined,
  options: RecoveryOuterProjectionOptions = {},
): Promise<void> {
  const state = stateOverride ?? (
    result.kind === 'found' && typeof result.state === 'string'
      ? recoveryOuterState(row, { state: result.state })
      : row.state
  )
  const clearResult = options.clearResult === true
    || (
      state === 'cancelled'
      && result.kind === 'found'
      && result.result === undefined
      && row.result?.kind === 'pending'
    )
  const clearWorkId = options.clearWorkId === true
  const clearAttemptRef = options.clearAttemptRef === true
  const clearEvidenceHash = options.clearEvidenceHash === true
  const clearDispatchState = options.clearDispatchState === true
  const projectedResult = clearResult
    ? undefined
    : result.kind === 'found' && result.result !== undefined
      ? result.result
      : result.kind === 'reconciliation_required'
        ? {
            kind: 'reconciliation_required' as const,

            invocationRef: result.invocationRef,
            operationRef: result.operationRef,
            evidence: result.evidence,
          }
        : undefined
  const projectedDispatchState = clearDispatchState
    ? undefined
    : state === 'cancelled' || state === 'refused'
      ? 'failed' as const
      : state === 'reconciliation_required'
        ? 'reconciliation_required' as const
        : state === 'completed'
          ? 'completed' as const
          : 'running' as const
  await ctx.runMutation(internal.capabilityOperationInvocations.projectRecovery, {
    invocationRef: row.invocationRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    state,
    ...(projectedResult === undefined ? {} : { result: projectedResult }),
    ...(clearAttemptRef ? {} : result.kind === 'found' && typeof result.attemptRef === 'string' ? { attemptRef: result.attemptRef } : {}),
    ...(projectedDispatchState === undefined ? {} : { dispatchState: projectedDispatchState }),
    clearResult,
    clearWorkId,
    clearAttemptRef,
    clearEvidenceHash,
    clearDispatchState,
    now: Date.now(),
  })
}

async function readCanonicalSnapshot(port: CanonicalPort, invocationRef: string, attemptRef: string): Promise<CanonicalClaimSnapshot | undefined> {
  const control = await port.readControl(invocationRef)
  if (control === undefined || control.currentAttemptRef !== attemptRef) return undefined
  const attempt = await port.readAttempt(invocationRef, attemptRef)
  return attempt === undefined ? undefined : { control, attempt }
}
async function finalizeOperationDispatch(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  snapshot: CanonicalClaimSnapshot,
  outcome: CanonicalTerminalOutcome,
  projection: OperationDispatchProjection,
  recordedAt: string,
): Promise<void> {
  const command = buildCanonicalTerminalOutcomeCommand({ snapshot, outcome, recordedAt })
  const persistedCommand = toOperationDispatchCommand(command)
  const result = await ctx.runMutation(internal.capabilityOperationInvocations.finalizeDispatch, {
    dispatch,
    command: persistedCommand,
    projection,
  })
  if (result.kind === 'refused') throw new Error(`operation_finalize_${result.code}`)
}

async function refuseBeforeClaim(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  code: string,
  retryable: boolean,
  nextAction?: string,
): Promise<WorkerResult> {
  const port = canonicalPort(ctx)
  const control = await port.readControl(dispatch.invocationRef)
  const attemptRef = control?.currentAttemptRef
  if (control !== undefined && attemptRef !== undefined) {
    const attempt = await port.readAttempt(dispatch.invocationRef, attemptRef)
    if (attempt !== undefined) {
      const snapshot = { control, attempt }
      if (control.control.control.state === 'leased' && attempt.release.state === 'possibly_released') {
        return await convergeReleaseFenceBeforeGates(ctx, dispatch, snapshot)
      }
      if (control.control.control.state === 'leased') {
        return await convergePreRelease(ctx, dispatch, snapshot, code, retryable, nextAction)
      }
      if (
        control.control.control.state === 'terminal'
        || control.control.control.state === 'reconciliation_required'
        || control.control.control.state === 'cancelled'
      ) return { kind: 'none' }
    }
  }
  await ctx.runMutation(internal.capabilityOperationInvocations.record, {
    invocationRef: dispatch.invocationRef,
    principalId: dispatch.principalId,
    state: 'refused',
    result: {
      kind: 'refused',
      operationRef: dispatch.operationRef,
      code,
      retryable,
      ...(nextAction === undefined ? {} : { nextAction }),
    },
    dispatchState: 'failed',
    now: Date.now(),
  })
  return { kind: 'recorded' }
}

async function convergeReleaseFenceBeforeGates(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  snapshot: CanonicalClaimSnapshot,
): Promise<WorkerResult> {
  const recordedAt = new Date().toISOString()
  const observation: RouteTransportObservation = {
    transport: 'unknown',
    disposition: 'unknown',
    releaseStarted: true,
    requestDigest: dispatch.inputDigest,
    failureCode: 'release_fence_replay',
  }
  await finalizeOperationDispatch(
    ctx,
    dispatch,
    snapshot,
    canonicalTerminalOutcome(observation, recordedAt),
    {
      state: 'reconciliation_required',
      result: {
        kind: 'reconciliation_required',
        invocationRef: dispatch.invocationRef,
        operationRef: dispatch.operationRef,
        evidence: {
          attemptRef: snapshot.attempt.attemptRef,
          effectGeneration: snapshot.attempt.effectGeneration,
          requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
          retry: 'reconcile_before_retry',
          evidenceSource: `operation:${dispatch.operationRef}`,
        },
      },
      attemptRef: snapshot.attempt.attemptRef,
      dispatchState: 'reconciliation_required',
    },
    recordedAt,
  )
  return { kind: 'recorded' }
}

async function convergePreRelease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  snapshot: CanonicalClaimSnapshot,
  code: string,
  retryable: boolean,
  nextAction?: string,
  settlement?: ChargeSettlementResult,
): Promise<WorkerResult> {
  const recordedAt = new Date().toISOString()
  const reconciliation = settlement?.kind === 'reconciliation_required'
  const observation: RouteTransportObservation = reconciliation
    ? {
        transport: 'unknown',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: dispatch.inputDigest,
        failureCode: nextAction === undefined ? code : `${code}:${nextAction}`,
      }
    : {
        transport: 'unknown',
        disposition: 'refused',
        releaseStarted: false,
        requestDigest: dispatch.inputDigest,
        failureCode: nextAction === undefined ? code : `${code}:${nextAction}`,
      }
  await finalizeOperationDispatch(
    ctx,
    dispatch,
    snapshot,
    canonicalTerminalOutcome(observation, recordedAt),
    reconciliation
      ? {
          state: 'reconciliation_required',
          result: {
            kind: 'reconciliation_required',
            invocationRef: dispatch.invocationRef,
            operationRef: dispatch.operationRef,
            evidence: {
              attemptRef: snapshot.attempt.attemptRef,
              effectGeneration: snapshot.attempt.effectGeneration,
              requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
              retry: 'reconcile_before_retry',
              evidenceSource: `operation:${dispatch.operationRef}`,
            },
          },
          attemptRef: snapshot.attempt.attemptRef,
          dispatchState: 'reconciliation_required',
        }
      : {
          state: 'refused',
          result: {
            kind: 'refused',
            operationRef: dispatch.operationRef,
            code,
            retryable,
            ...(nextAction === undefined ? {} : { nextAction }),
          },
          attemptRef: snapshot.attempt.attemptRef,
          dispatchState: 'failed',
        },
    recordedAt,
  )
  return { kind: 'recorded' }
}

async function reconcileAcceptedCharge(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  operation: PublishedOperation,
  charge: WorkerAcceptedCharge,
  attemptRef: string,
  outcome: 'not_released' | 'released' | 'unknown',
): Promise<ChargeSettlementResult> {
  const transactionRef = charge.transactionRef
  if (transactionRef === undefined) {
    return charge.chargeState === 'free_tier' && outcome !== 'unknown'
      ? { kind: 'settled', outcome }
      : { kind: 'reconciliation_required' }
  }
  const reconciliationDigest = canonicalDigest({
    format: 'operation-money-reconciliation:v1',
    invocationRef: dispatch.invocationRef,
    attemptRef,
    operationRef: dispatch.operationRef,
    inputDigest: dispatch.inputDigest,
    transactionRef,
    outcome,
    sourceDigest: operation.materialDigest,
  } as StableHashValue)
  const evidenceRefs = [
    ...operation.readiness.evidenceRefs,
    `operation-money-reconciliation:${reconciliationDigest}`,
  ]
  const now = Date.now()
  try {
    if (outcome === 'unknown') {
      await ctx.runMutation(internal.moneyLedger.markChargeOutcomeUnknown, {
        transactionRef,
        principalId: dispatch.principalId,
        now,
      })
      return { kind: 'reconciliation_required' }
    }
    const refundTransactionRef = `operation-money-refund:${dispatch.invocationRef}:${attemptRef}:1`
    const result = await ctx.runMutation(internal.moneyLedger.reconcileInvocationCharge, {
      invocationRef: dispatch.invocationRef,
      principalId: dispatch.principalId,
      credentialId: dispatch.credentialId,
      attemptRef,
      transactionRef,
      inputDigest: dispatch.inputDigest,
      outcome,
      refundTransactionRef,
      refundIdempotencyKey: refundTransactionRef,
      refundInputDigest: canonicalDigest({
        format: 'operation-money-refund:v1',
        invocationRef: dispatch.invocationRef,
        attemptRef,
        inputDigest: dispatch.inputDigest,
        transactionRef,
        outcome,
      } as StableHashValue),
      sourceDigest: operation.materialDigest,
      evidenceRefs,
      observedAt: now,
    })
    return result.kind === 'settled'
      ? { kind: 'settled', outcome }
      : { kind: 'reconciliation_required' }
  } catch {
    return { kind: 'reconciliation_required' }
  }
}
async function finalizeX402ExternalSpend(
  ctx: ActionCtx,
  identity: ExternalSpendIdentity,
  submissionStatus: 'not_submitted' | 'possibly_submitted' | 'observed' | 'unknown',
  settlementStatus: ExternalSpendSettlementStatus,
  paymentResponseDigest: string | undefined,
  evidenceRefs: readonly string[],
  providerReceiptDigest?: string,
): Promise<ExternalSpendSettlement> {
  const result = await ctx.runMutation(internal.moneyLedger.finalizeExternalInvocationSpend, {
    ...identity,
    submissionStatus,
    settlementStatus,
    ...(paymentResponseDigest === undefined ? {} : { paymentResponseDigest }),
    ...(providerReceiptDigest === undefined ? {} : { providerReceiptDigest }),
    evidenceRefs: [...evidenceRefs],
    observedAt: Date.now(),
  })
  if (result.kind !== 'accepted' || settlementStatus === 'unknown') {
    return { kind: 'reconciliation_required' }
  }
  return { kind: 'settled', settlementStatus }
}

async function bestEffortReleaseX402ExternalSpend(
  ctx: ActionCtx,
  identity: ExternalSpendIdentity,
  evidenceRefs: readonly string[],
): Promise<'released' | 'failed'> {
  try {
    const result = await finalizeX402ExternalSpend(
      ctx,
      identity,
      'not_submitted',
      'not_settled',
      undefined,
      evidenceRefs,
    )
    return result.kind === 'settled'
      && result.settlementStatus === 'not_settled'
      ? 'released'
      : 'failed'
  } catch {
    return 'failed'
  }
}

type X402AttemptSnapshotForMoney = Readonly<{
  reservationRef?: string
  selectedRequirementJson: string
  paymentIdentifier: string
  challengeDigest: string
  amountUnits: string
  currency: string
  exponent: number
}>

function x402ExternalSpendIdentityFromAttempt(
  dispatch: OpenDispatch,
  operation: PublishedOperation,
  attempt: X402AttemptSnapshotForMoney,
  attemptRef: string,
  effectGeneration: number,
): ExternalSpendIdentity | undefined {
  if (
    operation.binding.authority.kind !== 'provider_connection'
    || attempt.reservationRef === undefined
  ) return undefined
  const amount = exactAmountSchema.safeParse({
    currency: attempt.currency,
    units: attempt.amountUnits,
    exponent: attempt.exponent,
  })
  if (!amount.success) return undefined
  const identity = x402ExternalSpendIdentity({
    dispatch,
    attemptRef,
    effectGeneration,
    providerRef: operation.binding.authority.providerRef,
    paymentIdentifier: attempt.paymentIdentifier,
    challengeDigest: attempt.challengeDigest,
    selectedRequirementJson: attempt.selectedRequirementJson,
    amount: amount.data,
  })
  return identity.reservationRef === attempt.reservationRef ? identity : undefined
}


async function projectReconciliationRequired(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  attemptRef: string,
  recordedAt: string,
  effectGeneration = 1,
): Promise<void> {
  await ctx.runMutation(internal.capabilityOperationInvocations.record, {
    invocationRef: dispatch.invocationRef,
    principalId: dispatch.principalId,
    state: 'reconciliation_required',
    result: {
      kind: 'reconciliation_required',
      invocationRef: dispatch.invocationRef,
      operationRef: dispatch.operationRef,
      evidence: {
        attemptRef,
        effectGeneration,
        requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${dispatch.operationRef}`,
      },
    },
    attemptRef,
    dispatchState: 'reconciliation_required',
    now: Date.now(),
  })
}
function routeCallSigningKey(): Readonly<{ keyId: string; secret: string }> | undefined {
  const keyId = env.AE_ROUTE_CALL_SIGNING_KEY_ID
  const secret = env.AE_ROUTE_CALL_SIGNING_SECRET
  return keyId === undefined || secret === undefined ? undefined : { keyId, secret }
}

function routeInvocation(
  baseBinding: Readonly<{ adapterId: string; endpointUrl: string; authority: { kind: 'keyless' } | { kind: 'provider_connection'; connectionRef: string; providerRef: string }; configJson: string; configDigest: string }>,
  input: Record<string, unknown>,
  common: Readonly<{ attemptRef: string; effectGeneration: number; operationKeyDigest: string; mandateDigest: string; grantDigest: string; capabilityContractDigest: string; maximumSpend: ExactAmount; expiresAt: number; callIdentity: Readonly<{ keyId: string; signature: string }> }>,
  leaseRef: string | undefined,
  leaseAuthority: Readonly<{ authorityGeneration: number; authorityDigest: string; grantedScopes: readonly string[]; grantedResources: readonly string[] }> | undefined,
  invocationRef: string,
  operationRef: string,
  readinessValidUntil: number,
  readinessDigest: string,
  connectionAuthority: Readonly<{ connectionRef: string; providerRef: string; adapterId: string; authorityGeneration: number; authorityDigest: string }> | undefined,
): RouteTransportInvocation {
  const inputJson = JSON.stringify(input)
  if (baseBinding.authority.kind === 'keyless') {
    return {
      binding: baseBinding as KeylessRouteBinding,
      inputJson,
      authority: common,
    } as KeylessRouteInvocation
  }
  if (connectionAuthority === undefined || leaseAuthority === undefined || leaseRef === undefined) throw new Error('provider_lease_missing')
  return {
    binding: baseBinding as ProviderRouteBinding,
    inputJson,
    authority: {
      ...common,
      authorityGeneration: leaseAuthority.authorityGeneration,
      authorityDigest: leaseAuthority.authorityDigest,
      leaseRef,
      invocationRef,
      operationRef,
      grantedScopes: leaseAuthority.grantedScopes,
      grantedResources: leaseAuthority.grantedResources,
      readinessValidUntil,
      readinessDigest,
    },
  } as ProviderRouteInvocation
}
async function settleProviderLease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  operation: PublishedOperation,
  leaseRef: string | undefined,
  leaseAuthority: Readonly<{
    authorityGeneration: number
    authorityDigest: string
    leaseExpiresAt: number
  }> | undefined,
  releaseStarted: boolean,
  attemptRef = `operation-attempt:${dispatch.invocationRef}:1`,
  effectGeneration = 1,
): Promise<void> {
  if (leaseRef === undefined || leaseAuthority === undefined) return
  const commandPrefix = `operation-lease:${dispatch.invocationRef}:${attemptRef}:${effectGeneration}`
  const evidenceRefs = [...operation.readiness.evidenceRefs]
  const now = Date.now()
  if (releaseStarted) {
    const result = await ctx.runMutation(internal.capabilityProviderConnections.consumeLease, {
      leaseRef,
      commandId: `${commandPrefix}:consume`,
      expectedAuthorityGeneration: leaseAuthority.authorityGeneration,
      expectedAuthorityDigest: leaseAuthority.authorityDigest,
      readinessValidUntil: operation.readiness.validUntil,
      readinessDigest: operation.readiness.qualificationDigest,
      evidenceRefs,
      now,
    })
    if (result.kind === 'refused' && result.code === 'lease_expired') {
      await ctx.runMutation(internal.capabilityProviderConnections.expireLease, {
        leaseRef,
        commandId: `${commandPrefix}:expire`,
        evidenceRefs,
        now,
      })
    }
    return
  }
  if (now >= leaseAuthority.leaseExpiresAt) {
    await ctx.runMutation(internal.capabilityProviderConnections.expireLease, {
      leaseRef,
      commandId: `${commandPrefix}:expire`,
      evidenceRefs,
      now,
    })
    return
  }
  await ctx.runMutation(internal.capabilityProviderConnections.invalidateLease, {
    leaseRef,
    commandId: `${commandPrefix}:invalidate`,
    reasonCode: now >= operation.readiness.validUntil ? 'readiness_expired' : 'invocation_aborted',
    evidenceRefs,
    now,
  })
}


function providerCredentialReader(
  ctx: ActionCtx,
  connectionAuthority: Readonly<{ connectionRef: string; providerRef: string; adapterId: string; authorityGeneration: number; authorityDigest: string }>,
  dispatch: OpenDispatch,
): ProviderConnectionAuthorityReader {
  return async (lookup) => {
    if (
      lookup.leaseRef === undefined
      || lookup.invocationRef !== dispatch.invocationRef
      || lookup.operationRef !== dispatch.operationRef
      || lookup.connectionRef !== connectionAuthority.connectionRef
      || lookup.providerRef !== connectionAuthority.providerRef
      || lookup.authorityGeneration !== connectionAuthority.authorityGeneration
      || lookup.authorityDigest !== connectionAuthority.authorityDigest
      || lookup.grantedScopes === undefined
      || lookup.grantedResources === undefined
      || lookup.readinessValidUntil === undefined
    ) return { kind: 'unavailable' as const, reason: 'lease_identity_mismatch' as const }
    const authorityExpiresAt = dispatch.authority?.expiresAt
    if (authorityExpiresAt === undefined || Date.parse(authorityExpiresAt) <= Date.now()) {
      return { kind: 'unavailable' as const, reason: 'lease_expired' as const }
    }
    const authority = await ctx.runQuery(internal.capabilityOperationInvocations.readProviderLeaseAuthority, {
      connectionRef: lookup.connectionRef,
      authorityGeneration: lookup.authorityGeneration,
    })
    if (authority === null || authority.providerRef !== connectionAuthority.providerRef) return { kind: 'unavailable' as const, reason: 'connection_not_found' as const }
    return await ctx.runQuery(internal.capabilityProviderConnections.resolveLeaseCredentialRef, {
      leaseRef: lookup.leaseRef,
      connectionRef: lookup.connectionRef,
      invocationRef: lookup.invocationRef,
      operationRef: lookup.operationRef,
      providerRef: lookup.providerRef,
      providerAccountRef: authority.providerAccountRef,
      adapterId: lookup.adapterId,
      authorityGeneration: lookup.authorityGeneration,
      authorityDigest: lookup.authorityDigest,
      grantedScopes: [...lookup.grantedScopes],
      grantedResources: [...lookup.grantedResources],
      readinessValidUntil: lookup.readinessValidUntil,
      ...(lookup.readinessDigest === undefined ? {} : { readinessDigest: lookup.readinessDigest }),
      now: Date.now(),
    })
  }
}
function providerLeaseAuthorityValidator(
  ctx: ActionCtx,
  connectionAuthority: Readonly<{
    connectionRef: string
    providerRef: string
    adapterId: string
    authorityGeneration: number
    authorityDigest: string
  }>,
  dispatch: OpenDispatch,
): ProviderConnectionAuthorityValidator {
  return async (lookup) => {
    if (
      lookup.leaseRef === undefined
      || lookup.invocationRef !== dispatch.invocationRef
      || lookup.operationRef !== dispatch.operationRef
      || lookup.connectionRef !== connectionAuthority.connectionRef
      || lookup.providerRef !== connectionAuthority.providerRef
      || lookup.adapterId !== connectionAuthority.adapterId
      || lookup.authorityGeneration !== connectionAuthority.authorityGeneration
      || lookup.authorityDigest !== connectionAuthority.authorityDigest
      || lookup.grantedScopes === undefined
      || lookup.grantedResources === undefined
      || lookup.readinessValidUntil === undefined
    ) return { kind: 'unavailable' as const, reason: 'lease_identity_mismatch' as const }
    const authorityExpiresAt = dispatch.authority?.expiresAt
    if (authorityExpiresAt === undefined || Date.parse(authorityExpiresAt) <= Date.now()) {
      return { kind: 'unavailable' as const, reason: 'lease_expired' as const }
    }
    return await ctx.runQuery(internal.capabilityProviderConnections.validateLeaseAuthority, {
      leaseRef: lookup.leaseRef,
      connectionRef: lookup.connectionRef,
      invocationRef: lookup.invocationRef,
      operationRef: lookup.operationRef,
      providerRef: lookup.providerRef,
      adapterId: lookup.adapterId,
      authorityGeneration: lookup.authorityGeneration,
      authorityDigest: lookup.authorityDigest,
      grantedScopes: [...lookup.grantedScopes],
      grantedResources: [...lookup.grantedResources],
      readinessValidUntil: lookup.readinessValidUntil,
      ...(lookup.readinessDigest === undefined ? {} : { readinessDigest: lookup.readinessDigest }),
      now: Date.now(),
    })
  }
}
async function readX402Authorization(
  ctx: ActionCtx,
  prepared: X402PreparedAuthorization,
  byDigest: boolean,
  expected: Readonly<{
    credentialRef: string
    dispatchRef: string
    attemptRef: string
    effectGeneration: number
    paymentIdentifier: string
  }>,
): Promise<string | undefined> {
  const material = byDigest
    ? await ctx.runQuery(
        internal.customerRequestRouteExecution.readX402PaymentAuthorizationByDigest,
        prepared,
      )
    : await ctx.runQuery(
        internal.customerRequestRouteExecution.readX402PaymentAuthorization,
        prepared,
      )
  if (
    material === null
    || material.state !== 'prepared'
    || material.credentialRef !== expected.credentialRef
    || material.dispatchRef !== expected.dispatchRef
    || material.attemptRef !== expected.attemptRef
    || material.effectGeneration !== expected.effectGeneration
    || material.paymentIdentifier !== expected.paymentIdentifier
  ) return undefined
  const credential = credentialFromEnvironment(material.credentialRef)
  if (credential === undefined || credential.trim().length === 0) return undefined
  try {
    const challenge = JSON.parse(material.challengeJson) as X402PaymentSignatureRequest['challenge']
    const selectedRequirement = JSON.parse(
      material.selectedRequirementJson,
    ) as X402PaymentSignatureRequest['selectedRequirement']
    if (canonicalDigest(challenge as StableHashValue) !== material.challengeDigest) return undefined
    return await createEvmX402PaymentSignature({
      challenge,
      credential,
      paymentIdentifier: material.paymentIdentifier,
      selectedRequirement,
    })
  } catch {
    return undefined
  }
}
export async function projectOuterResult(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  operation: PublishedOperation,
  descriptor: RuntimePublishedOperationDescriptor,
  observation: RouteTransportObservation,
  recordedAt: string,
  money?: WorkerAcceptedCharge,
  settlement?: ChargeSettlementResult,
  attemptRef = `operation-attempt:${dispatch.invocationRef}:1`,
  effectGeneration = 1,
  validatedOutput?: ContractOutputValidation,
  retainedSnapshot?: CanonicalClaimSnapshot,
): Promise<void> {
  const outputValidation = validatedOutput ?? parseContractOutput(observation, descriptor)
  const snapshot = retainedSnapshot ?? await readCanonicalSnapshot(canonicalPort(ctx), dispatch.invocationRef, attemptRef)
  if (snapshot === undefined) throw new Error('operation_terminal_snapshot_missing')
  const settlementOutcome = settlement?.kind === 'settled'
    ? settlement.outcome
    : settlement?.kind === 'reconciliation_required'
      ? 'unknown'
      : undefined
  const requiresReconciliation = (
    settlement?.kind === 'reconciliation_required'
    || observation.disposition === 'unknown'
    || observation.disposition === 'partial'
    || (
      outputValidation.valid
      && observation.releaseStarted
      && (settlement?.kind !== 'settled' || settlement.outcome !== 'released')
    )
    || (outputValidation.valid && observation.outputJson === undefined)
    || (
      observation.releaseStarted
      && !outputValidation.valid
      && (settlement?.kind !== 'settled' || settlement.outcome !== 'not_released')
    )
  )
  if (requiresReconciliation) {
    await finalizeOperationDispatch(
      ctx,
      dispatch,
      snapshot,
      canonicalTerminalOutcome(
        observation,
        recordedAt,
        outputValidation.valid,
        settlementOutcome,
      ),
      {
        state: 'reconciliation_required',
        result: {
          kind: 'reconciliation_required',
          invocationRef: dispatch.invocationRef,
          operationRef: dispatch.operationRef,
          evidence: {
            attemptRef,
            effectGeneration,
            requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
            retry: 'reconcile_before_retry',
            evidenceSource: `operation:${dispatch.operationRef}`,
          },
        },
        attemptRef,
        dispatchState: 'reconciliation_required',
      },
      recordedAt,
    )
    return
  }
  if (outputValidation.valid && observation.outputJson !== undefined && settlement?.kind === 'settled' && settlement.outcome === 'released' && observation.releaseStarted) {
    const evidenceHash = observation.responseDigest ?? canonicalDigest(observation.outputJson)
    const usage = money === undefined
      ? descriptor.price.kind !== 'fixed'
        ? undefined
        : {
            usageRef: `operation-x402-payment:${dispatch.invocationRef}:${attemptRef}`,
            observedAt: Date.parse(recordedAt),
            chargeState: 'paid' as const,
            amount: descriptor.price.amount,
            priceDigest: pricingConfigDigest({ version: 'pricing:v2', unit: 'call', paidAmount: descriptor.price.amount }),
          }
      : {
          usageRef: money.usageRef,
          observedAt: money.observedAt,
          chargeState: money.chargeState,
          amount: money.amount,
          priceDigest: money.priceDigest,
          ...(money.transactionRef === undefined ? {} : { transactionRef: money.transactionRef }),
        }
    if (usage === undefined) {
      await finalizeOperationDispatch(
        ctx,
        dispatch,
        snapshot,
        canonicalTerminalOutcome({
          transport: 'unknown',
          disposition: 'unknown',
          releaseStarted: true,
          requestDigest: observation.requestDigest,
          failureCode: 'usage_missing',
        }, recordedAt),
        {
          state: 'reconciliation_required',
          result: {
            kind: 'reconciliation_required',
            invocationRef: dispatch.invocationRef,
            operationRef: dispatch.operationRef,
            evidence: {
              attemptRef,
              effectGeneration,
              requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
              retry: 'reconcile_before_retry',
              evidenceSource: `operation:${dispatch.operationRef}`,
            },
          },
          attemptRef,
          dispatchState: 'reconciliation_required',
        },
        recordedAt,
      )
      return
    }
    await ctx.runMutation(internal.qualifiedUse.recordQualifiedUse, {
      invocationRef: dispatch.invocationRef,
      attemptRef,
      effectGeneration,
      businessId: operation.identity.businessId,
      operationRef: dispatch.operationRef,
      publicationRef: operation.identity.publicationRef,
      publicationRevision: operation.identity.publicationRevision,
      contractDigest: operation.identity.contractDigest,
      bindingDigest: operation.identity.bindingDigest,
      principalClass: 'agent_key',
      requestDigest: observation.requestDigest,
      responseDigest: evidenceHash,
      evidenceRefs: [`operation:${dispatch.operationRef}`, `attempt:${attemptRef}`],
      principalId: dispatch.principalId,
      environment: dispatch.environment,
      qualifiedAt: Date.parse(recordedAt),
      usageRef: usage.usageRef,
      ...(usage.transactionRef === undefined ? {} : { transactionRef: usage.transactionRef }),
    })
    await finalizeOperationDispatch(
      ctx,
      dispatch,
      snapshot,
      canonicalTerminalOutcome(observation, recordedAt, true, settlementOutcome),
      {
        state: 'completed',
        result: {
          kind: 'completed',
          invocationRef: dispatch.invocationRef,
          operationRef: dispatch.operationRef,
          output: outputValidation.output,
          evidenceHash,
          usage,
        },
        usage,
        evidenceHash,
        attemptRef,
        dispatchState: 'completed',
      },
      recordedAt,
    )
    return
  }
  await finalizeOperationDispatch(
    ctx,
    dispatch,
    snapshot,
    canonicalTerminalOutcome(observation, recordedAt, outputValidation.valid, settlementOutcome),
    {
      state: 'refused',
      result: {
        kind: 'refused',
        operationRef: dispatch.operationRef,
        code: observation.failureCode ?? 'provider_refused',
        retryable: false,
      },
      attemptRef,
      dispatchState: 'failed',
    },
    recordedAt,
  )
}

function parseContractOutput(
  observation: RouteTransportObservation,
  descriptor: RuntimePublishedOperationDescriptor,
): ContractOutputValidation {
  if (observation.disposition !== 'succeeded' || observation.outputJson === undefined) return { valid: false }
  try {
    const output: unknown = JSON.parse(observation.outputJson)
    return isBoundedJsonValue(output) && descriptor.validateOutput(output)
      ? { valid: true, output }
      : { valid: false }
  } catch {
    return { valid: false }
  }
}

function canonicalTerminalOutcome(
  observation: RouteTransportObservation,
  recordedAt: string,
  contractValidOutput = true,
  deliveryOutcome?: 'not_released' | 'released' | 'unknown',
): CanonicalTerminalOutcome {
  const evidenceDigest = transportObservationDigest(observation)
  if (deliveryOutcome === 'unknown') {
    return {
      kind: 'uncertain',
      errorDigest: evidenceDigest,
      reconciliationRequiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
      release: 'possibly_released',
    }
  }
  if (
    deliveryOutcome === 'not_released'
    && observation.disposition === 'succeeded'
    && !contractValidOutput
  ) {
    return { kind: 'failed', errorDigest: evidenceDigest, release: 'not_released' }
  }
  if (
    observation.disposition === 'succeeded'
    && observation.outputJson !== undefined
    && contractValidOutput
    && !observation.releaseStarted
  ) {
    return { kind: 'failed', errorDigest: evidenceDigest, release: 'not_released' }
  }
  if (
    observation.disposition === 'succeeded'
    && observation.outputJson !== undefined
    && contractValidOutput
  ) {
    return {
      kind: 'returned',
      businessOutcome: 'operation_succeeded',
      resultRef: `operation-result:v1:${evidenceDigest}`,
      resultDigest: evidenceDigest,
      resultReferenceable: true,
      release: 'released',
    }
  }
  if (
    observation.disposition === 'succeeded'
    && observation.outputJson !== undefined
    && !contractValidOutput
    && !observation.releaseStarted
  ) {
    return { kind: 'failed', errorDigest: evidenceDigest, release: 'not_released' }
  }
  if (observation.disposition === 'refused' && !observation.releaseStarted) {
    return { kind: 'failed', errorDigest: evidenceDigest, release: 'not_released' }
  }
  return {
    kind: 'uncertain',
    errorDigest: evidenceDigest,
    reconciliationRequiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
    release: 'possibly_released',
  }
}


function errorName(error: unknown): string {
  return error instanceof Error && error.name.trim().length > 0 ? error.name : 'unknown'
}
