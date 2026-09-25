import { degradeBackend } from '@/lib/observability/degrade-backend'

import {
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { CallGrant } from '@/modules/capability-execution/call-authority'
import type { AgentAccessGrant } from '@/modules/agent-access/policy'

import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { CanaryEnvelope, RequestArgs } from './contracts'

export async function existingCanaryForPublication(
  ctx: MutationCtx,
  publication: Doc<'capabilityPublications'>,
): Promise<CanaryEnvelope | null> {
  const offering = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
    .unique()
  const origin = offering?.origin
  if (origin?.kind !== 'catalog_offering') return null
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_sellerOnboardingCanary_target', (query) => (
      query.eq('sellerOnboardingCanary.businessId', String(publication.businessId))
        .eq('sellerOnboardingCanary.offeringRef', origin.offeringRef)
        .eq('sellerOnboardingCanary.offeringRevision', origin.offeringRevision)
        .eq('sellerOnboardingCanary.offeringSourceHash', origin.offeringSourceHash)
        .eq('sellerOnboardingCanary.publicationRef', publication.publicationRef)
        .eq('sellerOnboardingCanary.publicationRevision', publication.revision)
    ))
    .take(2)
  const row = rows.length === 1 ? rows[0] : undefined
  return row?.sellerOnboardingCanary ?? null
}

export function operationGrant(grant: AgentAccessGrant): CallGrant {
  return {
    grantRef: grant.grantRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    applicationRef: grant.applicationRef,
    credentialId: grant.credentialId,
    environment: grant.environment,
    generation: grant.generation,
    policyDigest: grant.spendingPolicyDigest,
    expiresAt: grant.expiresAt,
    lifecycle: 'active',
    toolAccess: grant.toolAccess,
    toolRefs: grant.toolRefs,
  }
}

export function stableCanaryIdentity(envelope: CanaryEnvelope) {
  return {
    executionPurpose: envelope.executionPurpose,
    canaryRef: envelope.canaryRef,
    toolRef: envelope.toolRef,
    ownerId: envelope.ownerId,
    businessId: envelope.businessId,
    offeringRef: envelope.offeringRef,
    offeringRevision: envelope.offeringRevision,
    offeringSourceHash: envelope.offeringSourceHash,
    accessPathRef: envelope.accessPathRef,
    accessPathSourceHash: envelope.accessPathSourceHash,
    publicationRef: envelope.publicationRef,
    publicationRevision: envelope.publicationRevision,
    contractDigest: envelope.contractDigest,
    bindingDigest: envelope.bindingDigest,
    priceDigest: envelope.priceDigest,
    sellerPayTo: envelope.sellerPayTo.toLowerCase(),
  }
}

export function persistedCanaryCommitmentIsValid(envelope: CanaryEnvelope): boolean {
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
    return reconstructed.canaryRef === envelope.canaryRef
      && reconstructed.commitmentDigest === envelope.canaryCommitmentDigest
      && canonicalDigest(sellerOnboardingCanaryExecutionEnvelope(reconstructed) as never)
        === canonicalDigest(envelope as never)
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'persistedCanaryCommitmentIsValid', reason: 'invalid_response' })
  }
}

export function exactPersistedCanaryIdentity(
  row: Doc<'capabilityCalls'>,
  requested: CanaryEnvelope,
): boolean {
  const existing = row.sellerOnboardingCanary
  return existing !== undefined
    && persistedCanaryCommitmentIsValid(existing)
    && existing.canaryRef === requested.canaryRef
    && canonicalDigest(stableCanaryIdentity(existing) as never)
      === canonicalDigest(stableCanaryIdentity(requested) as never)
    && row.callRef === existing.callRef
    && row.toolRef === existing.toolRef
    && row.inputDigest === existing.inputDigest
    && row.idempotencyKey === existing.idempotencyKey
    && row.principalId === existing.funding.principalId
    && row.ownerId === existing.funding.ownerId
    && row.credentialId === existing.funding.credentialId
    && row.applicationRef === existing.funding.applicationRef
    && row.grantRef === existing.funding.grantRef
    && row.grantGeneration === existing.funding.grantGeneration
    && row.policyDigest === existing.funding.policyDigest
}

export async function exactCatalogIdentity(
  ctx: MutationCtx,
  args: RequestArgs,
): Promise<boolean> {
  const [offering, revision] = await Promise.all([
    ctx.db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', args.offeringRef))
      .unique(),
    ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', args.offeringRef).eq('revision', args.offeringRevision)
      ))
      .unique(),
  ])
  return offering !== null
    && revision !== null
    && offering.businessId === args.businessId
    && revision.businessId === args.businessId
    && offering.currentRevision === args.offeringRevision
    && offering.status === 'published'
    && revision.sourceHash === args.offeringSourceHash
}
