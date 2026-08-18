import type { FunctionArgs } from 'convex/server'
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import {
  preparePublicationDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  capabilityContractV2,
  objectSchema,
} from '../fixtures/capability-contract-v2'
import {
  convexModules as modules,
  isAdapterConfig,
  seedCapabilitySupplySourceDraft,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import { probeRequestDigest } from '@/modules/capability-supply/public'

type CatalogOfferingOrigin = Extract<
  NonNullable<CapabilityPublicationOfferingDraft['origin']>,
  { kind: 'catalog_offering' }
>

type PublishPreparedCapabilityArgs = FunctionArgs<
  typeof api.capabilitySupply.publishPreparedCapability
>
async function prepareOwnerPublicationCommand(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  offeringRef: string,
  revision: number,
  sourceHash: string,
  source: CapabilityPublicationImport,
  operationKey: string,
  origin?: CatalogOfferingOrigin,
) {
  const offering =
    source.kind === 'ae_envelope' ? source.offering : source.commercial.offering
  const price = offering.presentation.price
  if (price.kind !== 'fixed')
    throw new Error('owner_publication_fixture_price_missing')
  const sourceRevision = 'owner-api/2026-08-09'
  const prepared = await preparePublicationDraft({
    source,
    sourceRevision,
    pricingConfig: {
      version: 'pricing:v2',
      unit: 'call',
      paidAmount: price.amount,
    },
    evidenceRefs: source.evidenceRefs,
    ...(origin === undefined ? {} : { origin }),
  })
  if (prepared.kind === 'refused') return prepared
  const preparedOrigin = prepared.prepared.offering.origin
  if (preparedOrigin === undefined)
    throw new Error('owner_publication_fixture_origin_missing')
  const adapterConfig = prepared.prepared.binding.adapter.config
  if (!isAdapterConfig(adapterConfig))
    throw new Error('owner_publication_fixture_adapter_config_invalid')
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
    evidenceRefs: [...source.evidenceRefs],
  }
  const rawSourceJson = JSON.stringify(rawSource)
  const rawSourceDigest = canonicalDigest(rawSource)
  const sourceDraftRevision = await seedCapabilitySupplySourceDraft(backend, {
    businessId,
    offeringRef,
    offeringRevision: revision,
    operationKey,
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
    evidenceRefs: source.evidenceRefs,
  })
  return {
    kind: 'prepared' as const,
    command: (await withSourceWrite('catalog_publish', {
      businessId,
      offeringRef,
      revision,
      sourceHash,
      sourceDraftRevision,
      sourceDigest: rawSourceDigest,
      runtimeEnvironment: 'production',
      prepared: preparedMaterial,
      operationKey,
      correlationId: `owner-supply:${offeringRef}`,
      reasonCode: 'owner_supply_publication',
      evidenceRefs: [...source.evidenceRefs],
    })) satisfies PublishPreparedCapabilityArgs,
  }
}

function openApiSource(
  capabilityId = 'owner.lookup',
): Extract<CapabilityPublicationImport, { kind: 'openapi_http' }> {
  return {
    kind: 'openapi_http' as const,
    document: {
      openapi: '3.1.0',
      info: { title: 'Owner API', version: '1' },
      servers: [{ url: 'https://provider.example' }],
      paths: {
        '/lookup': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: objectSchema(
                    { request: { type: 'string', minLength: 1 } },
                    ['request'],
                  ),
                },
              },
            },
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: objectSchema({ result: { type: 'string' } }, [
                      'result',
                    ]),
                  },
                },
              },
            },
          },
        },
      },
    },
    operation: { path: '/lookup', method: 'post' as const },
    fixedQuery: [],
    contract: contractMetadata(capabilityId),
    commercial: {
      offering: ownerOffering(),
      bindingId: 'binding:owner:lookup',
      authority: { kind: 'keyless' as const },
      registrationEvidenceRefs: ['registration:owner:lookup'],
      requestTimeoutMs: 5_000,
    },
    evidenceRefs: ['source:owner:lookup'],
  }
}

function x402Source(): Extract<CapabilityPublicationImport, { kind: 'x402' }> {
  const endpoint = 'https://provider.example/paid-lookup'
  const contract = contractMetadata('owner.x402.lookup')
  return {
    kind: 'x402',
    resource: {
      resourceUrl: endpoint,
      inputSchema: objectSchema(
        { request: { type: 'string', minLength: 1 } },
        ['request'],
      ),
      outputSchema: objectSchema({ result: { type: 'string' } }, ['result']),
      method: 'POST',
      price: { currency: 'AUD', units: '100', exponent: 2 },
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0xasset',
      payTo: '0xpayee',
      routeAmountExponent: 2,
      assetAmountExponent: 6,
    },
    contract: {
      ...contract,
      effects: [
        ...contract.effects,
        {
          effectId: 'payment-release',
          class: 'financial_exposure',
          authority: 'mandate_or_explicit',
          reversibility: 'irreversible',
        },
      ],
      lifecycle: {
        idempotency: 'required',
        recovery: 'reconcile_required',
      },
      inputExamples: [
        { label: 'Owner lookup', input: { request: 'hello' } },
      ],
    },
    commercial: {
      offering: ownerOffering(),
      bindingId: 'binding:owner:x402-lookup',
      authority: {
        kind: 'provider_connection',
        connectionRef: 'connection:owner:x402',
        providerRef: 'provider:owner:x402',
      },
      registrationEvidenceRefs: ['registration:owner:x402'],
      requestTimeoutMs: 5_000,
    },
    evidenceRefs: ['source:owner:x402'],
  }
}

