import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { PublicToolRef } from '@/modules/common/tool-ref'
import type { StableHashValue } from '@/modules/common/stable-hash'

export function createPublicToolRef(input: Readonly<{
  operationId: string
  publicationRef: string
  publicationRevision: number
  contractRef: CapabilityContractRef
}>): PublicToolRef {
  const material = {
    operationId: input.operationId,
    publicationRef: input.publicationRef,
    publicationRevision: input.publicationRevision,
    contractRef: input.contractRef,
  } as StableHashValue
  return `operation:v1:${canonicalDigest(material).slice(7)}` as PublicToolRef
}

export function capabilityToolId(capabilityId: string): string {
  return `capability:${capabilityId}`
}

export type AdmittedToolRef = Readonly<{
  operationId: string
  publisherRef: string
  provenanceDigest: string
  businessId: string
  publicationRef: string
  publicationRevision: number
  sourceRevision: string
  sourceDigest: string
  contractRef: CapabilityContractRef
  catalogOfferingRef: string
  catalogOfferingRevision: number
  offeringId: string
  offeringRegistrationHash: string
  offeringEligibilityHash: string
  bindingId: string
  bindingRegistrationHash: string
  bindingEligibilityHash: string
  bindingConfigDigest: string
  qualificationDigest: string
  readinessValidUntil: number
  commercialDigest: string
  effectDigest: string
}>

export function createAdmittedToolRef(input: AdmittedToolRef): AdmittedToolRef {
  if (
    input.operationId.trim().length === 0
    || input.publisherRef.trim().length === 0
    || input.businessId.trim().length === 0
    || input.publicationRef.trim().length === 0
    || input.sourceRevision.trim().length === 0
    || input.sourceDigest.trim().length === 0
    || input.catalogOfferingRef.trim().length === 0
    || input.offeringId.trim().length === 0
    || input.bindingId.trim().length === 0
    || input.readinessValidUntil <= 0
    || !Number.isSafeInteger(input.publicationRevision)
    || !Number.isSafeInteger(input.catalogOfferingRevision)
  ) throw new Error('admitted_operation_ref_invalid')
  return Object.freeze({
    ...input,
    contractRef: Object.freeze({ ...input.contractRef }),
  })
}

export function validateAdmittedToolRef(input: unknown): input is AdmittedToolRef {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false
  const value = input as Partial<AdmittedToolRef>
  return typeof value.operationId === 'string'
    && typeof value.publisherRef === 'string'
    && typeof value.provenanceDigest === 'string'
    && typeof value.businessId === 'string'
    && typeof value.publicationRef === 'string'
    && Number.isSafeInteger(value.publicationRevision)
    && typeof value.sourceRevision === 'string'
    && typeof value.sourceDigest === 'string'
    && typeof value.contractRef === 'object'
    && value.contractRef !== null
    && typeof value.catalogOfferingRef === 'string'
    && Number.isSafeInteger(value.catalogOfferingRevision)
    && typeof value.offeringId === 'string'
    && typeof value.offeringRegistrationHash === 'string'
    && typeof value.offeringEligibilityHash === 'string'
    && typeof value.bindingId === 'string'
    && typeof value.bindingRegistrationHash === 'string'
    && typeof value.bindingEligibilityHash === 'string'
    && typeof value.bindingConfigDigest === 'string'
    && typeof value.qualificationDigest === 'string'
    && typeof value.readinessValidUntil === 'number'
    && value.readinessValidUntil > 0
    && typeof value.commercialDigest === 'string'
    && typeof value.effectDigest === 'string'
}
