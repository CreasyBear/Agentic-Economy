import { describe, expect, it } from 'vitest'

import {
  decideCatalogSupplyCutover,
  legacyOfferingParityMatches,
  migrateLegacyServiceToOffering,
  planLegacyOfferingMigrationBatch,
  type BusinessServiceRecord,
  type ServiceCapabilityRecord,
} from '@/modules/catalog/public'

const service = {
  serviceId: 'service:engineering-quote',
  serviceSlug: 'engineering-quote',
  businessId: 'business:engineers',
  name: 'Civil design review',
  category: 'Engineering',
  summary: 'Review a civil design package.',
  serviceArea: 'Australia',
  hoursOrUnknown: 'Business hours',
  status: 'published',
  sortOrder: 1,
  sourceHash: 'sha256:legacy-service',
  createdAt: 10,
  updatedAt: 20,
} as BusinessServiceRecord

const capability = {
  businessId: service.businessId,
  serviceId: service.serviceId,
  kind: 'quote_request',
  status: 'available',
  firstRequest: {
    mode: 'quote_request_available',
    publicDisclosure: 'Request a scoped estimate.',
    publicChannel: 'public_business_contact',
    rawContactExcluded: true,
  },
  callable: false,
  paymentRequired: false,
  sourceHash: 'sha256:legacy-capability',
  createdAt: 10,
  updatedAt: 20,
} as ServiceCapabilityRecord

describe('catalog legacy expansion', () => {
  it('preserves exact crosswalks while translating request channels into access paths', () => {
    const migrated = migrateLegacyServiceToOffering({ service, capabilities: [capability] })

    expect(migrated.offering.offeringRef).toBe(`offering:${service.serviceId}`)
    expect(migrated.revision.serviceAreaSummary).toBe('Australia')
    expect(migrated.accessPaths[0]?.descriptor).toEqual({
      kind: 'human_request', channel: 'phone', disclosure: 'Request a scoped estimate.',
    })
    expect(migrated.crosswalk.serviceSourceHash).toBe(service.sourceHash)
    expect(legacyOfferingParityMatches(migrated, migrated)).toBe(true)
    expect(legacyOfferingParityMatches(migrated, {
      ...migrated,
      revision: { ...migrated.revision, summary: 'Drifted copy' },
    })).toBe(false)
  })

  it('does not invent reachability for a legacy service with no usable request channel', () => {
    const migrated = migrateLegacyServiceToOffering({
      service,
      capabilities: [{
        ...capability,
        status: 'unavailable',
        firstRequest: {
          mode: 'not_available_yet',
          publicDisclosure: 'Not available.',
          publicChannel: 'not_available',
          noContactReason: 'Not configured.',
          rawContactExcluded: true,
        },
      }],
    })
    expect(migrated.accessPaths).toEqual([])
  })

  it('bounds migration batches and requires exact compare parity before cutover', () => {
    const oversized = Array.from({ length: 51 }, (_, index) => ({ ...service, serviceId: `service:${index}` })) as BusinessServiceRecord[]
    expect(planLegacyOfferingMigrationBatch({ services: oversized, capabilities: [] })).toEqual({ kind: 'refused', code: 'migration_batch_limit_exceeded' })
    expect(decideCatalogSupplyCutover({ current: 'legacy', requested: 'offering', expectedDigest: 'a' as never, observedDigest: 'a' as never })).toEqual({ kind: 'refused', code: 'invalid_transition' })
    expect(decideCatalogSupplyCutover({ current: 'compare', requested: 'offering', expectedDigest: 'a' as never, observedDigest: 'b' as never })).toEqual({ kind: 'refused', code: 'projection_mismatch' })
    expect(decideCatalogSupplyCutover({ current: 'compare', requested: 'offering', expectedDigest: 'a' as never, observedDigest: 'a' as never })).toEqual({ kind: 'allowed', mode: 'offering' })
    expect(decideCatalogSupplyCutover({ current: 'offering', requested: 'legacy' })).toEqual({ kind: 'allowed', mode: 'legacy' })
  })
})
