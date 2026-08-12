import type { OfferingPrice } from '../../src/modules/catalog/public'

export type LocalE2eOfferingAccessPathFixture = Readonly<{
  kind: 'human_request'
  channel: 'phone' | 'website' | 'ae_inquiry'
  disclosure: string
}>

export type LocalE2eOfferingFixture = Readonly<{
  name: string
  category: string
  summary: string
  serviceAreaSummary: string
  availabilitySummary: string
  pricingSummary?: string
  price?: OfferingPrice
  accessPaths: readonly LocalE2eOfferingAccessPathFixture[]
}>

export type LocalE2eBusinessFixture = Readonly<{
  requestedSlug: string
  businessName: string
  category: string
  suburb: string
  stateTerritory: string
  publishedPhone?: string
  offerings: readonly LocalE2eOfferingFixture[]
  responseTimeMinutes?: number
  inquiryAdmission?: 'admitted'
}>

export const DEFAULT_LOCAL_REGISTRY_FIXTURE_SLUG = 'parramatta-emergency-plumbing'

export const LOCAL_E2E_BUSINESS_FIXTURES: readonly LocalE2eBusinessFixture[] = [
  {
    requestedSlug: 'plumbing-demo',
    businessName: 'Demo Plumbing',
    category: 'Plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    offerings: [{
      name: 'Diagnostic plumbing',
      category: 'Plumbing',
      summary: 'Diagnostic plumbing triage for first contact.',
      serviceAreaSummary: 'Parramatta',
      availabilitySummary: 'Hours unknown',
      accessPaths: [{
        kind: 'human_request',
        channel: 'ae_inquiry',
        disclosure: 'Use the inquiry form for a first contact.',
      }],
    }],
    responseTimeMinutes: 22,
  },
  {
    requestedSlug: 'joondalup-rapid-plumbing',
    businessName: 'Joondalup Rapid Plumbing',
    category: 'Plumbing',
    suburb: 'Joondalup',
    stateTerritory: 'WA',
    publishedPhone: '0412 345 678',
    offerings: [{
      name: 'Emergency plumbing',
      category: 'Plumbing',
      summary: 'Burst pipe and blocked drain triage for urgent local plumbing issues.',
      serviceAreaSummary: 'Joondalup and nearby suburbs',
      availabilitySummary: 'Mon–Fri 7am–5pm, Sat 8am–12pm',
      pricingSummary: 'Demo price — $180 call-out, quoted before work starts',
      accessPaths: [
        {
          kind: 'human_request',
          channel: 'phone',
          disclosure: 'Call the published number for a first contact.',
        },
        {
          kind: 'human_request',
          channel: 'ae_inquiry',
          disclosure: 'Use the inquiry form for a first contact.',
        },
      ],
    }],
    responseTimeMinutes: 20,
    inquiryAdmission: 'admitted',
  },
  {
    requestedSlug: 'fremantle-coastal-electrical',
    businessName: 'Fremantle Coastal Electrical',
    category: 'Electrical repairs',
    suburb: 'Fremantle',
    stateTerritory: 'WA',
    publishedPhone: '(08) 9430 1234',
    offerings: [{
      name: 'Electrical fault repairs',
      category: 'Electrical repairs',
      summary: 'Electrical fault checks and repair coordination for homes and small businesses.',
      serviceAreaSummary: 'Fremantle and nearby suburbs',
      availabilitySummary: 'Mon–Sat 8am–6pm',
      pricingSummary: 'Demo price — $140 first hour, then $95 per hour',
      accessPaths: [{
        kind: 'human_request',
        channel: 'phone',
        disclosure: 'Call the published number for a first contact.',
      }],
    }],
    responseTimeMinutes: 25,
  },
  {
    requestedSlug: 'adelaide-dental-clinic',
    businessName: 'Adelaide Dental Clinic',
    category: 'Dental clinic',
    suburb: 'Adelaide',
    stateTerritory: 'SA',
    publishedPhone: '(08) 5550 1300',
    offerings: [{
      name: 'General dental care',
      category: 'Dental clinic',
      summary: 'Dentist check-ups, tooth pain triage, and routine dental care information.',
      serviceAreaSummary: 'Adelaide and nearby suburbs',
      availabilitySummary: 'Mon–Fri 8:30am–5pm',
      pricingSummary: 'Demo price — $95 check-up and clean',
      accessPaths: [
        {
          kind: 'human_request',
          channel: 'phone',
          disclosure: 'Call the published number for a first contact.',
        },
        {
          kind: 'human_request',
          channel: 'ae_inquiry',
          disclosure: 'Use the inquiry form for a first contact.',
        },
      ],
    }],
    responseTimeMinutes: 20,
    inquiryAdmission: 'admitted',
  },
]

export const LOCAL_DEVELOPMENT_BUSINESS_FIXTURE_SLUGS = [
  DEFAULT_LOCAL_REGISTRY_FIXTURE_SLUG,
  ...LOCAL_E2E_BUSINESS_FIXTURES.map((fixture) => fixture.requestedSlug),
] as const
