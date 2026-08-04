import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'
import type { BusinessMutationActor, BusinessSourceState } from '@/modules/business/public'
import {
  createEmptyCatalogSourceState,
  publishBusinessCatalog,
  type ServiceCatalogInput,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { matchingCsrf } from '@/modules/common/matching-csrf'
import type { CapabilityLaunchSupportRecord } from '@/modules/inquiries/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import {
  DEV_SEED_BUSINESS_FIXTURES,
  type DevSeedBusinessFixture,
  type DevSeedOfferingFixture,
} from './dev-seed-business-fixtures'
export {
  DEV_SEED_BUSINESS_COUNT,
  DEV_SEED_BUSINESS_FIXTURES,
  type DevSeedBusinessFixture,
  type DevSeedOfferingAccessPathFixture,
  type DevSeedOfferingFixture,
} from './dev-seed-business-fixtures'



export type DevSeedCatalogState = BusinessSourceState & RegistrySourceState

export type DevSeedCatalogBundle = {
  ownerClerkUserId: string
  state: DevSeedCatalogState
  supportRecord: CapabilityLaunchSupportRecord
  seededSlugs: readonly string[]
}

export const DEV_SEED_OWNER_CLERK_USER_ID = 'dev-seed-owner-session'

/**
 * The email hash is what makes the owner a *resolvable recipient*. Without it
 * `toResolvableOwnerRecipient` yields nothing, every seeded business fails
 * admission on `recipient_unresolvable`, and no business can accept a first
 * contact — so the whole inquiry path, human and agent, is unreachable in
 * development. Hashed the same way `convex/authz.ts` hashes a real identity.
 */
export const DEV_SEED_OWNER_EMAIL = 'dev-seed-owner@agentic.market' as const

const devSeedActor: BusinessMutationActor = {
  kind: 'authenticated_owner',
  clerkUserId: DEV_SEED_OWNER_CLERK_USER_ID,
  displayName: 'Dev Seed Owner',
  emailHash: canonicalDigest({ email: DEV_SEED_OWNER_EMAIL }),
}

const devSeedNow = 1_777_100_000_000


export function buildDevSeedCatalogState(
  fixtures: readonly DevSeedBusinessFixture[] = DEV_SEED_BUSINESS_FIXTURES
): DevSeedCatalogBundle {
  let state: DevSeedCatalogState = {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    suppressionRules: [],
  }

  for (const [index, fixture] of fixtures.entries()) {
    const now = devSeedNow + index * 1_000
    state = seedBusinessFixture(state, fixture, now)
  }

  const primaryBusiness = state.businesses.find((business) => business.slug === fixtures[0]?.requestedSlug)
  if (primaryBusiness === undefined) {
    throw new Error('Dev seed fixture did not produce a primary business.')
  }

  const owner = state.owners.find((candidate) => candidate.clerkUserId === DEV_SEED_OWNER_CLERK_USER_ID)
  if (owner === undefined) {
    throw new Error('Dev seed fixture did not produce the seed owner.')
  }

  return {
    ownerClerkUserId: DEV_SEED_OWNER_CLERK_USER_ID,
    state,
    supportRecord: createHumanInquirySupportRecord({
      primaryOwnerRef: owner.ownerId,
      now: devSeedNow + fixtures.length * 1_000,
    }),
    seededSlugs: fixtures.map((fixture) => fixture.requestedSlug),
  }
}

