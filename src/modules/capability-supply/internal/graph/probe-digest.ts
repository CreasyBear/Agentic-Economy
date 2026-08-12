import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

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
  | 'authority'
  | 'connectionAuthority'
  | 'adapterId'
  | 'configDigest'
  | 'registrationHash'
  | 'eligibilityHash'
  | 'admission'
  | 'conformance'
>

export type ProbeRequestDigestTarget = Readonly<{
  targetDigest: string
  endpointUrl: string
  adapterId: string
  probeKind?: 'ae_quote' | 'openapi_http' | 'mcp' | 'x402'
  probeMethod?: 'GET' | 'POST'
  probeQuery?: readonly Readonly<{ parameter: string; value: string }>[]
  transportConfigJson?: string
  probeInputJson?: string
  outputSchemaJson?: string
  expectedPaymentJson?: string
}>

export function probeTargetDigest(
  publication: ProbeDigestPublication,
  offering: ProbeDigestOffering,
  binding: ProbeDigestBinding,
): string {
  const authorityMaterial = binding.authority.kind === 'provider_connection'
    ? {
      authority: binding.authority,
      ...(binding.connectionAuthority === undefined
        ? {}
        : { connectionAuthority: binding.connectionAuthority }),
    }
    : { authority: binding.authority }
  return canonicalDigest({
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    bindingId: binding.bindingId,
    capabilityId: publication.capabilityId,
    endpointUrl: binding.endpointUrl,
    ...authorityMaterial,
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

export function probeRequestDigest(target: ProbeRequestDigestTarget): string {
  return canonicalDigest({
    targetDigest: target.targetDigest,
    endpointUrl: target.endpointUrl,
    adapterId: target.adapterId,
    probeKind: target.probeKind ?? null,
    probeMethod: target.probeMethod ?? null,
    probeQuery: target.probeQuery ?? [],
    transportConfigJson: target.transportConfigJson ?? null,
    probeInputJson: target.probeInputJson ?? null,
    outputSchemaJson: target.outputSchemaJson ?? null,
    expectedPaymentJson: target.expectedPaymentJson ?? null,
  } as StableHashValue)
}
