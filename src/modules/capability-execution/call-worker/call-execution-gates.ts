"use node";

import { makeFunctionReference } from 'convex/server'
import type { FunctionReturnType } from 'convex/server'
import type { NormalizedStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  resolveServiceMode,
  serviceModeAllowsEnvironment,
  type ServiceMode,
} from '@/lib/deployment/service-mode'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  cdpX402CustodyConfigurationFromEnvironment,
  validSellerCanaryPayee,
} from '@/modules/capability-supply/server'
import {
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
  parsePublishedToolSnapshot,
  type PublishedTool,
} from '@/modules/capability-supply/public'
import { currentToolQuotesMatch } from '../current-tool-quote'
import {
  isPrincipalEnvironmentCompatibleWithTool,
  toolEnvironmentMismatchNextAction,
} from '@/modules/capability-execution/call-contracts'
import { env, type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { OpenDispatch } from '../../../../convex/capabilityCallProjection'
import { convergePreRelease, refuseBeforeClaim, type WorkerResult } from './charge'

export const acceptedCallGrantAfterLimitUpdateRef = makeFunctionReference<
  'mutation', { callRef: string }, NormalizedStoredAgentAccessGrant | null
>('capabilityCalls:readAcceptedCallGrantAfterLimitUpdate')

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

type AgentPrincipalRow = NonNullable<
  FunctionReturnType<typeof internal.agentAccessPrincipals.getAgentPrincipal>
>

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

export type EnvironmentBeforeClaimInput =
  | Readonly<{ phase: 'dispatch'; dispatch: OpenDispatch }>
  | Readonly<{
      phase: 'published_tools'
      dispatch: OpenDispatch
      reservedOperation: PublishedTool
      currentOperation: PublishedTool
    }>
  | Readonly<{
      phase: 'principal_tool'
      dispatch: OpenDispatch
      principal: AgentAccessPrincipal
      operation: PublishedTool
    }>

export async function gateEnvironmentBeforeClaim(
  ctx: ActionCtx,
  input: EnvironmentBeforeClaimInput,
): Promise<WorkerResult | null> {
  switch (input.phase) {
    case 'dispatch': {
      const serviceMode = resolveServiceMode(env)
      if (!serviceModeAllowsEnvironment(serviceMode, input.dispatch.environment)) {
        return await refuseBeforeClaim(
          ctx,
          input.dispatch,
          'environment_mismatch',
          false,
          'This deployment does not admit purchases in this environment.',
        )
      }
      return null
    }
    case 'published_tools': {
      const serviceMode = resolveServiceMode(env)
      if (
        !serviceModeAllowsEnvironment(serviceMode, input.reservedOperation.runtimeEnvironment)
        || !serviceModeAllowsEnvironment(serviceMode, input.currentOperation.runtimeEnvironment)
      ) {
        return await refuseBeforeClaim(
          ctx,
          input.dispatch,
          'environment_mismatch',
          false,
          'This deployment does not admit purchases in this environment.',
        )
      }
      return null
    }
    case 'principal_tool': {
      if (!isPrincipalEnvironmentCompatibleWithTool(input.principal.environment, input.operation)) {
        return await refuseBeforeClaim(
          ctx,
          input.dispatch,
          'environment_mismatch',
          false,
          toolEnvironmentMismatchNextAction,
        )
      }
      return null
    }
    default: {
      const _exhaustive: never = input
      return _exhaustive
    }
  }
}

export type PrincipalIdentityBeforeClaimPass = Readonly<{
  principalRow: AgentPrincipalRow
  dispatchedCredentialId: string
  principal: AgentAccessPrincipal
}>

export async function gatePrincipalIdentityBeforeClaim(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
): Promise<WorkerResult | PrincipalIdentityBeforeClaimPass> {
  const principalRow = await ctx.runQuery(internal.agentAccessPrincipals.getAgentPrincipal, {
    principalId: dispatch.principalId,
  })
  const principalReadAt = Date.now()
  if (
    principalRow === null
    || !callPrincipalIdentityMatches(principalRow, dispatch)
    || principalRow.lifecycle !== 'active'
    || (principalRow.expiresAt !== undefined && principalRow.expiresAt <= principalReadAt)
    || principalRow.grantGeneration < dispatch.grantGeneration
  ) {
    return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'Refresh the agent grant and retry.')
  }
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
  return { principalRow, dispatchedCredentialId, principal }
}

