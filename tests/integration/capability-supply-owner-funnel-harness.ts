import type { FunctionArgs } from 'convex/server'
import { validatePaymentRequired } from '@x402/core/schemas'
import { expect } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { toRow as providerConnectionRow } from '../../convex/lib/providerConnections/codecs'
import { createX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  x402SellerClaimDigest,
} from '@/modules/capability-supply/public'
import type { Id } from '../../convex/_generated/dataModel'
import {
  preparePublicationDraft,
  X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { agentAccessPolicyDigest } from '@/modules/agent-access/policy'
import { isRecord } from '@/modules/common/is-record'
import { rescaleExactAmount } from '@/modules/money/public'
import {
  capabilityContractV2,
  objectSchema,
} from '../fixtures/capability-contract-v2'
import {
  isAdapterConfig,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import { withDefinedPrice } from './capability-publication-harness'

type CatalogOfferingOrigin = Extract<
  NonNullable<CapabilityPublicationOfferingDraft['origin']>,
  { kind: 'catalog_offering' }
>

type PublishPreparedCapabilityArgs = FunctionArgs<
  typeof api.capabilitySupply.publishPreparedCapability
>
export async function prepareOwnerPublicationCommand(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  offeringRef: string,
  revision: number,
  sourceHash: string,
  source: CapabilityPublicationImport,
  operationKey: string,
  origin?: CatalogOfferingOrigin,
  runtimeEnvironment: 'production' | 'sandbox' = 'production',
) {
  const offering =
    source.kind === 'ae_envelope' ? source.offering : source.commercial.offering
  const price = offering.presentation.price
  let pricingConfig
  let preparedOffering: CapabilityPublicationOfferingDraft | undefined
  if (source.kind === 'x402') {
    if (!isRecord(source.resource)) throw new Error('owner_publication_fixture_x402_resource_invalid')
    const paymentRequired = validatePaymentRequired(source.resource.paymentRequired)
    const requirement = paymentRequired.accepts[0]
    if (requirement === undefined) throw new Error('owner_publication_fixture_x402_requirement_missing')
    pricingConfig = {
      version: 'pricing:v3' as const,
      kind: 'managed_x402' as const,
      effectTiming: 'payment_required_before_effect' as const,
      sourceRequirement: {
        network: requirement.network,
        asset: requirement.asset,
        atomicUnits: 'amount' in requirement ? requirement.amount : requirement.maxAmountRequired,
      },
      pricingPolicyRef: 'pricing-policy:sandbox-managed-x402:v1',
      publicDisplay: 'on_request' as const,
    }
    preparedOffering = {
      ...offering,
      presentation: {
        ...offering.presentation,
        price: { kind: 'on_request' as const },
      },
    }
  } else {
    if (price === undefined || price.kind !== 'fixed') throw new Error('owner_publication_fixture_price_missing')
    const audPrice = rescaleExactAmount(price.amount, 6)
    if (audPrice === undefined || audPrice.currency !== 'AUD') {
      throw new Error('owner_publication_fixture_aud_price_invalid')
    }
    pricingConfig = {
      version: 'pricing:v3' as const,
      kind: 'fixed_aud' as const,
      currency: 'AUD' as const,
      exponent: 6 as const,
      amountUnits: audPrice.units,
    }
  }
  const sourceRevision = 'owner-api/2026-08-09'
  const prepared = await preparePublicationDraft({
    source,
    sourceRevision,
    pricingConfig,
    ...(preparedOffering === undefined ? {} : { offering: preparedOffering }),
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
      presentation: withDefinedPrice({
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
      }),
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
    kind: 'prepared' as const,
    command: (await withSourceWrite('catalog_publish', {
      businessId,
      offeringRef,
      revision,
      sourceHash,
      runtimeEnvironment,
      prepared: preparedMaterial,
      operationKey,
      proof: {
        reverificationId: `test:${canonicalDigest({ operationKey })}`,
        firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: -1,
      },
      correlationId: `owner-supply:${offeringRef}`,
      reasonCode: 'owner_supply_publication',
      evidenceRefs: [
        ...source.evidenceRefs,
        ...(runtimeEnvironment === 'sandbox' && source.kind === 'x402'
          ? [X402_SELLER_CANARY_ADMISSION_REQUIRED_REF]
          : []),
      ],
    })) satisfies PublishPreparedCapabilityArgs,
  }
}

export function openApiSource(
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
      authority: { kind: 'public_upstream' as const },
      registrationEvidenceRefs: ['registration:owner:lookup'],
      requestTimeoutMs: 5_000,
    },
    evidenceRefs: ['source:owner:lookup'],
  }
}

export function x402Source(environment: 'sandbox' | 'production' = 'production', endpoint = 'https://provider.example/paid-lookup'): Extract<
  CapabilityPublicationImport,
  { kind: 'x402' }
> {
  const price = { currency: 'USD', units: '100', exponent: 2 }
  const asset = environment === 'sandbox'
    ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  const network = environment === 'sandbox' ? 'eip155:84532' : 'eip155:8453'
  const payTo = '0xbA667287B8Ef89565F8fD7AcD4d22Ce98E0f39cd'
  const paymentRequired = validatePaymentRequired({
    x402Version: 2,
    resource: { url: endpoint },
    accepts: [{
      scheme: 'exact',
      network,
      amount: '1000000',
      asset,
      payTo,
      maxTimeoutSeconds: 60,
      extra: { name: 'USD Coin', version: '2' },
    }],
  })
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
      price,
      scheme: 'exact',
      network,
      asset,
      payTo,
      routeAmountExponent: 2,
      assetAmountExponent: 6,
      paymentRequired,
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
      offering: ownerOffering(undefined, price),
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

export function directSource(
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
      authority: { kind: 'public_upstream' as const },
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
  price: { currency: string; units: string; exponent: number } = {
    currency: 'AUD',
    units: '100',
    exponent: 2,
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
        amount: price,
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

export async function createPublishedBusinessOwner(
  backend: ConvexFixtureBackend,
  slug: string,
) {
  const published = await publishedBusinessOwner(backend, slug)
  await backend.run(async (ctx) => {
    await ctx.db.patch(published.businessId, {
      businessContext: {
        kind: 'programmable_provider',
        website: 'https://provider.example',
        providerIdentifier: `provider:${slug}`,
      },
    })
  })
  return published
}
export async function seedSupplyAgentPrincipal(
  backend: ConvexFixtureBackend,
  ownerId: string,
  suffix: string,
) {
  const canonicalSuffix = canonicalDigest({
    format: 'supply-agent-principal-fixture:v1',
    ownerId,
    suffix,
  }).slice('sha256:'.length, 'sha256:'.length + 32)
  const principal = {
    principalId: `prn_${canonicalSuffix}`,
    ownerId,
    credentialId: `credential:supply-reservation:${suffix}`,
    applicationRef: 'agentic-economy',
    environment: 'production' as const,
    scopes: ['market_supply:manage'],
    authorityMode: 'spending_policy' as const,
  }
  const now = Date.now()
  const amount = { currency: 'USD', units: '0', exponent: 2 }
  const policy = {
    format: 'ae.agent-access-policy:v2' as const,
    toolAccess: 'all_admitted' as const,
    toolRefs: [],
    environment: 'production' as const,
    budget: {
      budgetPolicyRef: `budget-policy:supply-reservation:${suffix}`,
      generation: 1,
      currency: 'USD',
      exponent: 2,
      maximumSpendPerCall: amount,
      maximumDailySpend: amount,
      maximumMonthlySpend: amount,
      maximumConcurrentCalls: 4,
    },
    rate: {
      ratePolicyRef: `rate-policy:supply-reservation:${suffix}`,
      generation: 1,
      maximumCallsPerMinute: 100,
      maximumCallsPerHour: 1_000,
    },
  }
  const grant = {
    format: 'ae.agent-access-grant:v2' as const,
    grantRef: `grt_${canonicalSuffix}`,
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    applicationRef: principal.applicationRef,
    credentialId: principal.credentialId,
    environment: principal.environment,
    toolAccess: 'all_admitted' as const,
    toolRefs: [],
    authorityMode: principal.authorityMode,
    spendingPolicy: policy,
    budgetPolicyRef: policy.budget.budgetPolicyRef,
    ratePolicyRef: policy.rate.ratePolicyRef,
    lifecycle: 'active' as const,
    generation: 1,
    spendingPolicyDigest: agentAccessPolicyDigest(policy),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1_000,
  }
  await backend.run(async (ctx) => {
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', ownerId))
      .unique()
    if (account === null) throw new Error('supply_reservation_account_missing')
    const ownership = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
      .unique()
    if (ownership === null) throw new Error('supply_reservation_ownership_missing')
    await ctx.db.insert('principals', {
      principalRef: principal.principalId,
      kind: 'agent',
      displayName: `Supply Agent ${suffix}`,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('memberships', {
      membershipRef: `mbr_${canonicalSuffix}`,
      accountRef: ownerId,
      memberPrincipalRef: principal.principalId,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      createdBy: {
        actorPrincipalRef: ownership.ownerPrincipalRef,
        activeAccountRef: ownerId,
        correlationRef: `fixture:${grant.grantRef}`,
        idempotencyRef: `fixture:${grant.grantRef}`,
      },
    })
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef: grant.grantRef,
      accountRef: ownerId,
      actorPrincipalRef: ownership.ownerPrincipalRef,
      subjectPrincipalRef: principal.principalId,
      scopes: ['market_supply:manage'],
      resourceRefs: ['*'],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: grant.expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: now,
      createdBy: {
        actorPrincipalRef: ownership.ownerPrincipalRef,
        activeAccountRef: ownerId,
        correlationRef: `fixture:${grant.grantRef}`,
        idempotencyRef: `fixture:${grant.grantRef}`,
      },
    })
  })
  const recorded = await backend.mutation(internal.agentAccessPrincipals.recordAgentPrincipal, {
    ...principal,
    scopes: [...principal.scopes],
    ownerTokenIdentifier: `token:supply-reservation:${suffix}`,
    grantGeneration: 1,
    spendingPolicyDigest: grant.spendingPolicyDigest,
    lifecycle: 'active',
    seenAt: now,
  })
  if (recorded.kind !== 'recorded') throw new Error(`supply_reservation_principal_failed:${recorded.kind}`)
  const granted = await backend.mutation(internal.agentAccessPolicy.upsertGrant, { grant })
  if (granted.kind !== 'recorded') throw new Error(`supply_reservation_grant_failed:${granted.kind}`)
  return principal
}

export async function seedCatalogOffering(
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

const DEFAULT_X402_PAY_TO = '0xbA667287B8Ef89565F8fD7AcD4d22Ce98E0f39cd'

export function x402SourceForConnection(
  endpoint: string,
  connectionRef: string,
  providerRef: string,
  pricing: Readonly<{
    price?: { currency: 'USD'; units: string; exponent: number }
    routeAmountExponent?: number
    assetAmount?: string
  }> = {},
) {
  const source = x402Source('sandbox', endpoint)
  if (!isRecord(source.resource)) throw new Error('owner_publication_x402_resource_invalid')
  const payTo = source.resource.payTo as string
  const price = pricing.price ?? { currency: 'USD', units: '1', exponent: 2 }
  const paymentRequired = validatePaymentRequired({
    x402Version: 2,
    resource: { url: endpoint },
    accepts: [{
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      amount: pricing.assetAmount ?? '10000',
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo,
      maxTimeoutSeconds: 60,
      extra: {
        name: 'USD Coin',
        version: '2',
        assetTransferMethod: 'eip3009',
      },
    }],
  })
  return {
    ...source,
    resource: {
      ...source.resource,
      price,
      routeAmountExponent: pricing.routeAmountExponent ?? source.resource.routeAmountExponent,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      paymentRequired,
    },
    commercial: {
      ...source.commercial,
      offering: {
        ...source.commercial.offering,
        presentation: {
          ...source.commercial.offering.presentation,
          price: { kind: 'fixed' as const, amount: price },
        },
      },
      authority: {
        kind: 'provider_connection' as const,
        connectionRef,
        providerRef,
      },
    },
  }
}

export async function publishOwnerOpenApiCapability(input: Readonly<{
  backend: ConvexFixtureBackend
  businessId: Id<'businesses'>
  owner: ReturnType<ConvexFixtureBackend['withIdentity']>
  offeringRef: string
  sourceHash: string
  capabilityId: string
  operationKey: string
  catalogOrigin: CatalogOfferingOrigin
  observeReadiness?: Readonly<{
    operationKey: string
    correlationId: string
    evidenceRef: string
  }>
}>) {
  const prepared = await prepareOwnerPublicationCommand(
    input.backend,
    input.businessId,
    input.offeringRef,
    1,
    input.sourceHash,
    openApiSource(input.capabilityId),
    input.operationKey,
    input.catalogOrigin,
  )
  if (prepared.kind === 'refused') {
    throw new Error(`publication_prepare_failed:${prepared.reason}`)
  }
  const published = await input.owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    prepared.command,
  )
  if (published.kind === 'refused') {
    throw new Error(`publication_publish_failed:${published.reason}`)
  }
  if (published.kind !== 'published') {
    throw new Error(`publication_publish_replayed_unexpectedly:${published.kind}`)
  }
  if (input.observeReadiness !== undefined) {
    await input.backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: published.publicationRef,
      expectedRevision: published.publicationRevision,
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: Date.now() + 60_000,
      operationKey: input.observeReadiness.operationKey,
      correlationId: input.observeReadiness.correlationId,
      reasonCode: 'readiness_probe',
      evidenceRefs: [input.observeReadiness.evidenceRef],
    })
  }
  return { prepared, published }
}

export async function seedPaidX402Publication(
  backend: ConvexFixtureBackend,
  slug: string,
  overrides: Readonly<{
    endpoint?: string
    providerRef?: string
    payTo?: string
    publisher?: 'owner' | 'agent'
    price?: { currency: 'USD'; units: string; exponent: number }
    routeAmountExponent?: number
    assetAmount?: string
    onPaymentRequired?: (
      paymentRequired: ReturnType<typeof x402SourceForConnection>['resource']['paymentRequired'],
    ) => void
  }> = {},
) {
  const identity = await createPublishedBusinessOwner(backend, slug)
  const offeringRef = `catalog-offering:${slug}`
  const sourceHash = canonicalDigest({ offering: slug, revision: 1 })
  const endpoint = overrides.endpoint ?? 'https://provider.example/paid-lookup'
  const accessPathRef = `access-path:${slug}`
  const accessPathSourceHash = canonicalDigest({ accessPath: slug, revision: 1 })
  const connectionRef = `connection:x402:${slug}`
  const providerRef = overrides.providerRef ?? 'provider:x402:paid-lookup'
  const payTo = overrides.payTo ?? DEFAULT_X402_PAY_TO

  await seedCatalogOffering(backend, identity.businessId, offeringRef, 1, 1, sourceHash)
  await backend.run(async (ctx) => {
    await ctx.db.insert('offeringAccessPaths', {
      accessPathRef,
      businessId: identity.businessId,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
      status: 'published',
      descriptor: {
        kind: 'external_operation',
        name: 'Paid lookup',
        summary: 'Returns one paid lookup result.',
        url: endpoint,
        method: 'POST',
        provenance: 'business_declared',
      },
      sourceHash: accessPathSourceHash,
      createdAt: 1,
      updatedAt: 1,
    })
  })

  const now = Date.now()
  const sellerClaim = {
    businessId: String(identity.businessId),
    endpointUrl: endpoint,
    method: 'POST' as const,
    observationDigest: canonicalDigest({
      kind: 'official-x402-v2-unpaid-inspection',
      endpoint,
      network: BASE_SEPOLIA_NETWORK,
      payTo,
    }),
    payTo,
    expiresAt: now + 5 * 60_000,
  }
  const claimEvidence = `x402-payee-claim:${x402SellerClaimDigest(sellerClaim)}`
  const inspectionEvidence = `x402-endpoint-inspection:${sellerClaim.observationDigest}`
  const createdConnection = createX402ProviderConnection({
    commandId: `connect-${slug}`,
    connectionRef,
    businessId: String(identity.businessId),
    providerRef,
    providerAccountRef: `x402:${endpoint}`,
    resourceUrl: endpoint,
    method: sellerClaim.method,
    payee: sellerClaim.payTo,
    evidenceRefs: [claimEvidence, inspectionEvidence],
    owningAccountRef: identity.canonicalAccountRef,
    installedByPrincipalRef: identity.canonicalPrincipalRef,
    authorityGrantRef: `grant:${slug}`,
    authorityGrantGeneration: 1,
  }, now)
  if (createdConnection.kind !== 'applied') {
    throw new Error(`connection_provision_failed:${createdConnection.kind}`)
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert(
      'capabilityProviderConnections',
      providerConnectionRow(
        createdConnection.connection,
        createdConnection.connection.lastCommandId ?? '',
        createdConnection.commandDigest,
      ),
    )
  })

  const source = x402SourceForConnection(endpoint, connectionRef, providerRef, {
    ...(overrides.price === undefined ? {} : { price: overrides.price }),
    ...(overrides.routeAmountExponent === undefined
      ? {}
      : { routeAmountExponent: overrides.routeAmountExponent }),
    ...(overrides.assetAmount === undefined ? {} : { assetAmount: overrides.assetAmount }),
  })
  overrides.onPaymentRequired?.(source.resource.paymentRequired)
  const prepared = await prepareOwnerPublicationCommand(
    backend,
    identity.businessId,
    offeringRef,
    1,
    sourceHash,
    source,
    `owner-supply:${slug}:publish`,
    {
      kind: 'catalog_offering',
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
      declaredAccessPathRef: accessPathRef,
      accessPathSourceHash,
    },
    'sandbox',
  )
  if (prepared.kind === 'refused') {
    throw new Error(`publication_prepare_failed:${prepared.reason}`)
  }
  const agentPrincipal = overrides.publisher === 'agent'
    ? await seedSupplyAgentPrincipal(backend, identity.canonicalAccountRef, `${slug}:publish`)
    : undefined
  const published = agentPrincipal === undefined
    ? await identity.owner.mutation(
        api.capabilitySupply.stageOwnerX402Capability,
        await withSourceWrite('catalog_publish', (() => {
          const {
            runtimeEnvironment: _runtimeEnvironment,
            proof: _proof,
            sourceWrite: _sourceWrite,
            sourceWriteRequest: _sourceWriteRequest,
            ...unsignedCommand
          } = prepared.command
          return {
            ...unsignedCommand,
            sellerClaim,
            evidenceRefs: [claimEvidence, inspectionEvidence],
            operationKey: `owner-supply:${slug}:stage`,
            correlationId: `owner-supply:${slug}:stage`,
          }
        })()),
      )
    : await backend.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await withSourceWrite('catalog_publish', (() => {
          const {
            proof: _proof,
            sourceWrite: _sourceWrite,
            sourceWriteRequest: _sourceWriteRequest,
            ...unsignedCommand
          } = prepared.command
          return { ...unsignedCommand, agentPrincipal }
        })()),
      )
  if (published.kind === 'refused') {
    throw new Error(`publication_stage_failed:${published.reason}`)
  }

  const readinessObservedAt = Date.now()
  const readinessValidUntil = readinessObservedAt + 3_600_000
  await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef,
    expectedRevision: published.publicationRevision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: readinessValidUntil,
    operationKey: `readiness-probe:${slug}`,
    correlationId: `readiness-probe:${slug}`,
    reasonCode: 'readiness_probe',
    evidenceRefs: [`readiness:probe:${slug}`],
  })
  await backend.run(async (ctx) => {
    const row = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', published.publicationRef)
          .eq('revision', published.publicationRevision)
      ))
      .unique()
    if (row === null) throw new Error('publication_missing_for_readiness')
    await ctx.db.patch(row._id, {
      credentialState: 'ready',
      healthState: 'healthy',
      readinessObservedAt,
      readinessValidUntil,
    })
  })
  await backend.finishAllScheduledFunctions(() => undefined)
  await backend.run(async (ctx) => {
    const row = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', published.publicationRef)
          .eq('revision', published.publicationRevision)
      ))
      .unique()
    if (row === null) throw new Error('publication_missing_after_probe_drain')
    await ctx.db.patch(row._id, {
      credentialState: 'ready',
      healthState: 'healthy',
      readinessObservedAt,
      readinessValidUntil,
    })
  })
  await expect(
    backend.query(
      internal.capabilitySupplyCurrentTool.readExactSellerCanaryOperationSnapshot,
      {
        publicationRef: published.publicationRef,
        revision: published.publicationRevision,
      },
    ),
  ).resolves.not.toBeNull()

  return {
    ...identity,
    offeringRef,
    sourceHash,
    endpoint,
    accessPathRef,
    accessPathSourceHash,
    connectionRef,
    providerRef,
    payTo,
    published,
    sellerClaim,
    claimEvidence,
    inspectionEvidence,
    agentPrincipal,
  }
}
