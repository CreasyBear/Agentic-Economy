import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, type MutationCtx } from './_generated/server'
import {
  admitSandboxV2Supply,
  registerSandboxBusinesses,
  registerSandboxRouteSupplyRegistrations,
  registerSandboxWorkflowSupplyRegistrations,
  registerSandboxV2SupplyRegistrations,
  retireSandboxV2AcceptanceSupply,
  retireSupersededSandboxItineraryBuilderSupply,
  retireSupersededSandboxProcurementSupply,
  retireSupersededSandboxRouteSupply,
  retireSupersededSandboxV2Supply,
  seedSandboxCapabilityPublication,
} from './devSeed'
import { setCapabilitySupplyEligibilityCommand } from './capabilitySupply'
import { runtimeDb } from './source_state'
import { DEV_SEED_BUSINESS_FIXTURES } from '../src/modules/dev/public'
import { SANDBOX_WORKFLOW_PROVIDER_PROFILES } from '../src/modules/sandbox-supply/workflow-cohorts'

export const seedLabelledSandboxSupply = internalMutation({
  args: {
    includeComparisonOptions: v.optional(v.boolean()),
    ownerClerkUserId: v.optional(v.string()),
  },
  returns: v.object({
    seededSlugs: v.array(v.string()),
    businessIdsBySlug: v.record(v.string(), v.string()),
    ownerClerkUserId: v.string(),
    sandboxV2Bindings: v.array(v.string()),
    sandboxCapabilityPublicationRefs: v.array(v.string()),
    retiredSandboxV2Bindings: v.array(v.string()),
    sandboxRouteBindings: v.array(v.string()),
    sandboxRoutePublicationRefs: v.array(v.string()),
    sandboxWorkflowBindings: v.array(v.string()),
    sandboxWorkflowPublicationRefs: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const registeredAt = Date.now()
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
      fixture.requestedSlug.startsWith('sandbox-')
    ))
    const existing = await Promise.all(fixtures.map(async (fixture) => (
      await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', fixture.requestedSlug))
        .unique()
    )))
    for (const [index, fixture] of fixtures.entries()) {
      const business = existing[index]
      if (business !== undefined && business !== null && (
        business.name !== fixture.businessName
        || business.category !== fixture.category
        || business.claimStatus !== 'published'
        || business.publicStatus !== 'published'
      )) throw new Error('sandbox_acceptance_supply_identity_mismatch')
    }
    const missingFixtures = fixtures.filter((_, index) => existing[index] === null)
    const created = await registerSandboxBusinesses(runtimeDb(ctx.db), missingFixtures, registeredAt)
    const businesses = {
      seededSlugs: fixtures.map((fixture) => fixture.requestedSlug),
      businessIdsBySlug: {
        ...Object.fromEntries(fixtures.flatMap((fixture, index) => {
          const business = existing[index]
          return business === undefined || business === null ? [] : [[fixture.requestedSlug, business._id]]
        })),
        ...created.businessIdsBySlug,
      },
    }
    const ownerClerkUserId = args.ownerClerkUserId?.trim() || 'dev-seed-owner-session'
    if (ownerClerkUserId !== 'dev-seed-owner-session') {
      await bindLabelledSandboxBusinessesToOwner(
        ctx.db,
        fixtures.map((fixture) => fixture.requestedSlug),
        ownerClerkUserId,
        registeredAt + 1_000,
      )
    }
    const [registrations, routeRegistrations, workflowRegistrations] = await Promise.all([
      registerSandboxV2SupplyRegistrations(ctx.db, registeredAt + 2_000),
      registerSandboxRouteSupplyRegistrations(ctx.db, registeredAt + 2_100),
      registerSandboxWorkflowSupplyRegistrations(ctx.db, registeredAt + 2_200),
    ])
    const [
      sandboxV2Bindings,
      sandboxRouteBindings,
      sandboxCapabilityPublicationRefs,
      sandboxRoutePublicationRefs,
      sandboxWorkflowBindings,
      sandboxWorkflowPublicationRefs,
    ] = await Promise.all([
      admitSandboxV2Supply(ctx.db, registrations, registeredAt + 2_500),
      admitSandboxV2Supply(ctx.db, routeRegistrations, registeredAt + 2_600),
      Promise.all(registrations.map(async (registration, index) => {
        const publicationRef = await seedSandboxCapabilityPublication(
          ctx.db, registration, registeredAt + 2_750 + index,
        )
        await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
          publicationRef, expectedRevision: 1,
        })
        return publicationRef
      })),
      Promise.all(routeRegistrations.map(async (registration, index) => {
        const publicationRef = await seedSandboxCapabilityPublication(
          ctx.db, registration, registeredAt + 2_800 + index,
        )
        await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
          publicationRef, expectedRevision: 1,
        })
        return publicationRef
      })),
      admitSandboxV2Supply(ctx.db, workflowRegistrations, registeredAt + 2_650),
      Promise.all(workflowRegistrations.map(async (registration, index) => {
        const publicationRef = await seedSandboxCapabilityPublication(
          ctx.db, registration, registeredAt + 2_900 + index,
        )
        await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
          publicationRef, expectedRevision: 1,
        })
        return publicationRef
      })),
    ])
    await retireSupersededSandboxV2Supply(ctx.db, registrations, registeredAt + 3_000)
    await retireSupersededSandboxRouteSupply(ctx.db, routeRegistrations, registeredAt + 3_050)
    await retireSupersededSandboxProcurementSupply(
      ctx.db, workflowRegistrations, registeredAt + 3_075,
    )
    await retireSupersededSandboxItineraryBuilderSupply(
      ctx.db, workflowRegistrations, registeredAt + 3_080,
    )
    const retiredSandboxV2Bindings = args.includeComparisonOptions === false
      ? await retireSandboxV2AcceptanceSupply(ctx.db, registrations, registeredAt + 3_100)
      : []
    return {
      ...businesses, ownerClerkUserId, sandboxV2Bindings, sandboxCapabilityPublicationRefs,
      retiredSandboxV2Bindings, sandboxRouteBindings, sandboxRoutePublicationRefs,
      sandboxWorkflowBindings, sandboxWorkflowPublicationRefs,
    }
  },
})