function directSource(
  offeringSourceHash: string,
  capabilityId = 'owner.direct',
): Extract<CapabilityPublicationImport, { kind: 'ae_envelope' }> {
  return {
    kind: 'ae_envelope' as const,
    documentJson: JSON.stringify(capabilityContractV2({ capabilityId })),
    offering: ownerOffering({
      kind: 'catalog_offering',
      offeringRef: 'catalog-offering:owner-stale-hash',
      offeringRevision: 1,
      offeringSourceHash,
    }),
    binding: {
      bindingId: 'binding:owner:direct',
      endpointUrl: 'https://provider.example/lookup',
      authority: { kind: 'keyless' as const },
      continuation: {
        kind: 'single_response' as const,
        evidenceRefs: ['registration:owner:direct'],
      },
      cancellation: {
        kind: 'unsupported' as const,
        evidenceRefs: ['registration:owner:direct'],
      },
      adapter: {
        adapterId: 'http-json:v1',
        config: {
          method: 'POST',
          requestTimeoutMs: 5_000,
          credential: { kind: 'none' },
        },
      },
      registrationEvidenceRefs: ['registration:owner:direct'],
    },
    evidenceRefs: ['source:owner:direct'],
  }
}

function contractMetadata(capabilityId: string) {
  return {
    capabilityId,
    version: 1,
    name: 'Owner lookup',
    description: 'Returns one owner-provided result.',
    customerAnnotations: [
      {
        annotationId: 'request',
        document: 'input' as const,
        pointer: '/request',
        label: 'Request',
        role: 'request' as const,
      },
      {
        annotationId: 'result',
        document: 'output' as const,
        pointer: '/result',
        label: 'Result',
        role: 'completion_evidence' as const,
      },
    ],
    dataUse: [
      {
        effectId: 'request-release',
        inputPointer: '/request',
        classification: 'public' as const,
        phase: 'execution' as const,
        recipient: { kind: 'selected_binding' as const },
        purposes: ['return_requested_result'],
      },
    ],
    effects: [
      {
        effectId: 'request-release',
        class: 'data_release' as const,
        authority: 'explicit' as const,
        reversibility: 'irreversible' as const,
      },
    ],
    evidence: [
      {
        evidenceId: 'result',
        outputPointer: '/result',
        purpose: 'completion' as const,
      },
    ],
    lifecycle: {
      idempotency: 'required' as const,
      recovery: 'retry_safe' as const,
    },
  }
}

function ownerOffering(
  origin: NonNullable<CapabilityPublicationOfferingDraft['origin']> = {
    kind: 'standalone',
  },
): CapabilityPublicationOfferingDraft {
  return {
    offeringId: 'offering:owner:lookup',
    networkId: 'ae:public',
    origin,
    presentation: {
      label: 'Owner lookup',
      summary: 'Returns one owner-provided result.',
      price: {
        kind: 'fixed' as const,
        amount: { currency: 'AUD', units: '100', exponent: 2 },
      },
      materialTerms: [],
      commercialRelationship: {
        kind: 'none' as const,
        summary: 'No commercial influence.',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['commercial:none'],
      },
    },
    searchTerms: ['owner', 'lookup'],
    registrationEvidenceRefs: ['registration:owner:lookup'],
  }
}

async function createPublishedBusinessOwner(
  backend: ConvexFixtureBackend,
  slug: string,
) {
  const identity = {
    subject: `user_${slug}`,
    issuer: 'https://identity.example',
    tokenIdentifier: `token_${slug}`,
  }
  const businessId = (await backend.run(async (ctx) => {
    const ownerId = await ctx.db.insert('owners', {
      clerkUserId: identity.subject,
      createdAt: 1,
      updatedAt: 1,
    })
    return ctx.db.insert('businesses', {
      ownerId,
      slug,
      name: slug,
      normalizedName: slug,
      category: 'professional services',
      businessContext: {
        kind: 'programmable_provider',
        website: 'https://provider.example',
        providerIdentifier: `provider:${slug}`,
      },
      publicStatus: 'published',
      trustTier: 'listed',
      claimStatus: 'published',
      sourceHash: `source:${slug}`,
      createdAt: 1,
      updatedAt: 1,
    })
  })) as Id<'businesses'>
  return { businessId, owner: backend.withIdentity(identity) }
}
async function seedSupplyAgentPrincipal(
  backend: ConvexFixtureBackend,
  ownerId: string,
  suffix: string,
) {
  const principal = {
    principalId: `principal:supply-reservation:${suffix}`,
    ownerId,
    credentialId: `credential:supply-reservation:${suffix}`,
    applicationRef: 'agentic-economy',
    environment: 'production' as const,
    scopes: ['market_supply:manage'],
    authorityMode: 'full_yolo' as const,
  }
  const now = Date.now()
  const amount = { currency: 'USD', units: '0', exponent: 2 }
  const policy = {
    format: 'ae.agent-access-policy:v1' as const,
    operationAccess: 'all_admitted' as const,
    environment: 'production' as const,
    budget: {
      budgetPolicyRef: `budget-policy:supply-reservation:${suffix}`,
      generation: 1,
      currency: 'USD',
      exponent: 2,
      maximumSpendPerInvocation: amount,
      maximumDailySpend: amount,
      maximumMonthlySpend: amount,
      maximumConcurrentInvocations: 4,
    },
    rate: {
      ratePolicyRef: `rate-policy:supply-reservation:${suffix}`,
      generation: 1,
      maximumCallsPerMinute: 100,
      maximumCallsPerHour: 1_000,
    },
  }
  const grant = {
    format: 'ae.agent-access-grant:v1' as const,
    grantRef: `grant:supply-reservation:${suffix}`,
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    applicationRef: principal.applicationRef,
    credentialId: principal.credentialId,
    environment: principal.environment,
    operationAccess: 'all_admitted' as const,
    authorityMode: principal.authorityMode,
    policy,
    budgetPolicyRef: policy.budget.budgetPolicyRef,
    ratePolicyRef: policy.rate.ratePolicyRef,
    lifecycle: 'active' as const,
    generation: 1,
    policyDigest: canonicalDigest(policy as never),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1_000,
  }
  const recorded = await backend.mutation(internal.agentAccessPrincipals.recordAgentPrincipal, {
    ...principal,
    scopes: [...principal.scopes],
    ownerTokenIdentifier: `token:supply-reservation:${suffix}`,
    grantGeneration: 1,
    policyDigest: grant.policyDigest,
    lifecycle: 'active',
    seenAt: now,
  })
  if (recorded.kind !== 'recorded') throw new Error(`supply_reservation_principal_failed:${recorded.kind}`)
  const granted = await backend.mutation(internal.agentAccessPolicy.upsertGrant, { grant })
  if (granted.kind !== 'recorded') throw new Error(`supply_reservation_grant_failed:${granted.kind}`)
  return principal
}

