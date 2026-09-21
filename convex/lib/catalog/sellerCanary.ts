import { degradeBackend } from '@/lib/observability/degrade-backend'
import { v } from 'convex/values'

import type { MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { resolveBusinessActor } from '../../authz'
import { requireSourceWrite } from '../../sourceWriteAdmission'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from '../../capabilitySupplyProjection'
import {
  SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
} from '../../capabilitySupplyCanaryFunding'
import {
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
  type SellerOnboardingCanaryInvocationObservation,
} from '../../../src/modules/capability-execution'
import {
  evaluateX402SellerPromotion,
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  sellerCanaryCompletionEvidenceMatches,
  X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
  x402SellerCanaryAdmissionEvidenceRef,
  type X402SellerPromotionAnchor,
} from '../../../src/modules/capability-supply/public'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../../src/modules/common/stable-hash'
import { compareExactAmounts, readExactAmount } from '../../../src/modules/money/public'
import {
  readCurrentPublishedTool,
  readExactSellerCanaryOperationSnapshotHandler,
} from '../capabilitySupply/currentTool'
import { providerRouteabilityIsFrozen } from '../providerOffboardingFreeze'

type OfferingSourceMutationArgs = {
  businessId: Id<'businesses'>
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
}

export type PromoteX402SellerCanaryArgs = OfferingSourceMutationArgs & { canaryRef: string }

export type PromoteX402SellerCanaryResult =
  | {
      kind: 'promoted' | 'replayed'
      canaryRef: string
      offeringRef: string
      offeringRevision: number
      publicationRef: string
      publicationRevision: number
      toolRef: string
      promotionEvidenceDigest: string
      outputDigest: string
    }
  | {
      kind: 'refused'
      code:
        | 'unauthenticated'
        | 'wrong_owner'
        | 'source_write_refused'
        | 'canary_not_found'
        | 'canary_evidence_invalid'
        | 'target_drift'
        | 'operation_conflict'
        | 'seller_claim_stale'
        | 'funding_authority_invalid'
        | 'readiness_stale'
        | 'output_nondeterministic'
        | 'canary_pending'
        | 'reconciliation_required'
        | 'canary_identity_mismatch'
        | 'canary_expired'
        | 'operation_commitment_stale'
        | 'invocation_refused'
        | 'payment_not_settled'
        | 'payment_evidence_missing'
        | 'spend_commitment_mismatch'
        | 'output_contract_invalid'
        | 'output_unusable'
    }

function promotionAnchorFromEnvelope(
  envelope: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
): X402SellerPromotionAnchor {
  return {
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
  }
}

function reconstructCanaryCommitment(
  envelope: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
) {
  try {
    const commitment = createSellerOnboardingCanaryCommitment({
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
    return canonicalDigest(
      sellerOnboardingCanaryExecutionEnvelope(commitment) as StableHashValue,
    ) === canonicalDigest(envelope as StableHashValue)
      ? commitment
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'reconstructCanaryCommitment', reason: 'invalid_response' })
  }
}

function canaryObservation(
  row: Doc<'capabilityCalls'>,
  outputContractValid: boolean,
  outputDeterministic: boolean,
): SellerOnboardingCanaryInvocationObservation {
  const envelope = row.sellerOnboardingCanary
  if (envelope === undefined) throw new Error('seller_canary_envelope_missing')
  const result = row.result
  const receipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
  const ambiguous = row.state === 'reconciliation_required'
    || result?.kind === 'reconciliation_required'
    || receipt?.state === 'reconciliation_required'
    || receipt?.refundState === 'unknown'
    || receipt?.lossState === 'unknown'
  const state: SellerOnboardingCanaryInvocationObservation['state'] = ambiguous
    ? 'reconciliation_required'
    : row.state === 'pending'
      ? 'pending'
      : row.state === 'completed' && result?.kind === 'completed'
        ? 'completed'
        : row.state === 'cancelled'
          ? 'cancelled'
          : 'refused'
  const paymentState = receipt?.state === 'reconciliation_required'
    || receipt?.refundState === 'unknown'
    || receipt?.lossState === 'unknown'
    ? 'reconciliation_required' as const
    : receipt?.state === 'settled'
      && receipt.refundState === 'not_applicable'
      && receipt.lossState === 'none'
      ? 'settled' as const
      : 'refunded' as const
  return {
    executionPurpose: envelope.executionPurpose,
    canaryRef: envelope.canaryRef,
    canaryCommitmentDigest: envelope.canaryCommitmentDigest,
    callRef: row.callRef,
    toolRef: row.toolRef,
    inputDigest: row.inputDigest,
    state,
    outputContractValid,
    outputUsable: outputContractValid && outputDeterministic,
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(receipt === undefined || receipt.commercialModel !== 'seller_canary_x402' ? {} : {
      payment: {
        state: paymentState,
        amount: receipt.providerQuotedAmount,
        priceDigest: receipt.priceDigest,
        ...(receipt.paymentIdentifier === undefined ? {} : { paymentIdentifier: receipt.paymentIdentifier }),
        ...(receipt.settlementTransactionHash === undefined
          ? {}
          : { settlementTransactionHash: receipt.settlementTransactionHash }),
        ...(receipt.externalSettlementRef === undefined
          ? {}
          : { externalSettlementRef: receipt.externalSettlementRef }),
      },
    }),
  }
}

async function exactCatalogPromotionTarget(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  anchor: X402SellerPromotionAnchor,
): Promise<boolean> {
  const [offering, revision, path] = await Promise.all([
    ctx.db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', anchor.offeringRef))
      .unique(),
    ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', anchor.offeringRef).eq('revision', anchor.offeringRevision)
      ))
      .unique(),
    ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', anchor.accessPathRef))
      .unique(),
  ])
  return offering !== null
    && revision !== null
    && path !== null
    && offering.businessId === businessId
    && offering.currentRevision === anchor.offeringRevision
    && offering.status === 'published'
    && revision.businessId === businessId
    && revision.sourceHash === anchor.offeringSourceHash
    && path.businessId === businessId
    && path.offeringRef === anchor.offeringRef
    && path.offeringRevision === anchor.offeringRevision
    && path.offeringSourceHash === anchor.offeringSourceHash
    && path.status === 'published'
    && path.sourceHash === anchor.accessPathSourceHash
}

