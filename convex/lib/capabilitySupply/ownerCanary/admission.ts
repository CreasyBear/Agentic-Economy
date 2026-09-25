import {
  createSellerOnboardingCanaryCommitment,
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  sellerOnboardingCanaryExecutionEnvelope,
  X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
  x402SellerCanaryAdmissionIsSatisfied,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { compareExactAmounts } from '@/modules/money/public'
import { buildCallAuthority } from '@/modules/capability-execution/call-authority'

import { resolveBusinessActor } from '../../../authz'
import {
  readExactSellerOnboardingCanaryPlatformGrantHandler,
  sellerOnboardingCanaryPlatformGrantExpectation,
} from '../../../capabilitySupplyCanaryFunding'
import { readExactSellerCanaryOperationSnapshotHandler } from '../currentTool/sellerCanary'
import type { MutationCtx } from '../../../_generated/server'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { reserveHandler } from '../../capabilityExecution/callLifecycle/admissionReserve'
import { enqueueCallDispatch } from '../../capabilityExecution/callLifecycle/dispatchEnqueue'
import {
  enqueueKnownUnpaidSellerCanaryRearm,
  enqueueRecoveredSellerCanaryReplay,
  enqueueSafeBeforeReleaseSellerCanaryResume,
} from '../../capabilityExecution/callLifecycle/sellerCanaryRearm'
import {
  existingCanaryForPublication,
  exactCatalogIdentity,
  exactPersistedCanaryIdentity,
  operationGrant,
} from './identity'
import type {
  CanaryEnvelope,
  RequestArgs,
  RequestSellerOnboardingCanaryResult,
} from './contracts'

export async function requestSellerOnboardingCanaryHandler(
  ctx: MutationCtx,
  args: RequestArgs,
): Promise<RequestSellerOnboardingCanaryResult> {
  if (args.input !== undefined && !isBoundedJsonValue(args.input)) {
    return { kind: 'refused', code: 'input_invalid' }
  }
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', code: 'source_write_refused' }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'authorization_denied' }
  const business = await ctx.db.get(args.businessId)
  if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'refused', code: 'authorization_denied' }
  }
  return await requestSellerOnboardingCanaryWithOwner(ctx, {
    ...args,
    ownerId: actor.canonicalAccountRef,
  })
}

export async function requestSellerOnboardingCanaryForAdmittedPublicationHandler(
  ctx: MutationCtx,
  args: Readonly<{
    publicationRef: string
    publicationRevision: number
    operationKey: string
    correlationId: string
  }>,
): Promise<RequestSellerOnboardingCanaryResult> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', args.publicationRef).eq('revision', args.publicationRevision)
    ))
    .unique()
  if (
    publication === null
    || publication.disposition !== 'current'
    || (publication.runtimeEnvironment !== 'sandbox' && publication.runtimeEnvironment !== 'production')
    || publication.sourceKind !== 'x402'
    || publication.registrationEvidenceRefs.filter(
      (ref) => ref === X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
    ).length !== 1
  ) {
    return { kind: 'refused', code: 'staging_snapshot_missing' }
  }
  const business = await ctx.db.get(publication.businessId)
  if (business === null) return { kind: 'refused', code: 'authorization_denied' }
  const snapshot = await readExactSellerCanaryOperationSnapshotHandler(ctx, {
    publicationRef: args.publicationRef,
    revision: args.publicationRevision,
  })
  if (snapshot === null) {
    if (!x402SellerCanaryAdmissionIsSatisfied(publication.registrationEvidenceRefs)) {
      return { kind: 'refused', code: 'staging_snapshot_missing' }
    }
    const existing = await existingCanaryForPublication(ctx, publication)
    if (existing === null) return { kind: 'refused', code: 'staging_snapshot_missing' }
    return {
      kind: 'replayed',
      canaryRef: existing.canaryRef,
      callRef: existing.callRef,
      toolRef: existing.toolRef,
    }
  }
  return await requestSellerOnboardingCanaryWithOwner(ctx, {
    businessId: publication.businessId,
    offeringRef: snapshot.offeringRef,
    offeringRevision: snapshot.offeringRevision,
    offeringSourceHash: snapshot.offeringSourceHash,
    publicationRef: args.publicationRef,
    publicationRevision: args.publicationRevision,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ownerId: business.owningAccountRef,
  })
}

