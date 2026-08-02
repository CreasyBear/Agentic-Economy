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
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { matchingCsrf } from '@/modules/common/matching-csrf'
import type { CapabilityLaunchSupportRecord } from '@/modules/inquiries/public'
import type { RegistrySourceState } from '@/modules/registry/public'

export type DevSeedOfferingAccessPathFixture = Readonly<{
  kind: 'human_request'
  channel: 'phone' | 'website' | 'ae_inquiry'
  disclosure: string
}>

export type DevSeedOfferingFixture = Readonly<{
  name: string
  category: string
  summary: string
  serviceAreaSummary: string
  availabilitySummary: string
  pricingSummary?: string
  accessPaths: readonly DevSeedOfferingAccessPathFixture[]
  firstRequestMode: FirstRequestMode
  publicDisclosure: string
  noContactReason: string
}>

export type DevSeedBusinessFixture = Readonly<{
  requestedSlug: string
  businessName: string
  category: string
  suburb: string
  stateTerritory: string
  ownerMessage: string
  sourceLabel: string
  publishedPhone?: string
  offerings: readonly DevSeedOfferingFixture[]
  photoUrl?: string
  responseTimeMinutes?: number
}>

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
  offering: Readonly<{
    name: string
    category: string
    summary: string
    availabilitySummary: string
    pricingSummary?: string
  }>
  /**
   * Whether the seeded business publishes a phone number. A published phone is
   * what produces a real `phone` access path, so this is also the switch that
   * decides which fixtures have no way to be contacted at all.
   */
  publishesPhone: boolean
}

type DevSeedLocale = {
  slug: string
  suburb: string
  stateTerritory: string
  /** Geographic area code the fictitious landline is built from. */
  areaCode: '02' | '03' | '07' | '08'
}

function requireDevSeedField(value: string | undefined, field: string): string {
  if (value === undefined) throw new Error(`dev_seed_fixture_field_missing:${field}`)
  return value
}