async function exactCurrentSellerClaim(
  ctx: MutationCtx,
  operation: NonNullable<ReturnType<typeof parsePublishedToolSnapshot>>,
  anchor: X402SellerPromotionAnchor,
): Promise<boolean> {
  if (operation.binding.authority.kind !== 'provider_connection'
    || operation.identity.payment.kind !== 'x402'
    || operation.identity.payment.payTo.toLowerCase() !== anchor.sellerPayTo.toLowerCase()) return false
  const authority = operation.binding.authority
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => (
      query.eq('connectionRef', authority.connectionRef)
    ))
    .unique()
  return connection !== null
    && connection.lifecycle === 'active'
    && String(connection.businessId) === anchor.businessId
    && connection.owningAccountRef === anchor.ownerId
    && connection.providerRef === authority.providerRef
    && connection.evidenceRefs.includes(`x402-payee-claim:${anchor.sellerClaimDigest}`)
}

function exactPlatformCanaryFundingEvidence(
  row: Doc<'capabilityCalls'>,
  envelope: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
): boolean {
  const funding = envelope.funding
  const authority = row.authority
  const authorizedAmount = readExactAmount(authority?.limits.amount)
  const exactEnvironmentIdentity = row.environment === 'sandbox'
    ? funding.applicationRef === SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF
      && funding.grantRef === SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF
    : row.environment === 'production'
      ? funding.applicationRef === PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF
        && /^agent-access-grant:platform:seller-onboarding-canary:production:v[1-9]\d*$/.test(funding.grantRef)
      : false
  if (funding.ownerId === envelope.ownerId
    || !exactEnvironmentIdentity
    || row.principalId !== funding.principalId
    || row.ownerId !== funding.ownerId
    || row.credentialId !== funding.credentialId
    || row.applicationRef !== funding.applicationRef
    || row.grantRef !== funding.grantRef
    || row.grantGeneration !== funding.grantGeneration
    || row.policyDigest !== funding.policyDigest
    || authority === undefined
    || authorizedAmount === undefined) return false
  return authority.callRef === row.callRef
    && authority.toolRef === row.toolRef
    && authority.inputDigest === row.inputDigest
    && authority.grantRef === funding.grantRef
    && authority.grantGeneration === funding.grantGeneration
    && authority.grantDigest === funding.policyDigest
    && authority.acceptedBasis.kind === 'spending_policy_use'
    && authority.acceptedBasis.spendingPolicyRef === `agent-access-grant:${funding.grantRef}`
    && authority.acceptedBasis.spendingPolicyGeneration === funding.grantGeneration
    && authority.acceptedBasis.grantEvidenceRef === `agent-access-grant-evidence:${funding.policyDigest}`
    && compareExactAmounts(authorizedAmount, funding.requestedSpend) === 0
}

