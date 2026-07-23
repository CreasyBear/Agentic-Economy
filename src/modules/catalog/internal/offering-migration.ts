import { stableHash } from '@/modules/common/stable-hash'
import type { AccessPathRef, OfferingRef, SourceHash } from '@/modules/common/ids'

import type { BusinessServiceRecord, ServiceCapabilityRecord } from './catalog-model'
import type {
  BusinessOfferingRecord,
  BusinessOfferingRevisionRecord,
  OfferingAccessPathRecord,
} from './offering-supply'

export type LegacyOfferingCrosswalk = Readonly<{
  serviceId: BusinessServiceRecord['serviceId']
  serviceSourceHash: SourceHash
  offeringRef: OfferingRef
  offeringRevision: 1
  offeringSourceHash: SourceHash
  accessPathRefs: readonly AccessPathRef[]
}>

export type LegacyOfferingMigration = Readonly<{
  offering: BusinessOfferingRecord
  revision: BusinessOfferingRevisionRecord
  accessPaths: readonly OfferingAccessPathRecord[]
  crosswalk: LegacyOfferingCrosswalk
}>

export const MAX_LEGACY_MIGRATION_BATCH = 50
export type CatalogSupplyCutoverMode = 'legacy' | 'compare' | 'offering'
export type CatalogSupplyCutoverDecision =
  | Readonly<{ kind: 'allowed'; mode: CatalogSupplyCutoverMode }>
  | Readonly<{ kind: 'refused'; code: 'migration_batch_limit_exceeded' | 'projection_mismatch' | 'invalid_transition' }>

export function planLegacyOfferingMigrationBatch(input: Readonly<{
  services: readonly BusinessServiceRecord[]
  capabilities: readonly ServiceCapabilityRecord[]
}>): readonly LegacyOfferingMigration[] | CatalogSupplyCutoverDecision {
  if (input.services.length > MAX_LEGACY_MIGRATION_BATCH) return { kind: 'refused', code: 'migration_batch_limit_exceeded' }
  return [...input.services]
    .sort((left, right) => left.serviceId.localeCompare(right.serviceId))
    .map((service) => migrateLegacyServiceToOffering({ service, capabilities: input.capabilities }))
}

export function decideCatalogSupplyCutover(input: Readonly<{
  current: CatalogSupplyCutoverMode
  requested: CatalogSupplyCutoverMode
  expectedDigest?: SourceHash
  observedDigest?: SourceHash
}>): CatalogSupplyCutoverDecision {
  if (input.requested === 'offering' && input.current !== 'compare') return { kind: 'refused', code: 'invalid_transition' }
  if (input.requested === 'offering' && (input.expectedDigest === undefined || input.expectedDigest !== input.observedDigest)) {
    return { kind: 'refused', code: 'projection_mismatch' }
  }
  return { kind: 'allowed', mode: input.requested }
}

/** Pure, replayable expansion from the retained v1 service rows. */
export function migrateLegacyServiceToOffering(input: Readonly<{
  service: BusinessServiceRecord
  capabilities: readonly ServiceCapabilityRecord[]
}>): LegacyOfferingMigration {
  const offeringRef = `offering:${input.service.serviceId}` as OfferingRef
  const revision = 1 as const
  const offeringSourceHash = stableHash({
    source: 'legacy_business_service',
    serviceId: input.service.serviceId,
    serviceSourceHash: input.service.sourceHash,
    revision,
  }) as SourceHash
  const matchingCapabilities = input.capabilities.filter((capability) => (
    capability.businessId === input.service.businessId
    && capability.serviceId === input.service.serviceId
    && capability.status !== 'unavailable'
    && capability.firstRequest.mode !== 'not_available_yet'
  )).sort((left, right) => left.sourceHash.localeCompare(right.sourceHash))
  const accessPaths = matchingCapabilities.map((capability) => {
    const accessPathRef = `access:${input.service.serviceId}:${capability.sourceHash}` as AccessPathRef
    return {
      accessPathRef,
      businessId: input.service.businessId,
      offeringRef,
      offeringRevision: revision,
      offeringSourceHash,
      status: 'published' as const,
      descriptor: {
        kind: 'human_request' as const,
        channel: capability.firstRequest.publicChannel === 'public_business_contact'
          ? 'phone' as const
          : 'ae_inquiry' as const,
        disclosure: capability.firstRequest.publicDisclosure,
      },
      sourceHash: stableHash({
        source: 'legacy_service_capability',
        capabilitySourceHash: capability.sourceHash,
        offeringSourceHash,
      }) as SourceHash,
      createdAt: capability.createdAt,
      updatedAt: capability.updatedAt,
    }
  })
  return {
    offering: {
      offeringRef,
      businessId: input.service.businessId,
      currentRevision: revision,
      status: input.service.status === 'published' ? 'published' : 'draft',
      createdAt: input.service.createdAt,
      updatedAt: input.service.updatedAt,
    },
    revision: {
      offeringRef,
      businessId: input.service.businessId,
      revision,
      name: input.service.name,
      category: input.service.category,
      summary: input.service.summary,
      serviceAreaSummary: input.service.serviceArea,
      availabilitySummary: input.service.hoursOrUnknown,
      sourceHash: offeringSourceHash,
      createdAt: input.service.createdAt,
    },
    accessPaths,
    crosswalk: {
      serviceId: input.service.serviceId,
      serviceSourceHash: input.service.sourceHash,
      offeringRef,
      offeringRevision: revision,
      offeringSourceHash,
      accessPathRefs: accessPaths.map((path) => path.accessPathRef),
    },
  }
}

export function legacyOfferingParityMatches(
  expected: LegacyOfferingMigration,
  observed: Readonly<{
    offering: BusinessOfferingRecord
    revision: BusinessOfferingRevisionRecord
    accessPaths: readonly OfferingAccessPathRecord[]
  }>,
): boolean {
  return stableHash(expected.offering) === stableHash(observed.offering)
    && stableHash(expected.revision) === stableHash(observed.revision)
    && stableHash(expected.accessPaths) === stableHash(observed.accessPaths)
}
