import type { FunctionArgs } from 'convex/server'
import { validatePaymentRequired } from '@x402/core/schemas'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
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
  isAdapterConfig,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'

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
  return {
    kind: 'prepared' as const,
    command: (await withSourceWrite('catalog_publish', {
      businessId,
      offeringRef,
      revision,
      sourceHash,
      runtimeEnvironment: 'production',
      prepared: preparedMaterial,
      operationKey,
      correlationId: `owner-supply:${offeringRef}`,
      reasonCode: 'owner_supply_publication',
      evidenceRefs: [...source.evidenceRefs],
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

export function x402Source(): Extract<
  CapabilityPublicationImport,
  { kind: 'x402' }
> {
  const endpoint = 'https://provider.example/paid-lookup'
  const price = { currency: 'USD', units: '100', exponent: 2 }
  const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  const payTo = '0xbA667287B8Ef89565F8fD7AcD4d22Ce98E0f39cd'
  const paymentRequired = validatePaymentRequired({
    x402Version: 2,
    resource: { url: endpoint },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',
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
      network: 'eip155:8453',
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
  const principal = {
    principalId: `principal:supply-reservation:${suffix}`,
    ownerId,
    credentialId: `credential:supply-reservation:${suffix}`,
    applicationRef: 'agentic-economy',
    environment: 'production' as const,
    scopes: ['market_supply:manage'],
    authorityMode: 'bounded_mandate' as const,
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