function promotionOutputEvidence(
  row: Doc<'capabilityCalls'>,
  operation: NonNullable<ReturnType<typeof parsePublishedToolSnapshot>>,
): Readonly<{
  contractValid: boolean
  deterministic: boolean
  assertionMatched: boolean
  outputDigest: string
}> {
  const result = row.result
  if (row.state !== 'completed' || result?.kind !== 'completed') {
    return {
      contractValid: false,
      deterministic: false,
      assertionMatched: false,
      outputDigest: canonicalDigest(null),
    }
  }
  let contractValid = false
  try {
    contractValid = materializeRuntimePublishedTool(operation).validateOutput(result.output)
  } catch (cause) {
    contractValid = degradeBackend(cause, false, { site: 'promotionOutputEvidence', reason: 'invalid_response' })
  }
  const receipt = result.receipt
  const deterministic = row.evidenceHash !== undefined
    && row.evidenceHash === result.evidenceHash
    && receipt !== undefined
    && receipt.evidenceHash === result.evidenceHash
  const envelope = row.sellerOnboardingCanary
  const expectedOutputSchemaDigest = canonicalDigest(operation.contract.outputSchema as StableHashValue)
  const expectedOutputEvidenceDigest = canonicalDigest({
    kind: 'seller_onboarding_canary_expected_output:v1',
    toolMaterialDigest: operation.materialDigest,
    contractDigest: operation.identity.contractDigest,
    inputDigest: row.inputDigest,
    outputSchema: operation.contract.outputSchema,
    evidence: operation.contract.evidence,
  } as StableHashValue)
  return {
    contractValid,
    deterministic,
    assertionMatched: envelope !== undefined
      && sellerCanaryCompletionEvidenceMatches(result.output, operation.contract.evidence)
      && envelope.expectedOutputSchemaDigest === expectedOutputSchemaDigest
      && envelope.expectedOutputEvidenceDigest === expectedOutputEvidenceDigest,
    outputDigest: canonicalDigest(result.output as StableHashValue),
  }
}

function currentAnchorFromSnapshot(
  sealed: X402SellerPromotionAnchor,
  snapshot: NonNullable<Awaited<ReturnType<typeof readExactSellerCanaryOperationSnapshotHandler>>>,
  operation: NonNullable<ReturnType<typeof parsePublishedToolSnapshot>>,
): X402SellerPromotionAnchor {
  return {
    ownerId: sealed.ownerId,
    businessId: operation.identity.businessId,
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
  }
}

function promotionRefusalCode(
  code: Extract<ReturnType<typeof evaluateX402SellerPromotion>, { kind: 'refused' }>['code'],
): Extract<PromoteX402SellerCanaryResult, { kind: 'refused' }>['code'] {
  if (code === 'evidence_invalid') return 'canary_evidence_invalid'
  if (code === 'owner_mismatch') return 'wrong_owner'
  return code
}

async function admitExactSellerCanaryPublication(
  ctx: MutationCtx,
  anchor: X402SellerPromotionAnchor,
  promotionEvidenceDigest: string,
  now: number,
): Promise<boolean> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', anchor.publicationRef)
      .eq('revision', anchor.publicationRevision))
    .unique()
  if (publication === null
    || String(publication.businessId) !== anchor.businessId
    || publication.toolRef !== anchor.draftOperationRef
    || publication.disposition !== 'current'
    || publication.registrationEvidenceRefs.filter(
      (ref) => ref === X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
    ).length !== 1) return false
  const admissionRef = x402SellerCanaryAdmissionEvidenceRef(promotionEvidenceDigest)
  const existingAdmissionRefs = publication.registrationEvidenceRefs.filter((ref) => (
    ref.startsWith('x402-seller-canary-admission:admitted:v1:')
  ))
  if (existingAdmissionRefs.length > 0) return false
  await ctx.db.patch(publication._id, {
    registrationEvidenceRefs: [...new Set([
      ...publication.registrationEvidenceRefs,
      admissionRef,
    ])].sort(),
    updatedAt: now,
  })
  return true
}

