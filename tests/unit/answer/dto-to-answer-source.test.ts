import { describe, expect, it } from 'vitest'

import { toAnswerSource } from '@/modules/answer/internal/dto-to-answer-source'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicOfferingAccessPathDto,
  PublicOfferingDto,
} from '@/modules/registry/public'

const AE_INQUIRY_PATH: PublicOfferingAccessPathDto = {
  accessPathRef: 'access:ae',
  offeringRevision: 1,
  kind: 'human_request',
  channel: 'website',
  disclosure: 'Send an inquiry through Agentic Economy.',
}

const PHONE_PATH: PublicOfferingAccessPathDto = {
  accessPathRef: 'access:phone',
  offeringRevision: 1,
  kind: 'human_request',
  channel: 'phone',
  disclosure: 'Call the business directly.',
}

const EXTERNAL_PATH: PublicOfferingAccessPathDto = {
  accessPathRef: 'access:api',
  offeringRevision: 1,
  kind: 'external_operation',
  name: 'Booking API',
  summary: 'Business-declared booking endpoint.',
  url: 'https://example.test/book',
  provenance: 'business_declared',
}

function offering(overrides: Partial<PublicOfferingDto> = {}): PublicOfferingDto {
  return {
    offeringRef: 'offering:emergency',
    revision: 1,
    name: 'Listed offering',
    category: 'Plumbing',
    summary: 'Burst pipe triage.',
    accessPaths: [],
    support: { integrated: false, aeSupportedAction: false },
    ...overrides,
  }
}

function dto(overrides: Partial<PublicBusinessCatalogApiV2Dto> = {}): PublicBusinessCatalogApiV2Dto {
  const offerings = overrides.offerings ?? [offering()]
  const paths = offerings.flatMap((item) => item.accessPaths)
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: 'business:demo-plumbing',
    slug: 'demo-plumbing',
    name: 'Demo inquiry provider',
    category: 'Plumbing',
    businessContext: { kind: 'local_human', suburb: 'Parramatta', stateTerritory: 'NSW' },
    publicUrl: '/demo-plumbing',
    trustTier: 'registry_verified',
    photos: [],
    observedAt: Date.now() - 60_000,
    disposition: 'current',
    accessSummary: {
      humanRequest: paths.some((path) => path.kind === 'human_request'),
      externalOperation: paths.some((path) => path.kind === 'external_operation'),
      aeSupportedAction: false,
    },
    ...overrides,
    offerings,
  }
}

describe('toAnswerSource — access paths replace firstRequest.mode', () => {
  it('treats a website human request path as published contact', () => {
    const source = toAnswerSource(
      dto({ offerings: [offering({ accessPaths: [AE_INQUIRY_PATH] })] }),
      1,
    )

    expect(source.nextStepLabel).toBe('View contact details')
    expect(source.availabilityLabel).toBe('Contact supplied')
  })

  it('treats a phone-only human request path as published contact', () => {
    const source = toAnswerSource(
      dto({ offerings: [offering({ accessPaths: [PHONE_PATH] })] }),
      1,
    )

    expect(source.nextStepLabel).toBe('View contact details')
    expect(source.availabilityLabel).toBe('Contact supplied')
  })

  it('reports no contact option when no human request path is published', () => {
    const source = toAnswerSource(
      dto({ offerings: [offering({ accessPaths: [EXTERNAL_PATH] })] }),
      1,
    )

    expect(source.nextStepLabel).toBe('View details')
    expect(source.availabilityLabel).toBe('No contact option yet')
  })

  it('finds a published contact path on a later offering', () => {
    const source = toAnswerSource(
      dto({
        offerings: [
          offering({ offeringRef: 'offering:a', accessPaths: [PHONE_PATH] }),
          offering({ offeringRef: 'offering:b', accessPaths: [AE_INQUIRY_PATH] }),
        ],
      }),
      1,
    )

    expect(source.nextStepLabel).toBe('View contact details')
  })
})

describe('toAnswerSource — facts V1 could not carry', () => {
  it('carries the published price verbatim at business and offering level', () => {
    const source = toAnswerSource(
      dto({
        offerings: [
          offering({ offeringRef: 'offering:a', pricingSummary: '  $180 callout, then $120/hr  ' }),
          offering({ offeringRef: 'offering:b', pricingSummary: 'From $95' }),
        ],
      }),
      1,
    )

    expect(source.pricingSummary).toBe('$180 callout, then $120/hr')
    expect(source.services.map((service) => service.pricingSummary)).toEqual([
      '$180 callout, then $120/hr',
      'From $95',
    ])
  })

  it('omits price entirely when no offering publishes one', () => {
    const source = toAnswerSource(dto(), 1)

    expect(source.pricingSummary).toBeUndefined()
    expect(source.services[0]?.pricingSummary).toBeUndefined()
  })

  it('carries real published availability verbatim and echoes it as the hours line', () => {
    const source = toAnswerSource(
      dto({ offerings: [offering({ availabilitySummary: 'Mon–Fri 7am–5pm' })] }),
      1,
    )

    expect(source.availabilitySummary).toBe('Mon–Fri 7am–5pm')
    expect(source.hoursLabel).toBe('Mon–Fri 7am–5pm')
  })

  it('never presents the "Hours supplied by owner" placeholder as availability', () => {
    const source = toAnswerSource(
      dto({ offerings: [offering({ availabilitySummary: 'Hours supplied by owner' })] }),
      1,
    )

    expect(source.availabilitySummary).toBeUndefined()
    expect(source.services[0]?.availabilitySummary).toBeUndefined()
    expect(source.hoursLabel).toBe('Check hours')
  })

  it('prefers a real availability string over an earlier placeholder offering', () => {
    const source = toAnswerSource(
      dto({
        offerings: [
          offering({ offeringRef: 'offering:a', availabilitySummary: 'Hours supplied by owner' }),
          offering({ offeringRef: 'offering:b', availabilitySummary: 'Sat 8am–1pm' }),
        ],
      }),
      1,
    )

    expect(source.availabilitySummary).toBe('Sat 8am–1pm')
    expect(source.hoursLabel).toBe('Sat 8am–1pm')
  })
})

describe('toAnswerSource — business-level V2 facts', () => {
  it('maps observedAt to the freshness label, trustTier to the trust cue, and photos to the card image', () => {
    const source = toAnswerSource(
      dto({
        observedAt: Date.now() - 60_000,
        responseTimeMinutes: 22,
        photos: [{ url: 'https://example.test/one.jpg', alt: 'Van' }],
        offerings: [offering({ serviceAreaSummary: 'Parramatta and nearby suburbs' })],
      }),
      3,
    )

    expect(source.citationIndex).toBe(3)
    expect(source.freshnessLabel).toMatch(/^Updated /)
    expect(source.trustLabel).toBe('Checked')
    expect(source.trustCue).toBe('Responds ~22m · Checked')
    expect(source.photoUrl).toBe('https://example.test/one.jpg')
    expect(source.serviceArea).toBe('Parramatta and nearby suburbs')
    expect(source.detailUrl).toBe('/demo-plumbing')
  })

  it('emits an empty freshness label when the projection carries no observation time', () => {
    expect(toAnswerSource(dto({ observedAt: 0 }), 1).freshnessLabel).toBe('')
  })
})
