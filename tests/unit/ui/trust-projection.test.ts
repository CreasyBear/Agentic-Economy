import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  AE_EXPLAINER_FULL,
  AE_EXPLAINER_NO_PHONE,
  NO_REPLY_HISTORY,
  buildListingTrustProjection,
} from '@/lib/ui/trust-projection'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const UPDATED_AT = 1_900_000_000_000

function trustCatalog({
  hoursOrUnknown,
  serviceArea,
  responseTimeMinutes,
  publishedPhone,
}: {
  hoursOrUnknown: string
  serviceArea: string
  responseTimeMinutes?: number
  publishedPhone?: string
}): PublicBusinessCatalogApiV2Dto {
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: 'business:trust-fixture',
    slug: 'trust-fixture',
    name: 'Trust Fixture Plumbing',
    category: 'Plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    ...(publishedPhone === undefined ? {} : { publishedPhone }),
    publicUrl: '/trust-fixture',
    trustTier: 'contact_confirmed',
    ...(responseTimeMinutes === undefined ? {} : { responseTimeMinutes }),
    photos: [],
    observedAt: UPDATED_AT,
    disposition: 'partial',
    offerings: [{
      offeringRef: 'offering:trust-fixture:emergency-plumbing',
      revision: 1,
      name: 'Emergency plumbing',
      category: 'Plumbing',
      summary: 'Urgent plumbing triage and repair.',
      serviceAreaSummary: serviceArea,
      availabilitySummary: hoursOrUnknown,
      accessPaths: [],
      support: { integrated: false, aeSupportedAction: false },
    }],
    accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
  }
}

describe('buildListingTrustProjection', () => {
  it('publishes supplied hours and service area while keeping phone and reply history explicitly unknown', () => {
    const projection = buildListingTrustProjection(
      trustCatalog({
        hoursOrUnknown: '  Mon–Fri 8am–5pm  ',
        serviceArea: '  Parramatta and nearby suburbs  ',
      }),
    )

    expect(projection).toEqual({
      phone: { kind: 'not_published', label: 'Phone not published here' },
      hours: { kind: 'published', value: 'Mon–Fri 8am–5pm', updatedAt: UPDATED_AT },
      serviceArea: {
        kind: 'published',
        value: 'Parramatta and nearby suburbs',
        updatedAt: UPDATED_AT,
      },
      replyPosture: { kind: 'no_history', label: 'No reply history yet' },
      explainer: AE_EXPLAINER_NO_PHONE,
    })
  })

  it('publishes only the catalog phone with the catalog update time', () => {
    const projection = buildListingTrustProjection(
      trustCatalog({
        hoursOrUnknown: 'Mon–Fri 8am–5pm',
        serviceArea: 'Parramatta',
        publishedPhone: '0412 345 678',
      }),
    )

    expect(projection.phone).toEqual({
      kind: 'published',
      value: '0412 345 678',
      updatedAt: UPDATED_AT,
    })
    expect(projection.explainer).toBe(AE_EXPLAINER_FULL)
  })

  it('labels every unavailable trust fact without inventing phone, hours, service area, or reply history', () => {
    const projection = buildListingTrustProjection(
      trustCatalog({
        hoursOrUnknown: '  UNKNOWN  ',
        serviceArea: '  unknown  ',
      }),
    )

    expect(projection).toEqual({
      phone: { kind: 'not_published', label: 'Phone not published here' },
      hours: { kind: 'not_published', label: 'Hours not published here' },
      serviceArea: { kind: 'not_published', label: 'Service area not published here' },
      replyPosture: { kind: 'no_history', label: 'No reply history yet' },
      explainer: AE_EXPLAINER_NO_PHONE,
    })
  })

  it('does not publish the owner-supplied-hours meta label as usable hours', () => {
    const projection = buildListingTrustProjection(
      trustCatalog({
        hoursOrUnknown: 'Hours supplied by owner',
        serviceArea: 'Parramatta',
      }),
    )

    expect(projection.hours).toEqual({
      kind: 'not_published',
      label: 'Hours not published here',
    })
  })

  it.each([0, 22])(
    'does not reinterpret responseTimeMinutes=%i as observed or business-published reply history',
    (responseTimeMinutes) => {
      const projection = buildListingTrustProjection(
        trustCatalog({
          hoursOrUnknown: 'Mon–Fri 8am–5pm',
          serviceArea: 'Parramatta',
          responseTimeMinutes,
        }),
      )

      expect(projection.replyPosture).toEqual({
        kind: 'no_history',
        label: 'No reply history yet',
      })
    },
  )

  it('locks both capability-gated public explainers and the no-history string exactly', () => {
    expect(AE_EXPLAINER_FULL).toBe(
      'AE sends your request in writing and keeps a record — or call directly.',
    )
    expect(AE_EXPLAINER_NO_PHONE).toBe('AE sends your request in writing and keeps a record.')
    expect(NO_REPLY_HISTORY).toBe('No reply history yet')
  })
})

describe('trust projection source boundary', () => {
  it('keeps registry/public as its only cross-module type import and excludes routing-kernel and inquiries', () => {
    const source = readFileSync(
      new URL('../../../src/lib/ui/trust-projection.ts', import.meta.url),
      'utf8',
    )
    const imports = [...source.matchAll(
      /^import\s+(type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/gm,
    )].map((match) => ({
      typeOnly: match[1] !== undefined,
      specifier: match[2] ?? '',
    }))
    const moduleImports = imports.filter(({ specifier }) =>
      /^(?:@\/|(?:\.\.\/)+)modules\//.test(specifier),
    )

    expect(moduleImports).toEqual([
      { typeOnly: true, specifier: '@/modules/registry/public' },
    ])
    expect(
      imports.filter(({ specifier }) =>
        /modules\/(?:routing-kernel|inquiries)(?:\/|$)/.test(specifier),
      ),
    ).toEqual([])
  })
})
