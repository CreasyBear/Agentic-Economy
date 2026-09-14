import { v, type Infer } from 'convex/values'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  isCanonicalCredentiallessX402ProviderConnection,
  providerConnectionAuthorityProvenanceIsValid,
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
  type CapabilityOfferingOrigin,
  type PublishPreparedCapabilityCommandResult,
} from '@/modules/capability-supply/public'
import { changeOfferingStatusInState, upsertAccessPathInState } from '@/modules/catalog/public'
import { normalizeSupplyIntegrationDraft } from '@/modules/capability-supply/integration-draft'
import { canonicalDigest } from '@/modules/common/canonical-digest'
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
  publishPreparedCapabilityHandler,
  recordSupplyAdmissionCase,
  preparedPublicationResultValue,
} from './capabilitySupplyPublish'
import { capabilitySupplyPublicationPorts } from './capabilitySupplyPublicationPorts'
import { capabilitySupplyWriterPorts } from './capabilitySupplyWriterPorts'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from './capabilitySupplyRowMappers'
import {
  contextFields,
  rebuildCapabilityOriginSupplyProjection,
} from './capabilitySupplyShared'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { toDomain as providerConnectionDomain } from './lib/providerConnections/codecs'
import { agentAccessPrincipalValue, verifySupplyAgentPrincipal } from './agentAccessPrincipals'
import { admitAgentPublicationConsequence } from './lib/agentPublicationConsequence'
import { admitInteractiveOwnerConsequence } from './lib/ownerConsequence'
import { clerkConsequenceProofValue } from './lib/consequenceProof'
import { providerRouteabilityIsFrozen } from './lib/providerOffboardingFreeze'
import {
  loadExactOfferingSourceState,
  persistOfferingSourceState,
} from './catalogOfferingMutations'

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

type PublishPreparedCapabilityArgs = {
  businessId: Id<'businesses'>
  offeringRef: string
  revision: number
  sourceHash: string
  runtimeEnvironment: 'sandbox' | 'production'
  prepared: Infer<typeof preparedPublicationMaterialValue>
  proof?: Infer<typeof clerkConsequenceProofValue>
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: string[]
  agentPrincipal?: Infer<typeof agentAccessPrincipalValue>
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}
type CatalogOrigin = Extract<CapabilityOfferingOrigin, { kind: 'catalog_offering' }>
type ConnectedCatalogTarget = Readonly<{
  origin: CatalogOrigin
  state: Awaited<ReturnType<typeof loadExactOfferingSourceState>>
  path: Doc<'offeringAccessPaths'>
}>

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
  return exactSandboxX402PaymentMaterial(prepared, {
    endpointUrl: claim.endpointUrl,
    method: claim.method,
    payTo: claim.payTo,
  })
}

function exactSandboxX402PaymentMaterial(
  prepared: Infer<typeof preparedPublicationMaterialValue>,
  expected: Readonly<{
    endpointUrl: string
    method: 'GET' | 'POST'
    payTo: string
  }>,
): boolean {
  if (
    prepared.sourceKind !== 'x402'
    || prepared.binding.adapter.adapterId !== 'x402-fetch:v2'
    || prepared.binding.authority.kind !== 'provider_connection'
  ) return false
  const endpoint = canonicalEndpoint(prepared.binding.endpointUrl)
  const expectedEndpoint = canonicalEndpoint(expected.endpointUrl)
  const config = parseX402FetchTransportConfiguration(
    prepared.binding.adapter.config,
  )
  const profile = x402PaymentProfileForEnvironment('sandbox')
  if (
    endpoint === undefined
    || expectedEndpoint !== endpoint
    || config === undefined
    || profile === undefined
    || config.method !== expected.method
    || config.scheme !== profile.scheme
    || config.network !== profile.network
    || config.asset.toLowerCase() !== profile.asset.toLowerCase()
    || config.payTo.toLowerCase() !== expected.payTo.toLowerCase()
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
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'exactSandboxX402Material', reason: 'invalid_response' })
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
    toolRef: result.toolRef,
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

