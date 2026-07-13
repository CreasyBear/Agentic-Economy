import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  AE_EXPLAINER,
  NO_REPLY_HISTORY,
  buildListingTrustProjection,
} from '@/lib/ui/trust-projection'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicRouteCatalogContract } from '@/modules/catalog/public'

const BUSINESS_ID = brandNonEmpty('business:trust-fixture', 'BusinessId')
const SERVICE_ID = brandNonEmpty('service:trust-fixture', 'ServiceId')
const UPDATED_AT = 1_900_000_000_000

function trustCatalog({
  hoursOrUnknown,
  serviceArea,
  responseTimeMinutes,
}: {
  hoursOrUnknown: string
  serviceArea: string
  responseTimeMinutes?: number
}): PublicRouteCatalogContract {
  return {
    businessId: BUSINESS_ID,
    slug: brandNonEmpty('trust-fixture', 'Slug'),
    name: 'Trust Fixture Plumbing',
    category: 'Plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/trust-fixture',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    indexStatus: 'queued',
    discoveryStatus: 'degraded',
    photos: [],
    ...(responseTimeMinutes === undefined ? {} : { responseTimeMinutes }),
    services: [
      {
        serviceId: SERVICE_ID,
        serviceSlug: brandNonEmpty('emergency-plumbing', 'Slug'),
        businessId: BUSINESS_ID,
        name: 'Emergency plumbing',
        category: 'Plumbing',
        summary: 'Urgent plumbing triage and repair.',
        serviceArea,
        hoursOrUnknown,
        firstRequest: {
          mode: 'inquiry_available',
          publicChannel: 'public_business_contact',
          publicDisclosure: 'Use the source-owned inquiry form for a first contact.',
          rawContactExcluded: true,
        },
        status: 'published',
        capabilities: [],
      },
    ],
    schemaVersion: 'public-catalog:v1',
    updatedAt: UPDATED_AT,
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
      explainer: 'AE sends your request in writing and keeps a record — or call directly.',
    })
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
      explainer: 'AE sends your request in writing and keeps a record — or call directly.',
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

  it('locks the public explainer and no-history strings exactly', () => {
    expect(AE_EXPLAINER).toBe(
      'AE sends your request in writing and keeps a record — or call directly.',
    )
    expect(NO_REPLY_HISTORY).toBe('No reply history yet')
  })
})

describe('trust projection source boundary', () => {
  it('keeps catalog/public as its only cross-module type import and excludes routing-kernel and inquiries', () => {
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
      { typeOnly: true, specifier: '@/modules/catalog/public' },
    ])
    expect(
      imports.filter(({ specifier }) =>
        /modules\/(?:routing-kernel|inquiries)(?:\/|$)/.test(specifier),
      ),
    ).toEqual([])
  })
})