const DEV_SEED_ANCHOR_BUSINESSES: readonly DevSeedBusinessFixture[] = [
  ...LOCAL_E2E_BUSINESS_FIXTURES.map((fixture) => {
    const offering = fixture.offerings[0]
    if (offering === undefined) {
      throw new Error(`dev_seed_fixture_offering_missing:${fixture.requestedSlug}`)
    }
    return {
      ...fixture,
      ownerMessage: 'Owner supplied service facts for local catalog testing.',
      sourceLabel: 'Owner supplied service facts',
      photoUrl: '/images/illustration/cat-plumbing.png',
      offerings: [{
        ...offering,
        firstRequestMode: 'inquiry_available' as const,
        publicDisclosure: 'Use the inquiry form for a first contact.',
        noContactReason: '',
      }],
    }
  }),
  {
    requestedSlug: 'bedford-photography',
    businessName: 'Bedford Photography',
    category: 'Wedding photography',
    suburb: 'Sydney',
    stateTerritory: 'NSW',
    publishedPhone: '0432 268 101',
    ownerMessage: 'Publicly observed business facts used for a development/mock cohort; not AE-verified.',
    sourceLabel: 'publicly_observed / development-mock based on cited website',
    offerings: [{
      name: 'Wedding photographer day coverage',
      category: 'Wedding photography',
      summary: 'Wedding and event photography coverage with a comparable day-rate package.',
      serviceAreaSummary: 'Sydney, South Coast, Newcastle and Hunter Valley',
      availabilitySummary: 'Coverage hours agreed in the package',
      pricingSummary: 'Demo price — publicly observed / development mock — AUD 5,000–7,000 typical wedding investment',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Development/mock supply based on publicly observed business facts; contact path is not real fulfilment.',
      noContactReason: '',
    }],
  },
  {
    requestedSlug: 'little-reed-weddings',
    businessName: 'Little Reed Weddings',
    category: 'Wedding photography',
    suburb: 'Melbourne',
    stateTerritory: 'VIC',
    ownerMessage: 'Publicly observed business facts used for a development/mock cohort; not AE-verified.',
    sourceLabel: 'publicly_observed / development-mock based on cited website',
    offerings: [{
      name: 'Wedding photographer coverage',
      category: 'Wedding photography',
      summary: 'Candid wedding photography coverage with package and extra-hour options.',
      serviceAreaSummary: 'Melbourne, Yarra Valley, Macedon Ranges and surrounds',
      availabilitySummary: 'Coverage hours agreed in the package',
      pricingSummary: 'Demo price — publicly observed / development mock — AUD 250 per additional hour',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Development/mock supply based on publicly observed business facts; contact path is not real fulfilment.',
      noContactReason: '',
    }],
  },
  {
    requestedSlug: 'rachel-levingston-photography',
    businessName: 'Rachel Levingston Photography',
    category: 'Wedding photography',
    suburb: 'Hawkesbury',
    stateTerritory: 'NSW',
    ownerMessage: 'Publicly observed business facts used for a development/mock cohort; not AE-verified.',
    sourceLabel: 'publicly_observed / development-mock based on cited website',
    offerings: [{
      name: 'Wedding photographer coverage',
      category: 'Wedding photography',
      summary: 'Wedding and event photography coverage for Hawkesbury, The Hills and Sydney.',
      serviceAreaSummary: 'Hawkesbury, The Hills and Sydney',
      availabilitySummary: 'Coverage hours agreed in the package',
      pricingSummary: 'Demo price — publicly observed / development mock — AUD 1,800 wedding coverage package',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Development/mock supply based on publicly observed business facts; contact path is not real fulfilment.',
      noContactReason: '',
    }],
  },
  {
    requestedSlug: 'wn-bull-funerals-parramatta',
    businessName: 'WN Bull Funerals',
    category: 'Funeral services',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publishedPhone: '(02) 9519 5344',
    ownerMessage: 'Publicly observed Parramatta business facts used for a development/mock cohort; not AE-verified.',
    sourceLabel: 'publicly_observed / development-mock based on cited website',
    offerings: [{
      name: 'Funeral service arrangement',
      category: 'Funeral services',
      summary: 'Funeral director support and arrangement service for Parramatta families.',
      serviceAreaSummary: 'Parramatta and surrounding suburbs',
      availabilitySummary: '24/7 contact; office hours vary',
      pricingSummary: 'Demo price — publicly observed / development mock — AUD 4,500 base funeral service',
      accessPaths: [{
        kind: 'human_request',
        channel: 'phone',
        disclosure: 'Call the published number for a first contact.',
      }],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Development/mock supply based on publicly observed business facts; contact path is not real fulfilment.',
      noContactReason: '',
    }],
  },
  {
    requestedSlug: 'funerals-of-compassion-parramatta',
    businessName: 'Funerals of Compassion',
    category: 'Funeral services',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publishedPhone: '1300 906 060',
    ownerMessage: 'Publicly observed Parramatta service facts used for a development/mock cohort; not AE-verified.',
    sourceLabel: 'publicly_observed / development-mock based on cited website',
    offerings: [{
      name: 'Compassionate funeral arrangement',
      category: 'Funeral services',
      summary: 'Funeral arrangement and family support for the Parramatta area.',
      serviceAreaSummary: 'Parramatta and surrounding suburbs',
      availabilitySummary: 'Available 24/7',
      pricingSummary: 'Demo price — publicly observed / development mock — AUD 4,200 base funeral service',
      accessPaths: [{
        kind: 'human_request',
        channel: 'phone',
        disclosure: 'Call the published number for a first contact.',
      }],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Development/mock supply based on publicly observed business facts; contact path is not real fulfilment.',
      noContactReason: '',
    }],
  },
  {
    requestedSlug: 'gregory-and-carr-parramatta',
    businessName: 'Gregory & Carr',
    category: 'Funeral services',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publishedPhone: '(02) 9630 6444',
    ownerMessage: 'Publicly observed Parramatta service facts used for a development/mock cohort; not AE-verified.',
    sourceLabel: 'publicly_observed / development-mock based on cited website',
    offerings: [{
      name: 'Funeral director consultation',
      category: 'Funeral services',
      summary: 'Funeral director consultation and arrangement support serving Parramatta.',
      serviceAreaSummary: 'Parramatta and surrounding suburbs',
      availabilitySummary: '24/7 support; office hours vary',
      pricingSummary: 'Demo price — publicly observed / development mock — AUD 4,800 base funeral service',
      accessPaths: [{
        kind: 'human_request',
        channel: 'phone',
        disclosure: 'Call the published number for a first contact.',
      }],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Development/mock supply based on publicly observed business facts; contact path is not real fulfilment.',
      noContactReason: '',
    }],
  },
  {
    requestedSlug: 'adelaide-cbd-dentist',
    businessName: 'Adelaide CBD Dentist',
    category: 'Dental clinic',
    suburb: 'Adelaide',
    stateTerritory: 'SA',
    ownerMessage: 'Publicly observed Adelaide dental facts used for a development/mock cohort; not AE-verified.',
    sourceLabel: 'publicly_observed / development-mock based on cited website',
    offerings: [{
      name: 'Dental check-up and clean',
      category: 'Dental clinic',
      summary: 'Routine dental check-up and clean for Adelaide CBD patients.',
      serviceAreaSummary: 'Adelaide CBD',
      availabilitySummary: 'Hours vary; appointment required',
      pricingSummary: 'Demo price — publicly observed / development mock — AUD 150 check-up and clean',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Development/mock supply based on publicly observed business facts; contact path is not real fulfilment.',
      noContactReason: '',
    }],
    photoUrl: '/images/illustration/cat-plumbing.png',
    responseTimeMinutes: 25,
  },
  {
    requestedSlug: 'perfect-smile-adelaide',
    businessName: 'Perfect Smile',
    category: 'Dental clinic',
    suburb: 'Adelaide',
    stateTerritory: 'SA',
    ownerMessage: 'Publicly observed Adelaide dental facts used for a development/mock cohort; not AE-verified.',
    sourceLabel: 'publicly_observed / development-mock based on cited website',
    offerings: [{
      name: 'Dental check-up and clean',
      category: 'Dental clinic',
      summary: 'General dentistry with check-up and clean appointments in Adelaide.',
      serviceAreaSummary: 'Adelaide CBD',
      availabilitySummary: 'Hours vary; appointment required',
      pricingSummary: 'Demo price — publicly observed / development mock — AUD 199 check-up, scale and clean',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Development/mock supply based on publicly observed business facts; contact path is not real fulfilment.',
      noContactReason: '',
    }],
    photoUrl: '/images/illustration/cat-plumbing.png',
    responseTimeMinutes: 30,
  },
  {
    requestedSlug: 'fixed-dental-adelaide',
    businessName: 'Fixed Dental',
    category: 'Dental clinic',
    suburb: 'Adelaide',
    stateTerritory: 'SA',
    ownerMessage: 'Publicly observed Adelaide dental facts used for a development/mock cohort; not AE-verified.',
    sourceLabel: 'publicly_observed / development-mock based on cited website',
    offerings: [{
      name: 'Dental check-up and clean',
      category: 'Dental clinic',
      summary: 'Routine dentist check-ups and cleans for Adelaide patients.',
      serviceAreaSummary: 'Adelaide and nearby suburbs',
      availabilitySummary: 'Hours vary; appointment required',
      pricingSummary: 'Demo price — publicly observed / development mock — AUD 139 check-up and clean',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Development/mock supply based on publicly observed business facts; contact path is not real fulfilment.',
      noContactReason: '',
    }],
    photoUrl: '/images/illustration/cat-plumbing.png',
    responseTimeMinutes: 35,
  },
  {
    requestedSlug: 'sandbox-option-one',
    businessName: 'Sandbox Option One',
    category: 'Sandbox capability provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for neutral routing verification.',
    sourceLabel: 'AE sandbox registration fixture',
    offerings: [{
      name: 'Prepare a sandbox option',
      category: 'Sandbox capability provider',
      summary: 'Returns a deterministic option through the production capability protocol.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Always available for verification',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Sandbox only. No real service is supplied.',
      noContactReason: '',
    }],
  },
  {
    requestedSlug: 'sandbox-option-two',
    businessName: 'Sandbox Option Two',
    category: 'Sandbox capability provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for neutral routing verification.',
    sourceLabel: 'AE sandbox registration fixture',
    offerings: [{
      name: 'Prepare a sandbox option',
      category: 'Sandbox capability provider',
      summary: 'Returns a second deterministic option through the production capability protocol.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Always available for verification',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Sandbox only. No real service is supplied.',
      noContactReason: '',
    }],
  },
  {
    requestedSlug: 'sandbox-route-resolver',
    businessName: 'Sandbox Route Resolver',
    category: 'Sandbox capability provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for multi-capability route verification.',
    sourceLabel: 'AE sandbox registration fixture',
    offerings: [{
      name: 'Resolve a sandbox service reference',
      category: 'Sandbox capability provider',
      summary: 'Produces a typed service reference for a separately registered downstream business.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Always available for verification',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Sandbox only. No real service is supplied.',
      noContactReason: '',
    }],
  },
  {
    requestedSlug: 'sandbox-route-quoter',
    businessName: 'Sandbox Route Quoter',
    category: 'Sandbox capability provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for multi-capability route verification.',
    sourceLabel: 'AE sandbox registration fixture',
    offerings: [{
      name: 'Quote a sandbox service reference',
      category: 'Sandbox capability provider',
      summary: 'Consumes a typed reference from a separately registered upstream business and returns a quote reference.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Always available for verification',
      accessPaths: [],
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Sandbox only. No real service is supplied.',
      noContactReason: '',
    }],
  },
  ...[
    ['procurement-brief', 'Procurement Brief Studio', 'Structure procurement requirements'],
    ['supplier-options', 'Supplier Options Network', 'Find eligible supplier options'],
    ['procurement-recommendation', 'Procurement Comparison Desk', 'Compare supplier options'],
  ].map(([providerKey, businessName, name]) => ({
    requestedSlug: `sandbox-${providerKey}`,
    businessName: requireDevSeedField(businessName, 'business_name'),
    category: 'Sandbox procurement workflow provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for procurement workflow verification.',
    sourceLabel: 'AE sandbox workflow registration fixture',
    offerings: [{
      name: requireDevSeedField(name, 'offering_name'),
      category: 'Sandbox procurement workflow provider',
      summary: 'Returns deterministic typed evidence through the generic capability path.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Always available for verification',
      accessPaths: [],
      firstRequestMode: 'inquiry_available' as const,
      publicDisclosure: 'Sandbox only. No supplier order, payment, or fulfilment is provided.',
      noContactReason: '',
    }],
  })),
  ...[
    ['event-requirements', 'Ideal Event Requirements Adviser', 'Prepare sourced event requirements'],
    ['event-site-evidence', 'Ideal Site and Safety Evidence Planner', 'Prepare site and safety evidence'],
    ['event-business-readiness', 'Ideal Event Business Readiness Desk', 'Prepare participating-business readiness evidence'],
  ].map(([providerKey, businessName, name]) => ({
    requestedSlug: `sandbox-${providerKey}`,
    businessName: requireDevSeedField(businessName, 'business_name'),
    category: 'Synthetic public-event workflow provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Fictional non-production business for public-event onboarding rehearsal.',
    sourceLabel: 'AE synthetic workflow registration fixture',
    offerings: [{
      name: requireDevSeedField(name, 'offering_name'),
      category: 'Synthetic public-event workflow provider',
      summary: 'Returns attributable synthetic evidence records through the generic capability path.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Always available for labelled development verification',
      accessPaths: [],
      firstRequestMode: 'inquiry_available' as const,
      publicDisclosure: 'Synthetic sandbox only. No application, approval, certification, booking, payment, dispatch, or fulfilment is provided.',
      noContactReason: '',
    }],
  })),
  ...[
    ['trip-constraints', 'Trip Constraint Interpreter', 'Structure trip constraints'],
    ['accessible-transfer', 'Accessible Transfer Planner', 'Plan an accessible airport transfer'],
    ['accessible-hotel', 'Accessible Hotel Planner', 'Plan accessible accommodation'],
    ['meeting-schedule', 'Meeting Schedule Planner', 'Plan timed meetings'],
    ['dinner-plan', 'Dinner Plan Service', 'Plan dinner'],
    ['itinerary-builder', 'Itinerary Assembly Service', 'Build an itinerary'],
    ['itinerary-readiness', 'Travel Readiness Review', 'Review itinerary readiness'],
  ].map(([providerKey, businessName, name]) => ({
    requestedSlug: `sandbox-${providerKey}`,
    businessName: requireDevSeedField(businessName, 'business_name'),
    category: 'Sandbox workflow provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for itinerary workflow verification.',
    sourceLabel: 'AE sandbox workflow registration fixture',
    offerings: [{
      name: requireDevSeedField(name, 'offering_name'),
      category: 'Sandbox workflow provider',
      summary: 'Returns deterministic typed evidence through the generic capability path.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Always available for verification',
      accessPaths: [],
      firstRequestMode: 'inquiry_available' as const,
      publicDisclosure: 'Sandbox only. No availability, booking, ticketing, or payment is provided.',
      noContactReason: '',
    }],
  })),
  ...[
    ['journey-case', 'Journey Case Intake', 'Structure a service case'],
    ['milestone-plan', 'Milestone Planning Service', 'Build a milestone plan'],
    ['progress-synthesis', 'Progress Synthesis Service', 'Synthesize journey progress'],
  ].map(([providerKey, businessName, name]) => ({
    requestedSlug: `sandbox-${providerKey}`,
    businessName: requireDevSeedField(businessName, 'business_name'),
    category: 'Sandbox workflow provider',
    suburb: 'Perth',
    stateTerritory: 'WA',
    ownerMessage: 'Clearly labelled non-production business for service journey workflow verification.',
    sourceLabel: 'AE sandbox workflow registration fixture',
    offerings: [{
      name: requireDevSeedField(name, 'offering_name'),
      category: 'Sandbox workflow provider',
      summary: 'Returns deterministic typed evidence through the generic capability path.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Always available for verification',
      accessPaths: [],
      firstRequestMode: 'inquiry_available' as const,
      publicDisclosure: 'Sandbox only. No physical move, dispatch, or third-party task is performed.',
      noContactReason: '',
    }],
  })),
] as const