function connectedCatalogOrigin(
  args: PublishPreparedCapabilityArgs,
): CatalogOrigin | undefined {
  const origin = args.prepared.offering.origin
  return origin?.kind === 'catalog_offering'
    && origin.offeringRef === args.offeringRef
    && origin.offeringRevision === args.revision
    && origin.offeringSourceHash === args.sourceHash
    && origin.declaredAccessPathRef !== undefined
    && origin.accessPathSourceHash !== undefined
    ? origin
    : undefined
}

async function exactConnectedCatalogTarget(
  ctx: MutationCtx,
  args: PublishPreparedCapabilityArgs,
): Promise<ConnectedCatalogTarget | undefined> {
  const origin = connectedCatalogOrigin(args)
  if (origin === undefined || args.prepared.binding.authority.kind !== 'provider_connection') {
    return undefined
  }
  const accessPathRef = origin.declaredAccessPathRef
  if (accessPathRef === undefined) return undefined

  let state: Awaited<ReturnType<typeof loadExactOfferingSourceState>>
  let path: Doc<'offeringAccessPaths'> | null
  try {
    ;[state, path] = await Promise.all([
      loadExactOfferingSourceState(ctx.db, args.businessId, { offeringRef: origin.offeringRef }),
      ctx.db.query('offeringAccessPaths')
        .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', accessPathRef))
        .unique(),
    ])
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'exactConnectedCatalogTarget',
      reason: 'invalid_response',
    })
  }

  const offering = state.offerings.find((item) => item.offeringRef === origin.offeringRef)
  const revision = state.revisions.find((item) => (
    item.offeringRef === origin.offeringRef
      && item.revision === origin.offeringRevision
  ))
  const endpoint = canonicalEndpoint(args.prepared.binding.endpointUrl)
  const selector = args.prepared.sourceSelector
  const configuration = parseX402FetchTransportConfiguration(args.prepared.binding.adapter.config)
  if (
    offering === undefined
    || revision === undefined
    || path === null
    || endpoint === undefined
    || configuration === undefined
    || offering.businessId !== String(args.businessId)
    || offering.status !== 'draft' && offering.status !== 'published'
    || offering.currentRevision !== origin.offeringRevision
    || revision.businessId !== String(args.businessId)
    || revision.sourceHash !== origin.offeringSourceHash
    || path.businessId !== args.businessId
    || path.offeringRef !== origin.offeringRef
    || path.offeringRevision !== origin.offeringRevision
    || path.offeringSourceHash !== origin.offeringSourceHash
    || path.status !== 'draft' && path.status !== 'published'
    || path.sourceHash !== origin.accessPathSourceHash
    || path.descriptor.kind !== 'external_operation'
    || canonicalEndpoint(path.descriptor.url) !== endpoint
    || path.descriptor.method?.trim().toUpperCase() !== configuration.method
    || !('resourceUrl' in selector)
    || canonicalEndpoint(selector.resourceUrl) !== endpoint
  ) return undefined

  const draft = path.integrationDraft
  if (draft === undefined) return undefined
  const normalized = normalizeSupplyIntegrationDraft(draft)
  if (
    normalized.kind !== 'valid'
    || normalized.source.kind !== 'x402'
    || normalized.source.environment !== 'sandbox'
    || normalized.targetUrl !== endpoint
    || normalized.method !== configuration.method
    || normalized.draft.sourceRevision !== args.prepared.sourceRevision
    || normalized.draft.connectionRef !== args.prepared.binding.authority.connectionRef
    || normalized.draft.sourceDigest.length === 0
    || normalized.draft.candidateRef.length === 0
    || args.evidenceRefs.filter((ref) => ref === normalized.draft.sourceDigest).length !== 1
    || args.evidenceRefs.filter((ref) => ref === normalized.draft.candidateRef).length !== 1
    || args.evidenceRefs.some((ref) => (
      ref.startsWith('x402-payee-claim:') || ref.startsWith('x402-endpoint-inspection:')
    ))
  ) return undefined

  return { origin, state, path }
}