async function requestSellerOnboardingCanaryWithOwner(
  ctx: MutationCtx,
  args: RequestArgs & { ownerId: string },
): Promise<RequestSellerOnboardingCanaryResult> {
  if (args.input !== undefined && !isBoundedJsonValue(args.input)) {
    return { kind: 'refused', code: 'input_invalid' }
  }
  if (!await exactCatalogIdentity(ctx, args)) return { kind: 'refused', code: 'catalog_revision_changed' }

  const snapshot = await readExactSellerCanaryOperationSnapshotHandler(ctx, {
    publicationRef: args.publicationRef,
    revision: args.publicationRevision,
  })
  if (
    snapshot === null
    || snapshot.offeringRef !== args.offeringRef
    || snapshot.offeringRevision !== args.offeringRevision
    || snapshot.offeringSourceHash !== args.offeringSourceHash
  ) return { kind: 'refused', code: 'staging_snapshot_missing' }
  const operation = parsePublishedToolSnapshot(snapshot.toolJson)
  if (operation === undefined
    || (operation.runtimeEnvironment !== 'sandbox' && operation.runtimeEnvironment !== 'production')) {
    return { kind: 'refused', code: 'staging_snapshot_missing' }
  }
  const descriptor = materializeRuntimePublishedTool(operation)
  const canaryInput = operation.contract.inputExamples?.find(({ input }) => (
    isBoundedJsonValue(input) && descriptor.validateInput(input)
  ))?.input
  if (
    canaryInput === undefined
    || operation.pricingConfig.kind !== 'managed_x402'
    || operation.identity.payment.kind !== 'x402'
    || (args.input !== undefined
      && canonicalDigest(args.input) !== canonicalDigest(canaryInput))
  ) {
    return { kind: 'refused', code: 'input_invalid' }
  }
  const requestedSpend = {
    currency: operation.identity.payment.currency,
    units: operation.pricingConfig.sourceRequirement.atomicUnits,
    exponent: operation.identity.payment.assetAmountExponent,
  }

  const now = Date.now()
  const grant = await readExactSellerOnboardingCanaryPlatformGrantHandler(
    ctx,
    sellerOnboardingCanaryPlatformGrantExpectation(args.ownerId, now, operation.runtimeEnvironment),
  )
  if (grant === null) return { kind: 'refused', code: 'canary_grant_missing' }
  const maximumSpend = grant.spendingPolicy.budget.maximumSpendPerCall
  if (compareExactAmounts(requestedSpend, maximumSpend) !== -1
    && compareExactAmounts(requestedSpend, maximumSpend) !== 0) {
    return { kind: 'refused', code: 'canary_budget_exceeded' }
  }
  const inputDigest = canonicalDigest(canaryInput)
  const canaryCommitment = (idempotencyKey: string) => createSellerOnboardingCanaryCommitment({
    ownerId: args.ownerId,
    businessId: String(args.businessId),
    offeringRef: snapshot.offeringRef,
    offeringRevision: snapshot.offeringRevision,
    offeringSourceHash: snapshot.offeringSourceHash,
    accessPathRef: snapshot.accessPathRef,
    accessPathSourceHash: snapshot.accessPathSourceHash,
    publicationRef: snapshot.publicationRef,
    publicationRevision: snapshot.publicationRevision,
    draftOperationRef: snapshot.toolRef,
    toolMaterialDigest: operation.materialDigest,
    contractDigest: operation.identity.contractDigest,
    bindingDigest: operation.identity.bindingDigest,
    priceDigest: operation.priceDigest,
    sellerPayTo: snapshot.sellerPayTo,
    sellerClaimDigest: snapshot.sellerClaimDigest,
    readinessDigest: snapshot.readinessDigest,
    readinessObservedAt: snapshot.readinessObservedAt,
    readinessValidUntil: snapshot.readinessValidUntil,
    expectedOutputSchemaDigest: canonicalDigest(operation.contract.outputSchema),
    expectedOutputEvidenceDigest: canonicalDigest({
      kind: 'seller_onboarding_canary_expected_output:v1',
      toolMaterialDigest: operation.materialDigest,
      contractDigest: operation.identity.contractDigest,
      inputDigest,
      outputSchema: operation.contract.outputSchema,
      evidence: operation.contract.evidence,
    }),
    inputDigest,
    idempotencyKey,
    fundingBudgetRef: grant.budgetPolicyRef,
    fundingPrincipalId: grant.principalId,
    fundingOwnerId: grant.ownerId,
    fundingCredentialId: grant.credentialId,
    fundingApplicationRef: grant.applicationRef,
    fundingGrantRef: grant.grantRef,
    fundingGrantGeneration: grant.generation,
    fundingPolicyDigest: grant.spendingPolicyDigest,
    requestedSpend,
    maximumSpend,
    expiresAt: Math.min(snapshot.readinessValidUntil, grant.expiresAt, now + 5 * 60_000),
    now,
  })
  const commitment = canaryCommitment(args.operationKey)
  const envelope = sellerOnboardingCanaryExecutionEnvelope(commitment)
  const authorityForEnvelope = (target: CanaryEnvelope) => buildCallAuthority({
    authority: {
      kind: 'approved',
      basis: {
        kind: 'spending_policy_use',
        spendingPolicyRef: `agent-access-grant:${grant.grantRef}`,
        spendingPolicyVersion: 1,
        spendingPolicyGeneration: grant.generation,
        authorityUseRef: `operation-authority-use:${target.callRef}`,
        grantEvidenceRef: `agent-access-grant-evidence:${grant.spendingPolicyDigest}`,
      },
      expiresAt: new Date(target.expiresAt).toISOString(),
    },
    grant: operationGrant(grant),
    operation,
    descriptor,
    toolRef: snapshot.toolRef,
    callRef: target.callRef,
    inputDigest,
    decisionPrice: target.funding.requestedSpend,
    now,
  })
  const existingRows = await ctx.db.query('capabilityCalls')
    .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
      query.eq('sellerOnboardingCanary.canaryRef', envelope.canaryRef)
    ))
    .take(2)
  if (existingRows.length > 0) {
    const existing = existingRows.length === 1 ? existingRows[0] : undefined
    if (existing === undefined || !exactPersistedCanaryIdentity(existing, envelope)) {
      return { kind: 'refused', code: 'canary_identity_conflict' }
    }
    const refreshedCommitment = canaryCommitment(existing.idempotencyKey)
    const refreshedEnvelope = sellerOnboardingCanaryExecutionEnvelope(refreshedCommitment)
    const refreshedAuthority = authorityForEnvelope(refreshedEnvelope)
    if (
      refreshedAuthority !== undefined
      && refreshedEnvelope.canaryRef === existing.sellerOnboardingCanary?.canaryRef
      && refreshedEnvelope.callRef === existing.callRef
    ) {
      const refreshed = {
        envelope: refreshedEnvelope,
        authority: refreshedAuthority,
        grantGeneration: grant.generation,
        policyDigest: grant.spendingPolicyDigest,
        grantExpiresAt: grant.expiresAt,
        toolJson: snapshot.toolJson,
        inputJson: JSON.stringify(canaryInput),
        inputDigest,
        requestDigest: canonicalDigest({
          purpose: refreshedEnvelope.executionPurpose,
          toolRef: snapshot.toolRef,
          input: canaryInput,
          canaryCommitmentDigest: refreshedEnvelope.canaryCommitmentDigest,
        }),
        idempotencyKey: existing.idempotencyKey,
        now,
      }
      const rearmed = await enqueueKnownUnpaidSellerCanaryRearm(ctx, existing, refreshed)
      if (rearmed.kind === 'enqueued') {
        return {
          kind: 'enqueued',
          canaryRef: refreshedEnvelope.canaryRef,
          callRef: refreshedEnvelope.callRef,
          toolRef: refreshedEnvelope.toolRef,
        }
      }
      const resumed = await enqueueSafeBeforeReleaseSellerCanaryResume(ctx, existing, refreshed)
      if (resumed.kind === 'enqueued') {
        return {
          kind: 'enqueued',
          canaryRef: refreshedEnvelope.canaryRef,
          callRef: refreshedEnvelope.callRef,
          toolRef: refreshedEnvelope.toolRef,
        }
      }
      const recoveredWorkless = existing.state === 'pending'
        && existing.result === undefined
        && existing.workId === undefined
        && existing.attemptRef === undefined
        && existing.dispatchState === undefined
        && existing.authority !== undefined
      if (recoveredWorkless) {
        const dispatch = await enqueueRecoveredSellerCanaryReplay(ctx, existing, refreshed)
        if (dispatch.kind === 'refused') {
          return { kind: 'refused', code: 'canary_dispatch_refused' }
        }
        return {
          kind: dispatch.kind,
          canaryRef: refreshedEnvelope.canaryRef,
          callRef: refreshedEnvelope.callRef,
          toolRef: refreshedEnvelope.toolRef,
        }
      }
    }
    return {
      kind: 'replayed',
      canaryRef: existing.sellerOnboardingCanary!.canaryRef,
      callRef: existing.callRef,
      toolRef: existing.toolRef,
    }
  }
  const requestDigest = canonicalDigest({
    purpose: envelope.executionPurpose,
    toolRef: snapshot.toolRef,
    input: canaryInput,
    canaryCommitmentDigest: envelope.canaryCommitmentDigest,
  })
  const authority = authorityForEnvelope(envelope)
  if (authority === undefined) return { kind: 'refused', code: 'canary_identity_conflict' }
  const reserved = await reserveHandler(ctx, {
    quoteRef: envelope.canaryRef,
    callRef: envelope.callRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    credentialId: grant.credentialId,
    applicationRef: grant.applicationRef,
    grantRef: grant.grantRef,
    environment: operation.runtimeEnvironment,
    toolRef: snapshot.toolRef,
    idempotencyKey: args.operationKey,
    inputDigest,
    requestDigest,
    grantGeneration: grant.generation,
    policyDigest: grant.spendingPolicyDigest,
    grantExpiresAt: grant.expiresAt,
    toolJson: snapshot.toolJson,
    inputJson: JSON.stringify(canaryInput),
    sellerOnboardingCanary: envelope,
    now,
  })
  if (reserved.kind === 'conflict') return { kind: 'refused', code: 'canary_identity_conflict' }
  if (reserved.kind === 'refused') return { kind: 'refused', code: 'canary_dispatch_refused' }
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', envelope.callRef))
    .unique()
  if (row === null) return { kind: 'refused', code: 'canary_identity_conflict' }
  const dispatch = await enqueueCallDispatch(ctx, row, authority, now)
  if (dispatch.kind === 'refused') return { kind: 'refused', code: 'canary_dispatch_refused' }
  return {
    kind: dispatch.kind,
    canaryRef: envelope.canaryRef,
    callRef: envelope.callRef,
    toolRef: envelope.toolRef,
  }
}