export async function gateGrantValidityBeforeClaim(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
): Promise<WorkerResult | NormalizedStoredAgentAccessGrant> {
  const sellerCanary = dispatch.sellerOnboardingCanary
  const grantReadAt = Date.now()
  let grant = sellerCanary === undefined
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
  if (grant === null && sellerCanary === undefined) {
    grant = await ctx.runMutation(acceptedCallGrantAfterLimitUpdateRef, { callRef: dispatch.callRef })
  }
  if (grant === null) return await refuseBeforeClaim(ctx, dispatch, 'grant_not_found', false, 'Refresh the agent grant and retry.')
  if (grant.generation < dispatch.grantGeneration) {
    return await refuseBeforeClaim(ctx, dispatch, 'grant_generation_stale', false, 'Refresh the agent grant and retry.')
  }
  return grant
}

export async function gateSellerCanarySnapshotBeforeClaim(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    currentSnapshot: SellerCanaryOperationSnapshot | null
    reservedOperation: PublishedTool | undefined
    currentOperation: PublishedTool | undefined
  }>,
): Promise<WorkerResult | null> {
  const { dispatch, currentSnapshot, reservedOperation, currentOperation } = input
  const sellerCanary = dispatch.sellerOnboardingCanary
  if (currentSnapshot === null) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The operation publication changed; retry discovery.')
  }
  if (reservedOperation === undefined || currentOperation === undefined) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_unsupported', false, 'The admitted operation snapshot is invalid.')
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
    snapshot: currentSnapshot,
    operation: currentOperation,
  })) {
    return await refuseBeforeClaim(ctx, dispatch, 'operation_not_current', false, 'The sealed seller canary no longer matches its exact staged operation.')
  }
  return null
}

type GrantValidityExpectation = Readonly<{
  grantRef: string
  ownerId: string
  credentialId: string
  principalId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  generation: number
  policyDigest: string
}>

function grantIdentityMatches(
  candidate: unknown,
  expected: GrantValidityExpectation,
): boolean {
  if (candidate === null || typeof candidate !== 'object') return false
  const grant = candidate as Record<string, unknown>
  return grant.grantRef === expected.grantRef
    && grant.ownerId === expected.ownerId
    && grant.credentialId === expected.credentialId
    && grant.principalId === expected.principalId
    && grant.applicationRef === expected.applicationRef
    && grant.environment === expected.environment
    && grant.generation === expected.generation
    && grant.spendingPolicyDigest === expected.policyDigest
}

async function readGrantValidityForRelease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  grantValidityExpectation: GrantValidityExpectation,
): Promise<boolean> {
  const readCurrentGrant = async (now: number): Promise<
    FunctionReturnType<typeof internal.capabilitySupplyCanaryFunding.readExactSellerOnboardingCanaryPlatformGrant>
    | FunctionReturnType<typeof internal.agentAccessPolicy.readActiveGrant>
  > => {
    const canary = dispatch.sellerOnboardingCanary
    if (canary !== undefined) {
      return await ctx.runQuery(
        internal.capabilitySupplyCanaryFunding.readExactSellerOnboardingCanaryPlatformGrant,
        {
          sellerOwnerId: canary.ownerId,
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
          now,
        },
      )
    }
    return await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
      grantRef: grantValidityExpectation.grantRef,
      ownerId: grantValidityExpectation.ownerId,
      credentialId: grantValidityExpectation.credentialId,
      principalId: grantValidityExpectation.principalId,
      applicationRef: grantValidityExpectation.applicationRef,
      environment: grantValidityExpectation.environment,
      generation: grantValidityExpectation.generation,
      now,
    })
  }
  const currentGrant = await readCurrentGrant(Date.now())
  if (currentGrant?.lifecycle === 'active' && grantIdentityMatches(currentGrant, grantValidityExpectation)) return true
  if (dispatch.sellerOnboardingCanary !== undefined) return false
  const acceptedGrant = await ctx.runMutation(acceptedCallGrantAfterLimitUpdateRef, { callRef: dispatch.callRef })
  return acceptedGrant?.lifecycle === 'revoked' && grantIdentityMatches(acceptedGrant, grantValidityExpectation)
}

