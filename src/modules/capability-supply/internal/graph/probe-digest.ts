import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { CapabilityBindingRow } from '../binding'
import type { CapabilityOfferingRow } from '../offering'

import type { GraphPublicationRow } from './ports'

export type ProbeDigestPublication = Pick<
  GraphPublicationRow,
  'publicationRef' | 'revision' | 'capabilityId' | 'businessId' | 'contractDigest'
>

export type ProbeDigestOffering = Pick<
  CapabilityOfferingRow,
  'registrationHash' | 'eligibilityHash' | 'status'
>

export type ProbeDigestBinding = Pick<
  CapabilityBindingRow,
  | 'bindingId'
  | 'endpointUrl'
  | 'credentialRef'
  | 'adapterId'
  | 'configDigest'
  | 'registrationHash'
  | 'eligibilityHash'
  | 'admission'
  | 'conformance'
>

export function probeTargetDigest(
  publication: ProbeDigestPublication,
  offering: ProbeDigestOffering,
  binding: ProbeDigestBinding,
): string {
  return canonicalDigest({
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    bindingId: binding.bindingId,
    capabilityId: publication.capabilityId,
    endpointUrl: binding.endpointUrl,
    credentialRef: binding.credentialRef,
    adapterId: binding.adapterId,
    configDigest: binding.configDigest,
    offeringRegistrationHash: offering.registrationHash,
    offeringEligibilityHash: offering.eligibilityHash,
    offeringStatus: offering.status,
    bindingRegistrationHash: binding.registrationHash,
    bindingEligibilityHash: binding.eligibilityHash,
    bindingAdmission: binding.admission,
    bindingConformance: binding.conformance,
    businessId: publication.businessId,
    contractDigest: publication.contractDigest,
  })
}
