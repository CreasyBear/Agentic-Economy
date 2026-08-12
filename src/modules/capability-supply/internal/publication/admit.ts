import {
  normalizeCapabilityPublication,
  type CapabilityPublicationImport,
  type CapabilityPublicationImportRefusal,
  type CapabilityPublicationImportResult,
} from '../publication-importers'
import { preparePublicationDraft, pricingConfigForOffering, type AdmitPublicationDraftRefusal } from './draft'
import {
  publishPreparedCapabilityCommand,
  type PublishPreparedCapabilityRefusal,
} from './publish'
import type { PublicationCommandPorts } from './ports'
import type { PublicationLifecycle } from './lifecycle'
import {
  defineCapabilityPublicationProvenance,
  validCapabilityPublicationAuthority,
  validCapabilityPublicationSourceRevision,
  type CapabilityPublicationAuthorityMode,
} from './provenance'
import {
  validRegistrationContext,
  type RegistrationContext,
  type SupplyCommandActor,
} from '../shared/command-envelope'
import { dereferenceLocalSchema } from '../schema-deref-shared'

export type CapabilityPublicationAdmissionSource = CapabilityPublicationImport & Readonly<{
  sourceRevision: string
}>

export type AdmitCapabilityPublicationInput = RegistrationContext & Readonly<{
  businessId: string
  catalogOfferingRef: string
  catalogOfferingRevision: number
  runtimeEnvironment: 'sandbox' | 'production'
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
  | AdmitPublicationDraftRefusal
  | 'catalog_offering_origin_changed'
  | 'contract_identity_conflict'
  | 'contract_integrity_failure'
  | 'offering_identity_conflict'
  | 'offering_integrity_failure'
  | 'binding_identity_conflict'
  | 'binding_integrity_failure'
  | 'operation_key_conflict'

export type AdmitCapabilityPublicationResult =
  | Readonly<{
      kind: 'published' | 'replayed'
      operationId?: string
      operationName: 'publishCapability'
      publisherRef: string
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
      authorityMode: CapabilityPublicationAuthorityMode
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
  if (!validRegistrationContext(input)) {
    return { kind: 'refused', reason: 'registration_context_invalid' }
  }
  if (!validCapabilityPublicationAuthority(input.actor, input.authorityMode)) {
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

  let normalized: CapabilityPublicationImportResult
  try {
    normalized = await normalizeCapabilityPublication(input.source, dereferenceLocalSchema)
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (normalized.kind === 'refused') return { kind: 'refused', reason: normalized.reason }

  const origin = normalized.draft.offering.origin
  if (origin === undefined
    || origin.kind !== 'catalog_offering'
    || origin.offeringRef !== input.catalogOfferingRef
    || origin.offeringRevision !== input.catalogOfferingRevision
    || origin.offeringSourceHash.trim().length === 0) {
    return { kind: 'refused', reason: 'catalog_offering_invalid' }
  }
  const pricingConfig = pricingConfigForOffering(normalized.draft.offering)
  if (pricingConfig === undefined) return { kind: 'refused', reason: 'price_unavailable' }

  const prepared = await preparePublicationDraft({
    source: input.source,
    sourceRevision: input.source.sourceRevision,
    pricingConfig,
    evidenceRefs: input.evidenceRefs,
    derefSchema: dereferenceLocalSchema,
  }).catch(() => undefined)
  if (prepared === undefined) return { kind: 'refused', reason: 'source_invalid' }
  if (prepared.kind === 'refused') return { kind: 'refused', reason: prepared.reason }

  const preparedOrigin = prepared.draft.offering.origin
  if (preparedOrigin === undefined
    || preparedOrigin.kind !== 'catalog_offering'
    || preparedOrigin.offeringRef !== input.catalogOfferingRef
    || preparedOrigin.offeringRevision !== input.catalogOfferingRevision
    || preparedOrigin.offeringSourceHash.trim().length === 0) {
    return { kind: 'refused', reason: 'catalog_offering_invalid' }
  }

  let provenance
  try {
    provenance = defineCapabilityPublicationProvenance({
      actor: input.actor,
      authorityMode: input.authorityMode,
      sourceRevision: input.source.sourceRevision,
      sourceDigest: prepared.prepared.sourceDigest,
    })
  } catch {
    return { kind: 'refused', reason: 'provenance_invalid' }
  }

  const published = await publishPreparedCapabilityCommand({
    businessId: input.businessId,
    runtimeEnvironment: input.runtimeEnvironment,
    prepared: prepared.prepared,
    origin: preparedOrigin,
    publicationMetadata: provenance,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    reasonCode: input.reasonCode,
    evidenceRefs: input.evidenceRefs,
    actor: input.actor,
    now: input.now,
  }, ports)
  if (published.kind === 'refused') {
    return { kind: 'refused', reason: mapPublishRefusal(published.reason) }
  }
  return {
    kind: published.kind,
    ...(published.operationId === undefined ? {} : { operationId: published.operationId }),
    operationName: 'publishCapability',
    publisherRef: published.publisherRef,
    provenanceDigest: published.provenanceDigest,
    publicationRef: published.publicationRef,
    publicationRevision: published.publicationRevision,
    contractRef: published.contractRef,
    catalogOfferingRef: input.catalogOfferingRef,
    catalogOfferingRevision: input.catalogOfferingRevision,
    offeringId: published.offeringId,
    bindingId: published.bindingId,
    sourceRevision: published.sourceRevision,
    sourceDigest: published.sourceDigest,
    authorityMode: published.authorityMode,
    lifecycle: published.lifecycle,
  }
}


function mapPublishRefusal(reason: PublishPreparedCapabilityRefusal): CapabilityPublicationAdmissionRefusal {
  switch (reason) {
    case 'registration_changed':
    case 'connection_authority_stale':
      return 'source_invalid'
    default:
      return reason
  }
}