const DEV_SEED_LOCALES: readonly DevSeedLocale[] = [
  { slug: 'parramatta', suburb: 'Parramatta', stateTerritory: 'NSW', areaCode: '02' },
  { slug: 'coburg', suburb: 'Coburg', stateTerritory: 'VIC', areaCode: '03' },
  { slug: 'perth', suburb: 'Perth', stateTerritory: 'WA', areaCode: '08' },
  { slug: 'fremantle', suburb: 'Fremantle', stateTerritory: 'WA', areaCode: '08' },
  { slug: 'hobart', suburb: 'Hobart', stateTerritory: 'TAS', areaCode: '03' },
  { slug: 'darwin', suburb: 'Darwin', stateTerritory: 'NT', areaCode: '08' },
  { slug: 'adelaide', suburb: 'Adelaide', stateTerritory: 'SA', areaCode: '08' },
  { slug: 'brisbane', suburb: 'Brisbane', stateTerritory: 'QLD', areaCode: '07' },
  { slug: 'canberra', suburb: 'Canberra', stateTerritory: 'ACT', areaCode: '02' },
  { slug: 'geelong', suburb: 'Geelong', stateTerritory: 'VIC', areaCode: '03' },
] as const

/**
 * Deliberately mixed supply. Before this, every seeded business published
 * `'Hours supplied by owner'`, no price, and no reachable contact, so the
 * catalog demonstrated exactly one state — the empty one — and the search-gap
 * signal fired on all of it.
 *
 * Seven of ten industries publish hours, five publish a price, eight publish a
 * phone. Home cleaning publishes a price but not hours, so the two facts are
 * never assumed to travel together. HVAC repair and maths tutoring publish
 * none of the three, keeping the honest-absence path exercised end to end.
 */
