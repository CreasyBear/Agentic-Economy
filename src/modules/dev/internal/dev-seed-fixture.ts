import { LOCAL_E2E_BUSINESS_FIXTURES } from '@/lib/dev/local-e2e-business-fixtures'
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
  publishedPhone?: string
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
export const DEV_SEED_BUSINESS_COUNT = 100

type DevSeedIndustryTemplate = {
  slug: string
  businessSuffix: string
  category: string
  serviceName: string
  serviceCategory: string
  serviceSummary: string
  hoursOrUnknown: string
}

type DevSeedLocale = {
  slug: string
  suburb: string
  stateTerritory: string
}

const DEV_SEED_ANCHOR_BUSINESSES: readonly DevSeedBusinessFixture[] = [
  ...LOCAL_E2E_BUSINESS_FIXTURES.map((fixture) => ({
    ...fixture,
    ownerMessage: 'Owner supplied service facts for local catalog testing.',
    sourceLabel: 'Owner supplied service facts',
    photoUrl: '/images/illustration/cat-plumbing.png',
    firstRequestMode: 'inquiry_available' as const,
    publicDisclosure: 'Use the inquiry form for a first contact.',
    noContactReason: '',
  })),
  {
    requestedSlug: 'sandbox-option-one',
    businessName: 'Sandbox Option One',
    category: 'Sandbox capability provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for neutral routing verification.',
    sourceLabel: 'AE sandbox registration fixture',
    serviceName: 'Prepare a sandbox option',
    serviceCategory: 'Sandbox capability provider',
    serviceSummary: 'Returns a deterministic option through the production capability protocol.',
    serviceArea: 'Online',
    hoursOrUnknown: 'Always available for verification',
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Sandbox only. No real service is supplied.',
    noContactReason: '',
  },
  {
    requestedSlug: 'sandbox-option-two',
    businessName: 'Sandbox Option Two',
    category: 'Sandbox capability provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for neutral routing verification.',
    sourceLabel: 'AE sandbox registration fixture',
    serviceName: 'Prepare a sandbox option',
    serviceCategory: 'Sandbox capability provider',
    serviceSummary: 'Returns a second deterministic option through the production capability protocol.',
    serviceArea: 'Online',
    hoursOrUnknown: 'Always available for verification',
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Sandbox only. No real service is supplied.',
    noContactReason: '',
  },
  {
    requestedSlug: 'sandbox-route-resolver',
    businessName: 'Sandbox Route Resolver',
    category: 'Sandbox capability provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for multi-capability route verification.',
    sourceLabel: 'AE sandbox registration fixture',
    serviceName: 'Resolve a sandbox service reference',
    serviceCategory: 'Sandbox capability provider',
    serviceSummary: 'Produces a typed service reference for a separately registered downstream business.',
    serviceArea: 'Online',
    hoursOrUnknown: 'Always available for verification',
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Sandbox only. No real service is supplied.',
    noContactReason: '',
  },
  {
    requestedSlug: 'sandbox-route-quoter',
    businessName: 'Sandbox Route Quoter',
    category: 'Sandbox capability provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for multi-capability route verification.',
    sourceLabel: 'AE sandbox registration fixture',
    serviceName: 'Quote a sandbox service reference',
    serviceCategory: 'Sandbox capability provider',
    serviceSummary: 'Consumes a typed reference from a separately registered upstream business and returns a quote reference.',
    serviceArea: 'Online',
    hoursOrUnknown: 'Always available for verification',
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Sandbox only. No real service is supplied.',
    noContactReason: '',
  },
  ...[
    ['procurement-brief', 'Procurement Brief Studio', 'Structure procurement requirements'],
    ['supplier-options', 'Supplier Options Network', 'Find eligible supplier options'],
    ['procurement-recommendation', 'Procurement Comparison Desk', 'Compare supplier options'],
  ].map(([providerKey, businessName, serviceName]) => ({
    requestedSlug: `sandbox-${providerKey}`,
    businessName: businessName!,
    category: 'Sandbox procurement workflow provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for procurement workflow verification.',
    sourceLabel: 'AE sandbox workflow registration fixture',
    serviceName: serviceName!,
    serviceCategory: 'Sandbox procurement workflow provider',
    serviceSummary: 'Returns deterministic typed evidence through the generic capability path.',
    serviceArea: 'Online',
    hoursOrUnknown: 'Always available for verification',
    firstRequestMode: 'inquiry_available' as const,
    publicDisclosure: 'Sandbox only. No supplier order, payment, or fulfilment is provided.',
    noContactReason: '',
  })),
] as const

const DEV_SEED_LOCALES: readonly DevSeedLocale[] = [
  { slug: 'parramatta', suburb: 'Parramatta', stateTerritory: 'NSW' },
  { slug: 'coburg', suburb: 'Coburg', stateTerritory: 'VIC' },
  { slug: 'perth', suburb: 'Perth', stateTerritory: 'WA' },
  { slug: 'fremantle', suburb: 'Fremantle', stateTerritory: 'WA' },
  { slug: 'hobart', suburb: 'Hobart', stateTerritory: 'TAS' },
  { slug: 'darwin', suburb: 'Darwin', stateTerritory: 'NT' },
  { slug: 'adelaide', suburb: 'Adelaide', stateTerritory: 'SA' },
  { slug: 'brisbane', suburb: 'Brisbane', stateTerritory: 'QLD' },
  { slug: 'canberra', suburb: 'Canberra', stateTerritory: 'ACT' },
  { slug: 'geelong', suburb: 'Geelong', stateTerritory: 'VIC' },
] as const

