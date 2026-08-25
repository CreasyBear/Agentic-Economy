type FirstRequestMode = 'quote_request_available' | 'not_available_yet'

export type DevSeedOfferingAccessPathFixture = Readonly<{
  kind: 'human_request'
  channel: 'phone' | 'website'
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

/**
 * Dev-seed businesses are not the product catalog. Market Operations come from
 * facilitator discovery ingest, not curated fixtures.
 */
export const DEV_SEED_BUSINESS_COUNT = 0

export const DEV_SEED_BUSINESS_FIXTURES: readonly DevSeedBusinessFixture[] = []
