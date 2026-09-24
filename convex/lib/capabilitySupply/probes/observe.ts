import { X402_SELLER_CANARY_ADMISSION_REQUIRED_REF } from '@/modules/capability-supply/convex'
import {
  publicationLifecycle,
  validRegistrationContext,
  readinessOutcomeValue,
  x402SellerCanaryAdmissionIsSatisfied,
} from '@/modules/capability-supply/public'
import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import {
  convexPublicationLifecycle,
  contextFields,
  publicationLifecycleValue,
} from '../../../capabilitySupplyShared'
import { syncMarketToolPresence } from '../../../marketPresence'
import { publishValidatedNativeDraft } from '../../../capabilitySupplyNativeAdmission'
import { capabilityProbeAuthorityValue } from './authority'

export const observeCapabilityReadinessArgs = {
  publicationRef: v.string(),
  expectedRevision: v.number(),
  credentialState: v.union(v.literal('ready'), v.literal('unavailable')),
  healthState: v.union(v.literal('healthy'), v.literal('unhealthy')),
  validUntil: v.number(),
  ...contextFields,
} as const
export const observeCapabilityReadinessReturns = v.union(
  v.object({
    kind: v.literal('observed'),
    publicationRef: v.string(),
    revision: v.number(),
    lifecycle: publicationLifecycleValue,
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'),
      v.literal('publication_not_found'),
      v.literal('revision_changed'),
      v.literal('observation_invalid'),
    ),
  }),
)
export const recordCapabilityProbeResultArgs = {
  publicationRef: v.string(),
  expectedRevision: v.number(),
  targetDigest: v.string(),
  requestDigest: v.string(),
  responseStatus: v.optional(v.number()),
  responseContentType: v.optional(v.string()),
  responseDigest: v.optional(v.string()),
  outcome: readinessOutcomeValue,
  credentialState: v.union(v.literal('ready'), v.literal('unavailable')),
  healthState: v.union(v.literal('healthy'), v.literal('unhealthy')),
  observedAt: v.number(),
  validUntil: v.number(),
  evidenceRefs: v.array(v.string()),
  resourceAuthority: capabilityProbeAuthorityValue,
} as const
export const recordOwnerStagedCapabilityProbeResultArgs = {
  ...recordCapabilityProbeResultArgs,
  businessId: v.id('businesses'),
} as const
export const recordCapabilityProbeResultReturns = v.union(
  v.object({
    kind: v.literal('observed'),
    publicationRef: v.string(),
    revision: v.number(),
    lifecycle: publicationLifecycleValue,
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('revision_changed'),
      v.literal('target_changed'),
    ),
  }),
)

/** Fixture/curated-seed helper. Production owner readiness uses probe → record. */
export async function observeCapabilityReadinessHandler(
  ctx: MutationCtx,
  args: {
    publicationRef: string
    expectedRevision: number
    credentialState: 'ready' | 'unavailable'
    healthState: 'healthy' | 'unhealthy'
    validUntil: number
    operationKey: string
    correlationId: string
    reasonCode: string
    evidenceRefs: string[]
  },
) {
  const now = Date.now()
  if (
    !validRegistrationContext(args) ||
    !Number.isSafeInteger(args.expectedRevision) ||
    args.validUntil <= now ||
    args.validUntil > now + 86_400_000
  ) {
    return {
      kind: 'refused' as const,
      reason: 'observation_invalid' as const,
    }
  }
  const publication = await ctx.db
    .query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (index) =>
      index
        .eq('publicationRef', args.publicationRef)
        .eq('revision', args.expectedRevision),
    )
    .unique()
  if (publication === null)
    return {
      kind: 'refused' as const,
      reason: 'publication_not_found' as const,
    }
  if (publication.disposition !== 'current') {
    return { kind: 'refused' as const, reason: 'revision_changed' as const }
  }
  await ctx.db.patch(publication._id, {
    credentialState: args.credentialState,
    healthState: args.healthState,
    readinessEvidenceRefs: [...args.evidenceRefs],
    readinessObservedAt: now,
    readinessValidUntil: args.validUntil,
    ...(args.healthState === 'healthy' ? { readinessLastHealthyAt: now } : {}),
    updatedAt: now,
  })
  await syncMarketToolPresence(ctx, {
    toolRef: publication.toolRef,
    businessId: publication.businessId,
    active: publication.sourceAuthorityState !== 'review_required'
      && args.credentialState === 'ready'
      && args.healthState === 'healthy',
    now,
  })
  const [offering, binding] = await Promise.all([
    ctx.db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (index) =>
        index.eq('offeringId', publication.offeringId),
      )
      .unique(),
    ctx.db
      .query('capabilityTransportBindings')
      .withIndex('by_bindingId', (index) =>
        index.eq('bindingId', publication.bindingId),
      )
      .unique(),
  ])
  if (offering === null || binding === null)
    throw new Error('capability_publication_supply_integrity_failure')
  const result = {
    kind: 'observed' as const,
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    lifecycle: convexPublicationLifecycle(
      publicationLifecycle(
        {
          ...publication,
          credentialState: args.credentialState,
          healthState: args.healthState,
          readinessObservedAt: now,
          readinessValidUntil: args.validUntil,
          ...(args.healthState === 'healthy'
            ? { readinessLastHealthyAt: now }
            : publication.readinessLastHealthyAt === undefined
              ? {}
              : { readinessLastHealthyAt: publication.readinessLastHealthyAt }),
        },
        offering,
        binding,
        now,
      ),
    ),
  }
  return result
}