export async function promoteX402SellerCanaryHandler(
  ctx: MutationCtx,
  args: PromoteX402SellerCanaryArgs,
): Promise<PromoteX402SellerCanaryResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'unauthenticated' }
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', code: 'source_write_refused' }
  return await promoteX402SellerCanaryForOwner(ctx, {
    ownerId: actor.canonicalAccountRef,
    businessId: args.businessId,
    canaryRef: args.canaryRef,
  })
}

export async function promoteAdmittedSellerCanaryHandler(
  ctx: MutationCtx,
  args: Readonly<{ canaryRef: string }>,
): Promise<PromoteX402SellerCanaryResult> {
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
      query.eq('sellerOnboardingCanary.canaryRef', args.canaryRef)
    ))
    .take(2)
  const [row] = rows
  const envelope = row?.sellerOnboardingCanary
  if (rows.length !== 1 || row === undefined || envelope === undefined) {
    return { kind: 'refused', code: 'canary_not_found' }
  }
  return await promoteX402SellerCanaryForOwner(ctx, {
    ownerId: envelope.ownerId,
    businessId: envelope.businessId as Id<'businesses'>,
    canaryRef: args.canaryRef,
  })
}

export async function promoteX402SellerCanaryForOwner(
  ctx: MutationCtx,
  args: Readonly<{ ownerId: string; businessId: Id<'businesses'>; canaryRef: string }>,
): Promise<PromoteX402SellerCanaryResult> {
  const business = await ctx.db.get(args.businessId)
  if (business === null || business.owningAccountRef !== args.ownerId) {
    return { kind: 'refused', code: 'wrong_owner' }
  }

  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
      query.eq('sellerOnboardingCanary.canaryRef', args.canaryRef)
    ))
    .take(2)
  const [row] = rows
  if (rows.length !== 1 || row === undefined) return { kind: 'refused', code: 'canary_not_found' }
  const envelope = row.sellerOnboardingCanary
  if (envelope === undefined
    || envelope.canaryRef !== args.canaryRef
    || envelope.ownerId !== args.ownerId
    || envelope.businessId !== String(args.businessId)
    || row.callRef !== envelope.callRef
    || row.toolRef !== envelope.toolRef
    || row.inputDigest !== envelope.inputDigest
    || row.idempotencyKey !== envelope.idempotencyKey) {
    return { kind: 'refused', code: 'canary_evidence_invalid' }
  }
  const commitment = reconstructCanaryCommitment(envelope)
  const retainedOperation = row.toolJson === undefined
    ? undefined
    : parsePublishedToolSnapshot(row.toolJson)
  if (commitment === undefined
    || retainedOperation === undefined
    || retainedOperation.runtimeEnvironment !== row.environment
    || retainedOperation.materialDigest !== envelope.toolMaterialDigest
    || retainedOperation.identity.contractDigest !== envelope.contractDigest
    || retainedOperation.identity.bindingDigest !== envelope.bindingDigest
    || retainedOperation.priceDigest !== envelope.priceDigest) {
    return { kind: 'refused', code: 'canary_evidence_invalid' }
  }
  const sealed = promotionAnchorFromEnvelope(envelope)
  if (!await exactCatalogPromotionTarget(ctx, args.businessId, sealed)) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const output = promotionOutputEvidence(row, retainedOperation)
  const observation = canaryObservation(row, output.contractValid, output.deterministic)
  const now = Date.now()
  const platformFundingAuthorized = exactPlatformCanaryFundingEvidence(row, envelope)
  const operationMarker = await ctx.db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => query
      .eq('actorRef', args.ownerId)
      .eq('operationName', 'promoteX402SellerCanary')
      .eq('key', args.canaryRef))
    .unique()

  if (operationMarker !== null) {
    const currentOperation = await readCurrentPublishedTool(ctx, envelope.toolRef, now)
    const claimCurrent = currentOperation !== undefined
      && await exactCurrentSellerClaim(ctx, currentOperation, sealed)
    const current = currentOperation === undefined
      ? sealed
      : {
          ...sealed,
          toolMaterialDigest: currentOperation.materialDigest,
          readinessObservedAt: currentOperation.readiness.observedAt,
          readinessValidUntil: currentOperation.readiness.validUntil,
        }
    const evaluated = evaluateX402SellerPromotion({
      actingOwnerId: args.ownerId,
      sealed,
      current,
      sellerClaimCurrent: claimCurrent,
      platformFundingAuthorized,
      readinessCurrent: currentOperation !== undefined
        && currentOperation.identity.contractDigest === sealed.contractDigest
        && currentOperation.identity.bindingDigest === sealed.bindingDigest
        && currentOperation.priceDigest === sealed.priceDigest,
      outputDeterministic: output.deterministic,
      outputAssertionMatched: output.assertionMatched,
      expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
      outputDigest: output.outputDigest,
      commitment,
      observation,
      now,
    })
    if (evaluated.kind === 'refused') {
      return { kind: 'refused', code: promotionRefusalCode(evaluated.code) }
    }
    if (operationMarker.scope !== 'catalog_offering'
      || operationMarker.status !== 'succeeded'
      || operationMarker.requestHash !== evaluated.consumptionDigest
      || operationMarker.resultHash !== evaluated.promotionEvidence.promotionEvidenceDigest
      || business.publicStatus !== 'published'
      || business.suppressedAt !== undefined) {
      return { kind: 'refused', code: 'operation_conflict' }
    }
    const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, args.businessId, now)
    if (support[sealed.offeringRef]?.routeable !== true) {
      return { kind: 'refused', code: 'target_drift' }
    }
    const projection = await rebuildBusinessSupplyProjectionSnapshotCommand({
      db: ctx.db,
      sourceDb: ctx.db,
      businessId: args.businessId,
      support,
      now,
    })
    if (projection.kind !== 'ok') throw new Error(`seller_promotion_projection_failed:${projection.code}`)
    return {
      kind: 'replayed',
      canaryRef: args.canaryRef,
      offeringRef: sealed.offeringRef,
      offeringRevision: sealed.offeringRevision,
      publicationRef: sealed.publicationRef,
      publicationRevision: sealed.publicationRevision,
      toolRef: sealed.draftOperationRef,
      promotionEvidenceDigest: evaluated.promotionEvidence.promotionEvidenceDigest,
      outputDigest: output.outputDigest,
    }
  }

  if ((business.publicStatus !== 'unpublished' && business.publicStatus !== 'published')
    || business.suppressedAt !== undefined) {
    return { kind: 'refused', code: 'target_drift' }
  }
  if (await providerRouteabilityIsFrozen(ctx, args.businessId)) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const promotionTargetPublication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', sealed.publicationRef).eq('revision', sealed.publicationRevision)
    ))
    .unique()
  if (promotionTargetPublication === null) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const offeringDoc = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', promotionTargetPublication.offeringId))
    .unique()
  if (offeringDoc === null || offeringDoc.status !== 'active') {
    return { kind: 'refused', code: 'target_drift' }
  }
  const snapshot = await readExactSellerCanaryOperationSnapshotHandler(ctx, {
    publicationRef: envelope.publicationRef,
    revision: envelope.publicationRevision,
  })
  const currentOperation = snapshot === null
    ? undefined
    : parsePublishedToolSnapshot(snapshot.toolJson)
  if (snapshot === null || currentOperation === undefined) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const current = currentAnchorFromSnapshot(sealed, snapshot, currentOperation)
  const evaluated = evaluateX402SellerPromotion({
    actingOwnerId: args.ownerId,
    sealed,
    current,
    sellerClaimCurrent: await exactCurrentSellerClaim(ctx, currentOperation, current),
    platformFundingAuthorized,
    readinessCurrent: true,
    outputDeterministic: output.deterministic,
    outputAssertionMatched: output.assertionMatched,
    expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
    outputDigest: output.outputDigest,
    commitment,
    observation,
    now,
  })
  if (evaluated.kind === 'refused') {
    return { kind: 'refused', code: promotionRefusalCode(evaluated.code) }
  }

  if (!await admitExactSellerCanaryPublication(
    ctx,
    sealed,
    evaluated.promotionEvidence.promotionEvidenceDigest,
    now,
  )) return { kind: 'refused', code: 'target_drift' }
  if (business.publicStatus === 'unpublished') {
    await ctx.db.patch(args.businessId, { publicStatus: 'published' })
  }
  const publicOperation = await readCurrentPublishedTool(ctx, sealed.draftOperationRef, now)
  if (publicOperation === undefined
    || publicOperation.identity.contractDigest !== sealed.contractDigest
    || publicOperation.identity.bindingDigest !== sealed.bindingDigest
    || publicOperation.priceDigest !== sealed.priceDigest) {
    throw new Error('seller_promotion_post_publish_operation_drift')
  }
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, args.businessId, now)
  if (support[sealed.offeringRef]?.routeable !== true) {
    throw new Error('seller_promotion_post_publish_not_routeable')
  }
  const projection = await rebuildBusinessSupplyProjectionSnapshotCommand({
    db: ctx.db,
    sourceDb: ctx.db,
    businessId: args.businessId,
    support,
    now,
  })
  if (projection.kind !== 'ok') throw new Error(`seller_promotion_projection_failed:${projection.code}`)
  await ctx.db.insert('operationKeys', {
    scope: 'catalog_offering',
    actorKind: 'owner',
    actorRef: args.ownerId,
    operationName: 'promoteX402SellerCanary',
    key: args.canaryRef,
    requestHash: evaluated.consumptionDigest,
    sourceHash: evaluated.promotionEvidence.promotionEvidenceDigest,
    status: 'succeeded',
    resultHash: evaluated.promotionEvidence.promotionEvidenceDigest,
    effectRefs: [
      args.canaryRef,
      sealed.offeringRef,
      `${sealed.publicationRef}@${sealed.publicationRevision}`,
      sealed.draftOperationRef,
    ],
    createdAt: now,
    updatedAt: now,
  })
  await markSellerCanaryAdmissionPublished(
    ctx,
    sealed.publicationRef,
    sealed.publicationRevision,
    now,
  )
  return {
    kind: 'promoted',
    canaryRef: args.canaryRef,
    offeringRef: sealed.offeringRef,
    offeringRevision: sealed.offeringRevision,
    publicationRef: sealed.publicationRef,
    publicationRevision: sealed.publicationRevision,
    toolRef: sealed.draftOperationRef,
    promotionEvidenceDigest: evaluated.promotionEvidence.promotionEvidenceDigest,
    outputDigest: output.outputDigest,
  }
}

