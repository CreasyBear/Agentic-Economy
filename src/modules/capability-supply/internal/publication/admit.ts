import { normalizeCapabilityPublication, type CapabilityPublicationImport, type CapabilityPublicationImportRefusal } from '../publication-importers'
import { decodeConvexPublicationSource } from './source'
import { publishCapabilityCommand } from './publish'
import type { PublicationLifecycle } from './lifecycle'
import type { PublicationCommandPorts } from './ports'
import {
  defineCapabilityPublicationProvenance,
  validCapabilityPublicationAuthority,
  validCapabilityPublicationSourceRevision,
  type CapabilityPublicationAuthorityMode,
} from './provenance'
import { validRegistrationContext, type RegistrationContext, type SupplyCommandActor } from '../shared'

export type CapabilityPublicationAdmissionSource = CapabilityPublicationImport & Readonly<{
  sourceRevision: string
}>

export type AdmitCapabilityPublicationInput = RegistrationContext & Readonly<{
  businessId: string
  catalogOfferingRef: string
  catalogOfferingRevision: number
  source: CapabilityPublicationAdmissionSource
  authorityMode: CapabilityPublicationAuthorityMode
  actor: SupplyCommandActor
  now: number
}>

export type CapabilityPublicationAdmissionRefusal =
  | 'authorization_denied'
  | 'registration_context_invalid'
  | 'source_revision_invalid'
  | 'catalog_offering_invalid'
  | 'provenance_invalid'
  | CapabilityPublicationImportRefusal
  | 'contract_identity_conflict'
  | 'contract_integrity_failure'
  | 'offering_invalid'
  | 'offering_identity_conflict'
  | 'offering_integrity_failure'
  | 'binding_invalid'
  | 'binding_identity_conflict'
  | 'binding_integrity_failure'
  | 'adapter_not_registered'
  | 'adapter_config_invalid'
  | 'adapter_config_too_large'
  | 'operation_key_conflict'

export type AdmitCapabilityPublicationResult =
  | Readonly<{
      kind: 'published' | 'replayed'
      operationId: string
      operationName: 'publishCapability'
      publisherRef: string
      authorityMode: CapabilityPublicationAuthorityMode
      provenanceDigest: string
      publicationRef: string
      publicationRevision: number
      contractRef: Readonly<{
        capabilityId: string
        version: number
        contractDigest: string
      }>
      catalogOfferingRef: string
      catalogOfferingRevision: number
      offeringId: string
      bindingId: string
      sourceRevision: string
      sourceDigest: string
      lifecycle: PublicationLifecycle
    }>
  | Readonly<{
      kind: 'refused'
      reason: CapabilityPublicationAdmissionRefusal
    }>

export async function admitCapabilityPublicationCommand(
  input: AdmitCapabilityPublicationInput,
  ports: PublicationCommandPorts,
): Promise<AdmitCapabilityPublicationResult> {
  if (!validRegistrationContext(input)
    || !validCapabilityPublicationAuthority(input.actor, input.authorityMode)) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  if (!validCapabilityPublicationSourceRevision(input.source.sourceRevision)) {
    return { kind: 'refused', reason: 'source_revision_invalid' }
  }
  if (input.catalogOfferingRef.trim().length === 0
    || !Number.isSafeInteger(input.catalogOfferingRevision)
    || input.catalogOfferingRevision < 1) {
    return { kind: 'refused', reason: 'catalog_offering_invalid' }
  }

  const { sourceRevision, ...serializedSource } = input.source
  const importSource = decodeConvexPublicationSource(serializedSource)
  let normalized
  try {
    normalized = normalizeCapabilityPublication(importSource as CapabilityPublicationImport)
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (normalized.kind === 'refused') return normalized

  const origin = normalized.draft.offering.origin
  if (origin === undefined || origin.kind !== 'catalog_offering'
    || origin.offeringRef !== input.catalogOfferingRef
    || origin.offeringRevision !== input.catalogOfferingRevision) {
    return { kind: 'refused', reason: 'catalog_offering_invalid' }
  }

  let provenance
  try {
    provenance = defineCapabilityPublicationProvenance({
      actor: input.actor,
      authorityMode: input.authorityMode,
      sourceRevision,
      sourceDigest: normalized.draft.source.descriptorDigest,
    })
  } catch {
    return { kind: 'refused', reason: 'provenance_invalid' }
  }

  const published = await publishCapabilityCommand({
    businessId: input.businessId,
    source: importSource,
    offering: undefined,
    binding: undefined,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    reasonCode: input.reasonCode,
    evidenceRefs: input.evidenceRefs,
    actor: input.actor,
    now: input.now,
    publicationMetadata: provenance,
  }, ports)
  if (published.kind === 'refused') {
    return { kind: 'refused', reason: published.reason as CapabilityPublicationAdmissionRefusal }
  }
  const operationId = 'operationId' in published && typeof published.operationId === 'string'
    ? published.operationId
    : `${input.operationKey}:publishCapability`
  const kind = published.kind === 'replayed' ? 'replayed' as const : 'published' as const
  return {
    kind,
    operationId,
    operationName: 'publishCapability',
    publisherRef: provenance.publisherRef,
    provenanceDigest: provenance.provenanceDigest,
    publicationRef: published.publicationRef,
    publicationRevision: 1,
    contractRef: published.contractRef,
    catalogOfferingRef: input.catalogOfferingRef,
    catalogOfferingRevision: input.catalogOfferingRevision,
    offeringId: published.offeringId,
    bindingId: published.bindingId,
    sourceRevision,
    sourceDigest: normalized.draft.source.descriptorDigest,
    authorityMode: input.authorityMode,
    lifecycle: published.lifecycle,
  }
}