async function seedCatalogOffering(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  offeringRef: string,
  currentRevision: number,
  revision: number,
  sourceHash: string,
) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('businessOfferings', {
      offeringRef,
      businessId,
      currentRevision,
      status: 'published',
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('businessOfferingRevisions', {
      offeringRef,
      businessId,
      revision,
      name: 'Owner lookup service',
      category: 'Data',
      summary: 'A bounded owner lookup service.',
      sourceHash,
      createdAt: 1,
    })
  })
}

describe('owner capability publication admission', () => {
  it('refuses anonymous and wrong-owner admission without publication', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await createPublishedBusinessOwner(
      backend,
      'owner-auth',
    )
    const { businessId: wrongBusinessId, owner: wrongOwner } =
      await createPublishedBusinessOwner(backend, 'other-owner')
    const offeringRef = 'catalog-offering:owner-auth'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:owner-auth:v1',
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      'catalog-source:owner-auth:v1',
      openApiSource(),
      `owner-supply:${offeringRef}:1`,
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: 'catalog-source:owner-auth:v1',
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    await expect(
      backend.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    await expect(
      wrongOwner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)

    await expect(
      backend.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
        businessId,
      }),
    ).resolves.toEqual({ kind: 'error', code: 'unauthenticated' })
    await expect(
      wrongOwner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
        businessId: wrongBusinessId,
      }),
    ).resolves.toMatchObject({
      kind: 'available',
      businessId: wrongBusinessId,
      offerings: [],
    })
  })

  it('refuses a stale catalog revision before publication', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-stale-revision',
    )
    const offeringRef = 'catalog-offering:owner-stale-revision'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      2,
      1,
      'catalog-source:owner-stale-revision:v1',
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      'catalog-source:owner-stale-revision:v1',
      openApiSource(),
      `owner-supply:${offeringRef}:1`,
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: 'catalog-source:owner-stale-revision:v1',
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    await expect(
      owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'catalog_offering_origin_changed',
    })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)
  })

  it('refuses an ae envelope whose catalog source hash is stale', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-stale-hash',
    )
    const offeringRef = 'catalog-offering:owner-stale-hash'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:owner-stale-hash:v2',
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      'catalog-source:owner-stale-hash:v2',
      directSource('catalog-source:owner-stale-hash:v1'),
      'owner-supply:owner-stale-hash',
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    await expect(
      owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'catalog_offering_origin_changed',
    })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)
  })

  it('refuses malformed source and admits a valid OpenAPI source through the canonical command', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-valid',
    )
    const offeringRef = 'catalog-offering:owner-valid'
    const sourceHash = 'catalog-source:owner-valid:v1'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )

    const malformed = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      { ...openApiSource(), document: '{' },
      'owner-supply:owner-valid:malformed',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    expect(malformed).toEqual({ kind: 'refused', reason: 'source_invalid' })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)

    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.valid'),
      'owner-supply:owner-valid:admit',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    // Owner readback must resolve its publication binding by identity, not a global first-page scan.
    await backend.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('capabilityTransportBindings', {
          bindingId: `binding:unrelated:${index}`,
          offeringId: `offering:unrelated:${index}`,
          networkId: 'ae:public',
          capabilityId: `unrelated.${index}`,
          version: 1,
          contractDigest: `sha256:${'0'.repeat(64)}`,
          endpointUrl: 'https://unrelated.example.test',
          authority: { kind: 'keyless' },
          continuation: { kind: 'single_response', evidenceRefs: [] },
          cancellation: { kind: 'unsupported', evidenceRefs: [] },
          adapterId: 'http-json:v1',
          configJson: '{}',
          configDigest: `sha256:${'1'.repeat(64)}`,
          registrationEvidenceRefs: [],
          registrationHash: `sha256:${'2'.repeat(64)}`,
          admission: 'not_admitted',
          conformance: 'not_conformant',
          admissionEvidenceRefs: [],
          conformanceEvidenceRefs: [],
          eligibilityHash: `sha256:${'3'.repeat(64)}`,
          registeredAt: index,
          updatedAt: index,
        })
      }
    })

    const admitted = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )
    if (admitted.kind === 'refused')
      throw new Error(`owner_publication_failed:${admitted.reason}`)
    expect(admitted).toMatchObject({
      kind: 'published',
      publicationRef: 'offering:owner:lookup',
      publicationRevision: 1,
      authorityMode: 'provider_owned',
      sourceKind: 'openapi_http',
      sourceRevision: 'owner-api/2026-08-09',
      priceDigest: expect.stringMatching(/^sha256:/),
    })
    const rows = await backend.run(async (ctx) => ({
      publications: await ctx.db.query('capabilityPublications').take(10),
      offerings: await ctx.db.query('capabilityOfferings').take(10),
    }))
    expect(rows.publications).toHaveLength(1)
    expect(rows.offerings[0]?.origin).toEqual({
      kind: 'catalog_offering',
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
    })

    const readback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId },
    )
    if (readback.kind !== 'available')
      throw new Error(`owner_readback_kind:${readback.kind}`)
    expect(readback.businessId).toBe(businessId)
    const readbackOffering = readback.offerings[0]
    if (readbackOffering === undefined)
      throw new Error('owner_readback_offering_missing')
    expect(readbackOffering).toMatchObject({ offeringRef, revision: 1 })
    expect(readbackOffering.source).toEqual({
      kind: 'openapi_http',
      selector: { path: '/lookup', method: 'post' },
      revision: admitted.sourceRevision,
      digest: admitted.sourceDigest,
    })
    expect(readbackOffering.pricing).toEqual({
      config: {
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '100', exponent: 2 },
      },
      priceDigest: admitted.priceDigest,
    })
    expect(readbackOffering.admission).toEqual({ state: 'admitted' })
    expect(readbackOffering.publicationRef).toBe(admitted.publicationRef)
    expect(readbackOffering.publication).toMatchObject({
      state: 'current',
      publicationRef: admitted.publicationRef,
      publicationRevision: admitted.publicationRevision,
      operationRef: admitted.operationRef,
    })
    expect(readbackOffering.publication?.source).toEqual({
      kind: 'openapi_http',
      selector: { path: '/lookup', method: 'post' },
      revision: admitted.sourceRevision,
      digest: admitted.sourceDigest,
    })
    expect(readbackOffering.publication?.pricing).toEqual({
      config: {
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '100', exponent: 2 },
      },
      priceDigest: admitted.priceDigest,
    })
    expect(readbackOffering.publication?.binding).toMatchObject({
      bindingId: admitted.bindingId,
      admission: 'admitted',
      conformance: 'conformant',
    })
  })
  it('returns a typed incomplete readback before capped joins instead of a false unadmitted operation', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-capability-overflow',
    )
    const offeringRef = 'catalog-offering:owner-capability-overflow'
    const sourceHash = 'catalog-source:owner-capability-overflow:v1'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )
    await backend.run(async (ctx) => {
      for (let index = 0; index < 50; index += 1) {
        await ctx.db.insert('capabilityOfferings', {
          offeringId: `offering:overflow:${index}`,
          businessId,
          networkId: 'ae:public',
          capabilityId: `overflow.${index}`,
          version: 1,
          contractDigest: `sha256:${'0'.repeat(64)}`,
          presentation: {
            label: `Overflow ${index}`,
            summary: 'An unrelated capability.',
            price: {
              kind: 'fixed',
              amount: { currency: 'AUD', units: '0', exponent: 2 },
            },
            materialTerms: [],
            commercialRelationship: {
              kind: 'none',
              summary: 'No commercial influence.',
              influencesEligibility: false,
              influencesInclusion: false,
              influencesOrder: false,
              evidenceRefs: [],
            },
          },
          searchTerms: [],
          registrationEvidenceRefs: [],
          registrationHash: `sha256:${'1'.repeat(64)}`,
          status: 'active',
          admissionEvidenceRefs: [],
          eligibilityHash: `sha256:${'2'.repeat(64)}`,
          registeredAt: index + 1,
          updatedAt: index + 1,
        })
      }
    })
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.capability-overflow'),
      'owner-supply:owner-capability-overflow',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_capability_overflow_prepare_failed:${prepared.reason}`)
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )
    if (published.kind === 'refused')
      throw new Error(`owner_capability_overflow_publish_failed:${published.reason}`)
    expect(published.kind).toBe('published')
    await expect(
      owner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
        businessId,
      }),
    ).resolves.toEqual({ kind: 'incomplete' })
  })
  it('completes x402 Test only from the exact fresh no-payment challenge', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-x402-test',
    )
    const offeringRef = 'catalog-offering:owner-x402-test'
    const sourceHash = 'catalog-source:owner-x402-test:v1'
    const endpoint = 'https://provider.example/paid-lookup'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )
    const now = Date.now()
    await expect(
      backend.mutation(internal.capabilityProviderConnections.create, {
        connectionRef: 'connection:owner:x402',
        businessId,
        providerRef: 'provider:owner:x402',
        providerAccountRef: 'account:owner:x402',
        adapterId: 'x402-fetch:v2',
        credentialRef: null,
        requestedScopes: ['payment:challenge'],
        grantedScopes: ['payment:challenge'],
        requestedResources: [endpoint],
        grantedResources: [endpoint],
        evidenceRefs: ['connection:owner:x402'],
        commandId: 'connection:owner:x402:create',
        now,
      }),
    ).resolves.toMatchObject({ kind: 'applied' })
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      x402Source(),
      'owner-supply:owner-x402-test',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_x402_prepare_failed:${prepared.reason}`)
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )
    if (published.kind !== 'published')
      throw new Error(`owner_x402_publish_failed:${published.kind}`)
    const targetResult = await backend.query(
      internal.capabilitySupply.readCapabilityProbeTarget,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
      },
    )
    if (targetResult.kind !== 'available')
      throw new Error(`owner_x402_target_failed:${targetResult.reason}`)
    const observation = {
      publicationRef: published.publicationRef,
      expectedRevision: published.publicationRevision,
      targetDigest: targetResult.target.targetDigest,
      requestDigest: probeRequestDigest(targetResult.target),
      responseStatus: 402,
      responseDigest: canonicalDigest(''),
      outcome: 'healthy' as const,
      credentialState: 'ready' as const,
      healthState: 'healthy' as const,
      observedAt: now,
      validUntil: now + 60_000,
      evidenceRefs: [
        'probe:credential_not_required',
        'probe:target_public',
        'probe:x402_payment_required_valid',
      ],
    }
    await expect(
      backend.mutation(
        internal.capabilitySupply.recordCapabilityProbeResult,
        observation,
      ),
    ).resolves.toMatchObject({ kind: 'observed' })

    const readTestState = async () => {
      const readback = await owner.query(
        api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
        { businessId },
      )
      if (readback.kind !== 'available')
        throw new Error(`owner_x402_readback_failed:${readback.kind}`)
      return readback.offerings[0]?.stepStates.test
    }
    await expect(readTestState()).resolves.toBe('completed')
    await expect(
      owner.action(api.capabilitySupplyOwnerSupply.runOwnerSupplyTest, {
        businessId,
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
        publicationRef: published.publicationRef,
        publicationRevision: published.publicationRevision,
        operationKey: 'owner-x402-test',
      }),
    ).resolves.toMatchObject({
      step: 'test',
      state: 'completed',
      message: expect.stringContaining('No payment was sent'),
    })
    await expect(
      backend.run(async () => []),
    ).resolves.toEqual([])

    const patchReadiness = async (patch: Record<string, unknown>) => {
      await backend.run(async (ctx) => {
        const publication = await ctx.db
          .query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (q) =>
            q
              .eq('publicationRef', published.publicationRef)
              .eq('revision', published.publicationRevision),
          )
          .unique()
        if (publication === null)
          throw new Error('owner_x402_publication_missing')
        await ctx.db.patch(publication._id, patch)
      })
    }
    await patchReadiness({
      readinessTargetDigest: canonicalDigest('mismatched-target'),
    })
    await expect(readTestState()).resolves.toBe('in_progress')
    await patchReadiness({
      readinessTargetDigest: observation.targetDigest,
    })
    await patchReadiness({
      readinessRequestDigest: canonicalDigest('mismatched-request'),
    })
    await expect(readTestState()).resolves.toBe('in_progress')
    await patchReadiness({
      readinessRequestDigest: observation.requestDigest,
      readinessEvidenceRefs: ['probe:x402_payment_required_mismatch'],
    })
    await expect(readTestState()).resolves.toBe('in_progress')
    await patchReadiness({
      readinessEvidenceRefs: observation.evidenceRefs,
      readinessValidUntil: now - 1,
    })
    await expect(readTestState()).resolves.toBe('not_started')
  })
  it('does not reuse owner test evidence across publication revisions', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-test-revision',
    )
    const offeringRef = 'catalog-offering:owner-test-revision'
    const sourceHash = 'catalog-source:owner-test-revision:v1'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.test.revision'),
      'owner-supply:owner-test-revision:r1',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(
        `owner_test_publication_prepare_failed:${prepared.reason}`,
      )
    const first = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )
    if (first.kind === 'refused')
      throw new Error(`owner_test_publication_failed:${first.reason}`)
    if (first.kind !== 'published')
      throw new Error('owner_test_publication_replayed_unexpectedly')

    const observeReadiness = async (
      publicationRef: string,
      revision: number,
      suffix: string,
    ) => {
      await expect(
        backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
          publicationRef,
          expectedRevision: revision,
          credentialState: 'ready',
          healthState: 'healthy',
          validUntil: Date.now() + 60_000,
          operationKey: `owner-test-readiness:${suffix}`,
          correlationId: `owner-test-readiness:${suffix}`,
          reasonCode: 'owner_test_readiness',
          evidenceRefs: [`owner-test:readiness:${suffix}`],
        }),
      ).resolves.toMatchObject({ kind: 'observed', revision })
    }

    await observeReadiness(
      first.publicationRef,
      first.publicationRevision,
      'r1',
    )
    const ownerTestEventBase = {
      businessId,
      offeringRef,
      publicationRef: first.publicationRef,
      eventKind: 'supply_owner_test_observed' as const,
      outcome: 'filled' as const,
      taskStartedAt: 1,
      successfulAt: 2,
      durationMs: 1,
      observedAt: 2,
      evidenceRefs: ['owner-test:evidence:r1'],
      environment: 'development' as const,
    }
    await expect(
      backend.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1:missing-identity',
        operationRef: first.operationRef,
        taskDigest: 'owner-test-task:r1:missing-identity',
      }),
    ).rejects.toThrow('owner_test_event_identity_required')
    await expect(
      backend.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1:wrong-operation',
        publicationRevision: first.publicationRevision,
        operationRef: 'operation:wrong',
        taskDigest: 'owner-test-task:r1:wrong-operation',
      }),
    ).rejects.toThrow('owner_test_event_identity_changed')
    await expect(
      backend.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1',
        publicationRevision: first.publicationRevision,
        operationRef: first.operationRef,
        taskDigest: 'owner-test-task:r1',
      }),
    ).resolves.toEqual({ kind: 'recorded' })
    for (let index = 0; index < 50; index += 1) {
      await expect(
        backend.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
          ...ownerTestEventBase,
          eventRef: `owner-supply-test:r1:history:${index}`,
          publicationRevision: first.publicationRevision,
          operationRef: first.operationRef,
          taskDigest: `owner-test-task:r1:history:${index}`,
          observedAt: 3 + index,
          evidenceRefs: [`owner-test:evidence:r1:history:${index}`],
        }),
      ).resolves.toEqual({ kind: 'recorded' })
    }
    for (let index = 0; index < 51; index += 1) {
      await expect(
        backend.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
          businessId,
          eventRef: `owner-supply-fill:r1:${index}`,
          offeringRef,
          publicationRef: first.publicationRef,
          publicationRevision: first.publicationRevision,
          operationRef: first.operationRef,
          taskDigest: `owner-fill-task:r1:${index}`,
          eventKind: 'supply_liquidity_fill_observed',
          outcome: 'filled',
          observedAt: 100 + index,
          evidenceRefs: [`owner-fill:evidence:r1:${index}`],
          environment: 'development',
        }),
      ).resolves.toEqual({ kind: 'recorded' })
    }
    const firstReadback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId },
    )
    if (firstReadback.kind !== 'available')
      throw new Error(`owner_test_readback_kind:${firstReadback.kind}`)
    expect(firstReadback.offerings).toHaveLength(1)
    expect(firstReadback.offerings[0]).toMatchObject({
      offeringRef,
      operationRef: first.operationRef,
      publicationRef: first.publicationRef,
    })
    expect(firstReadback.activityTruncated).toBe(true)
    expect(firstReadback.callLog).toHaveLength(50)
    expect(firstReadback.callLog[0]?.eventRef).toBe(
      'owner-supply-fill:r1:50',
    )
    expect(
      firstReadback.callLog[firstReadback.callLog.length - 1]?.eventRef,
    ).toBe('owner-supply-fill:r1:1')
    expect(
      firstReadback.offerings.find(
        (offering) => offering.offeringRef === offeringRef,
      )?.stepStates.test,
    ).toBe('completed')

    const maintenanceBase = {
      businessId,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
      publicationRef: first.publicationRef,
      publicationRevision: first.publicationRevision,
      reasonCode: 'owner_test_lifecycle',
      evidenceRefs: ['owner-test:lifecycle'],
    }
    await expect(
      owner.mutation(
        api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
        await withSourceWrite('catalog_publish', {
          ...maintenanceBase,
          operationKey: 'owner-test-withdraw',
          correlationId: 'owner-test-withdraw',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'withdrawn',
      revision: first.publicationRevision,
    })
    const republished = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.republishOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...maintenanceBase,
        operationKey: 'owner-test-republish',
        correlationId: 'owner-test-republish',
      }),
    )
    if (republished.kind === 'refused')
      throw new Error(`owner_test_republish_failed:${republished.reason}`)
    if (republished.kind !== 'republished')
      throw new Error(`owner_test_republish_unexpected:${republished.kind}`)
    expect(republished.revision).toBe(first.publicationRevision + 1)
    expect(republished.operationRef).not.toBe(first.operationRef)

    await observeReadiness(first.publicationRef, republished.revision, 'r2')
    await expect(
      backend.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r2:wrong-environment',
        publicationRevision: republished.revision,
        operationRef: republished.operationRef,
        taskDigest: 'owner-test-task:r2:wrong-environment',
        evidenceRefs: ['owner-test:evidence:r2:wrong-environment'],
        environment: 'production',
      }),
    ).resolves.toEqual({ kind: 'recorded' })
    const beforeSecondTest = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId },
    )
    if (beforeSecondTest.kind !== 'available')
      throw new Error(`owner_test_r2_readback_kind:${beforeSecondTest.kind}`)
    const secondOfferingBeforeTest = beforeSecondTest.offerings.find(
      (offering) => offering.offeringRef === offeringRef,
    )
    expect(secondOfferingBeforeTest?.publication?.publicationRevision).toBe(
      republished.revision,
    )
    expect(secondOfferingBeforeTest?.stepStates.test).toBe('in_progress')

    await expect(
      backend.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r2',
        publicationRevision: republished.revision,
        operationRef: republished.operationRef,
        taskDigest: 'owner-test-task:r2',
        evidenceRefs: ['owner-test:evidence:r2'],
      }),
    ).resolves.toEqual({ kind: 'recorded' })
    const afterSecondTest = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId },
    )
    if (afterSecondTest.kind !== 'available')
      throw new Error(`owner_test_r2_completion_kind:${afterSecondTest.kind}`)
    expect(
      afterSecondTest.offerings.find(
        (offering) => offering.offeringRef === offeringRef,
      )?.stepStates.test,
    ).toBe('completed')
  })
})