async function markSellerCanaryAdmissionPublished(
  ctx: MutationCtx,
  publicationRef: string,
  publicationRevision: number,
  now: number,
): Promise<void> {
  const admissionCase = await ctx.db.query('capabilitySupplyAdmissionCases')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', publicationRef).eq('publicationRevision', publicationRevision)
    ))
    .unique()
  if (admissionCase === null) return
  await ctx.db.patch(admissionCase._id, {
    state: 'completed',
    terminalDecision: 'published',
    blockerRefs: [],
    completedAt: now,
    updatedAt: now,
  })
}

export const promoteX402SellerCanaryResultValue = v.union(
  v.object({
    kind: v.union(v.literal('promoted'), v.literal('replayed')),
    canaryRef: v.string(),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    publicationRef: v.string(),
    publicationRevision: v.number(),
    toolRef: v.string(),
    promotionEvidenceDigest: v.string(),
    outputDigest: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('unauthenticated'),
      v.literal('wrong_owner'),
      v.literal('source_write_refused'),
      v.literal('canary_not_found'),
      v.literal('canary_evidence_invalid'),
      v.literal('target_drift'),
      v.literal('operation_conflict'),
      v.literal('seller_claim_stale'),
      v.literal('funding_authority_invalid'),
      v.literal('readiness_stale'),
      v.literal('output_nondeterministic'),
      v.literal('canary_pending'),
      v.literal('reconciliation_required'),
      v.literal('canary_identity_mismatch'),
      v.literal('canary_expired'),
      v.literal('operation_commitment_stale'),
      v.literal('invocation_refused'),
      v.literal('payment_not_settled'),
      v.literal('payment_evidence_missing'),
      v.literal('spend_commitment_mismatch'),
      v.literal('output_contract_invalid'),
      v.literal('output_unusable'),
    ),
  }),
)