function seedBusinessFixture(
  state: DevSeedCatalogState,
  fixture: DevSeedBusinessFixture,
  now: number
): DevSeedCatalogState {
  const claim = claimBusiness(state, {
    actor: devSeedActor,
    facts: {
      name: fixture.businessName,
      category: fixture.category,
      suburb: fixture.suburb,
      stateTerritory: fixture.stateTerritory,
      requestedSlug: fixture.requestedSlug,
      ...(fixture.publishedPhone === undefined ? {} : { publishedPhone: fixture.publishedPhone }),
      ownerMessage: fixture.ownerMessage,
      sourceRefs: [
        {
          label: fixture.sourceLabel,
          evidenceRef: `private:evidence:dev-seed:${fixture.requestedSlug}`,
          sourceHash: canonicalDigest(`dev-seed:${fixture.requestedSlug}`),
        },
      ],
      ...(fixture.photoUrl === undefined || fixture.photoUrl.length === 0
        ? {}
        : { photos: [{ url: fixture.photoUrl, alt: `${fixture.businessName} photo` }] }),
      ...(fixture.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: fixture.responseTimeMinutes }),
    },
    security: {
      csrf: matchingCsrf(`claim:${fixture.requestedSlug}`),
    },
    operationKey: operationKey(`claim:${fixture.requestedSlug}`),
    correlationId: correlationId(`claim:${fixture.requestedSlug}`),
    now,
  })

  if (claim.kind === 'error') {
    throw new Error(`Dev seed claim failed for ${fixture.requestedSlug}: ${claim.reason}`)
  }

  const published = publishBusinessCatalog(state, {
    actor: devSeedActor,
    claimId: claim.claim.claimId,
    services: fixture.offerings.map(toServiceCatalogInput),
    security: { csrf: matchingCsrf(`publish:${fixture.requestedSlug}`) },
    operationKey: operationKey(`publish:${fixture.requestedSlug}`),
    correlationId: correlationId(`publish:${fixture.requestedSlug}`),
    now: now + 500,
  })

  if (published.kind === 'error') {
    throw new Error(`Dev seed publish failed for ${fixture.requestedSlug}: ${published.reason}`)
  }

  return state
}

function createHumanInquirySupportRecord(input: {
  primaryOwnerRef: string
  now: number
}): CapabilityLaunchSupportRecord {
  return {
    capability: 'human_inquiry_owner_inbox',
    primaryOwnerRef: input.primaryOwnerRef,
    primaryAdminOperatorRef: 'admin:dev-seed-primary',
    backupOwnerRef: 'owner:dev-seed-backup',
    backupAdminOperatorRef: 'admin:dev-seed-backup',
    supportedStage: 'manual_support',
    supportedChannels: ['public_inquiry', 'owner_inbox', 'email_notification', 'provider_readback', 'operator_readback'],
    capacityThreshold: {
      maxOpenThreads: 25,
      maxFailedNotifications: 10,
    },
    backlogAgeThresholdMs: 7 * 24 * 60 * 60 * 1_000,
    phaseIncidentCounts: {
      retryExhausted: 0,
      noRepair: 0,
      unresolvedDeliveryFailures: 0,
      abuseBlocked: 0,
      privacyDeletes: 0,
    },
    supportEscalationPath: 'Dev seed operator readback queue, then founder support.',
    claimDisablePath: 'Set inquiries_enabled false or remove inquiry_available from the published service capability.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Support capacity, backlog age, retry-exhausted, or no-repair threshold is exceeded.',
        action: 'Suppress public inquiry availability and keep existing owner readbacks available.',
      },
      {
        channel: 'email_notification',
        trigger: 'Provider verification or dispatch credentials fail.',
        action: 'Hold delivery in source state and do not claim provider delivery.',
      },
    ],
    evidenceRefs: ['convex/devSeed.ts', 'src/modules/dev/internal/dev-seed-fixture.ts'],
    sourceHash: canonicalDigest({ supportRecord: 'human_inquiry_owner_inbox', stage: 'dev-seed' }),
    correlationId: brandNonEmpty('correlation:dev-seed-support-record', 'CorrelationId'),
    lastReviewedAt: input.now,
  }
}

function toServiceCatalogInput(offering: DevSeedOfferingFixture): ServiceCatalogInput {
  return {
    name: offering.name,
    category: offering.category,
    summary: offering.summary,
    serviceArea: offering.serviceAreaSummary,
    hoursOrUnknown: offering.availabilitySummary,
    firstRequest:
      offering.firstRequestMode === 'not_available_yet'
        ? {
            mode: offering.firstRequestMode,
            publicChannel: 'not_available',
            publicDisclosure: offering.publicDisclosure,
            noContactReason: offering.noContactReason,
          }
        : {
            mode: offering.firstRequestMode,
            publicChannel: offering.firstRequestMode === 'quote_request_available' ? 'ae_status_only' : 'public_business_contact',
            publicDisclosure: offering.publicDisclosure,
          },
  }
}


function operationKey(value: string) {
  return brandNonEmpty(`op:dev-seed:${value}`, 'OperationKey')
}

function correlationId(value: string) {
  return brandNonEmpty(`corr:dev-seed:${value}`, 'CorrelationId')
}