export const seedSyntheticEventWorkflowSupply = internalMutation({
  args: {},
  returns: v.object({
    bindings: v.array(v.string()),
    publicationRefs: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const registeredAt = Date.now()
    const registrations = await registerSandboxWorkflowSupplyRegistrations(
      ctx.db,
      registeredAt,
      ['public-event-activation'],
    )
    const bindings = await admitSandboxV2Supply(ctx.db, registrations, registeredAt + 500)
    const eventProfiles = Object.values(SANDBOX_WORKFLOW_PROVIDER_PROFILES)
      .filter((profile) => profile.cohortId === 'public-event-activation')
    for (const [index, profile] of eventProfiles.entries()) {
      const [priorOffering, priorBinding] = await Promise.all([
        ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.priorOfferingId))
          .unique(),
        ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.priorBindingId))
          .unique(),
      ])
      if (priorOffering !== null && priorBinding !== null) {
        const evidenceRef = 'seed:synthetic-event-contract-replaced'
        const retired = await setCapabilitySupplyEligibilityCommand(ctx.db, {
          actor: { kind: 'system', ref: 'system:dev-seed' },
          context: {
            operationKey: `seed:synthetic-event-retire:${priorBinding.bindingId}`,
            correlationId: 'seed:synthetic-event-workflow',
            reasonCode: 'labelled_sandbox_workflow_contract_replaced',
            evidenceRefs: [evidenceRef],
          },
          eligibility: {
            offeringId: priorOffering.offeringId,
            bindingId: priorBinding.bindingId,
            contractRef: {
              capabilityId: priorBinding.capabilityId,
              version: priorBinding.version,
              contractDigest: priorBinding.contractDigest,
            },
            decision: 'revoke',
            expectedOfferingRegistrationHash: priorOffering.registrationHash,
            expectedBindingRegistrationHash: priorBinding.registrationHash,
            admissionEvidenceRefs: [evidenceRef],
            conformanceEvidenceRefs: [evidenceRef],
          },
        }, registeredAt + 750 + index)
        if (retired.kind !== 'ineligible') {
          throw new Error(`synthetic_event_prior_binding_retirement_${retired.kind}`)
        }
      }
    }
    const publicationRefs = await Promise.all(registrations.map(async (registration, index) => {
      const publicationRef = await seedSandboxCapabilityPublication(
        ctx.db,
        registration,
        registeredAt + 1_000 + index,
      )
      await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
        publicationRef,
        expectedRevision: 1,
      })
      return publicationRef
    }))
    return { bindings, publicationRefs }
  },
})

async function bindLabelledSandboxBusinessesToOwner(
  db: MutationCtx['db'],
  slugs: readonly string[],
  ownerClerkUserId: string,
  now: number,
): Promise<void> {
  if (!ownerClerkUserId.startsWith('user_') || ownerClerkUserId.length > 200) {
    throw new Error('sandbox_acceptance_owner_identity_invalid')
  }
  let targetOwner = await db.query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', ownerClerkUserId))
    .unique()
  if (targetOwner === null) {
    const ownerId = await db.insert('owners', {
      clerkUserId: ownerClerkUserId,
      displayName: 'Labelled sandbox business owner',
      createdAt: now,
      updatedAt: now,
    })
    targetOwner = await db.get(ownerId)
  }
  if (targetOwner === null) throw new Error('sandbox_acceptance_owner_creation_failed')

  await Promise.all(slugs.map(async (slug) => {
    const business = await db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', slug))
      .unique()
    if (business === null) throw new Error(`sandbox_acceptance_business_missing:${slug}`)
    const currentOwner = await db.get(business.ownerId)
    if (currentOwner === null
      || (currentOwner.clerkUserId !== 'dev-seed-owner-session'
        && currentOwner.clerkUserId !== ownerClerkUserId)) {
      throw new Error(`sandbox_acceptance_owner_rebind_denied:${slug}`)
    }
    const claims = await db.query('claims')
      .withIndex('by_business_status', (query) => query.eq('businessId', business._id))
      .take(3)
    if (claims.length !== 1 || claims[0]?.status !== 'published') {
      throw new Error(`sandbox_acceptance_claim_integrity_failure:${slug}`)
    }
    if (business.ownerId !== targetOwner._id) {
      await db.patch(business._id, { ownerId: targetOwner._id, updatedAt: now })
    }
    if (claims[0].ownerId !== targetOwner._id) {
      await db.patch(claims[0]._id, { ownerId: targetOwner._id, updatedAt: now })
    }
  }))
}
