import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'
import type { BusinessMutationActor, BusinessSourceState } from '@/modules/business/public'
import {
  createEmptyCatalogSourceState,
  publishBusinessCatalog,
  type FirstRequestMode,
  type ServiceCatalogInput,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import type { CapabilityLaunchSupportRecord } from '@/modules/inquiries/public'
import type { RegistrySourceState } from '@/modules/registry/public'

export type DevSeedBusinessFixture = {
  requestedSlug: string
  businessName: string
  category: string
  suburb: string
  stateTerritory: string
  ownerMessage: string
  sourceLabel: string
  serviceName: string
  serviceCategory: string
  serviceSummary: string
  serviceArea: string
  hoursOrUnknown: string
  photoUrl?: string
  responseTimeMinutes?: number
  firstRequestMode: FirstRequestMode
  publicDisclosure: string
  noContactReason: string
}

export type DevSeedCatalogState = BusinessSourceState & RegistrySourceState

export type DevSeedCatalogBundle = {
  ownerClerkUserId: string
  state: DevSeedCatalogState
  supportRecord: CapabilityLaunchSupportRecord
  seededSlugs: readonly string[]
}

export const DEV_SEED_OWNER_CLERK_USER_ID = 'dev-seed-owner-session'

export const DEV_SEED_BUSINESS_FIXTURES: readonly DevSeedBusinessFixture[] = [
  {
    requestedSlug: 'plumbing-demo',
    businessName: 'Demo Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    ownerMessage: 'Dev seed fixture for Phase 2 inquiry verification.',
    sourceLabel: 'Dev seed service facts',
    serviceName: 'Emergency plumbing',
    serviceCategory: 'Emergency plumbing',
    serviceSummary: 'Human triage for urgent plumbing issues.',
    serviceArea: 'Parramatta',
    hoursOrUnknown: 'Hours supplied by owner',
    photoUrl: '/images/illustration/cat-plumbing.png',
    responseTimeMinutes: 22,
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Use the inquiry form for a first contact.',
    noContactReason: '',
  },
  {
    requestedSlug: 'parramatta-emergency-plumbing',
    businessName: 'Parramatta Emergency Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    ownerMessage: 'Owner supplied emergency plumbing facts for the public service page.',
    sourceLabel: 'Owner supplied service facts',
    serviceName: 'Emergency pipe repair',
    serviceCategory: 'Emergency plumbing',
    serviceSummary: 'Burst pipe triage and repair for urgent local plumbing jobs.',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursOrUnknown: 'Hours supplied by owner',
    photoUrl: '/images/illustration/cat-plumbing.png',
    responseTimeMinutes: 22,
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Use the inquiry form for a first contact.',
    noContactReason: '',
  },
  {
    requestedSlug: 'agentic-economy-r10-readback',
    businessName: 'Agentic Economy R10 Readback',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    ownerMessage: 'Phase 1 deployed verification fixture for public catalog routes.',
    sourceLabel: 'Deployed verification service facts',
    serviceName: 'Emergency pipe repair',
    serviceCategory: 'Emergency plumbing',
    serviceSummary: 'Verification service page for public registry and listing routes.',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursOrUnknown: 'Hours supplied by owner',
    photoUrl: '/images/illustration/cat-plumbing.png',
    responseTimeMinutes: 22,
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Use the inquiry form for a first contact.',
    noContactReason: '',
  },
] as const

const devSeedActor: BusinessMutationActor = {
  kind: 'authenticated_owner',
  clerkUserId: DEV_SEED_OWNER_CLERK_USER_ID,
  displayName: 'Dev Seed Owner',
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
      ownerMessage: fixture.ownerMessage,
      sourceRefs: [
        {
          label: fixture.sourceLabel,
          evidenceRef: `private:evidence:dev-seed:${fixture.requestedSlug}`,
          sourceHash: brandNonEmpty(`hash:dev-seed:${fixture.requestedSlug}`, 'SourceHash'),
        },
      ],
      ...(fixture.photoUrl === undefined || fixture.photoUrl.length === 0
        ? {}
        : { photos: [{ url: fixture.photoUrl, alt: `${fixture.businessName} photo` }] }),
      ...(fixture.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: fixture.responseTimeMinutes }),
    },
    security: {
      csrf: matchingCsrf(`claim:${fixture.requestedSlug}`),
      rateLimit: {
        scope: 'claim_submit',
        key: `dev-seed:${fixture.requestedSlug}`,
        now,
        limit: 5,
        windowMs: 60_000,
      },
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
    services: [toServiceCatalogInput(fixture)],
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
    sourceHash: stableHash({ supportRecord: 'human_inquiry_owner_inbox', stage: 'dev-seed' }),
    correlationId: brandNonEmpty('correlation:dev-seed-support-record', 'CorrelationId'),
    lastReviewedAt: input.now,
  }
}

function toServiceCatalogInput(fixture: DevSeedBusinessFixture): ServiceCatalogInput {
  return {
    name: fixture.serviceName,
    category: fixture.serviceCategory,
    summary: fixture.serviceSummary,
    serviceArea: fixture.serviceArea,
    hoursOrUnknown: fixture.hoursOrUnknown,
    firstRequest:
      fixture.firstRequestMode === 'not_available_yet'
        ? {
            mode: fixture.firstRequestMode,
            publicChannel: 'not_available',
            publicDisclosure: fixture.publicDisclosure,
            noContactReason: fixture.noContactReason,
          }
        : {
            mode: fixture.firstRequestMode,
            publicChannel: fixture.firstRequestMode === 'quote_request_available' ? 'ae_status_only' : 'public_business_contact',
            publicDisclosure: fixture.publicDisclosure,
          },
  }
}

function matchingCsrf(key: string) {
  void key
  return {
    origin: 'https://ae.example',
    allowedOrigins: ['https://ae.example'],
  }
}

function operationKey(value: string) {
  return brandNonEmpty(`op:dev-seed:${value}`, 'OperationKey')
}

function correlationId(value: string) {
  return brandNonEmpty(`corr:dev-seed:${value}`, 'CorrelationId')
}
