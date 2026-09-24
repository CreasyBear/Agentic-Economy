import { type Infer } from 'convex/values'

import {
  isCanonicalCredentiallessX402ProviderConnection,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import {
  admitPublicationDraft,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityToolId,
  connectionAuthoritySnapshotFromProviderConnection,
  connectionAuthoritySnapshotsEqual,
  createPublicToolRef,
  publicationProjection,
  registerCapabilityOffering,
  registerCapabilityTransportBinding,
  setCapabilitySupplyEligibility,
  x402SellerClaimDigest,
  type X402SellerClaim,
} from '@/modules/capability-supply/public'
import {
  bindingIntegrityIsValid,
  offeringIntegrityIsValid,
  X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
} from '@/modules/capability-supply/convex'

import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { capabilitySupplyPublicationPorts } from './publicationPorts/ports'
import { capabilitySupplyWriterPorts } from '../../capabilitySupplyWriterPorts'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from '../../capabilitySupplyRowMappers'
import { preparedPublicationMaterialValue } from '../../capabilitySupplyPublish'
import { toDomain as providerConnectionDomain } from '../providerConnections/codecs'
import {
  canonicalEndpoint,
  exactCatalogOrigin,
  exactOwnerX402Environment,
  oneEvidenceRef,
} from './ownerStagingNormalize'
import type {
  StageOwnerX402CapabilityArgs,
  StageOwnerX402CapabilityResult,
} from './ownerStagingValues'

export async function exactStagingConnection(
  ctx: MutationCtx,
  input: Readonly<{
    businessId: Id<'businesses'>
    ownerId: string
    prepared: Infer<typeof preparedPublicationMaterialValue>
    sellerClaim: X402SellerClaim
    evidenceRefs: readonly string[]
    now: number
  }>,
): Promise<Doc<'capabilityProviderConnections'> | undefined> {
  const authority = input.prepared.binding.authority
  if (authority.kind !== 'provider_connection') return undefined
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => (
      query.eq('connectionRef', authority.connectionRef)
    ))
    .unique()
  if (connection === null) return undefined
  const claimDigest = x402SellerClaimDigest(input.sellerClaim)
  const claimEvidence = `x402-payee-claim:${claimDigest}`
  const inspectionEvidence = `x402-endpoint-inspection:${input.sellerClaim.observationDigest}`
  const canonicalConnection: ProviderConnection = {
    ...connection,
    businessId: String(connection.businessId),
  }
  const endpoint = canonicalEndpoint(input.prepared.binding.endpointUrl)
  return endpoint !== undefined
    && connection.lifecycle === 'active'
    && (connection.expiresAt === undefined || connection.expiresAt > input.now)
    && String(connection.businessId) === String(input.businessId)
    && connection.owningAccountRef === input.ownerId
    && connection.providerRef === authority.providerRef
    && isCanonicalCredentiallessX402ProviderConnection(canonicalConnection)
    && connection.grantedResources.length === 1
    && connection.grantedResources[0] === endpoint
    && oneEvidenceRef(connection.evidenceRefs, 'x402-payee-claim:') === claimEvidence
    && oneEvidenceRef(connection.evidenceRefs, 'x402-endpoint-inspection:') === inspectionEvidence
    && oneEvidenceRef(input.evidenceRefs, 'x402-payee-claim:') === claimEvidence
    && oneEvidenceRef(input.evidenceRefs, 'x402-endpoint-inspection:') === inspectionEvidence
    ? connection
    : undefined
}

