import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  catalogFromRows,
  projectDiscoveryPublicCatalog,
  projectRegistryCatalogApiItem,
} from '@/modules/catalog/public'

const registryHost = readFileSync('convex/registry.ts', 'utf8')
const discoveryHost = readFileSync('convex/discovery.ts', 'utf8')

describe('catalog-from-rows', () => {
  it('builds one public catalog via buildPublicCatalogDto for shared row bags', () => {
    const catalog = catalogFromRows({
      businessId: 'business:parramatta',
      slug: 'parramatta-emergency-plumbing',
      name: 'Parramatta Emergency Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      sourceHash: brandNonEmpty('hash:business', 'SourceHash'),
      updatedAt: 2,
      trustTier: 'claimed',
      indexStatus: 'queued',
      discoveryStatus: 'degraded',
      publishedPhone: '0412 345 678',
      services: [
        {
          serviceId: 'service:pipe',
          serviceSlug: 'pipe-repair',
          name: 'Emergency pipe repair',
          category: 'Emergency plumbing',
          summary: 'Burst pipe triage and repair.',
          serviceArea: 'Parramatta and nearby suburbs',
          hoursOrUnknown: 'Hours supplied by owner',
          sortOrder: 0,
          sourceHash: brandNonEmpty('hash:service', 'SourceHash'),
        },
      ],
      capabilities: [
        {
          serviceId: 'service:pipe',
          kind: 'phone_inquiry',
          status: 'unavailable',
          firstRequest: {
            mode: 'not_available_yet',
            publicDisclosure: 'First request is not available yet.',
            publicChannel: 'not_available',
            noContactReason: 'Owner has not supplied public contact instructions.',
          },
          reason: 'Owner has not supplied public contact instructions.',
          sourceHash: brandNonEmpty('hash:capability', 'SourceHash'),
        },
      ],
    })

    expect(catalog?.slug).toBe('parramatta-emergency-plumbing')
    expect(catalog?.schemaVersion).toBe('public-catalog:v1')
    expect(projectRegistryCatalogApiItem(catalog!).schemaVersion).toBe(
      'public-business-catalog-api:v1',
    )
    expect(projectDiscoveryPublicCatalog(catalog!).sourceHash).toBe('hash:business')
    expect(projectDiscoveryPublicCatalog(catalog!).services[0]?.serviceId).toBe('service:pipe')
  })

  it('preserves booking_interest on the wire projection', () => {
    const catalog = catalogFromRows({
      businessId: 'business:x',
      slug: 'x',
      name: 'X',
      category: 'Cat',
      suburb: 'Sub',
      stateTerritory: 'NSW',
      sourceHash: 'hash:x',
      updatedAt: 1,
      trustTier: 'claimed',
      indexStatus: 'not_queued',
      discoveryStatus: 'degraded',
      services: [{
        serviceId: 'service:1',
        serviceSlug: 's1',
        name: 'Service',
        category: 'Cat',
        summary: 'Summary',
        serviceArea: 'Area',
        hoursOrUnknown: 'Hours',
        sortOrder: 0,
        sourceHash: 'hash:s',
      }],
      capabilities: [{
        serviceId: 'service:1',
        kind: 'booking_interest',
        status: 'available',
        firstRequest: {
          mode: 'inquiry_available',
          publicDisclosure: 'Ask the business.',
          publicChannel: 'public_business_contact',
        },
        sourceHash: 'hash:c',
      }],
    })
    expect(projectRegistryCatalogApiItem(catalog!).services[0]?.capabilities[0]?.kind)
      .toBe('booking_interest')
  })
})

describe('catalog-from-rows host thinness', () => {
  it('routes registry and discovery catalog assembly through catalogFromRows', () => {
    expect(registryHost).toContain('catalogFromRows')
    expect(registryHost).toContain('projectRegistryCatalogApiItem')
    expect(discoveryHost).toContain('catalogFromRows')
    expect(discoveryHost).toContain('projectDiscoveryPublicCatalog')
  })

  it('does not merge search ranking with UCP manifest generation', () => {
    expect(registryHost).not.toContain('buildManifest')
    expect(registryHost).not.toContain('ae-ucp-fallback')
    expect(discoveryHost).toContain('buildManifest')
    expect(discoveryHost).not.toMatch(/function\s+rankSearch/)
  })

  it('keeps catalog-from-rows free of Convex runtime imports', () => {
    const source = readFileSync('src/modules/catalog/internal/catalog-from-rows.ts', 'utf8')
    expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
    expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
    expect(source).not.toMatch(/\bMutationCtx\b/)
    expect(source).not.toMatch(/\bQueryCtx\b/)
    expect(source).toContain('buildPublicCatalogDto')
  })
})
