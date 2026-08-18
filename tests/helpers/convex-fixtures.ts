import { convexTest, type TestConvex } from 'convex-test'
import { register as registerWorkpool } from '@convex-dev/workpool/test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { components } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import {
  decodeConvexPublicationSource,
  preparePublicationDraft,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

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

export function convexTestWithWorkers(
  options: ConvexTestWithWorkersOptions = {},
) {
  const backend = convexTest(schema, convexModules)
  registerWorkpool(backend)
  registerRateLimiter(backend)
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
  const identity = {
    subject,
    issuer: 'https://identity.example',
    tokenIdentifier: subject.replace(/^user_/u, 'token_'),
  }
  await backend.run(async (ctx) => {
    void ctx
  })
  return backend.withIdentity(identity)
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
  const identity = {
    subject: `user_${identitySlug}`,
    issuer: 'https://identity.example',
    tokenIdentifier: `token_${identitySlug}`,
  }
  const businessId = (await backend.run(async (ctx) => {
    const ownerId = await ctx.db.insert('owners', {
      clerkUserId: identity.subject,
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
      claimStatus: 'published',
      sourceHash: `source:${prefixLabel.length === 0 ? '' : `${prefixLabel}:`}${slug}`,
      createdAt: 1,
      updatedAt: 1,
    })
  })) as Id<'businesses'>
  return { businessId, owner: backend.withIdentity(identity) }
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
export async function seedCapabilitySupplySourceDraft(
  backend: ConvexFixtureBackend,
  input: Readonly<{
    businessId: Id<'businesses'>
    offeringRef: string
    offeringRevision: number
    operationKey: string
    sourceKind: CapabilityPublicationImport['kind']
    sourceRevision: string
    sourceJson: string
    sourceDigest: string
    summary: Readonly<{
      sourceKind: string
      sourceRevision: string
      sourceDigest: string
      priceDigest: string
      preparedDigest: string
    }>
    evidenceRefs: readonly string[]
  }>,
): Promise<number> {
  void backend
  void input
  throw new Error('retired_listed_tables_unlisted')
}
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
  const rawSource = {
    ...source,
    sourceRevision,
    evidenceRefs: [...input.evidenceRefs],
  }
  const rawSourceJson = JSON.stringify(rawSource)
  const rawSourceDigest = canonicalDigest(rawSource)
  const sourceDraftRevision = await seedCapabilitySupplySourceDraft(backend, {
    businessId: input.businessId,
    offeringRef: catalog.offeringRef,
    offeringRevision: catalog.revision,
    operationKey: input.operationKey,
    sourceKind: preparedMaterial.sourceKind,
    sourceRevision,
    sourceJson: rawSourceJson,
    sourceDigest: rawSourceDigest,
    summary: {
      sourceKind: preparedMaterial.sourceKind,
      sourceRevision: preparedMaterial.sourceRevision,
      sourceDigest: preparedMaterial.sourceDigest,
      priceDigest: preparedMaterial.priceDigest,
      preparedDigest: canonicalDigest(preparedMaterial),
    },
    evidenceRefs: input.evidenceRefs,
  })
  return {
    businessId: input.businessId,
    offeringRef: catalog.offeringRef,
    revision: catalog.revision,
    sourceHash: catalog.sourceHash,
    sourceDraftRevision,
    sourceDigest: rawSourceDigest,
    runtimeEnvironment: 'production' as const,
    prepared: preparedMaterial,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    reasonCode: input.reasonCode,
    evidenceRefs: [...input.evidenceRefs],
  }
}