export async function exactCatalogTarget(
  ctx: MutationCtx,
  args: StageOwnerX402CapabilityArgs,
): Promise<boolean> {
  const origin = exactCatalogOrigin(args.prepared, args)
  if (origin === undefined) return false
  const accessPathRef = origin.declaredAccessPathRef
  if (accessPathRef === undefined) return false
  const [offering, revision, path] = await Promise.all([
    ctx.db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', args.offeringRef))
      .unique(),
    ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', args.offeringRef).eq('revision', args.revision)
      ))
      .unique(),
    ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => (
        query.eq('accessPathRef', accessPathRef)
      ))
      .unique(),
  ])
  return offering !== null
    && revision !== null
    && path !== null
    && offering.businessId === args.businessId
    && offering.status === 'published'
    && offering.currentRevision === args.revision
    && revision.businessId === args.businessId
    && revision.sourceHash === args.sourceHash
    && path.businessId === args.businessId
    && path.offeringRef === args.offeringRef
    && path.offeringRevision === args.revision
    && path.offeringSourceHash === args.sourceHash
    && path.status === 'published'
    && path.sourceHash === origin.accessPathSourceHash
    && path.descriptor.kind === 'external_operation'
    && canonicalEndpoint(path.descriptor.url) === canonicalEndpoint(args.prepared.binding.endpointUrl)
    && path.descriptor.method?.trim().toUpperCase() === args.sellerClaim.method
}

export function stagingPublicationPorts(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
) {
  const writer = capabilitySupplyWriterPorts(ctx.db)
  const stagingWriter = {
    ...writer,
    loadPublishedBusiness: async (candidateBusinessId: string) => {
      if (candidateBusinessId !== String(businessId)) return null
      const business = await ctx.db.get(businessId)
      return business !== null
        && (business.publicStatus === 'unpublished' || business.publicStatus === 'published')
        && business.suppressedAt === undefined
        ? { businessId: String(business._id) }
        : null
    },
  }
  return capabilitySupplyPublicationPorts(ctx, {
    registerOffering: (registration, now) => (
      registerCapabilityOffering(stagingWriter, registration, now)
    ),
    registerBinding: (registration, now, expectedToolRef) => (
      registerCapabilityTransportBinding(
        stagingWriter,
        registration,
        now,
        expectedToolRef,
      )
    ),
    setEligibility: (eligibility, now) => (
      setCapabilitySupplyEligibility(stagingWriter, eligibility, now)
    ),
  })
}

