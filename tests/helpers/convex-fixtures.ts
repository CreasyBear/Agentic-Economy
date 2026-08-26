import { convexTest, type TestConvex } from 'convex-test'
import { register as registerWorkpool } from '@convex-dev/workpool/test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { register as registerAggregate } from '@convex-dev/aggregate/test'
import agentTest from '@convex-dev/agent/test'
import { api, components } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  decodeConvexPublicationSource,
  preparePublicationDraft,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'
export type ConvexFixtureBackend = TestConvex<typeof schema>
export type ConvexFixtureAdmin = Pick<
  ConvexFixtureBackend,
  'mutation' | 'query' | 'action'
>
export const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../convex/**/*.{ts,js}')).map(
    ([path, load]) => [path.replace('../../convex/', './'), load],
  ),
)

export type ConvexTestWithWorkersOptions = Readonly<{
  pauseWorkpool?: boolean
}>

export function convexTestWithMarketComponents() {
  const backend = convexTest(schema, convexModules)
  registerRateLimiter(backend)
  agentTest.register(backend)
  registerAggregate(backend, 'marketEvidence')
  registerAggregate(backend, 'marketOperationEvidence')
  registerAggregate(backend, 'marketOperationRatings')
  registerAggregate(backend, 'marketActiveOperations')
  registerAggregate(backend, 'marketActiveSuppliers')
  return backend
}

export function convexTestWithWorkers(
  options: ConvexTestWithWorkersOptions = {},
) {
  const backend = convexTestWithMarketComponents()
  registerWorkpool(backend)
  if (options.pauseWorkpool === true) {
    void backend.run(async (ctx) => {
      await ctx.runMutation(components.workpool.config.update, {
        maxParallelism: 0,
      })
    })
  }
  return backend
}

