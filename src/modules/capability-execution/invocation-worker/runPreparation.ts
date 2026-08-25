"use node";

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  buildCanonicalClaimCommand,
  type CanonicalClaimInput,
} from '@/modules/action-invocation/runtime'
import {
  paymentLaneAdmission,
  signRouteTransportCall,
  type EconomicRail,
} from '@/modules/capability-supply/server'
import {
  compareExactAmounts,
  normalizePricingConfig,
  pricingConfigDigest,
  readExactAmount,
} from '@/modules/money/public'
import {
  materializeRuntimePublishedOperation,
  parsePublishedOperationSnapshot,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import { currentOperationCommitmentsMatch } from '../current-operation-commitment'
import {
  isPrincipalEnvironmentCompatibleWithOperation,
  operationEnvironmentMismatchNextAction,
} from '@/modules/capability-execution/operation-invoke-contracts'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import {
  canonicalPort,
  projectReconciliationRequired,
  readCanonicalSnapshot,
  toOperationDispatchCommand,
  type OpenDispatch,
} from '../../../../convex/capabilityOperationInvocationProjection'
import { operationInvocationAttemptIdentityDigest, validateOperationInvokeAuthority } from '../../../../convex/capabilityOperationInvocationIdentity'
import {
  convergePreRelease,
  convergeReleaseFenceBeforeGates,
  refuseBeforeClaim,
} from './charge'
import {
  type ConnectionAuthority,
} from './lease'
import { routeCallSigningKey } from './x402Route'

export async function prepareInvocationRun(
  ctx: ActionCtx,
  args: Readonly<{ invocationRef: string }>,
) {
  const opened = await ctx.runQuery(internal.capabilityOperationInvocations.openDispatch, args)
  if (opened === null) return { kind: 'none' as const }
  const dispatch = opened as OpenDispatch
  const port = canonicalPort(ctx)
  const initialControl = await port.readControl(dispatch.invocationRef)
  const initialAttempt = initialControl?.currentAttemptRef === undefined
    ? undefined
    : await port.readAttempt(dispatch.invocationRef, initialControl.currentAttemptRef)
  const initialSnapshot = initialControl === undefined || initialAttempt === undefined
    ? undefined
    : { control: initialControl, attempt: initialAttempt }
  if (dispatch.state === 'cancelled') return { kind: 'none' as const }
  if (dispatch.dispatchState === 'completed' || dispatch.dispatchState === 'reconciliation_required') {
    return { kind: 'none' as const }
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
    return { kind: 'none' as const }
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
  if (!currentOperationCommitmentsMatch({
    operationRef: dispatch.operationRef,
    pinned: reservedOperation,
    current: currentOperation,
  })) {
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
  const economicRail: EconomicRail = isX402
    ? dispatch.environment === 'production' ? 'brokered_x402' : 'provider_direct_x402'
    : 'ae_internal'
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
  const normalizedPricing = normalizePricingConfig(operation.identity.pricingConfig)
  if (normalizedPricing.kind === 'invalid') {
    return await refuseBeforeClaim(ctx, dispatch, normalizedPricing.code, false, 'The published pricing configuration is invalid.')
  }
  const pricingConfig = normalizedPricing.config
  const pricingAmount = readExactAmount(pricingConfig.paidAmount)
  const descriptorAmount = readExactAmount(descriptor.price.amount)
  const expectedPriceDigest = pricingConfigDigest(pricingConfig)
  if (
    pricingAmount === undefined
    || descriptorAmount === undefined
    || compareExactAmounts(pricingAmount, descriptorAmount) !== 0
    || operation.priceDigest !== expectedPriceDigest
    || operation.identity.priceDigest !== expectedPriceDigest
  ) {
    return await refuseBeforeClaim(ctx, dispatch, 'price_changed', false, 'The published price changed; retry discovery.')
  }
  if (
    economicRail === 'brokered_x402'
    && (pricingConfig.providerAmount === undefined || pricingConfig.platformFee === undefined)
  ) {
    return await refuseBeforeClaim(ctx, dispatch, 'rake_not_configured', false, 'Brokered x402 requires an explicit provider amount and platform fee.')
  }

  const authoritySnapshot = operation.connectionAuthority ?? operation.identity.connectionAuthority
  const connectionAuthority: ConnectionAuthority | undefined = operation.binding.authority.kind === 'provider_connection'
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
  let claimed = retainedClaim
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
      return { kind: 'none' as const }
    }
    claimed = await readCanonicalSnapshot(port, dispatch.invocationRef, claimAttemptRef)
  }
  if (claimed === undefined) return { kind: 'none' as const }
  const durableAttemptRef = claimed.attempt.attemptRef
  const durableEffectGeneration = claimed.attempt.effectGeneration
  if (claimed.control.control.control.state === 'cancelled') return { kind: 'none' as const }

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

  return {
    kind: 'prepared' as const,
    dispatch,
    port,
    principal,
    grant,
    operation,
    descriptor,
    input,
    isX402,
    economicRail,
    pricingConfig,
    connectionAuthority,
    authorityMaximumSpend,
    persistedAuthority,
    authorityBasis,
    authorityExpiresAt,
    claimed,
    durableAttemptRef,
    durableEffectGeneration,
    operationKeyDigest,
    baseBinding,
    callIdentity,
  }
}

export type InvocationPreparation = Awaited<ReturnType<typeof prepareInvocationRun>>