describe('owner publish reservation authority', () => {
  it('requires a verified owner principal and rejects changed material before draft effects', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await createPublishedBusinessOwner(backend, 'reservation-owner')
    const principal = await seedSupplyAgentPrincipal(backend, 'user_reservation-owner', 'one')
    const command = {
      businessId,
      offeringRef: 'offering:reservation',
      offeringRevision: 1,
      offeringSourceHash: 'source:reservation',
      materialDigest: 'sha256:' + '1'.repeat(64),
      operationKey: 'supply.publish:reservation:one',
      correlationId: 'supply.publish:reservation:one',
      reasonCode: 'supply.publish',
      evidenceRefs: ['evidence:reservation:one'],
      agentPrincipal: principal,
    }
    const forged = {
      ...principal,
      principalId: 'principal:supply-reservation:forged',
      ownerId: 'user_other-owner',
      credentialId: 'credential:supply-reservation:forged',
    }
    await expect(
      backend.mutation(
        api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
        await withSourceWrite('catalog_publish', {
          ...command,
          agentPrincipal: forged,
        }),
      ),
    ).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })

    await expect(
      backend.mutation(
        api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
        await withSourceWrite('catalog_publish', command),
      ),
    ).resolves.toEqual({ kind: 'reserved' })
    await expect(
      backend.mutation(
        api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
        await withSourceWrite('catalog_publish', command),
      ),
    ).resolves.toEqual({ kind: 'replayed' })
    await expect(
      backend.mutation(
        api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
        await withSourceWrite('catalog_publish', {
          ...command,
          materialDigest: 'sha256:' + '2'.repeat(64),
          evidenceRefs: ['evidence:reservation:changed'],
        }),
      ),
    ).resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })

    const state = await backend.run(async (ctx) => ({
      operations: await ctx.db.query('operationKeys').collect(),
      drafts: [] as ReadonlyArray<never>,
    }))
    expect(state.operations.filter((row) => row.operationName === 'reserveOwnerCapabilityPublication')).toHaveLength(1)
    expect(state.drafts).toHaveLength(0)
  })
})