type ObservedProbeRecordResult = Readonly<{
  kind: 'observed'
  publicationRef: string
  revision: number
  lifecycle: ReturnType<typeof publicationLifecycle>
}>

export async function applyObservedCapabilityProbeSideEffects(
  ctx: MutationCtx,
  args: Readonly<{
    healthState: 'healthy' | 'unhealthy'
    outcome: Infer<typeof readinessOutcomeValue>
    observedAt: number
  }>,
  result: ObservedProbeRecordResult,
) {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', result.publicationRef)
        .eq('revision', result.revision)
    ))
    .unique()
  if (publication !== null) {
    if (result.lifecycle.state === 'active') await publishValidatedNativeDraft(ctx, publication, Date.now())
    if (result.lifecycle.state === 'active'
      && publication.authorityMode === 'provider_owned'
      && publication.sourceRouteRef !== undefined) {
      const priorObservations = await ctx.db.query('capabilityPublications')
        .withIndex('by_sourceRouteRef_and_disposition', (query) => (
          query.eq('sourceRouteRef', publication.sourceRouteRef)
            .eq('disposition', 'current')
        ))
        .take(16)
      for (const prior of priorObservations) {
        if (prior._id === publication._id || prior.authorityMode === 'provider_owned') continue
        await ctx.db.patch(prior._id, { disposition: 'superseded', updatedAt: Date.now() })
        await syncMarketToolPresence(ctx, {
          toolRef: prior.toolRef,
          businessId: prior.businessId,
          active: false,
          now: Date.now(),
        })
      }
    }
    await syncMarketToolPresence(ctx, {
      toolRef: publication.toolRef,
      businessId: publication.businessId,
      active: result.lifecycle.state === 'active',
      now: Date.now(),
    })
  }
  const admissionCase = await ctx.db.query('capabilitySupplyAdmissionCases')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', result.publicationRef)
        .eq('publicationRevision', result.revision)
    ))
    .unique()
  if (admissionCase !== null) {
    const evidenceRefs = publication?.registrationEvidenceRefs ?? []
    const canaryFenceUnsatisfied =
      evidenceRefs.filter((ref) => ref === X402_SELLER_CANARY_ADMISSION_REQUIRED_REF).length === 1
      && !x402SellerCanaryAdmissionIsSatisfied(evidenceRefs)
    if (canaryFenceUnsatisfied) {
      if (args.healthState === 'healthy' && args.outcome === 'healthy') {
        await ctx.db.patch(admissionCase._id, {
          state: admissionCase.state === 'submitted' ? 'under_review' : admissionCase.state,
          reviewStartedAt: admissionCase.reviewStartedAt ?? args.observedAt,
          updatedAt: Date.now(),
        })
      } else {
        await ctx.db.patch(admissionCase._id, {
          state: 'completed',
          terminalDecision: 'action_required',
          blockerRefs: [...result.lifecycle.reasons],
          reviewStartedAt: admissionCase.reviewStartedAt ?? args.observedAt,
          completedAt: args.observedAt,
          updatedAt: Date.now(),
        })
      }
    } else {
      const published = result.lifecycle.state === 'active'
      await ctx.db.patch(admissionCase._id, {
        state: 'completed',
        terminalDecision: published ? 'published' : 'action_required',
        blockerRefs: published ? [] : [...result.lifecycle.reasons],
        reviewStartedAt: admissionCase.reviewStartedAt ?? args.observedAt,
        completedAt: args.observedAt,
        updatedAt: Date.now(),
      })
    }
  }
}