export async function readGrantStillValidForRelease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  grantValidityExpectation: GrantValidityExpectation,
): Promise<boolean> {
  try {
    return await readGrantValidityForRelease(ctx, dispatch, grantValidityExpectation)
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'readGrantStillValidForRelease', reason: 'source_unavailable' })
  }
}

export async function gateGrantValidityBeforeRelease(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    claimed: Parameters<typeof convergePreRelease>[2]
    grantValidityExpectation: GrantValidityExpectation
  }>,
): Promise<WorkerResult | null> {
  let finalGrantIsValid: boolean
  try {
    finalGrantIsValid = await readGrantValidityForRelease(ctx, input.dispatch, input.grantValidityExpectation)
  } catch (cause) {
    return degradeBackend(
      cause,
      await convergePreRelease(
        ctx,
        input.dispatch,
        input.claimed,
        'pre_release_failed',
        true,
        'Grant authority could not be revalidated before release.',
      ),
      { site: 'gateGrantValidityBeforeRelease', reason: 'source_unavailable' },
    )
  }
  if (!finalGrantIsValid) {
    return await convergePreRelease(
      ctx,
      input.dispatch,
      input.claimed,
      'grant_generation_stale',
      false,
      'Refresh the agent grant and retry.',
    )
  }
  return null
}

export async function readCurrentOperationForRelease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
): Promise<PublishedTool | undefined> {
  const currentSnapshot = dispatch.sellerOnboardingCanary === undefined
    ? await ctx.runQuery(
        internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
        { toolRef: dispatch.toolRef },
      )
    : await ctx.runQuery(
        internal.capabilitySupplyCurrentTool.readExactSellerCanaryOperationSnapshot,
        {
          publicationRef: dispatch.sellerOnboardingCanary.publicationRef,
          revision: dispatch.sellerOnboardingCanary.publicationRevision,
        },
      )
  const currentOperation = currentSnapshot === null
    ? undefined
    : parsePublishedToolSnapshot(currentSnapshot.toolJson)
  if (
    currentOperation !== undefined
    && dispatch.sellerOnboardingCanary !== undefined
    && !exactSellerCanarySnapshotMatches({
      dispatch,
      snapshot: currentSnapshot as SellerCanaryOperationSnapshot,
      operation: currentOperation,
    })
  ) {
    return undefined
  }
  return currentOperation
}

export async function gateSellerCanarySnapshotBeforeRelease(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    claimed: Parameters<typeof convergePreRelease>[2]
    pinnedOperation: PublishedTool
  }>,
): Promise<WorkerResult | PublishedTool> {
  let currentOperation: PublishedTool | undefined
  try {
    currentOperation = await readCurrentOperationForRelease(ctx, input.dispatch)
  } catch (cause) {
    currentOperation = degradeBackend(cause, undefined, { site: 'gateSellerCanarySnapshotBeforeRelease', reason: 'source_unavailable' })
  }
  if (
    currentOperation === undefined
    || (
      input.dispatch.sellerOnboardingCanary === undefined
      && !currentToolQuotesMatch({
        toolRef: input.dispatch.toolRef,
        pinned: input.pinnedOperation,
        current: currentOperation,
      })
    )
  ) {
    return await convergePreRelease(
      ctx,
      input.dispatch,
      input.claimed,
      'pre_release_failed',
      false,
      'The operation publication or price binding changed before release.',
    )
  }
  return currentOperation
}

export function sellerCanaryReleaseFenceSnapshotMatches(
  dispatch: OpenDispatch,
  exactSnapshot: SellerCanaryOperationSnapshot | null,
  exactOperation: PublishedTool | undefined,
): boolean {
  if (dispatch.sellerOnboardingCanary === undefined) return true
  if (dispatch.sellerOnboardingCanary.expiresAt <= Date.now()) return false
  return exactSnapshot !== null
    && exactOperation !== undefined
    && exactSellerCanarySnapshotMatches({
      dispatch,
      snapshot: exactSnapshot,
      operation: exactOperation,
    })
}

export type { GrantValidityExpectation, ServiceMode }