const DEV_SEED_INDUSTRIES: readonly DevSeedIndustryTemplate[] = [
  {
    slug: 'emergency-plumbing',
    businessSuffix: 'Emergency Plumbing',
    category: 'Emergency plumbing',
    offering: {
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Local emergency plumber for burst pipe and blocked drain triage.',
      availabilitySummary: 'Mon–Sun, 24 hours',
      pricingSummary: 'Demo price — $180 call-out, quoted before work starts',
    },
    publishesPhone: true,
  },
  {
    slug: 'electrical-repairs',
    businessSuffix: 'Electrical Repairs',
    category: 'Electrical repairs',
    offering: {
      name: 'Electrical fault repairs',
      category: 'Electrical repairs',
      summary: 'Electrical fault checks and repair coordination for homes and small businesses.',
      availabilitySummary: 'Mon–Fri 7am–5pm, Sat 8am–12pm',
      pricingSummary: 'Demo price — $140 first hour, then $95 per hour',
    },
    publishesPhone: true,
  },
  {
    slug: 'dental-clinic',
    businessSuffix: 'Dental Clinic',
    category: 'Dental clinic',
    offering: {
      name: 'General dental care',
      category: 'Dental clinic',
      summary: 'Dentist check-ups, tooth pain triage, and routine dental care information.',
      availabilitySummary: 'Mon–Fri 8:30am–5pm',
      pricingSummary: 'Demo price — $95 check-up and clean',
    },
    publishesPhone: true,
  },
  {
    slug: 'family-law',
    businessSuffix: 'Family Law',
    category: 'Family law',
    offering: {
      name: 'Family lawyer consultation',
      category: 'Family law',
      summary: 'Family lawyer guidance for separation, parenting, and property matter first steps.',
      availabilitySummary: 'Mon–Fri 9am–5pm',
      pricingSummary: 'Demo price — $350 first consultation',
    },
    publishesPhone: true,
  },
  {
    slug: 'accounting',
    businessSuffix: 'Accounting',
    category: 'Accounting',
    offering: {
      name: 'Small business accounting',
      category: 'Accounting',
      summary: 'Accountant support for BAS, payroll, and tax preparation questions.',
      availabilitySummary: 'Mon–Fri 9am–5pm',
    },
    publishesPhone: true,
  },
  {
    slug: 'home-cleaning',
    businessSuffix: 'Home Cleaning',
    category: 'Home cleaning',
    offering: {
      name: 'Home cleaning',
      category: 'Home cleaning',
      summary: 'Cleaner support for recurring home cleaning and end-of-lease cleaning requests.',
      availabilitySummary: 'Hours unknown',
      pricingSummary: 'Demo price — $55 per hour, 3 hour minimum',
    },
    publishesPhone: true,
  },
  {
    slug: 'locksmith',
    businessSuffix: 'Locksmith',
    category: 'Locksmith',
    offering: {
      name: 'Locksmith lock repair',
      category: 'Locksmith',
      summary: 'Locksmith help for lock repair, rekeying, and lost-key first steps.',
      availabilitySummary: 'Mon–Sun, 24 hours',
    },
    publishesPhone: true,
  },
  {
    slug: 'hvac-repair',
    businessSuffix: 'HVAC Repair',
    category: 'HVAC repair',
    offering: {
      name: 'Heat pump and air conditioning repair',
      category: 'HVAC repair',
      summary: 'Heat pump, split system, and air conditioning fault checks.',
      availabilitySummary: 'Hours unknown',
    },
    publishesPhone: false,
  },
  {
    slug: 'math-tutoring',
    businessSuffix: 'Math Tutoring',
    category: 'Tutoring',
    offering: {
      name: 'Math tutoring',
      category: 'Tutoring',
      summary: 'Tutor support for maths homework, exam preparation, and study planning.',
      availabilitySummary: 'Hours unknown',
    },
    publishesPhone: false,
  },
  {
    slug: 'aged-care-support',
    businessSuffix: 'Aged Care Support',
    category: 'Aged care support',
    offering: {
      name: 'Aged care support',
      category: 'Aged care support',
      summary: 'Home support information for older people and family carers.',
      availabilitySummary: 'Mon–Fri 8am–6pm',
    },
    publishesPhone: true,
  },
] as const

