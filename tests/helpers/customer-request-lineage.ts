import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createAdmittedOperationRef,
  createPublicOperationRef,
  type AdmittedOperationRef,
  type PublicOperationRef,
} from '@/modules/capability-supply/public'

export type TestOperationLineage = Readonly<{
  operationRef: PublicOperationRef
  admittedOperation: AdmittedOperationRef
}>

export function createTestOperationLineage(
  contractRef: CapabilityContractRef,
  suffix = `${contractRef.capabilityId}:${contractRef.version}`,
  overrides: Partial<Omit<AdmittedOperationRef, 'contractRef'>> = {},
): TestOperationLineage {
  const defaults: Omit<AdmittedOperationRef, 'contractRef'> = {
    operationId: `operation:test:${suffix}`,
    publisherRef: `publisher:test:${suffix}`,
    provenanceDigest: canonicalDigest({ kind: 'test-provenance', suffix }),
    businessId: `business:test:${suffix}`,
    publicationRef: `publication:test:${suffix}`,
    publicationRevision: 1,
    sourceRevision: `source:test:${suffix}:1`,
    sourceDigest: canonicalDigest({ kind: 'test-source', suffix, contractRef }),
    catalogOfferingRef: `catalog-offering:test:${suffix}`,
    catalogOfferingRevision: 1,
    offeringId: `offering:test:${suffix}`,
    offeringRegistrationHash: canonicalDigest({ kind: 'test-offering', suffix }),
    offeringEligibilityHash: canonicalDigest({ kind: 'test-offering-eligibility', suffix }),
    bindingId: `binding:test:${suffix}`,
    bindingRegistrationHash: canonicalDigest({ kind: 'test-binding', suffix }),
    bindingEligibilityHash: canonicalDigest({ kind: 'test-binding-eligibility', suffix }),
    bindingConfigDigest: canonicalDigest({ kind: 'test-binding-config', suffix }),
    qualificationDigest: canonicalDigest({ kind: 'test-qualification', suffix }),
    readinessValidUntil: 1_000_000,
    commercialDigest: canonicalDigest({ kind: 'test-commercial', suffix }),
    effectDigest: canonicalDigest({ kind: 'test-effect', suffix }),
  }
  const admittedOperation = createAdmittedOperationRef({
    ...defaults,
    ...overrides,
    contractRef,
  })
  return Object.freeze({
    operationRef: createPublicOperationRef({
      operationId: admittedOperation.operationId,
      publicationRef: admittedOperation.publicationRef,
      publicationRevision: admittedOperation.publicationRevision,
      contractRef: admittedOperation.contractRef,
    }),
    admittedOperation,
  })
}