function exactConnectedSandboxX402Material(
  prepared: Infer<typeof preparedPublicationMaterialValue>,
  connection: ProviderConnection,
): boolean {
  const endpoint = connection.grantedResources.length === 1
    ? connection.grantedResources[0]
    : undefined
  return connection.x402Method !== undefined
    && connection.x402Payee !== undefined
    && connection.x402Payee.length === 42
    && /^0x[0-9a-fA-F]{40}$/u.test(connection.x402Payee)
    && endpoint !== undefined
    && exactSandboxX402PaymentMaterial(prepared, {
      endpointUrl: endpoint,
      method: connection.x402Method,
      payTo: connection.x402Payee,
    })
}

function exactConnectionEvidence(
  connection: ProviderConnection,
  target: ConnectedCatalogTarget,
  evidenceRefs: readonly string[],
): Readonly<{ claimRef: string; inspectionRef: string }> | undefined {
  const draft = target.path.integrationDraft
  if (draft === undefined) return undefined
  const claimRef = oneEvidenceRef(connection.evidenceRefs, 'x402-payee-claim:')
  const inspectionRef = oneEvidenceRef(connection.evidenceRefs, 'x402-endpoint-inspection:')
  if (
    claimRef === undefined
    || inspectionRef === undefined
    || !/^x402-payee-claim:sha256:[0-9a-f]{64}$/u.test(claimRef)
    || inspectionRef !== `x402-endpoint-inspection:${draft.sourceDigest}`
    || evidenceRefs.filter((ref) => ref === draft.sourceDigest).length !== 1
    || evidenceRefs.filter((ref) => ref === draft.candidateRef).length !== 1
  ) return undefined
  return { claimRef, inspectionRef }
}

async function exactConnectedStagingConnection(
  ctx: MutationCtx,
  input: Readonly<{
    businessId: Id<'businesses'>
    ownerId: string
    prepared: Infer<typeof preparedPublicationMaterialValue>
    target: ConnectedCatalogTarget
    evidenceRefs: readonly string[]
    now: number
  }>,
): Promise<Readonly<{
  connection: Doc<'capabilityProviderConnections'>
  evidence: Readonly<{ claimRef: string; inspectionRef: string }>
}> | undefined> {
  const authority = input.prepared.binding.authority
  if (authority.kind !== 'provider_connection') return undefined
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', authority.connectionRef))
    .unique()
  if (connection === null) return undefined
  const canonicalConnection: ProviderConnection = {
    ...connection,
    businessId: String(connection.businessId),
  }
  const endpoint = canonicalEndpoint(input.prepared.binding.endpointUrl)
  if (
    endpoint === undefined
    || connection.lifecycle !== 'active'
    || (connection.expiresAt !== undefined && connection.expiresAt <= input.now)
    || String(connection.businessId) !== String(input.businessId)
    || connection.owningAccountRef !== input.ownerId
    || connection.providerRef !== authority.providerRef
    || !isCanonicalCredentiallessX402ProviderConnection(canonicalConnection)
    || !providerConnectionAuthorityProvenanceIsValid(canonicalConnection)
    || connection.providerAccountRef !== `x402:${endpoint}`
    || connection.grantedResources.length !== 1
    || connection.grantedResources[0] !== endpoint
    || !exactConnectedSandboxX402Material(input.prepared, canonicalConnection)
  ) return undefined
  const evidence = exactConnectionEvidence(canonicalConnection, input.target, input.evidenceRefs)
  return evidence === undefined ? undefined : { connection, evidence }
}

function effectiveStagingEvidenceRefs(
  sourceEvidenceRefs: readonly string[],
  connectionEvidenceRefs: readonly string[],
): string[] {
  return [...new Set([
    ...sourceEvidenceRefs,
    ...connectionEvidenceRefs,
  ])].filter((ref) => !ref.startsWith('x402-seller-canary-admission:'))
}

