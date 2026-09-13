"use node";

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { resolveServiceMode, serviceModeAllowsEnvironment } from '@/lib/deployment/service-mode'
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
  paymentLaneAdmission,
  signRouteTransportCall,
  validSellerCanaryPayee,
  type EconomicRail,
  type X402ExecutionContext,
} from '@/modules/capability-supply/server'
import {
  compareExactAmounts,
  normalizePricingConfig,
  pricingConfigDecisionAmount,
  pricingConfigDigest,
} from '@/modules/money/public'
import {
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  type PublishedTool,
  type RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/public'
import { currentToolQuotesMatch } from '../current-tool-quote'
import {
  isPrincipalEnvironmentCompatibleWithTool,
  toolEnvironmentMismatchNextAction,
} from '@/modules/capability-execution/call-contracts'
import {
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
  type SellerOnboardingCanaryExecutionEnvelope,
} from '@/modules/capability-supply/public'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { env, type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import {
  canonicalPort,
  projectReconciliationRequired,
  readCanonicalSnapshot,
  toCallDispatchCommand,
  type OpenDispatch,
} from '../../../../convex/capabilityCallProjection'
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

export type SellerCanaryOperationSnapshot = Readonly<{
  toolJson: string
  toolRef: string
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  accessPathRef: string
  accessPathSourceHash: string
  publicationRef: string
  publicationRevision: number
  sellerPayTo: string
  sellerClaimDigest: string
  readinessDigest: string
  readinessObservedAt: number
  readinessValidUntil: number
}>

/** The four stable fields a Call is identified by. The credential is not one of
 * them: it rotates while the Call keeps the credential it was admitted under. */
export type CallPrincipalIdentity = Readonly<{
  principalId: string
  ownerId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
}>

/** Worker-local mirror of `callIdentityMatches`
 * (`convex/lib/callLifecycle/callActions.ts`). That module registers Convex
 * actions and is not importable here without dragging the action runtime into
 * the worker bundle, so the tuple - four comparisons, no logic - is restated. */
export function callPrincipalIdentityMatches(
  row: CallPrincipalIdentity | null,
  identity: CallPrincipalIdentity,
): boolean {
  if (row === null) return false
  return [
    row.principalId === identity.principalId,
    row.ownerId === identity.ownerId,
    row.applicationRef === identity.applicationRef,
    row.environment === identity.environment,
  ].every(Boolean)
}

export function sellerCanaryExecutionContext(
  envelope: SellerOnboardingCanaryExecutionEnvelope,
): X402ExecutionContext {
  return {
    kind: 'seller_onboarding_canary',
    paymentProfile: 'base-sepolia-usdc-exact',
    canaryRef: envelope.canaryRef,
    canaryCommitmentDigest: envelope.canaryCommitmentDigest,
    fundingBudgetRef: envelope.funding.budgetRef,
  }
}

export function exactSellerCanarySnapshotMatches(input: Readonly<{
  dispatch: OpenDispatch
  snapshot: SellerCanaryOperationSnapshot
  operation: PublishedTool
}>): boolean {
  const { dispatch, snapshot, operation } = input
  const envelope = dispatch.sellerOnboardingCanary
  if (envelope === undefined) return false
  try {
    const reconstructed = createSellerOnboardingCanaryCommitment({
      ownerId: envelope.ownerId,
      businessId: envelope.businessId,
      offeringRef: envelope.offeringRef,
      offeringRevision: envelope.offeringRevision,
      offeringSourceHash: envelope.offeringSourceHash,
      accessPathRef: envelope.accessPathRef,
      accessPathSourceHash: envelope.accessPathSourceHash,
      publicationRef: envelope.publicationRef,
      publicationRevision: envelope.publicationRevision,
      draftOperationRef: envelope.toolRef,
      toolMaterialDigest: envelope.toolMaterialDigest,
      contractDigest: envelope.contractDigest,
      bindingDigest: envelope.bindingDigest,
      priceDigest: envelope.priceDigest,
      sellerPayTo: envelope.sellerPayTo,
      sellerClaimDigest: envelope.sellerClaimDigest,
      readinessDigest: envelope.readinessDigest,
      readinessObservedAt: envelope.readinessObservedAt,
      readinessValidUntil: envelope.readinessValidUntil,
      expectedOutputSchemaDigest: envelope.expectedOutputSchemaDigest,
      expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
      inputDigest: envelope.inputDigest,
      idempotencyKey: envelope.idempotencyKey,
      fundingBudgetRef: envelope.funding.budgetRef,
      fundingPrincipalId: envelope.funding.principalId,
      fundingOwnerId: envelope.funding.ownerId,
      fundingCredentialId: envelope.funding.credentialId,
      fundingApplicationRef: envelope.funding.applicationRef,
      fundingGrantRef: envelope.funding.grantRef,
      fundingGrantGeneration: envelope.funding.grantGeneration,
      fundingPolicyDigest: envelope.funding.policyDigest,
      requestedSpend: envelope.funding.requestedSpend,
      maximumSpend: envelope.funding.maximumSpend,
      expiresAt: envelope.expiresAt,
      now: 0,
    })
    const regeneratedEnvelope = sellerOnboardingCanaryExecutionEnvelope(reconstructed)
    if (canonicalDigest(regeneratedEnvelope as StableHashValue)
      !== canonicalDigest(envelope as StableHashValue)) return false
    const expectedOutputSchemaDigest = canonicalDigest(operation.contract.outputSchema as StableHashValue)
    const expectedOutputEvidenceDigest = canonicalDigest({
      kind: 'seller_onboarding_canary_expected_output:v1',
      toolMaterialDigest: operation.materialDigest,
      contractDigest: operation.identity.contractDigest,
      inputDigest: dispatch.inputDigest,
      outputSchema: operation.contract.outputSchema,
      evidence: operation.contract.evidence,
    } as StableHashValue)
    const payment = operation.identity.payment
    return dispatch.environment === 'sandbox'
      && operation.runtimeEnvironment === 'sandbox'
      && payment.kind === 'x402'
      && envelope.callRef === dispatch.callRef
      && envelope.toolRef === dispatch.toolRef
      && envelope.inputDigest === dispatch.inputDigest
      && envelope.idempotencyKey === dispatch.idempotencyKey
      && envelope.funding.principalId === dispatch.principalId
      && envelope.funding.ownerId === dispatch.ownerId
      && envelope.funding.credentialId === dispatch.credentialId
      && envelope.funding.applicationRef === dispatch.applicationRef
      && envelope.funding.grantRef === dispatch.grantRef
      && envelope.funding.grantGeneration === dispatch.grantGeneration
      && envelope.funding.policyDigest === dispatch.policyDigest
      && envelope.accountingPolicy.recordBuyerUsage === false
      && envelope.accountingPolicy.accrueProviderEarnings === false
      && envelope.accountingPolicy.accruePlatformRake === false
      && envelope.accountingPolicy.recordQualifiedUse === false
      && envelope.businessId === operation.identity.businessId
      && envelope.publicationRef === operation.identity.publicationRef
      && envelope.publicationRevision === operation.identity.publicationRevision
      && envelope.toolMaterialDigest === operation.materialDigest
      && envelope.contractDigest === operation.identity.contractDigest
      && envelope.bindingDigest === operation.identity.bindingDigest
      && envelope.priceDigest === operation.priceDigest
      && envelope.sellerPayTo.toLowerCase() === payment.payTo.toLowerCase()
      && envelope.expectedOutputSchemaDigest === expectedOutputSchemaDigest
      && envelope.expectedOutputEvidenceDigest === expectedOutputEvidenceDigest
      && envelope.toolRef === snapshot.toolRef
      && envelope.offeringRef === snapshot.offeringRef
      && envelope.offeringRevision === snapshot.offeringRevision
      && envelope.offeringSourceHash === snapshot.offeringSourceHash
      && envelope.accessPathRef === snapshot.accessPathRef
      && envelope.accessPathSourceHash === snapshot.accessPathSourceHash
      && envelope.publicationRef === snapshot.publicationRef
      && envelope.publicationRevision === snapshot.publicationRevision
      && envelope.sellerPayTo.toLowerCase() === snapshot.sellerPayTo.toLowerCase()
      && envelope.sellerClaimDigest === snapshot.sellerClaimDigest
      && envelope.readinessDigest === snapshot.readinessDigest
      && envelope.readinessObservedAt === snapshot.readinessObservedAt
      && envelope.readinessValidUntil === snapshot.readinessValidUntil
      && operation.readiness.observedAt === envelope.readinessObservedAt
      && operation.readiness.validUntil === envelope.readinessValidUntil
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'exactSellerCanarySnapshotMatches', reason: 'invalid_response' })
  }
}

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

  const serviceMode = resolveServiceMode(env)
  if (!serviceModeAllowsEnvironment(serviceMode, dispatch.environment)) {
    return await refuseBeforeClaim(ctx, dispatch, 'environment_mismatch', false, 'This deployment does not admit purchases in this environment.')
  }

  const principalRow = await ctx.runQuery(internal.agentAccessPrincipals.getAgentPrincipal, {
    principalId: dispatch.principalId,
  })
  const principalReadAt = Date.now()
  // A Call's identity survives a credential rotation; its authority does not.
  //
  // Identity: the live Principal row must still match the four stable fields a
  // Call is keyed by - principalId, ownerId, applicationRef, environment (the
  // tuple `callIdentityMatches` enforces on admit, replay, and recovery) - and
  // must itself be live. The credential is deliberately NOT part of that tuple:
  // it rotates, and the Call keeps the credential it was admitted under as
  // effect evidence. The Principal's grant generation may only move forward; a
  // Call carrying a generation ahead of the Principal is a stale replay.
  //
  // Authority: a rotation does not re-authorise anything. Dispatch proceeds
  // only if the grant that authorised THIS Call - read below under the Call's
  // own grantRef, credentialId, and owner tuple, exactly as release re-reads it
  // - is still current: active (never revoked), unexpired, and at least the
  // Call's generation. A revoked or expired grant refuses as before.
  //
  // Successor credential: when the credential has rotated, the credential now
  // bound to the Principal must itself be live, proven by its own active,
  // unexpired grant at the Principal's current generation. Revoking a
  // credential revokes its grant, so a revoked successor can never dispatch.
  if (
    principalRow === null
    || !callPrincipalIdentityMatches(principalRow, dispatch)
    || principalRow.lifecycle !== 'active'
    || (principalRow.expiresAt !== undefined && principalRow.expiresAt <= principalReadAt)
    || principalRow.grantGeneration < dispatch.grantGeneration
  ) {
    return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'Refresh the agent grant and retry.')
  }
  // Evidence: the credential that actually dispatches this attempt. The Call
  // retains `dispatch.credentialId` as its admitted effect identity.
  const dispatchedCredentialId = principalRow.credentialId
  if (dispatchedCredentialId !== dispatch.credentialId) {
    const successorGrant = await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
      credentialId: dispatchedCredentialId,
      environment: dispatch.environment,
      principalId: dispatch.principalId,
      applicationRef: dispatch.applicationRef,
      ownerId: dispatch.ownerId,
      generation: principalRow.grantGeneration,
      now: principalReadAt,
    })
    if (successorGrant === null) {
      return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'Refresh the agent grant and retry.')
    }
  }
  const principal: AgentAccessPrincipal = {
    principalId: principalRow.principalId,
    ownerId: principalRow.ownerId,
    credentialId: dispatchedCredentialId,
    applicationRef: principalRow.applicationRef,
    environment: principalRow.environment,
    scopes: principalRow.scopes,
    authorityMode: principalRow.authorityMode,
  }
  const sellerCanary = dispatch.sellerOnboardingCanary
  const grantReadAt = Date.now()
  const grant = sellerCanary === undefined
    ? await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
        credentialId: dispatch.credentialId,
        environment: dispatch.environment,
        principalId: dispatch.principalId,
        applicationRef: dispatch.applicationRef,
        grantRef: dispatch.grantRef,
        ownerId: dispatch.ownerId,
        now: grantReadAt,
      })
    : dispatch.environment !== 'sandbox'
      ? null
      : await ctx.runQuery(
          internal.capabilitySupplyCanaryFunding.readExactSellerOnboardingCanaryPlatformGrant,
          {
            sellerOwnerId: sellerCanary.ownerId,
            expected: {
              kind: 'persisted_dispatch',
              grantRef: dispatch.grantRef,
              principalId: dispatch.principalId,
              ownerId: dispatch.ownerId,
              credentialId: dispatch.credentialId,
              applicationRef: dispatch.applicationRef,
              environment: 'sandbox',
              generation: dispatch.grantGeneration,
              spendingPolicyDigest: dispatch.policyDigest,
              expiresAt: dispatch.grantExpiresAt,
            },
            now: grantReadAt,
          },
        )
  if (grant === null) return await refuseBeforeClaim(ctx, dispatch, 'grant_not_found', false, 'Refresh the agent grant and retry.')
  if (grant.generation < dispatch.grantGeneration) {
    return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'Refresh the agent grant and retry.')
  }
  // The canonical claim is bound to the credential the Call was admitted under,
  // not to whichever credential is dispatching now: the outer claim gate checks
  // the attempt actor against the stored Call, and the effect must stay
  // attributable to the credential that bought it.
  const actor = { callerRef: dispatch.credentialId, principalRef: dispatch.principalId }
  const initialAttemptRef = `operation-attempt:${dispatch.callRef}:1`
  const leaseOwner = `operation-worker:${dispatch.callRef}`

  const currentSnapshot = sellerCanary === undefined
    ? await ctx.runQuery(internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot, {
        toolRef: dispatch.toolRef,
      })
    : await ctx.runQuery(
        internal.capabilitySupplyCurrentTool.readExactSellerCanaryOperationSnapshot,
        {
          publicationRef: sellerCanary.publicationRef,
          revision: sellerCanary.publicationRevision,
        },
      )
  if (currentSnapshot === null) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The operation publication changed; retry discovery.')
  }
  const reservedOperation = parsePublishedToolSnapshot(dispatch.toolJson)
  const currentOperation = parsePublishedToolSnapshot(currentSnapshot.toolJson)
  if (reservedOperation === undefined || currentOperation === undefined) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'The admitted operation snapshot is invalid.')
  }
  if (!serviceModeAllowsEnvironment(serviceMode, reservedOperation.runtimeEnvironment)
    || !serviceModeAllowsEnvironment(serviceMode, currentOperation.runtimeEnvironment)) {
    return await refuseBeforeClaim(ctx, dispatch, 'environment_mismatch', false, 'This deployment does not admit purchases in this environment.')
  }
  if (sellerCanary !== undefined) {
    const payment = currentOperation.identity.payment
    const custody = cdpX402CustodyConfigurationFromEnvironment()
    if (
      payment.kind !== 'x402'
      || custody === undefined
      || !validSellerCanaryPayee(payment.payTo, custody.expectedEvmAddress)
      || !validSellerCanaryPayee(sellerCanary.sellerPayTo, custody.expectedEvmAddress)
    ) {
      return await refuseBeforeClaim(
        ctx,
        dispatch,
        'provider_refused',
        false,
        'The seller payee must be a valid EVM address distinct from the managed canary payer.',
      )
    }
  }
  if (sellerCanary === undefined) {
    if (!currentToolQuotesMatch({
      toolRef: dispatch.toolRef,
      pinned: reservedOperation,
      current: currentOperation,
    })) {
      return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The operation publication changed; retry discovery.')
    }
  } else if (!exactSellerCanarySnapshotMatches({
    dispatch,
    snapshot: currentSnapshot as SellerCanaryOperationSnapshot,
    operation: currentOperation,
  })) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The sealed seller canary no longer matches its exact staged operation.')
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
  if (!isPrincipalEnvironmentCompatibleWithTool(principal.environment, operation)) {
    return await refuseBeforeClaim(
      ctx,
      dispatch,
      'environment_mismatch',
      false,
      toolEnvironmentMismatchNextAction,
    )
  }
  if (!descriptor.validateInput(input)) return await refuseBeforeClaim(ctx, dispatch, 'input_invalid', false)
  const isX402 = operation.identity.adapterId === 'x402-fetch:v2'
  if (sellerCanary !== undefined && !isX402) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'Seller onboarding canaries require the exact x402 transport.')
  }
  const executionContext = sellerCanary === undefined
    ? undefined
    : sellerCanaryExecutionContext(sellerCanary)
  const economicRail: EconomicRail = economicRailForCall({
    isX402,
    sellerOnboardingCanary: sellerCanary !== undefined,
  })
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
  const laneAdmission = paymentLaneAdmission({
    rail: economicRail,
    environment: dispatch.environment,
    ...(executionContext === undefined ? {} : { executionContext }),
  })
  if (laneAdmission.kind === 'refused') {
    return await refuseBeforeClaim(ctx, dispatch, laneAdmission.code, false, 'This operation settles provider-direct; invoke a brokered operation instead.')
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
    : sellerCanary?.funding.requestedSpend
  if (economicRail === 'brokered_x402' || economicRail === 'managed_testnet_canary') {
    if (pricingConfig.kind !== 'managed_x402'
      || (economicRail === 'brokered_x402' && dispatch.quoteRef === undefined)) {
      return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'Inspect this managed Operation to obtain a current Commitment before invoking it.')
    }
  } else {
    if (pricingConfig.kind !== 'fixed_aud' || pricingAmount === undefined) {
      return await refuseBeforeClaim(ctx, dispatch, 'price_changed', false, 'The published price changed; retry discovery.')
    }
  }
  if (
    sellerCanary !== undefined
    && (
      sellerCanary.expiresAt <= Date.now()
      || pricingAmount === undefined
      || compareExactAmounts(pricingAmount, sellerCanary.funding.requestedSpend) !== 0
      || compareExactAmounts(sellerCanary.funding.requestedSpend, sellerCanary.funding.maximumSpend) === undefined
      || compareExactAmounts(sellerCanary.funding.requestedSpend, sellerCanary.funding.maximumSpend)! > 0
    )
  ) {
    return await refuseBeforeClaim(ctx, dispatch, 'price_changed', false, 'The sealed seller canary funding or expiry no longer matches the staged call.')
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
    executionContext,
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
