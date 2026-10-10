"use node";

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  buildCanonicalClaimCommand,
  type CanonicalClaimInput,
} from '@/modules/action-execution/runtime'
import {
  cdpX402CustodyConfigurationFromEnvironment,
  economicRailForCall,
  signRouteTransportCall,
  type EconomicRail,
} from '@/modules/capability-supply/server'
import {
  normalizePricingConfig,
  pricingConfigDecisionAmount,
  pricingConfigDigest,
} from '@/modules/money/public'
import {
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  type RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/public'
import { type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import { canonicalPort, readCanonicalSnapshot } from '../../../../convex/lib/capabilityExecution/callProjection/port'
import { projectReconciliationRequired } from '../../../../convex/lib/capabilityExecution/callProjection/recovery'
import { toCallDispatchCommand } from '../call-projection/dispatch-command'
import type { OpenDispatch } from '@/modules/capability-execution/call-projection/contracts'
import { callAttemptIdentityDigest, validateCallAuthority } from '../../../../convex/capabilityCallIdentity'
import {
  convergePreRelease,
  convergeReleaseFenceBeforeGates,
  refuseBeforeClaim,
} from './charge'
import {
  type ConnectionAuthority,
} from './lease'
import { routeCallSigningKey } from './x402Route'
import {
  gateEnvironmentBeforeClaim,
  gateGrantValidityBeforeClaim,
  gatePrincipalIdentityBeforeClaim,
  gatePublishedSnapshotBeforeClaim,
} from './call-execution-gates'

export {
  acceptedCallGrantAfterLimitUpdateRef,
  callPrincipalIdentityMatches,
  type CallPrincipalIdentity,
} from './call-execution-gates'

export async function prepareCallRun(
  ctx: ActionCtx,
  args: Readonly<{ callRef: string }>,
) {
  const opened = await ctx.runQuery(internal.capabilityCalls.openDispatch, args)
  if (opened === null) return { kind: 'none' as const }
  const dispatch = opened as OpenDispatch
  if (dispatch.state !== 'pending') return { kind: 'none' as const }
  if (dispatch.dispatchState === 'completed' || dispatch.dispatchState === 'reconciliation_required') {
    return { kind: 'none' as const }
  }
  const port = canonicalPort(ctx)
  const initialControl = await port.readControl(dispatch.callRef)
  const initialAttempt = initialControl?.currentAttemptRef === undefined
    ? undefined
    : await port.readAttempt(dispatch.callRef, initialControl.currentAttemptRef)
  const initialSnapshot = initialControl === undefined || initialAttempt === undefined
    ? undefined
    : { control: initialControl, attempt: initialAttempt }
  const initialCanonicalControl = initialControl?.control?.control
  const initialCanonicalState = initialCanonicalControl?.state
  if (initialCanonicalState === 'terminal' || initialCanonicalState === 'reconciliation_required') {
    if (dispatch.state === 'pending') {
      await projectReconciliationRequired(
        ctx,
        dispatch,
        initialControl?.currentAttemptRef ?? dispatch.attemptRef ?? `operation-attempt:${dispatch.callRef}:1`,
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

  const dispatchEnvironmentRefusal = await gateEnvironmentBeforeClaim(ctx, { phase: 'dispatch', dispatch })
  if (dispatchEnvironmentRefusal !== null) return dispatchEnvironmentRefusal

  const principalIdentity = await gatePrincipalIdentityBeforeClaim(ctx, dispatch)
  if (!('principal' in principalIdentity)) return principalIdentity
  const { dispatchedCredentialId, principal } = principalIdentity

  const grantResult = await gateGrantValidityBeforeClaim(ctx, dispatch)
  if ('kind' in grantResult) return grantResult
  const grant = grantResult
  // The canonical claim is bound to the credential the Call was admitted under,
  // not to whichever credential is dispatching now: the outer claim gate checks
  // the attempt actor against the stored Call, and the effect must stay
  // attributable to the credential that bought it.
  const actor = { callerRef: dispatch.credentialId, principalRef: dispatch.principalId }
  const initialAttemptRef = `operation-attempt:${dispatch.callRef}:1`
  const leaseOwner = `operation-worker:${dispatch.callRef}`

  const currentSnapshot = await ctx.runQuery(internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot, {
    toolRef: dispatch.toolRef,
  })
  const reservedOperation = parsePublishedToolSnapshot(dispatch.toolJson)
  const currentOperation = currentSnapshot === null
    ? undefined
    : parsePublishedToolSnapshot(currentSnapshot.toolJson)
  if (reservedOperation !== undefined && currentOperation !== undefined) {
    const publishedToolsEnvironmentRefusal = await gateEnvironmentBeforeClaim(ctx, {
      phase: 'published_tools',
      dispatch,
      reservedOperation,
      currentOperation,
    })
    if (publishedToolsEnvironmentRefusal !== null) return publishedToolsEnvironmentRefusal
  }
  const publishedSnapshotRefusal = await gatePublishedSnapshotBeforeClaim(ctx, {
    dispatch,
    currentSnapshot,
    reservedOperation,
    currentOperation,
  })
  if (publishedSnapshotRefusal !== null) return publishedSnapshotRefusal
  if (currentOperation === undefined || currentOperation === null) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'The admitted operation snapshot is invalid.')
  }
  const operation = currentOperation
  let descriptor: RuntimePublishedToolDescriptor
  let input: Record<string, unknown>
  try {
    descriptor = materializeRuntimePublishedTool(operation)
    const parsedInput: unknown = JSON.parse(dispatch.inputJson)
    if (!isBoundedJsonValue(parsedInput) || !isRecord(parsedInput)) throw new Error('input_invalid')
    input = parsedInput
  } catch (cause) {
    return degradeBackend(
      cause,
      await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'The admitted operation snapshot is invalid.'),
      { site: 'prepareCallRun', reason: 'invalid_response' },
    )
  }
  const principalToolEnvironmentRefusal = await gateEnvironmentBeforeClaim(ctx, {
    phase: 'principal_tool',
    dispatch,
    principal,
    operation,
  })
  if (principalToolEnvironmentRefusal !== null) return principalToolEnvironmentRefusal
  if (!descriptor.validateInput(input)) return await refuseBeforeClaim(ctx, dispatch, 'input_invalid', false)
  const isX402 = operation.identity.adapterId === 'x402-fetch:v2'
  const economicRail: EconomicRail = economicRailForCall({ isX402 })
  if (
    economicRail === 'brokered_x402'
    && cdpX402CustodyConfigurationFromEnvironment() === undefined
  ) {
    return await refuseBeforeClaim(
      ctx,
      dispatch,
      'provider_refused',
      false,
      'Managed x402 payment custody is unavailable.',
    )
  }
  if (isX402 && operation.binding.authority.kind !== 'provider_connection') {
    return await refuseBeforeClaim(ctx, dispatch, 'provider_refused', false, 'x402 payment requires provider connection custody.')
  }
  if (operation.readiness.validUntil <= Date.now()) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'Only Operations with current readiness are executable on this worker.')
  }
  const normalizedPricing = normalizePricingConfig(operation.identity.pricingConfig)
  if (normalizedPricing.kind === 'invalid') {
    return await refuseBeforeClaim(ctx, dispatch, normalizedPricing.code, false, 'The published pricing configuration is invalid.')
  }
  const pricingConfig = normalizedPricing.config
  const expectedPriceDigest = pricingConfigDigest(pricingConfig)
  if (operation.priceDigest !== expectedPriceDigest || operation.identity.priceDigest !== expectedPriceDigest) {
    return await refuseBeforeClaim(ctx, dispatch, 'price_changed', false, 'The published price changed; retry discovery.')
  }
  const pricingAmount = pricingConfig.kind === 'fixed_aud'
    ? pricingConfigDecisionAmount(pricingConfig)
    : undefined
  if (economicRail === 'brokered_x402') {
    if (pricingConfig.kind !== 'managed_x402' || dispatch.quoteRef === undefined) {
      return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'Inspect this managed Operation to obtain a current Commitment before invoking it.')
    }
  } else {
    if (pricingConfig.kind !== 'fixed_aud' || pricingAmount === undefined) {
      return await refuseBeforeClaim(ctx, dispatch, 'price_changed', false, 'The published price changed; retry discovery.')
    }
  }
  const authoritySnapshot = operation.connectionAuthority ?? operation.identity.connectionAuthority
  const connectionAuthority: ConnectionAuthority | undefined = operation.binding.authority.kind === 'provider_connection'
    ? authoritySnapshot
    : undefined
  let isCredentiallessX402Connection = false
  if (operation.binding.authority.kind === 'provider_connection') {
    if (
      connectionAuthority === undefined
      || connectionAuthority.connectionRef !== operation.binding.authority.connectionRef
      || connectionAuthority.providerRef !== operation.binding.authority.providerRef
      || connectionAuthority.adapterId !== operation.binding.adapter.adapterId
    ) return await refuseBeforeClaim(ctx, dispatch, 'provider_refused', false, 'Provider connection authority is stale.')
    const currentConnection = await ctx.runQuery(
      internal.capabilityCalls.readCurrentProviderConnectionAuthority,
      {
        connectionRef: connectionAuthority.connectionRef,
        providerRef: connectionAuthority.providerRef,
        adapterId: connectionAuthority.adapterId,
        authorityGeneration: connectionAuthority.authorityGeneration,
        authorityDigest: connectionAuthority.authorityDigest,
        resourceUrl: operation.binding.endpointUrl,
        now: Date.now(),
      },
    )
    if (currentConnection === null) {
      return await refuseBeforeClaim(ctx, dispatch, 'provider_refused', false, 'Provider connection authority is stale.')
    }
    isCredentiallessX402Connection = currentConnection.kind === 'credentialless_x402'
    if (!isCredentiallessX402Connection) {
      const approval = await ctx.runQuery(internal.capabilityCalls.readProviderLeaseAuthority, {
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
  }
  const authorityGrant = {
    grantRef: grant.grantRef,
    generation: grant.generation,
    policyDigest: grant.spendingPolicyDigest,
    expiresAt: grant.expiresAt,
  }
  const authorityMaximumSpend = validateCallAuthority({
    authority: dispatch.authority,
    dispatch,
    grant: authorityGrant,
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
  const priced = normalizePricingConfig(operation.pricingConfig)
  if (
    principal.authorityMode === 'approval_required'
    && dispatch.x402RequirementDigest !== undefined
    && priced.kind === 'valid'
    && priced.config.kind === 'managed_x402'
  ) {
    const quotedInput = JSON.parse(dispatch.inputJson) as Record<string, never>
    const probe = await ctx.runAction(internal.capabilityCallLiveX402.probeApprovedManagedX402, {
      callRef: dispatch.callRef,
      toolRef: dispatch.toolRef,
      input: quotedInput,
      principal: { ...principal, scopes: [...principal.scopes] },
      expectedDigest: dispatch.x402RequirementDigest,
    })
    if (probe.kind === 'pending') return { kind: 'none' as const }
    if (probe.kind !== 'matched') {
      return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The live x402 requirement does not match the quote.')
    }
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
      ? `operation-attempt:${dispatch.callRef}:${retryAttempt.attemptNumber + 1}`
      : initialAttemptRef
    const claimAttemptNumber = retrying ? retryAttempt.attemptNumber + 1 : 1
    const claimEffectGeneration = retrying ? retryAttempt.effectGeneration + 1 : 1
    const claimExecutionVersion = retrying ? existingControl!.executionVersion + 1 : 1
    const expectedExecutionVersion = retrying ? existingControl!.executionVersion : null
    const claimInput: CanonicalClaimInput = {
      executionRef: dispatch.callRef,
      sourceRef: `operation-invocation-source:${dispatch.callRef}`,
      executionVersion: claimExecutionVersion,
      expectedExecutionVersion,
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
        operationKey: dispatch.toolRef,
        leaseOwner,
        leaseExpiresAt: authorityExpiresAt,
      },
      recordedAt: new Date(Date.now()).toISOString(),
    }
    const claimCommand = buildCanonicalClaimCommand(claimInput)
    const persistedClaimCommand = toCallDispatchCommand(claimCommand)
    const claimResult = await ctx.runMutation(internal.capabilityCalls.claimDispatch, {
      dispatch: { ...dispatch, dispatchedCredentialId },
      command: persistedClaimCommand,
    })
    if (claimResult.kind === 'refused') {
      return { kind: 'none' as const }
    }
    claimed = await readCanonicalSnapshot(port, dispatch.callRef, claimAttemptRef)
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
  const operationKeyDigest = callAttemptIdentityDigest({
    callRef: dispatch.callRef,
    principalId: dispatch.principalId,
    credentialId: dispatch.credentialId,
    applicationRef: dispatch.applicationRef,
    environment: dispatch.environment,
    toolRef: dispatch.toolRef,
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
    dispatchRef: dispatch.callRef,
    attemptRef: durableAttemptRef,
    effectGeneration: durableEffectGeneration,
    operationKeyDigest,
    mandateDigest: canonicalDigest(authorityBasis as StableHashValue),
    grantDigest: grant.spendingPolicyDigest,
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
    // Rotation evidence: `dispatch.credentialId` is the credential the Call was
    // admitted under, `dispatchedCredentialId` the one authorising this
    // dispatch. They differ only across a rotation. The claim call site above
    // threads `dispatchedCredentialId` onto the persisted Call row alongside
    // the original `credentialId`.
    dispatchedCredentialId,
    grant,
    operation,
    descriptor,
    input,
    isX402,
    economicRail,
    pricingConfig,
    connectionAuthority,
    isCredentiallessX402Connection,
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

export type CallPreparation = Awaited<ReturnType<typeof prepareCallRun>>