const DEV_SEED_INDUSTRIES: readonly DevSeedIndustryTemplate[] = [
  {
    slug: 'emergency-plumbing',
    businessSuffix: 'Emergency Plumbing',
    category: 'Emergency plumbing',
    serviceName: 'Emergency pipe repair',
    serviceCategory: 'Emergency plumbing',
    serviceSummary: 'Burst pipe and blocked drain triage for urgent local plumbing issues.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
  {
    slug: 'electrical-repairs',
    businessSuffix: 'Electrical Repairs',
    category: 'Electrical repairs',
    serviceName: 'Electrical fault repairs',
    serviceCategory: 'Electrical repairs',
    serviceSummary: 'Electrical fault checks and repair coordination for homes and small businesses.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
  {
    slug: 'dental-clinic',
    businessSuffix: 'Dental Clinic',
    category: 'Dental clinic',
    serviceName: 'General dental care',
    serviceCategory: 'Dental clinic',
    serviceSummary: 'Dentist check-ups, tooth pain triage, and routine dental care information.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
  {
    slug: 'family-law',
    businessSuffix: 'Family Law',
    category: 'Family law',
    serviceName: 'Family lawyer consultation',
    serviceCategory: 'Family law',
    serviceSummary: 'Family lawyer guidance for separation, parenting, and property matter first steps.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
  {
    slug: 'accounting',
    businessSuffix: 'Accounting',
    category: 'Accounting',
    serviceName: 'Small business accounting',
    serviceCategory: 'Accounting',
    serviceSummary: 'Accountant support for BAS, payroll, and tax preparation questions.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
  {
    slug: 'home-cleaning',
    businessSuffix: 'Home Cleaning',
    category: 'Home cleaning',
    serviceName: 'Home cleaning',
    serviceCategory: 'Home cleaning',
    serviceSummary: 'Cleaner support for recurring home cleaning and end-of-lease cleaning requests.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
  {
    slug: 'locksmith',
    businessSuffix: 'Locksmith',
    category: 'Locksmith',
    serviceName: 'Locksmith lock repair',
    serviceCategory: 'Locksmith',
    serviceSummary: 'Locksmith help for lock repair, rekeying, and lost-key first steps.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
  {
    slug: 'hvac-repair',
    businessSuffix: 'HVAC Repair',
    category: 'HVAC repair',
    serviceName: 'Heat pump and air conditioning repair',
    serviceCategory: 'HVAC repair',
    serviceSummary: 'Heat pump, split system, and air conditioning fault checks.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
  {
    slug: 'math-tutoring',
    businessSuffix: 'Math Tutoring',
    category: 'Tutoring',
    serviceName: 'Math tutoring',
    serviceCategory: 'Tutoring',
    serviceSummary: 'Tutor support for maths homework, exam preparation, and study planning.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
  {
    slug: 'aged-care-support',
    businessSuffix: 'Aged Care Support',
    category: 'Aged care support',
    serviceName: 'Aged care support',
    serviceCategory: 'Aged care support',
    serviceSummary: 'Home support information for older people and family carers.',
    hoursOrUnknown: 'Hours supplied by owner',
  },
] as const

export const DEV_SEED_BUSINESS_FIXTURES: readonly DevSeedBusinessFixture[] = buildDevSeedBusinessFixtures()

const devSeedActor: BusinessMutationActor = {
  kind: 'authenticated_owner',
  clerkUserId: DEV_SEED_OWNER_CLERK_USER_ID,
  displayName: 'Dev Seed Owner',
}

const devSeedNow = 1_777_100_000_000

function buildDevSeedBusinessFixtures(): readonly DevSeedBusinessFixture[] {
  const anchorSlugs = new Set(DEV_SEED_ANCHOR_BUSINESSES.map((fixture) => fixture.requestedSlug))
  const broadFixtures: DevSeedBusinessFixture[] = []
  let localeIndex = 0
  for (const locale of DEV_SEED_LOCALES) {
    let industryIndex = 0
    for (const industry of DEV_SEED_INDUSTRIES) {
      const fixture = buildBroadSeedFixture(locale, industry, localeIndex, industryIndex)
      if (!anchorSlugs.has(fixture.requestedSlug)) {
        broadFixtures.push(fixture)
      }
      industryIndex += 1
    }
    localeIndex += 1
  }

  return [
    ...DEV_SEED_ANCHOR_BUSINESSES,
    ...broadFixtures.slice(0, DEV_SEED_BUSINESS_COUNT - DEV_SEED_ANCHOR_BUSINESSES.length),
  ]
}

function buildBroadSeedFixture(
  locale: DevSeedLocale,
  industry: DevSeedIndustryTemplate,
  localeIndex: number,
  industryIndex: number,
): DevSeedBusinessFixture {
  const businessName = `${locale.suburb} ${industry.businessSuffix}`

  return {
    requestedSlug: `${locale.slug}-${industry.slug}`,
    businessName,
    category: industry.category,
    suburb: locale.suburb,
    stateTerritory: locale.stateTerritory,
    ownerMessage: 'Owner supplied service facts for local catalog testing.',
    sourceLabel: 'Owner supplied service facts',
    serviceName: industry.serviceName,
    serviceCategory: industry.serviceCategory,
    serviceSummary: industry.serviceSummary,
    serviceArea: `${locale.suburb} and nearby suburbs`,
    hoursOrUnknown: industry.hoursOrUnknown,
    photoUrl: '/images/illustration/cat-plumbing.png',
    responseTimeMinutes: 15 + ((localeIndex + industryIndex) % 8) * 5,
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Use the inquiry form for a first contact.',
    noContactReason: '',
  }
}

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
