import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { pricingConfigDigest } from '@/modules/money/public'
import {
  preparePublicationDraft,
  type PreparedPublicationMaterial,
  type PublicationCommandPorts,
  type PublicationCommandRow,
} from '@/modules/capability-supply/internal/publication'
import { publicationSourceDigest } from '@/modules/capability-supply/internal/publication/source'
import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding/registration'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering/registration'
import {
  capabilityOperationId,
  createPublicOperationRef,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'

const currentPricingConfig = {
  version: 'pricing:v2' as const,
  unit: 'call' as const,
  paidAmount: { currency: 'AUD' as const, units: '1200', exponent: 2 },
}

export const digest = `sha256:${'a'.repeat(64)}`
export const actor = { kind: 'owner' as const, ref: 'owner-1' }
export const context = {
  operationKey: 'op-publish-1',
  correlationId: 'corr-1',
  reasonCode: 'publish',
  evidenceRefs: ['evidence:publication'],
  runtimeEnvironment: 'sandbox' as const,
}

export function publicationSource(
  capabilityId = 'independent.demo.lookup',
  version = 1,
): Extract<CapabilityPublicationImport, { kind: 'ae_envelope' }> {
  return {
    kind: 'ae_envelope',
    documentJson: JSON.stringify(capabilityContractV2({ capabilityId, version, name: 'Demo lookup' })),
    offering: offeringDraft(),
    binding: bindingDraft(),
    evidenceRefs: [...context.evidenceRefs],
  }
}

export function offeringDraft(suffix = 'demo'): CapabilityPublicationOfferingDraft {
  return {
    offeringId: `offering:${suffix}:lookup`,
    networkId: 'ae:public',
    presentation: {
      label: `${suffix} lookup`,
      summary: 'Returns one structured result.',
      price: { kind: 'fixed' as const, amount: { currency: 'AUD' as const, units: '1200', exponent: 2 } },
      materialTerms: [],
      commercialRelationship: {
        kind: 'none' as const,
        summary: 'No commercial influence.',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['business:neutral'],
      },
    },
    searchTerms: ['lookup'],
    registrationEvidenceRefs: ['business:publication'],
  }
}

export function bindingDraft(suffix = 'demo'): CapabilityPublicationBindingDraft {
  return {
    bindingId: `binding:${suffix}:http`,
    endpointUrl: `https://${suffix}.example.test/lookup`,
    authority: { kind: 'provider_connection', connectionRef: `connection:${suffix}`, providerRef: `provider:${suffix}` },
    continuation: { kind: 'single_response' as const, evidenceRefs: ['business:response'] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: ['business:no-cancellation'] },
    adapter: { adapterId: 'http-json:v1', config: { method: 'POST' as const, requestTimeoutMs: 5_000 } },
    registrationEvidenceRefs: ['business:binding'],
  }
}

export function encodedFor(capabilityId = 'independent.demo.lookup', version = 1) {
  return encodeCapabilityContractDocumentJson(
    JSON.stringify(capabilityContractV2({ capabilityId, version, name: 'Demo lookup' })),
  )
}

export async function preparedPublication(
  capabilityId = 'independent.demo.lookup',
  version = 1,
): Promise<PreparedPublicationMaterial> {
  const result = await preparePublicationDraft({
    source: publicationSource(capabilityId, version),
    sourceRevision: 'source-revision:demo',
    pricingConfig: {
      version: 'pricing:v2',
      unit: 'call',
      paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
    },
    evidenceRefs: context.evidenceRefs,
  })
  if ('reason' in result) throw new Error(`prepared_fixture_refused:${result.reason}`)
  return result.prepared
}

export function preparedWithSourceAdapter(
  prepared: PreparedPublicationMaterial,
  sourceKind: PreparedPublicationMaterial['sourceKind'],
  sourceSelector: PreparedPublicationMaterial['sourceSelector'],
  adapter: PreparedPublicationMaterial['binding']['adapter'],
): PreparedPublicationMaterial {
  return {
    ...prepared,
    sourceKind,
    sourceSelector,
    sourceDigest: publicationSourceDigest({
      sourceKind,
      selector: sourceSelector,
      descriptorJson: prepared.sourceDescriptorJson,
    }),
    binding: { ...prepared.binding, adapter },
  }
}

export function emptyPorts(overrides: Partial<PublicationCommandPorts> = {}): PublicationCommandPorts {
  return {
    findOperationKey: async () => null,
    insertOperationKey: async () => 'op-row-1',
    markOperationInProgress: async () => {},

    markOperationFailed: async () => {},
    markOperationSucceeded: async () => {},
    findAuditByEventId: async () => null,
    insertAudit: async () => {},
    registerOffering: async (registration: unknown) => ({
      kind: 'registered',
      offeringId: registrationId(registration, 'offeringId'),
      registrationHash: digest,
      created: true,
    }),
    registerBinding: async (registration: unknown) => ({
      kind: 'registered',
      bindingId: registrationId(registration, 'bindingId'),
      registrationHash: digest,
      created: true,
    }),
    setEligibility: async () => ({
      kind: 'eligible',
      offeringId: 'offering:demo:lookup',
      bindingId: 'binding:demo:http',
      eligibilityHash: digest,
      offeringEligibilityHash: digest,
      bindingEligibilityHash: digest,
      transition: {
        offeringBefore: 'inactive',
        offeringAfter: 'active',
        bindingBefore: 'not_admitted:not_conformant',
        bindingAfter: 'admitted:conformant',
      },
    }),
    loadOfferingByOfferingId: async () => null,
    loadBindingByBindingId: async () => null,
    listAdmittedConformantBindings: async () => [],
    patchOfferingQuarantineParent: async () => {},
    patchBindingQuarantine: async () => {},
    findContractDigest: async () => null,
    loadPublicationAtRevision: async () => null,
    insertPublication: async () => {},
    patchPublicationSuperseded: async () => {},
    patchPublicationWithdrawn: async () => {},
    rotateProviderConnectionBindingAuthority: async (input) => ({
      kind: 'rotated' as const,
      bindingId: input.bindingId,
      previousOperationRef: input.previousOperationRef,
      operationRef: input.nextOperationRef,
    }),
    registerContractDocument: async () => ({
      kind: 'registered',
      ref: encodedFor().contract.ref,
      created: true,
    }),
    getExactRegisteredContract: async () => ({
      kind: 'unavailable',
      reason: 'not_found',
    }),
    scheduleReadinessProbe: async () => {},
    ...overrides,
  }
}

function registrationId(registration: unknown, field: 'offeringId' | 'bindingId'): string {
  if (typeof registration !== 'object' || registration === null) {
    throw new Error(`registration_${field}_missing`)
  }
  const value = field === 'offeringId'
    ? ('offeringId' in registration ? registration.offeringId : undefined)
    : ('bindingId' in registration ? registration.bindingId : undefined)
  if (typeof value !== 'string') throw new Error(`registration_${field}_invalid`)
  return value
}

export function currentPublication(
  overrides: Partial<PublicationCommandRow> = {},
): PublicationCommandRow {
  const ref = encodedFor().contract.ref
  return {
    id: 'pub-row-1',
    operationRef: createPublicOperationRef({
      operationId: capabilityOperationId(ref.capabilityId),
      publicationRef: 'offering:demo:lookup',
      publicationRevision: 1,
      contractRef: ref,
    }),
    publicationRef: 'offering:demo:lookup',
    revision: 1,
    businessId: 'business-1',
    networkId: 'ae:public',
    runtimeEnvironment: 'sandbox',
    offeringId: 'offering:demo:lookup',
    bindingId: 'binding:demo:http',
    capabilityId: ref.capabilityId,
    version: ref.version,
    contractDigest: ref.contractDigest,
    disposition: 'current',
    sourceKind: 'ae_envelope',
    sourceSelector: {},
    sourceDescriptorJson: publicationSource(ref.capabilityId, ref.version).documentJson,
    sourceRevision: 'source-revision:demo',
    sourceDigest: digest,
    pricingConfigJson: JSON.stringify(currentPricingConfig),
    priceDigest: pricingConfigDigest(currentPricingConfig),
    publisherRef: 'owner-1',
    authorityMode: 'provider_owned',
    provenanceDigest: digest,
    registrationEvidenceRefs: ['evidence:publication'],
    ...overrides,
  }
}

export function supplyRows(publication: PublicationCommandRow): Pick<
  PublicationCommandPorts,
  'loadOfferingByOfferingId' | 'loadBindingByBindingId'
> {
  return {
    loadOfferingByOfferingId: async (): Promise<CapabilityOfferingRow> => ({
      offeringId: publication.offeringId,
      businessId: publication.businessId,
      networkId: publication.networkId,
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
      presentation: offeringDraft().presentation,
      searchTerms: ['lookup'],
      registrationEvidenceRefs: ['business:publication'],
      registrationHash: digest,
      status: 'active',
      admissionEvidenceRefs: ['evidence:admission'],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    }),
    loadBindingByBindingId: async (): Promise<CapabilityBindingRow> => ({
      _id: 'binding-row',
      _creationTime: 1,
      bindingId: publication.bindingId,
      offeringId: publication.offeringId,
      networkId: publication.networkId,
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
      endpointUrl: 'https://demo.example.test/lookup',
      authority: { kind: 'provider_connection', connectionRef: 'connection:demo', providerRef: 'provider:demo' },
      ...(publication.connectionAuthority === undefined
        ? {}
        : { connectionAuthority: publication.connectionAuthority }),
      continuation: { kind: 'single_response' as const, evidenceRefs: ['business:response'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['business:no-cancellation'] },
      adapterId: 'http-json:v1',
      configJson: '{}',
      configDigest: digest,
      registrationEvidenceRefs: ['business:binding'],
      registrationHash: digest,
      admission: 'admitted',
      conformance: 'conformant',
      admissionEvidenceRefs: ['evidence:admission'],
      conformanceEvidenceRefs: ['evidence:conformance'],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    }),
  }
}
