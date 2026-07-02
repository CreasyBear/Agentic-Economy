import { createDefaultRegistrySourceState } from '../../../src/modules/registry/public'
import type { RegistrySourceState } from '../../../src/modules/registry/public'
import {
  buildDevSeedCatalogState,
  type DevSeedBusinessFixture,
} from '../../../src/modules/dev/internal/dev-seed-fixture'

export type AnswerEvalRegistrySeed = 'default' | 'broad'

type EvalIndustryTemplate = {
  slug: string
  businessSuffix: string
  category: string
  serviceName: string
  serviceCategory: string
  serviceSummary: string
  hoursOrUnknown: string
}

type EvalLocale = {
  slug: string
  suburb: string
  stateTerritory: string
}

export const BROAD_ANSWER_EVAL_SEED_EXPECTATIONS = {
  businessCount: 100,
  industryCount: 10,
  localeCount: 10,
} as const

const EVAL_LOCALES: readonly EvalLocale[] = [
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

const EVAL_INDUSTRIES: readonly EvalIndustryTemplate[] = [
  {
    slug: 'emergency-plumbing',
    businessSuffix: 'Emergency Plumbing',
    category: 'Emergency plumbing',
    serviceName: 'Emergency pipe repair',
    serviceCategory: 'Emergency plumbing',
    serviceSummary: 'Burst pipe and blocked drain triage for urgent local plumbing jobs.',
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
    serviceSummary: 'Bookkeeper and accountant support for BAS, payroll, and tax preparation.',
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

export const BROAD_ANSWER_EVAL_BUSINESS_FIXTURES: readonly DevSeedBusinessFixture[] =
  EVAL_LOCALES.flatMap((locale, localeIndex) =>
    EVAL_INDUSTRIES.map((industry, industryIndex) =>
      buildFixture(locale, industry, localeIndex, industryIndex),
    ),
  )

export function createAnswerEvalRegistrySourceState(
  seed: AnswerEvalRegistrySeed = 'default',
): RegistrySourceState {
  if (seed === 'broad') {
    return buildDevSeedCatalogState(BROAD_ANSWER_EVAL_BUSINESS_FIXTURES).state
  }

  return createDefaultRegistrySourceState()
}

function buildFixture(
  locale: EvalLocale,
  industry: EvalIndustryTemplate,
  localeIndex: number,
  industryIndex: number,
): DevSeedBusinessFixture {
  const mode = firstRequestModeFor(localeIndex, industryIndex)
  const businessName = `${locale.suburb} ${industry.businessSuffix}`
  const requestedSlug = `${locale.slug}-${industry.slug}`

  return {
    requestedSlug,
    businessName,
    category: industry.category,
    suburb: locale.suburb,
    stateTerritory: locale.stateTerritory,
    ownerMessage: 'Owner supplied service facts for answer reliability evaluation.',
    sourceLabel: 'Owner supplied service facts',
    serviceName: industry.serviceName,
    serviceCategory: industry.serviceCategory,
    serviceSummary: industry.serviceSummary,
    serviceArea: `${locale.suburb} and nearby suburbs`,
    hoursOrUnknown: industry.hoursOrUnknown,
    photoUrl: '/images/illustration/cat-plumbing.png',
    responseTimeMinutes: 15 + ((localeIndex + industryIndex) % 8) * 5,
    firstRequestMode: mode,
    publicDisclosure: disclosureFor(mode),
    noContactReason: mode === 'not_available_yet'
      ? 'The business has not published first-request instructions yet.'
      : '',
  }
}

function firstRequestModeFor(
  localeIndex: number,
  industryIndex: number,
): DevSeedBusinessFixture['firstRequestMode'] {
  const value = (localeIndex + industryIndex) % 3
  if (value === 0) {
    return 'inquiry_available'
  }
  if (value === 1) {
    return 'quote_request_available'
  }
  return 'not_available_yet'
}

function disclosureFor(mode: DevSeedBusinessFixture['firstRequestMode']): string {
  if (mode === 'inquiry_available') {
    return 'Use the inquiry form for a first contact.'
  }
  if (mode === 'quote_request_available') {
    return 'Published quote request details are available for human review.'
  }
  return 'First request instructions are not available yet.'
}
