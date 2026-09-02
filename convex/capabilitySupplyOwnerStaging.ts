import { v, type Infer } from 'convex/values'

import {
  isCanonicalCredentiallessX402ProviderConnection,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import {
  admitPublicationDraft,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  connectionAuthoritySnapshotFromProviderConnection,
  connectionAuthoritySnapshotsEqual,
  createPublicOperationRef,
  isX402PaymentRequirementForProfile,
  parsePinnedX402PaymentRequiredJson,
  parseX402FetchTransportConfiguration,
  publicationProjection,
  validPublicHttpsEndpoint,
  validX402SellerClaimTime,
  x402SellerClaimDigest,
  type X402SellerClaim,
  publishPreparedCapabilityCommand,
  registerCapabilityOffering,
  registerCapabilityTransportBinding,
  setCapabilitySupplyEligibility,
  validRegistrationContext,
  x402PaymentProfileForEnvironment,
  type PublishPreparedCapabilityCommandResult,
} from '@/modules/capability-supply/public'
import { pricingConfigSourceAmount } from '@/modules/money/public'
import {
  bindingIntegrityIsValid,
  offeringIntegrityIsValid,
  X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
} from '@/modules/capability-supply/convex'
import {
  normalizePricingConfig,
  pricingConfigDigest,
  rescaleExactAmount,
} from '@/modules/money/public'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import {
  preparedPublicationMaterialValue,
  preparedPublicationResultValue,
} from './capabilitySupplyPublish'
import { capabilitySupplyPublicationPorts } from './capabilitySupplyPublicationPorts'
import { capabilitySupplyWriterPorts } from './capabilitySupplyWriterPorts'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from './capabilitySupplyRowMappers'
import { contextFields } from './capabilitySupplyShared'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { toDomain as providerConnectionDomain } from './lib/providerConnections/codecs'

const sellerClaimValue = v.object({
  businessId: v.string(),
  endpointUrl: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  observationDigest: v.string(),
  payTo: v.string(),
  expiresAt: v.number(),
})

export const stageOwnerX402CapabilityArgs = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  revision: v.number(),
  sourceHash: v.string(),
  prepared: preparedPublicationMaterialValue,
  sellerClaim: sellerClaimValue,
  ...contextFields,
  ...sourceWriteArgs,
} as const

export const stageOwnerX402CapabilityReturns = preparedPublicationResultValue

type StageOwnerX402CapabilityResult = Infer<typeof preparedPublicationResultValue>