describe('owner source draft persistence', () => {
  afterEach(() => vi.useRealTimers())

  it('isolates drafts by owner and preserves the latest preflight evidence', async () => {
    vi.useFakeTimers()
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'draft-owner',
    )
    const { owner: otherOwner } = await createPublishedBusinessOwner(
      backend,
      'draft-other',
    )
    const offeringRef = 'catalog-offering:draft-owner'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:draft-owner:v1',
    )
    const missingSourceRevisionJson = JSON.stringify({
      ...openApiSource(),
      evidenceRefs: ['source:owner:lookup'],
    })
    await expect(
      owner.mutation(
        api.capabilitySupplyOwnerFunnel.saveOwnerSourceDraft,
        await withSourceWrite('catalog_publish', {
          businessId,
          offeringRef,
          offeringRevision: 1,
          expectedRevision: 0,
          operationKey: 'owner-source-draft:missing-revision',
          correlationId: 'owner-source-draft:missing-revision',
          sourceJson: missingSourceRevisionJson,
        }),
      ),
    ).resolves.toEqual({ kind: 'refused', reason: 'source_invalid' })
    const sourceJson = JSON.stringify({
      ...openApiSource(),
      sourceRevision: 'owner-api/2026-08-09',
      evidenceRefs: ['source:owner:lookup'],
    })

    const saved = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSourceDraft,
      await withSourceWrite('catalog_publish', {
        businessId,
        offeringRef,
        offeringRevision: 1,
        expectedRevision: 0,
        operationKey: 'owner-source-draft:one',
        correlationId: 'owner-source-draft:one',
        sourceJson,
      }),
    )
    expect(saved.kind).toBe('saved')
    if (saved.kind !== 'saved') throw new Error('draft_save_failed')
    await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
    const readback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSourceDraft,
      { businessId, offeringRef },
    )
    expect(readback).toMatchObject({
      kind: 'available',
      businessId,
      offeringRef,
      revision: 1,
      sourceDigest: saved.sourceDigest,
      preflight: {
        draftRevision: 1,
      },
    })
    if (readback.kind !== 'available') throw new Error('draft_readback_missing')
    expect((JSON.parse(readback.sourceJson) as Record<string, unknown>).sourceRevision).toBe('owner-api/2026-08-09')
    expect(readback.preflight.status).toBe('prepared')
    expect(readback.preflight.evidenceRefs).toEqual(['source:owner:lookup'])
    await expect(
      otherOwner.query(api.capabilitySupplyOwnerFunnel.readOwnerSourceDraft, {
        businessId,
        offeringRef,
      }),
    ).resolves.toEqual({ kind: 'not_found' })
    await expect(
      otherOwner.mutation(
        api.capabilitySupplyOwnerFunnel.saveOwnerSourceDraft,
        await withSourceWrite('catalog_publish', {
          businessId,
          offeringRef,
          offeringRevision: 1,
          expectedRevision: 0,
          operationKey: 'owner-source-draft:wrong-owner',
          correlationId: 'owner-source-draft:wrong-owner',
          sourceJson,
        }),
      ),
    ).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
  })
  it('persists bounded OpenAPI outcomes through the owner preflight mutation', async () => {
    vi.useFakeTimers()
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'draft-outcomes',
    )
    const offeringRef = 'catalog-offering:draft-outcomes'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:draft-outcomes:v1',
    )
    const saved = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSourceDraft,
      await withSourceWrite('catalog_publish', {
        businessId,
        offeringRef,
        offeringRevision: 1,
        expectedRevision: 0,
        operationKey: 'owner-source-draft:outcomes',
        correlationId: 'owner-source-draft:outcomes',
        sourceJson: JSON.stringify({
          ...openApiSource(),
          sourceRevision: 'owner-api/2026-08-09',
        }),
      }),
    )
    if (saved.kind !== 'saved') throw new Error('draft_save_failed')
    await backend.finishAllScheduledFunctions(() => vi.runAllTimers())

    const openApi = {
      sourceDigest: saved.sourceDigest,
      truncated: false,
      outcomes: [
        {
          selector: { path: '/lookup', method: 'post' },
          kind: 'executable' as const,
        },
        {
          selector: { path: '/admin', method: 'get' },
          kind: 'unsafe' as const,
          reason: 'target_not_public' as const,
        },
      ],
    }
    await expect(
      owner.mutation(
        api.capabilitySupplyOwnerFunnel.recordOwnerSourceDraftPreflight,
        await withSourceWrite('catalog_publish', {
          businessId,
          offeringRef,
          expectedRevision: saved.revision,
          sourceDigest: saved.sourceDigest,
          status: 'prepared',
          openApi,
          evidenceRefs: ['source:owner:lookup'],
          operationKey: 'owner-source-preflight:outcomes',
          correlationId: 'owner-source-preflight:outcomes',
        }),
      ),
    ).resolves.toBe(true)

    const readback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSourceDraft,
      { businessId, offeringRef },
    )
    if (readback.kind !== 'available') throw new Error('draft_readback_missing')
    expect(readback.preflight.openApi).toEqual(openApi)
  })

  it('returns same-operation replay and rejects an unexpected draft revision', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'draft-replay',
    )
    const offeringRef = 'catalog-offering:draft-replay'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:draft-replay:v1',
    )
    const sourceJson = JSON.stringify({
      ...openApiSource(),
      sourceRevision: 'owner-api/2026-08-09',
    })
    const input = {
      businessId,
      offeringRef,
      offeringRevision: 1,
      expectedRevision: 0,
      operationKey: 'owner-source-draft:replay',
      correlationId: 'owner-source-draft:replay',
      sourceJson,
    }
    const first = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSourceDraft,
      await withSourceWrite('catalog_publish', input),
    )
    const replay = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSourceDraft,
      await withSourceWrite('catalog_publish', input),
    )
    expect(replay).toEqual({
      kind: 'replayed',
      revision: 1,
      sourceDigest: first.kind === 'saved' ? first.sourceDigest : '',
      preflightStatus: 'pending',
    })
    await expect(
      owner.mutation(
        api.capabilitySupplyOwnerFunnel.saveOwnerSourceDraft,
        await withSourceWrite('catalog_publish', {
          ...input,
          operationKey: 'owner-source-draft:conflict',
          correlationId: 'owner-source-draft:conflict',
        }),
      ),
    ).resolves.toEqual({ kind: 'revision_conflict', revision: 1 })
  })

  it('does not let an older scheduled preflight overwrite a newer draft', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'draft-stale',
    )
    const offeringRef = 'catalog-offering:draft-stale'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:draft-stale:v1',
    )
    const firstSourceJson = JSON.stringify({
      ...openApiSource(),
      sourceRevision: 'owner-api/2026-08-09',
    })
    const secondSourceJson = JSON.stringify({
      ...openApiSource('owner.lookup.changed'),
      sourceRevision: 'owner-api/2026-08-10',
    })
    const first = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSourceDraft,
      await withSourceWrite('catalog_publish', {
        businessId,
        offeringRef,
        offeringRevision: 1,
        expectedRevision: 0,
        operationKey: 'owner-source-draft:stale-one',
        correlationId: 'owner-source-draft:stale-one',
        sourceJson: firstSourceJson,
      }),
    )
    if (first.kind !== 'saved') throw new Error('first_draft_save_failed')
    const firstDraftId = 'draft:unlisted'
    const second = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSourceDraft,
      await withSourceWrite('catalog_publish', {
        businessId,
        offeringRef,
        offeringRevision: 1,
        expectedRevision: 1,
        operationKey: 'owner-source-draft:stale-two',
        correlationId: 'owner-source-draft:stale-two',
        sourceJson: secondSourceJson,
      }),
    )
    expect(second).toMatchObject({ kind: 'saved', revision: 2 })
    const stale = await backend.mutation(
      internal.capabilitySupplyOwnerFunnel.recordSourceDraftPreflight,
      {
        draftId: firstDraftId,
        expectedRevision: 1,
        sourceDigest: first.sourceDigest,
        status: 'prepared',
        summary: {
          sourceKind: 'openapi_http',
          sourceRevision: 'owner-api/2026-08-09',
          sourceDigest: first.sourceDigest,
          priceDigest: 'sha256:stale',
          preparedDigest: 'sha256:stale',
        },
        evidenceRefs: ['stale:evidence'],
      },
    )
    expect(stale).toBe(false)
    const row = await backend.run(async () => null as {
      revision: number
      preflight: { draftRevision: number; sourceDigest: string }
    } | null)
    expect(row).toBeNull()
  })
})
