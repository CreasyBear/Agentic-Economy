import type { OfferingPrice } from '../../src/modules/catalog/public'

export type LocalE2eOfferingAccessPathFixture = Readonly<{
  kind: 'human_request'
  channel: 'phone' | 'website'
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

export const DEFAULT_LOCAL_REGISTRY_FIXTURE_SLUG = 'demo-listed-provider'

export const LOCAL_E2E_BUSINESS_FIXTURES: readonly LocalE2eBusinessFixture[] = [
  {
    requestedSlug: DEFAULT_LOCAL_REGISTRY_FIXTURE_SLUG,
    businessName: 'Demo listed provider',
    category: 'Listed provider',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    offerings: [{
      name: 'Listed offering',
      category: 'Listed provider',
      summary: 'Published listing for first contact.',
      serviceAreaSummary: 'Parramatta and nearby suburbs',
      availabilitySummary: 'Hours unknown',
      accessPaths: [],
    }],
  },
  {
    requestedSlug: 'demo-inquiry-provider',
    businessName: 'Demo inquiry provider',
    category: 'Inquiry provider',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    offerings: [{
      name: 'Inquiry offering',
      category: 'Inquiry provider',
      summary: 'Inquiry offering for first contact.',
      serviceAreaSummary: 'Parramatta',
      availabilitySummary: 'Hours unknown',
      accessPaths: [{
        kind: 'human_request',
        channel: 'website',
        disclosure: 'Use the inquiry form for a first contact.',
      }],
    }],
    responseTimeMinutes: 22,
  },
  {
    requestedSlug: 'joondalup-listed-provider',
    businessName: 'Joondalup listed provider',
    category: 'Listed provider',
    suburb: 'Joondalup',
    stateTerritory: 'WA',
    publishedPhone: '0412 345 678',
    offerings: [{
      name: 'Listed offering',
      category: 'Listed provider',
      summary: 'Listed offering for urgent local first contact.',
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
          channel: 'website',
          disclosure: 'Use the inquiry form for a first contact.',
        },
      ],
    }],
    responseTimeMinutes: 20,
    inquiryAdmission: 'admitted',
  },
  {
    requestedSlug: 'fremantle-listed-provider',
    businessName: 'Fremantle listed provider',
    category: 'Listed provider',
    suburb: 'Fremantle',
    stateTerritory: 'WA',
    publishedPhone: '(08) 9430 1234',
    offerings: [{
      name: 'Listed offering',
      category: 'Listed provider',
      summary: 'Listed offering for homes and small businesses.',
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
    requestedSlug: 'adelaide-listed-provider',
    businessName: 'Adelaide listed provider',
    category: 'Listed provider',
    suburb: 'Adelaide',
    stateTerritory: 'SA',
    publishedPhone: '(08) 5550 1300',
    offerings: [{
      name: 'Listed offering',
      category: 'Listed provider',
      summary: 'Listed offering for first contact in Adelaide.',
      serviceAreaSummary: 'Adelaide and nearby suburbs',
      availabilitySummary: 'Mon–Fri 8:30am–5pm',
      pricingSummary: 'Demo price — $95 first visit',
      accessPaths: [
        {
          kind: 'human_request',
          channel: 'phone',
          disclosure: 'Call the published number for a first contact.',
        },
        {
          kind: 'human_request',
          channel: 'website',
          disclosure: 'Use the inquiry form for a first contact.',
        },
      ],
    }],
    responseTimeMinutes: 20,
    inquiryAdmission: 'admitted',
  },
]

export const LOCAL_DEVELOPMENT_BUSINESS_FIXTURE_SLUGS = [
  ...LOCAL_E2E_BUSINESS_FIXTURES.map((fixture) => fixture.requestedSlug),
] as const