async function currentOwnerPrincipalRef(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
): Promise<string | undefined> {
  const business = await ctx.db.get(businessId)
  if (business === null) return undefined
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', business.owningAccountRef))
    .unique()
  if (account === null || account.lifecycle !== 'active') return undefined
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (
    ownership === null
    || ownership.lifecycle !== 'active'
    || ownership.accountRef !== account.accountRef
  ) return undefined
  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', ownership.ownerPrincipalRef))
    .unique()
  return principal !== null
    && principal.kind === 'human'
    && principal.lifecycle === 'active'
    ? principal.principalRef
    : undefined
}

async function activateConnectedCatalogDraft(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  origin: CatalogOrigin,
  ownerPrincipalRef: string,
  operationKey: string,
  now: number,
): Promise<void> {
  const state = await loadExactOfferingSourceState(ctx.db, businessId, {
    offeringRef: origin.offeringRef,
  })
  const offering = state.offerings.find((item) => item.offeringRef === origin.offeringRef)
  const path = state.accessPaths.find((item) => item.accessPathRef === origin.declaredAccessPathRef)
  if (
    offering === undefined
    || path === undefined
    || offering.currentRevision !== origin.offeringRevision
    || offering.status === 'retired'
    || path.offeringRef !== origin.offeringRef
    || path.offeringRevision !== origin.offeringRevision
    || path.offeringSourceHash !== origin.offeringSourceHash
    || path.sourceHash !== origin.accessPathSourceHash
  ) throw new Error('connected_staging_catalog_origin_changed')

  const authority = {
    actorRef: ownerPrincipalRef,
    ownerRef: ownerPrincipalRef,
    businessOwnerRef: ownerPrincipalRef,
  }
  let next = state
  if (offering.status !== 'published') {
    const published = changeOfferingStatusInState(next, {
      authority,
      operationKey: `${operationKey}:catalog-offering`,
      offeringRef: offering.offeringRef,
      expectedRevision: origin.offeringRevision,
      status: 'published',
      now,
    })
    if (published.kind === 'error') {
      throw new Error(`connected_staging_catalog_offering:${published.code}`)
    }
    next = published.state
  }
  if (path.status !== 'published') {
    const activated = upsertAccessPathInState(next, {
      authority,
      operationKey: `${operationKey}:catalog-path`,
      offeringRef: offering.offeringRef,
      accessPathRef: path.accessPathRef,
      expectedRevision: origin.offeringRevision,
      status: 'published',
      descriptor: path.descriptor,
      now,
    })
    if (activated.kind === 'error') {
      throw new Error(`connected_staging_catalog_path:${activated.code}`)
    }
    const activatedPath = activated.state.accessPaths.find((item) => item.accessPathRef === path.accessPathRef)
    if (activatedPath?.sourceHash !== origin.accessPathSourceHash) {
      throw new Error('connected_staging_catalog_material_changed')
    }
    next = activated.state
  }
  if (next !== state) {
    const persisted = await persistOfferingSourceState(ctx.db, businessId, state, next, 'owner')
    if (persisted.kind === 'error') {
      throw new Error(`connected_staging_catalog_save:${persisted.code}`)
    }

  }
}

function catalogOriginsEqual(left: CatalogOrigin, right: CatalogOrigin): boolean {
  return left.offeringRef === right.offeringRef
    && left.offeringRevision === right.offeringRevision
    && left.offeringSourceHash === right.offeringSourceHash
    && left.declaredAccessPathRef === right.declaredAccessPathRef
    && left.accessPathSourceHash === right.accessPathSourceHash
}