type StageOwnerX402CapabilityArgs = {
  businessId: Id<'businesses'>
  offeringRef: string
  revision: number
  sourceHash: string
  prepared: Infer<typeof preparedPublicationMaterialValue>
  sellerClaim: Infer<typeof sellerClaimValue>
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: string[]
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

function canonicalEndpoint(value: string): string | undefined {
  const endpoint = validPublicHttpsEndpoint(value)
  return endpoint === undefined || endpoint.hash !== ''
    ? undefined
    : endpoint.toString()
}

function boundedSellerClaim(value: Infer<typeof sellerClaimValue>): value is X402SellerClaim {
  return value.businessId.length > 0
    && value.businessId.length <= 200
    && value.endpointUrl.length > 0
    && value.endpointUrl.length <= 2_048
    && value.observationDigest.length === 71
    && /^sha256:[0-9a-f]{64}$/u.test(value.observationDigest)
    && value.payTo.length === 42
    && /^0x[0-9a-fA-F]{40}$/u.test(value.payTo)
}

function oneEvidenceRef(
  evidenceRefs: readonly string[],
  prefix: string,
): string | undefined {
  const matches = evidenceRefs.filter((ref) => ref.startsWith(prefix))
  return matches.length === 1 ? matches[0] : undefined
}

function exactCatalogOrigin(
  prepared: Infer<typeof preparedPublicationMaterialValue>,
  args: Pick<StageOwnerX402CapabilityArgs, 'offeringRef' | 'revision' | 'sourceHash'>,
) {
  const origin = prepared.offering.origin
  return origin?.kind === 'catalog_offering'
    && origin.offeringRef === args.offeringRef
    && origin.offeringRevision === args.revision
    && origin.offeringSourceHash === args.sourceHash
    && origin.declaredAccessPathRef !== undefined
    && origin.accessPathSourceHash !== undefined
    ? origin
    : undefined
}

function exactSandboxX402Material(
  prepared: Infer<typeof preparedPublicationMaterialValue>,
  claim: X402SellerClaim,
): boolean {
  if (
    prepared.sourceKind !== 'x402'
    || prepared.binding.adapter.adapterId !== 'x402-fetch:v2'
    || prepared.binding.authority.kind !== 'provider_connection'
  ) return false
  const endpoint = canonicalEndpoint(prepared.binding.endpointUrl)
  const claimEndpoint = canonicalEndpoint(claim.endpointUrl)
  const config = parseX402FetchTransportConfiguration(
    prepared.binding.adapter.config,
  )
  const profile = x402PaymentProfileForEnvironment('sandbox')
  if (
    endpoint === undefined
    || claimEndpoint !== endpoint
    || config === undefined
    || profile === undefined
    || config.method !== claim.method
    || config.scheme !== profile.scheme
    || config.network !== profile.network
    || config.asset.toLowerCase() !== profile.asset.toLowerCase()
    || config.payTo.toLowerCase() !== claim.payTo.toLowerCase()
  ) return false

  const paymentRequired = parsePinnedX402PaymentRequiredJson(
    config.paymentRequiredJson,
  )
  if (
    paymentRequired === undefined
    || paymentRequired.x402Version !== 2
    || canonicalEndpoint(paymentRequired.resource.url) !== endpoint
  ) return false
  const matching = paymentRequired.accepts.filter((candidate) => (
    isX402PaymentRequirementForProfile({
      ...candidate,
      extra: candidate.extra ?? {},
    }, profile)
    && candidate.scheme === config.scheme
    && candidate.network === config.network
    && candidate.asset.toLowerCase() === config.asset.toLowerCase()
    && candidate.payTo.toLowerCase() === config.payTo.toLowerCase()
  ))
  if (matching.length !== 1) return false

  let pricing: ReturnType<typeof normalizePricingConfig>
  try {
    pricing = normalizePricingConfig(JSON.parse(prepared.pricingConfigJson))
  } catch {
    return false
  }
  if (
    pricing.kind !== 'valid'
    || pricingConfigDigest(pricing.config) !== prepared.priceDigest
    || pricing.config.kind !== 'managed_x402'
    || pricing.config.sourceRequirement.network !== config.network
    || pricing.config.sourceRequirement.asset.toLowerCase() !== config.asset.toLowerCase()
  ) return false
  const atomicAmount = rescaleExactAmount(
    pricingConfigSourceAmount(pricing.config),
    config.assetAmountExponent,
  )
  return atomicAmount !== undefined && matching[0]?.amount === atomicAmount.units
}

function convexStagingResult(
  result: PublishPreparedCapabilityCommandResult,
): StageOwnerX402CapabilityResult {
  if (result.kind === 'refused') return result
  return {
    kind: result.kind,
    ...(result.operationId === undefined ? {} : { operationId: result.operationId }),
    publicationRef: result.publicationRef,
    publicationRevision: result.publicationRevision,
    operationRef: result.operationRef,
    contractRef: { ...result.contractRef },
    offeringId: result.offeringId,
    bindingId: result.bindingId,
    sourceKind: result.sourceKind,
    sourceSelector: result.sourceSelector,
    sourceRevision: result.sourceRevision,
    sourceDigest: result.sourceDigest,
    priceDigest: result.priceDigest,
    authorityMode: result.authorityMode,
    publisherRef: result.publisherRef,
    provenanceDigest: result.provenanceDigest,
    lifecycle: {
      state: result.lifecycle.state,
      reasons: [...result.lifecycle.reasons],
    },
  }
}

async function exactStagingConnection(
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

async function exactCatalogTarget(
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

function stagingPublicationPorts(
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
    registerBinding: (registration, now, expectedOperationRef) => (
      registerCapabilityTransportBinding(
        stagingWriter,
        registration,
        now,
        expectedOperationRef,
      )
    ),
    setEligibility: (eligibility, now) => (
      setCapabilitySupplyEligibility(stagingWriter, eligibility, now)
    ),
  })
}

async function reuseExactStagedPublication(
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
  const operationRef = createPublicOperationRef({
    operationId: capabilityOperationId(contractRef.capabilityId),
    publicationRef,
    publicationRevision: 1,
    contractRef,
  })
  const admissionFenceCount = publication.registrationEvidenceRefs.filter(
    (ref) => ref === X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
  ).length
  const sourceSelector = publication.sourceSelector
  const priceDigest = publication.priceDigest
  if (
    existingEvidenceOfferingHash !== offering.registrationHash
    || existingEvidenceBindingHash !== binding.registrationHash
    || admissionFenceCount !== 1
    || publication.businessId !== input.args.businessId
    || publication.runtimeEnvironment !== 'sandbox'
    || publication.disposition !== 'current'
    || publication.operationRef !== operationRef
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
    operationRef,
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
    operationRef,
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

/**
 * Owner-only admission of one Base Sepolia x402 staging Operation. The
 * The exact publication receives an Operation-scoped admission fence. Seller
 * business visibility therefore cannot expose this revision before its paid
 * canary is explicitly promoted.
 */
export async function stageOwnerX402CapabilityHandler(
  ctx: MutationCtx,
  args: StageOwnerX402CapabilityArgs,
): Promise<StageOwnerX402CapabilityResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  const actor = await resolveBusinessActor(ctx)
  const business = await ctx.db.get(args.businessId)
  if (
    actor.kind !== 'authenticated_owner'
    || business === null
    || business.owningAccountRef !== actor.canonicalAccountRef
    || (business.publicStatus !== 'unpublished' && business.publicStatus !== 'published')
    || business.suppressedAt !== undefined
    || !validRegistrationContext(args)
  ) return { kind: 'refused', reason: 'authorization_denied' }

  const now = Date.now()
  if (
    !boundedSellerClaim(args.sellerClaim)
    || args.sellerClaim.businessId !== String(args.businessId)
    || !validX402SellerClaimTime(args.sellerClaim.expiresAt, now)
    || !exactSandboxX402Material(args.prepared, args.sellerClaim)
  ) return { kind: 'refused', reason: 'payment_required_invalid' }
  if (!await exactCatalogTarget(ctx, args)) {
    return { kind: 'refused', reason: 'catalog_offering_origin_changed' }
  }
  const connection = await exactStagingConnection(ctx, {
    businessId: args.businessId,
    ownerId: actor.canonicalAccountRef,
    prepared: args.prepared,
    sellerClaim: args.sellerClaim,
    evidenceRefs: args.evidenceRefs,
    now,
  })
  if (connection === undefined) {
    return { kind: 'refused', reason: 'connection_authority_stale' }
  }

  const replayed = await reuseExactStagedPublication(ctx, {
    args,
    ownerPrincipalRef: actor.canonicalPrincipalRef,
    connection,
    now,
  })
  if (replayed !== undefined) return replayed

  const result = await publishPreparedCapabilityCommand({
    businessId: String(args.businessId),
    runtimeEnvironment: 'sandbox',
    prepared: args.prepared,
    actor: { kind: 'owner', ref: actor.canonicalPrincipalRef },
    origin: args.prepared.offering.origin,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    reasonCode: args.reasonCode,
    evidenceRefs: [
      ...args.evidenceRefs,
      X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
    ],
    now,
  }, stagingPublicationPorts(ctx, args.businessId))
  return convexStagingResult(result)
}