export const DEV_SEED_BUSINESS_FIXTURES: readonly DevSeedBusinessFixture[] = buildDevSeedBusinessFixtures()

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

/**
 * Landlines come from the ACMA range reserved for fictitious use, `5550 1000`
 * to `5550 1999` in each geographic area code. A seeded number that could ring
 * a real household is the one fabrication a directory must never ship, and a
 * business with no published number has no phone access path at all — which is
 * the absent state the catalog also has to demonstrate.
 */
function buildBroadSeedFixture(
  locale: DevSeedLocale,
  industry: DevSeedIndustryTemplate,
  localeIndex: number,
  industryIndex: number,
): DevSeedBusinessFixture {
  const businessName = `${locale.suburb} ${industry.businessSuffix}`
  const publishedPhone = `(${locale.areaCode}) 5550 1${String(localeIndex * 10 + industryIndex).padStart(3, '0')}`

  return {
    requestedSlug: `${locale.slug}-${industry.slug}`,
    businessName,
    category: industry.category,
    suburb: locale.suburb,
    stateTerritory: locale.stateTerritory,
    ...(industry.publishesPhone ? { publishedPhone } : {}),
    ownerMessage: 'Owner supplied service facts for local catalog testing.',
    sourceLabel: 'Owner supplied service facts',
    offerings: [{
      ...industry.offering,
      serviceAreaSummary: `${locale.suburb} and nearby suburbs`,
      accessPaths: industry.publishesPhone
        ? [{
            kind: 'human_request' as const,
            channel: 'phone' as const,
            disclosure: 'Call the published number for a first contact.',
          }]
        : [],
      firstRequestMode: 'inquiry_available',
      // The only channel these fixtures publish is the phone number above, so the
      // disclosure names that. Pointing at an inquiry form the seeded business
      // cannot accept is the promise-without-a-path this catalog is fixing.
      publicDisclosure: industry.publishesPhone
        ? 'Call the published number for a first contact.'
        : 'No contact path is published for this service yet.',
      noContactReason: '',
    }],
    photoUrl: '/images/illustration/cat-plumbing.png',
    responseTimeMinutes: 15 + ((localeIndex + industryIndex) % 8) * 5,
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