function stagingPublicationPorts(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  allowDraftCatalogOrigin?: (
    origin: CatalogOrigin,
    candidateBusinessId: string,
  ) => Promise<boolean>,
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
  const ports = capabilitySupplyPublicationPorts(ctx, {
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
  if (allowDraftCatalogOrigin === undefined) return ports
  return {
    ...ports,
    catalogOriginIsCurrent: async (origin: CatalogOrigin, candidateBusinessId: string) => (
      (await ports.catalogOriginIsCurrent?.(origin, candidateBusinessId) ?? false)
      || await allowDraftCatalogOrigin(origin, candidateBusinessId)
    ),
  }
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
  if (
    existingEvidenceOfferingHash !== offering.registrationHash
    || existingEvidenceBindingHash !== binding.registrationHash
    || admissionFenceCount !== 1
    || publication.businessId !== input.args.businessId
    || publication.runtimeEnvironment !== 'sandbox'
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

/**
 * Owner-only admission of one Base Sepolia x402 staging Tool. The
 * The exact publication receives a Tool-scoped admission fence. Seller
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
      ...effectiveStagingEvidenceRefs(args.evidenceRefs, []),
      X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
    ],
    now,
  }, stagingPublicationPorts(ctx, args.businessId))
  return convexStagingResult(result)
}

async function privateSandboxX402Business(
  ctx: MutationCtx,
  args: PublishPreparedCapabilityArgs,
): Promise<Doc<'businesses'> | null> {
  if (args.runtimeEnvironment !== 'sandbox' || args.prepared.sourceKind !== 'x402') return null
  const business = await ctx.db.get(args.businessId)
  if (business === null
    || business.publicStatus !== 'unpublished'
    || business.suppressedAt !== undefined
    || business.businessContext?.kind !== 'programmable_provider') return null
  const origin = connectedCatalogOrigin(args)
  if (origin === undefined || origin.declaredAccessPathRef === undefined) return null
  const path = await ctx.db.query('offeringAccessPaths')
    .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', origin.declaredAccessPathRef!))
    .unique()
  return path?.integrationDraft?.sourceKind === 'x402'
    ? business
    : null
}

/**
 * Registered publish entry point for a private Provider's connected sandbox
 * x402 Tool. Every other publication keeps the generic handler and contract.
 */
export async function publishPreparedCapabilityWithOwnerStagingHandler(
  ctx: MutationCtx,
  args: PublishPreparedCapabilityArgs,
): Promise<Infer<typeof preparedPublicationResultValue>> {
  const business = await privateSandboxX402Business(ctx, args)
  if (business === null) return publishPreparedCapabilityHandler(ctx, args)

  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected' || !validRegistrationContext(args)) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  const now = Date.now()
  if (args.prepared.sourceAuthorityState !== 'verified') {
    return { kind: 'refused', reason: 'authorization_denied' }
  }

  const agentAdmission = args.agentPrincipal === undefined
    ? undefined
    : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
  const ownerActor = args.agentPrincipal === undefined
    ? await resolveBusinessActor(ctx)
    : undefined
  const ownerPrincipalRef = await currentOwnerPrincipalRef(ctx, args.businessId)
  const ownerAuthorized = ownerActor?.kind === 'authenticated_owner'
    && business.owningAccountRef === ownerActor.canonicalAccountRef
    && ownerPrincipalRef === ownerActor.canonicalPrincipalRef
  const agentAuthorized = agentAdmission?.kind === 'allowed'
    && business.owningAccountRef === agentAdmission.ownerId
    && ownerPrincipalRef !== undefined
  if (!ownerAuthorized && !agentAuthorized) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  if (await providerRouteabilityIsFrozen(ctx, args.businessId)) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }

  const target = await exactConnectedCatalogTarget(ctx, args)
  if (target === undefined) {
    return { kind: 'refused', reason: 'catalog_offering_origin_changed' }
  }
  const connected = await exactConnectedStagingConnection(ctx, {
    businessId: args.businessId,
    ownerId: business.owningAccountRef,
    prepared: args.prepared,
    target,
    evidenceRefs: args.evidenceRefs,
    now,
  })
  if (connected === undefined) {
    return { kind: 'refused', reason: 'connection_authority_stale' }
  }
  const evidenceRefs = effectiveStagingEvidenceRefs(
    args.evidenceRefs,
    connected.connection.evidenceRefs,
  )
  if (evidenceRefs.length === 0) {
    return { kind: 'refused', reason: 'connection_authority_stale' }
  }

  const consequenceCommand = {
    version: 'ae.publication-consequence:v1',
    action: 'publication.publish',
    operationKey: args.operationKey,
    businessId: String(args.businessId),
    offeringRef: args.offeringRef,
    offeringRevision: args.revision,
    offeringSourceHash: args.sourceHash,
    publicationRef: args.prepared.offering.offeringId,
    publicationRevision: 1,
    sourceDigest: args.prepared.sourceDigest,
    priceDigest: args.prepared.priceDigest,
    bindingId: args.prepared.binding.bindingId,
    documentDigest: canonicalDigest(args.prepared.documentJson),
  }
  if (agentAdmission?.kind === 'allowed') {
    const consequence = await admitAgentPublicationConsequence(ctx, {
      agent: agentAdmission,
      action: 'publication.publish',
      target: {
        targetType: 'capability_publication',
        targetRef: args.prepared.offering.offeringId,
        targetRevision: 1,
      },
      resourceRefs: [
        `offering:${args.offeringRef}`,
        `publication:${args.prepared.offering.offeringId}`,
      ],
      consequenceSummary: 'Publish this exact Tool revision to the market.',
      statusReadbackRef: `owner/operations/${args.offeringRef}`,
      correlationRef: args.correlationId,
      idempotencyRef: args.operationKey,
      command: consequenceCommand,
      now,
    })
    if (consequence === null) return { kind: 'refused', reason: 'authorization_denied' }
  }
  if (ownerActor?.kind === 'authenticated_owner') {
    const consequence = await admitInteractiveOwnerConsequence(ctx, {
      actor: ownerActor,
      action: 'publication.publish',
      target: {
        targetType: 'capability_publication',
        targetRef: args.prepared.offering.offeringId,
        targetRevision: 1,
      },
      requiredScopes: ['catalog_publish'],
      resourceRefs: [
        `offering:${args.offeringRef}`,
        `publication:${args.prepared.offering.offeringId}`,
      ],
      budgetAmount: 0,
      consequenceSummary: 'Publish this exact Tool revision to the market.',
      statusReadbackRef: `owner/operations/${args.offeringRef}`,
      correlationRef: args.correlationId,
      idempotencyRef: args.operationKey,
      command: consequenceCommand,
      ...(args.proof === undefined ? {} : { proof: args.proof }),
      now,
    })
    if (consequence.kind === 'refused') return { kind: 'refused', reason: consequence.code }
  }

  const actorRef = agentAdmission?.kind === 'allowed'
    ? agentAdmission.principalId
    : ownerActor?.kind === 'authenticated_owner'
      ? ownerActor.canonicalPrincipalRef
      : ''
  const result = await publishPreparedCapabilityCommand({
    businessId: String(args.businessId),
    runtimeEnvironment: 'sandbox',
    prepared: args.prepared,
    actor: { kind: 'owner', ref: actorRef },
    origin: target.origin,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    reasonCode: args.reasonCode,
    evidenceRefs: [...evidenceRefs, X402_SELLER_CANARY_ADMISSION_REQUIRED_REF],
    now,
  }, stagingPublicationPorts(ctx, args.businessId, async (origin, candidateBusinessId) => (
    candidateBusinessId === String(args.businessId) && catalogOriginsEqual(origin, target.origin)
  )))
  if (result.kind === 'refused') return convexStagingResult(result)

  await activateConnectedCatalogDraft(
    ctx,
    args.businessId,
    target.origin,
    ownerPrincipalRef!,
    args.operationKey,
    now,
  )
  await recordSupplyAdmissionCase(ctx, {
    ...args,
    evidenceRefs,
  }, result, now)
  await rebuildCapabilityOriginSupplyProjection(ctx, args.businessId, now)
  return convexStagingResult(result)
}
