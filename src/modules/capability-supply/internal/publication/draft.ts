import {
  encodeCapabilityContractDocumentJson,
  type EncodedCapabilityContractDocument,
} from '@/modules/capability-contract-registry/public'
import {
  admitRegisteredTransport,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  normalizeCapabilityPublication,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationOfferingDraft,
  type CanonicalCapabilityPublicationDraft,
} from '@/modules/capability-supply/public'

import { transportAdmissionInput } from '../binding/registration'
import { decodeConvexPublicationSource, isDirectPublicationSource } from './source'

export type PreparedPublicationDraft = Readonly<{
  draft: CanonicalCapabilityPublicationDraft
  encoded: EncodedCapabilityContractDocument
}>

export type AdmittedPublicationDraft = PreparedPublicationDraft & Readonly<{
  offering: ReturnType<typeof defineCapabilityOfferingRegistration>
  binding: ReturnType<typeof defineCapabilityTransportBindingRegistration>
  admittedTransport: Extract<ReturnType<typeof admitRegisteredTransport>, { kind: 'admitted' }>
}>

export type PreparePublicationDraftRefusal =
  | 'source_invalid'
  | 'contract_too_large'
  | 'contract_invalid'

export type AdmitPublicationDraftRefusal =
  | PreparePublicationDraftRefusal
  | 'offering_invalid'
  | 'binding_invalid'
  | Extract<ReturnType<typeof admitRegisteredTransport>, { kind: 'refused' }>['reason']

export function preparePublicationDraft(input: Readonly<{
  source: unknown
  offering?: CapabilityPublicationOfferingDraft | undefined
  binding?: CapabilityPublicationBindingDraft | undefined
  evidenceRefs: readonly string[]
}>):
  | Readonly<{ kind: 'prepared'; draft: CanonicalCapabilityPublicationDraft; encoded: EncodedCapabilityContractDocument }>
  | Readonly<{ kind: 'refused'; reason: PreparePublicationDraftRefusal }>
{
  let importInput: Parameters<typeof normalizeCapabilityPublication>[0]
  if (isDirectPublicationSource(input.source)) {
    if (input.offering === undefined || input.binding === undefined) {
      return { kind: 'refused', reason: 'source_invalid' }
    }
    importInput = {
      kind: 'ae_envelope',
      documentJson: input.source.documentJson,
      offering: input.offering,
      binding: input.binding,
      evidenceRefs: input.evidenceRefs,
    }
  } else {
    importInput = decodeConvexPublicationSource(input.source) as Parameters<
      typeof normalizeCapabilityPublication
    >[0]
  }
  let normalized
  try {
    normalized = normalizeCapabilityPublication(importInput)
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (normalized === undefined || normalized.kind === 'refused') {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  try {
    return {
      kind: 'prepared',
      draft: normalized.draft,
      encoded: encodeCapabilityContractDocumentJson(normalized.draft.documentJson),
    }
  } catch (error) {
    return {
      kind: 'refused',
      reason: error instanceof Error && error.message === 'capability_contract_too_large'
        ? 'contract_too_large'
        : 'contract_invalid',
    }
  }
}

export function admitPublicationDraft(input: Readonly<{
  source: unknown
  offering?: CapabilityPublicationOfferingDraft | undefined
  binding?: CapabilityPublicationBindingDraft | undefined
  evidenceRefs: readonly string[]
  businessId: string
}>):
  | Readonly<{ kind: 'admitted' } & AdmittedPublicationDraft>
  | Readonly<{ kind: 'refused'; reason: AdmitPublicationDraftRefusal }>
{
  const prepared = preparePublicationDraft(input)
  if (prepared.kind === 'refused') return prepared
  const { draft, encoded } = prepared
  const offeringInput = {
    ...draft.offering,
    businessId: input.businessId,
    contractRef: encoded.contract.ref,
  }
  const bindingInput = {
    ...draft.binding,
    offeringId: draft.offering.offeringId,
    networkId: draft.offering.networkId,
    contractRef: encoded.contract.ref,
  }
  try {
    defineCapabilityOfferingRegistration(offeringInput)
  } catch {
    return { kind: 'refused', reason: 'offering_invalid' }
  }
  let admittedTransport: ReturnType<typeof admitRegisteredTransport>
  try {
    const definedBinding = defineCapabilityTransportBindingRegistration(bindingInput)
    admittedTransport = admitRegisteredTransport(transportAdmissionInput(definedBinding))
    if (admittedTransport.kind === 'refused') return admittedTransport
  } catch {
    return { kind: 'refused', reason: 'binding_invalid' }
  }
  if (admittedTransport.kind !== 'admitted') {
    throw new Error('capability_publication_admission_invariant')
  }
  return {
    kind: 'admitted',
    draft,
    encoded,
    offering: defineCapabilityOfferingRegistration(offeringInput),
    binding: defineCapabilityTransportBindingRegistration(bindingInput),
    admittedTransport,
  }
}