export async function reuseExactStagedPublication(
  ctx: MutationCtx,
  input: Readonly<{
    args: StageOwnerX402CapabilityArgs
    ownerPrincipalRef: string
    connection: Doc<'capabilityProviderConnections'>
    now: number
  }>,
): Promise<StageOwnerX402CapabilityResult | undefined> {
  const admitted = await admitPublicationDraft({
    prepared: input.args.prepared,
    businessId: String(input.args.businessId),
    origin: input.args.prepared.offering.origin,
  })
  if (admitted.kind === 'refused') return undefined

  const publicationRef = admitted.offering.offeringId
  const [offeringDoc, bindingDoc, publication] = await Promise.all([
    ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', admitted.offering.offeringId))
      .unique(),
    ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', admitted.binding.bindingId))
      .unique(),
    ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', publicationRef).eq('revision', 1)
      ))
      .unique(),
  ])
  if (offeringDoc === null || bindingDoc === null || publication === null) return undefined

  const offering = toCapabilityOfferingRow(offeringDoc)
  const binding = toCapabilityBindingRow(bindingDoc)
  if (!offeringIntegrityIsValid(offering) || !bindingIntegrityIsValid(binding)) return undefined

  // Registration evidence is durable provenance, not executable identity. A
  // repeat inspection may replace an expiring seller claim with a Bazaar
  // contract reference. Reuse is allowed only when substituting the persisted
  // evidence makes every other offering and binding registration byte-exact.
  const existingEvidenceOfferingHash = capabilityOfferingRegistrationHash({
    ...admitted.offering,
    registrationEvidenceRefs: [...offering.registrationEvidenceRefs],
  })
  const existingEvidenceBindingHash = capabilityBindingRegistrationHash({
    ...admitted.binding,
    continuation: {
      ...admitted.binding.continuation,
      evidenceRefs: binding.continuation.evidenceRefs,
    },
    cancellation: {
      ...admitted.binding.cancellation,
      evidenceRefs: binding.cancellation.evidenceRefs,
    },
    registrationEvidenceRefs: [...binding.registrationEvidenceRefs],
  }, admitted.admittedTransport.transport)
  const contractRef = admitted.encoded.contract.ref
  const toolRef = createPublicToolRef({
    operationId: capabilityToolId(contractRef.capabilityId),
    publicationRef,
    publicationRevision: 1,
    contractRef,
  })
  const admissionFenceCount = publication.registrationEvidenceRefs.filter(
    (ref) => ref === X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
  ).length
  const sourceSelector = publication.sourceSelector
  const priceDigest = publication.priceDigest
  const runtimeEnvironment = exactOwnerX402Environment(input.args.prepared, input.args.sellerClaim)
  if (
    existingEvidenceOfferingHash !== offering.registrationHash
    || existingEvidenceBindingHash !== binding.registrationHash
    || admissionFenceCount !== 1
    || publication.businessId !== input.args.businessId
    || runtimeEnvironment === undefined
    || publication.runtimeEnvironment !== runtimeEnvironment
    || publication.disposition !== 'current'
    || publication.toolRef !== toolRef
    || publication.offeringId !== offering.offeringId
    || publication.bindingId !== binding.bindingId
    || publication.capabilityId !== contractRef.capabilityId
    || publication.version !== contractRef.version
    || publication.contractDigest !== contractRef.contractDigest
    || publication.sourceKind !== input.args.prepared.sourceKind
    || sourceSelector === undefined
    || publication.sourceDigest !== input.args.prepared.sourceDigest
    || publication.sourceDescriptorJson !== input.args.prepared.sourceDescriptorJson
    || priceDigest === undefined
    || priceDigest !== input.args.prepared.priceDigest
    || publication.pricingConfigJson !== input.args.prepared.pricingConfigJson
    || publication.publisherRef !== input.ownerPrincipalRef
    || publication.authorityMode !== 'provider_owned'
    || binding.authority.kind !== 'provider_connection'
    || binding.authority.connectionRef !== input.connection.connectionRef
    || binding.authority.providerRef !== input.connection.providerRef
    || publication.connectionAuthority === undefined
    || !connectionAuthoritySnapshotsEqual(publication.connectionAuthority, binding.connectionAuthority)
  ) return undefined

  const nextAuthority = connectionAuthoritySnapshotFromProviderConnection(
    providerConnectionDomain(input.connection),
    toolRef,
  )
  await ctx.db.patch(bindingDoc._id, {
    connectionAuthority: {
      ...nextAuthority,
      grantedScopes: [...nextAuthority.grantedScopes],
      grantedResources: [...nextAuthority.grantedResources],
    },
    updatedAt: input.now,
  })
  await ctx.db.patch(publication._id, {
    connectionAuthority: {
      ...nextAuthority,
      grantedScopes: [...nextAuthority.grantedScopes],
      grantedResources: [...nextAuthority.grantedResources],
    },
    credentialState: 'unobserved',
    healthState: 'unobserved',
    readinessTargetDigest: undefined,
    readinessRequestDigest: undefined,
    readinessResponseStatus: undefined,
    readinessResponseContentType: undefined,
    readinessResponseDigest: undefined,
    readinessOutcome: undefined,
    readinessObservedAt: undefined,
    readinessValidUntil: undefined,
    readinessEvidenceRefs: [],
    updatedAt: input.now,
  })
  await stagingPublicationPorts(ctx, input.args.businessId).scheduleReadinessProbe(publicationRef, 1)
  const projection = publicationProjection(contractRef, offering.offeringId, binding.bindingId)
  return {
    ...projection,
    kind: 'replayed',
    publicationRef,
    publicationRevision: 1,
    toolRef,
    contractRef,
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    sourceKind: publication.sourceKind,
    sourceSelector,
    sourceRevision: publication.sourceRevision,
    sourceDigest: publication.sourceDigest,
    priceDigest,
    authorityMode: publication.authorityMode,
    publisherRef: publication.publisherRef,
    provenanceDigest: publication.provenanceDigest,
    lifecycle: {
      state: projection.lifecycle.state,
      reasons: [...projection.lifecycle.reasons],
    },
  }
}