export async function ownerAdmin(
  backend: ConvexFixtureBackend,
  subject: string,
) {
  const credentialExpirySeconds = Math.floor(Date.now() / 1_000) + 86_400
  const identity = {
    subject,
    issuer: 'https://identity.example',
    tokenIdentifier: subject.replace(/^user_/u, 'token_'),
    exp: credentialExpirySeconds,
  }
  const suffix = canonicalDigest({
    format: 'test-owner-admin-authority:v1',
    tokenIdentifier: identity.tokenIdentifier,
  }).slice('sha256:'.length, 'sha256:'.length + 32)
  const canonicalPrincipalRef = `prn_${suffix}`
  const canonicalAccountRef = `acc_${suffix}`
  const ownershipRef = `own_${suffix}`
  const bindingRef = `eib_${suffix}`
  const credentialRef = `crd_${suffix}`
  const credentialExpiresAt = credentialExpirySeconds * 1_000
  await backend.run(async (ctx) => {
    const existingBinding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', 'clerk/user')
        .eq('providerIdentifier', identity.tokenIdentifier))
      .unique()
    if (existingBinding === null) {
      await ctx.db.insert('principals', {
        principalRef: canonicalPrincipalRef,
        kind: 'human',
        displayName: `${subject} admin`,
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('accounts', {
        accountRef: canonicalAccountRef,
        displayName: `${subject} account`,
        lifecycle: 'active',
        recoveryPolicy: { kind: 'no_transfer', revision: 1 },
        creationActorPrincipalRef: canonicalPrincipalRef,
        creationIdempotencyRef: `create:${canonicalAccountRef}`,
        initialOwnershipRef: ownershipRef,
        currentOwnershipRef: ownershipRef,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        lastAction: {
          actorPrincipalRef: canonicalPrincipalRef,
          activeAccountRef: canonicalAccountRef,
          correlationRef: `create:${canonicalAccountRef}`,
          idempotencyRef: `create:${canonicalAccountRef}`,
        },
      })
      await ctx.db.insert('accountOwnerships', {
        ownershipRef,
        accountRef: canonicalAccountRef,
        ownerPrincipalRef: canonicalPrincipalRef,
        lifecycle: 'active',
        changeKind: 'creation',
        revision: 1,
        createdAt: 1,
        createdBy: {
          actorPrincipalRef: canonicalPrincipalRef,
          activeAccountRef: canonicalAccountRef,
          correlationRef: `create:${ownershipRef}`,
          idempotencyRef: `create:${ownershipRef}`,
        },
      })
      await ctx.db.insert('externalIdentityBindings', {
        bindingRef,
        principalRef: canonicalPrincipalRef,
        providerNamespace: 'clerk/user',
        providerIdentifier: identity.tokenIdentifier,
        providerState: { kind: 'known', value: 'active' },
        lifecycle: 'active',
        credentialGeneration: 1,
        bindIdempotencyRef: `bind:${bindingRef}`,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('credentials', {
        credentialRef,
        bindingRef,
        principalRef: canonicalPrincipalRef,
        type: 'provider_token',
        lifecycle: 'active',
        generation: 1,
        issueIdempotencyRef: `issue:${credentialRef}`,
        revision: 1,
        issuedAt: 1,
        expiresAt: credentialExpiresAt,
        updatedAt: 1,
      })
      await ctx.db.insert('owners', {
        clerkUserId: identity.subject,
        canonicalPrincipalRef,
        canonicalAccountRef,
        createdAt: 1,
        updatedAt: 1,
      })
    }
    const existing = await ctx.db
      .query('adminMemberships')
      .withIndex('by_tokenIdentifier_and_state', (query) =>
        query.eq('tokenIdentifier', identity.tokenIdentifier).eq('state', 'active')
      )
      .unique()
    if (existing === null) {
      await ctx.db.insert('adminMemberships', {
        clerkUserId: identity.subject,
        tokenIdentifier: identity.tokenIdentifier,
        role: 'owner_admin',
        state: 'active',
        grantedBy: 'test-fixture',
        grantedAt: 1,
      })
    }
  })
  const owner = backend.withIdentity(identity)
  const materialized = await owner.mutation(
    api.interactiveAuthority.materializeCurrentInteractiveAuthority,
    {},
  )
  if (!materialized) throw new Error('test owner authority materialization failed')
  return owner
}

export type PublishedBusinessOwnerOptions = Readonly<{
  slugPrefix?: string
  identityPrefix?: string
}>

export async function publishedBusinessOwner(
  backend: ConvexFixtureBackend,
  slug: string,
  options: PublishedBusinessOwnerOptions = {},
) {
  const slugPrefix = options.slugPrefix ?? ''
  const identityPrefix = options.identityPrefix ?? ''
  const prefixLabel = slugPrefix.replace(/[-_]+$/u, '')
  const businessName =
    prefixLabel.length === 0
      ? slug
      : `${prefixLabel.charAt(0).toUpperCase()}${prefixLabel.slice(1)} ${slug}`
  const identitySlug = `${identityPrefix}${slug}`
  const credentialExpirySeconds = 8_000_000_000
  const credentialExpiresAt = credentialExpirySeconds * 1_000
  const identity = {
    subject: `user_${identitySlug}`,
    issuer: 'https://identity.example',
    exp: credentialExpirySeconds,
  }
  const tokenIdentifier = `${identity.issuer}|${identity.subject}`
  const authorityDigest = canonicalDigest({
    format: 'test-published-business-owner-authority:v1',
    tokenIdentifier,
  }).slice('sha256:'.length, 'sha256:'.length + 32)
  const canonicalPrincipalRef = `prn_${authorityDigest}`
  const canonicalAccountRef = `acc_${authorityDigest}`
  const ownershipRef = `own_${authorityDigest}`
  const bindingRef = `eib_${authorityDigest}`
  const credentialRef = `crd_${authorityDigest}`
  const businessId = (await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: canonicalPrincipalRef,
      kind: 'human',
      displayName: `${businessName} owner`,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('accounts', {
      accountRef: canonicalAccountRef,
      displayName: `${businessName} Account`,
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: canonicalPrincipalRef,
      creationIdempotencyRef: `create:${canonicalAccountRef}`,
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      lastAction: {
        actorPrincipalRef: canonicalPrincipalRef,
        activeAccountRef: canonicalAccountRef,
        correlationRef: `create:${canonicalAccountRef}`,
        idempotencyRef: `create:${canonicalAccountRef}`,
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef: canonicalAccountRef,
      ownerPrincipalRef: canonicalPrincipalRef,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: canonicalPrincipalRef,
        activeAccountRef: canonicalAccountRef,
        correlationRef: `create:${ownershipRef}`,
        idempotencyRef: `create:${ownershipRef}`,
      },
    })
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef: canonicalPrincipalRef,
      providerNamespace: 'clerk/user',
      providerIdentifier: tokenIdentifier,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:${bindingRef}`,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('credentials', {
      credentialRef,
      bindingRef,
      principalRef: canonicalPrincipalRef,
      type: 'provider_token',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: `issue:${credentialRef}`,
      revision: 1,
      issuedAt: 1,
      expiresAt: credentialExpiresAt,
      expiryMaterialization: {
        state: 'scheduled' as const,
        credentialGeneration: 1,
        credentialExpiresAt,
        scheduleNonce: canonicalDigest({
          kind: 'interactive_credential_expiry:v1',
          bindingRef,
          credentialRef,
          generation: 1,
          expiresAt: credentialExpiresAt,
        }),
        scheduleRef: `scheduled:${credentialRef}`,
        materializedAt: 1,
      },
      updatedAt: 1,
    })
    const ownerId = await ctx.db.insert('owners', {
      clerkUserId: identity.subject,
      canonicalPrincipalRef,
      canonicalAccountRef,
      createdAt: 1,
      updatedAt: 1,
    })
    return await ctx.db.insert('businesses', {
      ownerId,
      slug: `${slugPrefix}${slug}`,
      name: businessName,
      normalizedName: businessName.toLowerCase(),
      category: 'professional services',
      businessContext: {
        kind: 'local_human',
        suburb: 'Perth',
        stateTerritory: 'WA',
      },
      publicStatus: 'published',
      trustTier: 'listed',
      sourceHash: `source:${prefixLabel.length === 0 ? '' : `${prefixLabel}:`}${slug}`,
      createdAt: 1,
      updatedAt: 1,
    })
  })) as Id<'businesses'>
  return {
    businessId,
    owner: backend.withIdentity(identity),
    canonicalPrincipalRef,
    canonicalAccountRef,
  }
}
export type CapabilityPublicationMutationFixture = Readonly<{
  businessId: Id<'businesses'>
  source: unknown
  offering?: CapabilityPublicationOfferingDraft
  binding?: CapabilityPublicationBindingDraft
  sourceRevision?: string
  pricingConfig?: unknown
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: readonly string[]
}>

export type AdapterConfigScalar = string | number | boolean | null
export type AdapterConfigObject = Record<string, AdapterConfigScalar>
export type AdapterConfig = Record<
  string,
  | AdapterConfigScalar
  | AdapterConfigScalar[]
  | AdapterConfigObject
  | AdapterConfigObject[]
>

function isAdapterConfigScalar(value: unknown): value is AdapterConfigScalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function isAdapterConfigObject(value: unknown): value is AdapterConfigObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(isAdapterConfigScalar)
  )
}

export function isAdapterConfig(value: unknown): value is AdapterConfig | null {
  if (value === null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(
    (entry) =>
      isAdapterConfigScalar(entry) ||
      isAdapterConfigObject(entry) ||
      (Array.isArray(entry) &&
        (entry.every(isAdapterConfigScalar) ||
          entry.every(isAdapterConfigObject))),
  )
}

export async function prepareCapabilityPublicationMutation(
  backend: ConvexFixtureBackend,
  input: CapabilityPublicationMutationFixture,
) {
  const decoded = decodeConvexPublicationSource(input.source)
  if (typeof decoded !== 'object' || decoded === null || !('kind' in decoded)) {
    throw new Error('capability_publication_fixture_source_invalid')
  }
  let source: CapabilityPublicationImport
  if (decoded.kind === 'ae_envelope') {
    if (
      !('documentJson' in decoded) ||
      typeof decoded.documentJson !== 'string' ||
      input.offering === undefined ||
      input.binding === undefined
    ) {
      throw new Error('capability_publication_fixture_source_incomplete')
    }
    source = {
      kind: 'ae_envelope',
      documentJson: decoded.documentJson,
      offering: input.offering,
      binding: input.binding,
      evidenceRefs: input.evidenceRefs,
    }
  } else {
    source = decoded as CapabilityPublicationImport
  }
  const offering =
    source.kind === 'ae_envelope' ? source.offering : source.commercial.offering
  const price = offering.presentation.price
  const declaredOrigin =
    offering.origin?.kind === 'catalog_offering' ? offering.origin : undefined
  if (price.kind !== 'fixed' && input.pricingConfig === undefined) {
    throw new Error('capability_publication_fixture_price_missing')
  }
  const pricingConfig = input.pricingConfig ?? {
    version: 'pricing:v2' as const,
    unit: 'call' as const,
    paidAmount:
      price.kind === 'fixed'
        ? price.amount
        : { currency: 'AUD' as const, units: '0', exponent: 2 },
  }
  const catalog = await backend.run(async (ctx) => {
    const offeringRows = await ctx.db
      .query('businessOfferings')
      .withIndex('by_businessId_and_status', (query) =>
        query.eq('businessId', input.businessId).eq('status', 'published'),
      )
      .collect()
    const catalogOffering =
      declaredOrigin === undefined
        ? offeringRows[0]
        : offeringRows.find(
            (candidate) => candidate.offeringRef === declaredOrigin.offeringRef,
          )
    if (catalogOffering === undefined)
      throw new Error('capability_publication_fixture_catalog_offering_missing')
    const revision = await ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) =>
        query
          .eq('offeringRef', catalogOffering.offeringRef)
          .eq('revision', catalogOffering.currentRevision),
      )
      .unique()
    if (revision === null)
      throw new Error('capability_publication_fixture_catalog_revision_missing')
    const accessPath = (
      await ctx.db
        .query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) =>
          query
            .eq('offeringRef', catalogOffering.offeringRef)
            .eq('status', 'published'),
        )
        .take(10)
    ).find(
      (candidate) =>
        candidate.offeringRevision === catalogOffering.currentRevision &&
        (declaredOrigin?.declaredAccessPathRef === undefined ||
          candidate.accessPathRef === declaredOrigin.declaredAccessPathRef),
    )
    return {
      offeringRef: catalogOffering.offeringRef,
      revision: catalogOffering.currentRevision,
      sourceHash: revision.sourceHash,
      ...(accessPath === undefined
        ? {}
        : {
            accessPathRef: accessPath.accessPathRef,
            accessPathSourceHash: accessPath.sourceHash,
          }),
    }
  })
  const catalogOrigin = {
    kind: 'catalog_offering' as const,
    offeringRef: catalog.offeringRef,
    offeringRevision: catalog.revision,
    offeringSourceHash: catalog.sourceHash,
    ...(catalog.accessPathRef === undefined
      ? {}
      : {
          declaredAccessPathRef: catalog.accessPathRef,
          accessPathSourceHash: catalog.accessPathSourceHash,
        }),
  }
  const preparedSource: CapabilityPublicationImport =
    declaredOrigin !== undefined
      ? source
      : source.kind === 'ae_envelope'
        ? { ...source, offering: { ...source.offering, origin: catalogOrigin } }
        : {
            ...source,
            commercial: {
              ...source.commercial,
              offering: {
                ...source.commercial.offering,
                origin: catalogOrigin,
              },
            },
          }
  const sourceRevision =
    input.sourceRevision ??
    `test:publication:${catalog.offeringRef}:${catalog.revision}`
  const prepared = await preparePublicationDraft({
    source: preparedSource,
    sourceRevision,
    pricingConfig,
    evidenceRefs: input.evidenceRefs,
  })
  if (prepared.kind === 'refused')
    throw new Error(`capability_publication_fixture_prepare_${prepared.reason}`)
  const preparedOrigin = prepared.prepared.offering.origin
  if (preparedOrigin === undefined)
    throw new Error('capability_publication_fixture_origin_missing')
  const adapterConfig = prepared.prepared.binding.adapter.config
  if (!isAdapterConfig(adapterConfig))
    throw new Error('capability_publication_fixture_adapter_config_invalid')
  const normalizedOrigin =
    preparedOrigin.kind === 'catalog_offering'
      ? {
          kind: 'catalog_offering' as const,
          offeringRef: preparedOrigin.offeringRef,
          offeringRevision: preparedOrigin.offeringRevision,
          offeringSourceHash: preparedOrigin.offeringSourceHash,
          ...(preparedOrigin.declaredAccessPathRef === undefined
            ? {}
            : { declaredAccessPathRef: preparedOrigin.declaredAccessPathRef }),
          ...(preparedOrigin.accessPathSourceHash === undefined
            ? {}
            : { accessPathSourceHash: preparedOrigin.accessPathSourceHash }),
        }
      : { kind: 'standalone' as const }
  const preparedMaterial = {
    ...prepared.prepared,
    offering: {
      ...prepared.prepared.offering,
      origin: normalizedOrigin,
      presentation: {
        ...prepared.prepared.offering.presentation,
        materialTerms:
          prepared.prepared.offering.presentation.materialTerms.map((term) => ({
            ...term,
          })),
        commercialRelationship: {
          ...prepared.prepared.offering.presentation.commercialRelationship,
          evidenceRefs: [
            ...prepared.prepared.offering.presentation.commercialRelationship
              .evidenceRefs,
          ],
        },
      },
      searchTerms: [...prepared.prepared.offering.searchTerms],
      registrationEvidenceRefs: [
        ...prepared.prepared.offering.registrationEvidenceRefs,
      ],
    },
    binding: {
      ...prepared.prepared.binding,
      continuation: {
        ...prepared.prepared.binding.continuation,
        evidenceRefs: [...prepared.prepared.binding.continuation.evidenceRefs],
      },
      cancellation: {
        ...prepared.prepared.binding.cancellation,
        evidenceRefs: [...prepared.prepared.binding.cancellation.evidenceRefs],
      },
      adapter: {
        ...prepared.prepared.binding.adapter,
        config: adapterConfig,
      },
      registrationEvidenceRefs: [
        ...prepared.prepared.binding.registrationEvidenceRefs,
      ],
    },
    evidenceRefs: [...prepared.prepared.evidenceRefs],
  }
  return {
    businessId: input.businessId,
    offeringRef: catalog.offeringRef,
    revision: catalog.revision,
    sourceHash: catalog.sourceHash,
    runtimeEnvironment: 'production' as const,
    prepared: preparedMaterial,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    reasonCode: input.reasonCode,
    evidenceRefs: [...input.evidenceRefs],
  }
}
