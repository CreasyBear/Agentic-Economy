import { describe, expect, it, vi } from 'vitest'

import { executeKeylessOperation } from '@/modules/capability-execution/operation-execute.server'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import type { CapabilityTransportAuthority } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  prepareCapabilityPublicationMutation,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import {
  rebuildCapabilityOriginSupplyProjection,
  setCapabilitySupplyEligibilityCommand,
} from '../../convex/capabilitySupply'
import type { EligibilityInput, RegistrationContext } from '@/modules/capability-supply/public'
import { withSourceWrite } from '../helpers/source-write-admission'

type PublicationFixtureInput = Parameters<typeof prepareCapabilityPublicationMutation>[1]
type EffectClass = 'data_release' | 'financial_exposure' | 'external_state_change'

const KEYLESS_AUTHORITY: CapabilityTransportAuthority = { kind: 'keyless' }

async function runEligibility(
  backend: ConvexFixtureBackend,
  args: EligibilityInput & RegistrationContext,
  actorRef: string,
) {
  return await backend.run(async (ctx) => {
    const now = Date.now()
    const result = await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'admin', ref: actorRef },
      eligibility: args,
      context: args,
    }, now)
    if (result.kind === 'eligible' || result.kind === 'ineligible') {
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (index) => index.eq('offeringId', args.offeringId)).unique()
      if (offering !== null) await rebuildCapabilityOriginSupplyProjection(ctx, offering.businessId, now)
    }
    return result
  })
}

async function publishKeyless(
  backend: ConvexFixtureBackend,
  suffix: string,
  options: Readonly<{
    method: 'GET' | 'POST'
    effectClass: EffectClass
    endpointPath?: string
    pathParameter?: boolean
    priceUnits?: string
  }>,
) {
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  const endpointPath = options.endpointPath ?? '/lookup'
  await seedCatalogOffering(backend, businessId, suffix, endpointPath, options.method)
  const input = publicationInput(businessId, suffix, options)
  const prepared = await prepareCapabilityPublicationMutation(backend, input)
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await withSourceWrite('catalog_publish', prepared),
  )
  if ('reason' in published) throw new Error(`publication_refused:${published.reason}`)

  await ownerAdmin(backend, `user_capability_operations_observer_${suffix}`)
  const hashes = await backend.run(async (ctx) => {
    const offering = await ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', published.offeringId))
      .unique()
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', published.bindingId))
      .unique()
    if (offering === null || binding === null) throw new Error('publication_supply_missing')
    return { offering: offering.registrationHash, binding: binding.registrationHash }
  })
  const admitted = await runEligibility(backend, {
    offeringId: published.offeringId,
    bindingId: published.bindingId,
    contractRef: published.contractRef,
    decision: 'admit',
    expectedOfferingRegistrationHash: hashes.offering,
    expectedBindingRegistrationHash: hashes.binding,
    admissionEvidenceRefs: [`test:admission:${suffix}`],
    conformanceEvidenceRefs: [`test:conformance:${suffix}`],
    operationKey: `op:capability-operations:admit:${suffix}`,
    correlationId: `corr:capability-operations:admit:${suffix}`,
    reasonCode: 'business_capability_publication',
    evidenceRefs: ['test:capability-operations'],
  }, `user_capability_operations_observer_${suffix}`)
  if (admitted.kind !== 'eligible') throw new Error(`eligibility_refused:${admitted.kind}`)
  await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef,
    expectedRevision: published.publicationRevision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 300_000,
    operationKey: `op:capability-operations:ready:${suffix}`,
    correlationId: `corr:capability-operations:ready:${suffix}`,
    reasonCode: 'business_capability_publication',
    evidenceRefs: ['test:capability-operations'],
  })
  return published
}
function publicationInput(
  businessId: Id<'businesses'>,
  suffix: string,
  options: Readonly<{
    method: 'GET' | 'POST'
    effectClass: EffectClass
    endpointPath?: string
    pathParameter?: boolean
    priceUnits?: string
  }>,
): PublicationFixtureInput {
  const endpointPath = options.endpointPath ?? '/lookup'
  const path = options.pathParameter
    ? [{ inputPointer: '/request', parameter: 'id', required: true, style: 'simple' as const, explode: false }]
    : undefined
  const effects = [
    {
      effectId: 'request_release',
      class: 'data_release' as const,
      authority: 'mandate_or_explicit' as const,
      reversibility: 'irreversible' as const,
    },
    ...(options.effectClass === 'data_release'
      ? []
      : [{
        effectId: 'unsafe_effect',
        class: options.effectClass,
        authority: 'explicit' as const,
        reversibility: options.effectClass === 'external_state_change' ? 'reversible' as const : 'irreversible' as const,
      }]),
  ]
  return {
    businessId,
    source: {
      kind: 'ae_envelope',
      documentJson: JSON.stringify(capabilityContractV2({
        capabilityId: `keyless.${suffix}`,
        name: `${suffix} keyless operation`,
        effects,
      })),
    },
    offering: {
      offeringId: `offering:keyless:${suffix}`,
      networkId: 'ae:public',
      presentation: {
        label: `${suffix} keyless operation`,
        summary: 'Returns one structured result.',
        price: { kind: 'fixed', amount: { currency: 'AUD', units: options.priceUnits ?? '1200', exponent: 2 } },
        materialTerms: [],
        commercialRelationship: {
          kind: 'none', summary: 'No commercial influence.',
          influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
          evidenceRefs: ['test:commercial-neutrality'],
        },
      },
      searchTerms: ['keyless', suffix],
      registrationEvidenceRefs: ['test:offering'],
    },
    binding: {
      bindingId: `binding:keyless:${suffix}`,
      endpointUrl: `https://${suffix}.example.test${endpointPath}`,
      authority: KEYLESS_AUTHORITY,
      continuation: { kind: 'single_response', evidenceRefs: ['test:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['test:no-cancellation'] },
      adapter: {
        adapterId: 'http-json:v1',
        config: {
          method: options.method,
          ...(path === undefined ? {} : { path }),
          requestTimeoutMs: 5_000,
        },
      },
      registrationEvidenceRefs: ['test:binding'],
    },
    operationKey: `op:capability-operations:publish:${suffix}`,
    correlationId: `corr:capability-operations:publish:${suffix}`,
    reasonCode: 'business_capability_publication',
    evidenceRefs: ['test:capability-operations'],
  } as PublicationFixtureInput
}

async function seedCatalogOffering(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  suffix: string,
  endpointPath: string,
  method: 'GET' | 'POST',
): Promise<void> {
  await backend.run(async (ctx) => {
    const offeringRef = `catalog-offering:keyless:${suffix}`
    const offeringSourceHash = `catalog-source:keyless:${suffix}`
    const accessPathRef = `access:keyless:${suffix}`
    const descriptor = {
      kind: 'external_operation' as const,
      name: `${suffix} keyless operation`,
      summary: 'Returns one structured result.',
      url: `https://${suffix}.example.test${endpointPath}`,
      method,
      provenance: 'business_declared' as const,
    }
    await ctx.db.insert('businessOfferings', {
      offeringRef, businessId, currentRevision: 1, status: 'published', createdAt: 1, updatedAt: 1,
    })
    await ctx.db.insert('businessOfferingRevisions', {
      offeringRef, businessId, revision: 1,
      name: `${suffix} keyless operation`, category: 'Data', summary: 'Returns one structured result.',
      sourceHash: offeringSourceHash, createdAt: 1,
    })
    await ctx.db.insert('offeringAccessPaths', {
      accessPathRef, businessId, offeringRef, offeringRevision: 1, offeringSourceHash,
      status: 'published', descriptor,
      sourceHash: canonicalDigest({ accessPathRef, offeringSourceHash, descriptor }),
      createdAt: 1, updatedAt: 1,
    })
  })
}

function sourceFor(backend: ConvexFixtureBackend): KeylessExecutableSourcePort {
  return {
    list: async () => [],
    search: async () => [],
    read: async (operationRef) => {
      const row = await backend.query(api.capabilitySupplyOperations.readKeylessExecutable, { operationRef })
      if (row === null) return null
      return {
        ...row,
        inputSchema: JSON.parse(row.inputSchemaJson) as Record<string, unknown>,
        ...(row.outputSchemaJson === undefined ? {} : { outputSchema: JSON.parse(row.outputSchemaJson) as Record<string, unknown> }),
      }
    },
  }
}

describe('keyless operation projection', () => {
  it('runs the registered keyless read query and excludes effectful POST before provider transport', async () => {
    const backend = convexTestWithMarketComponents()
    for (const [suffix, effectClass] of [
      ['effectful-post-state', 'external_state_change'],
      ['effectful-post-financial', 'financial_exposure'],
    ] as const) {
      const published = await publishKeyless(backend, suffix, {
        method: 'POST', effectClass,
      })
      const listed = await backend.query(api.capabilitySupplyOperations.listKeylessExecutable, {})
      expect(listed.some(({ operationRef }) => operationRef === published.operationRef)).toBe(false)
      await expect(backend.query(api.capabilitySupplyOperations.readKeylessExecutable, {
        operationRef: published.operationRef,
      })).resolves.toBeNull()

      const providerFetch = vi.fn(async () => new Response(JSON.stringify({ result: 'must-not-run' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      const executed = await executeKeylessOperation(
        { operationRef: published.operationRef, input: { request: 'unsafe' } },
        sourceFor(backend),
        { fetchImpl: providerFetch, isPublicTarget: async () => true },
      )
      expect(executed).toEqual({ kind: 'refused', operationRef: published.operationRef, reason: 'operation_not_found' })
      expect(providerFetch).not.toHaveBeenCalled()
    }
  })

  it('keeps data-release-only POST executable', async () => {
    const backend = convexTestWithMarketComponents()
    const published = await publishKeyless(backend, 'data-post', {
      method: 'POST', effectClass: 'data_release', priceUnits: '0',
    })
    const listed = await backend.query(api.capabilitySupplyOperations.listKeylessExecutable, {})
    expect(listed.some(({ operationRef }) => operationRef === published.operationRef)).toBe(true)
    await expect(backend.query(api.capabilitySupplyOperations.readKeylessExecutable, {
      operationRef: published.operationRef,
    })).resolves.toMatchObject({ operationRef: published.operationRef, method: 'POST' })

    const providerFetch = vi.fn(async () => new Response(JSON.stringify({ result: 'safe' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    await expect(executeKeylessOperation(
      { operationRef: published.operationRef, input: { request: 'safe' } },
      sourceFor(backend),
      { fetchImpl: providerFetch, isPublicTarget: async () => true },
    )).resolves.toMatchObject({ kind: 'ok', operationRef: published.operationRef })
    expect(providerFetch).toHaveBeenCalledTimes(1)
  })
  it('omits a current keyless publication when its stored operation ref drifts', async () => {
    const backend = convexTestWithMarketComponents()
    const published = await publishKeyless(backend, 'operation-ref-drift', {
      method: 'POST',
      effectClass: 'data_release',
      priceUnits: '0',
    })
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', published.publicationRef).eq('revision', published.publicationRevision)
        ))
        .unique()
      if (publication === null) throw new Error('published_publication_missing')
      await ctx.db.patch(publication._id, { operationRef: `${published.operationRef}:stored-drift` })
    })

    const listed = await backend.query(api.capabilitySupplyOperations.listKeylessExecutable, {})
    expect(listed.some(({ operationRef }) => operationRef === published.operationRef)).toBe(false)
    await expect(backend.query(api.capabilitySupplyOperations.readKeylessExecutable, {
      operationRef: published.operationRef,
    })).resolves.toBeNull()
  })

  it('excludes a paid keyless operation from direct list, read, and execution', async () => {
    const backend = convexTestWithMarketComponents()
    const published = await publishKeyless(backend, 'paid-keyless', {
      method: 'POST', effectClass: 'data_release', priceUnits: '0',
    })
    await backend.run(async (ctx) => {
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', published.offeringId))
        .unique()
      if (offering === null) throw new Error('published_offering_missing')
      await ctx.db.patch(offering._id, {
        presentation: {
          ...offering.presentation,
          price: { kind: 'fixed', amount: { currency: 'AUD', units: '1200', exponent: 2 } },
        },
      })
    })
    const listed = await backend.query(api.capabilitySupplyOperations.listKeylessExecutable, {})
    expect(listed.some(({ operationRef }) => operationRef === published.operationRef)).toBe(false)
    await expect(backend.query(api.capabilitySupplyOperations.readKeylessExecutable, {
      operationRef: published.operationRef,
    })).resolves.toBeNull()

    const providerFetch = vi.fn()
    await expect(executeKeylessOperation(
      { operationRef: published.operationRef, input: { request: 'paid' } },
      sourceFor(backend),
      { fetchImpl: providerFetch, isPublicTarget: async () => true },
    )).resolves.toEqual({ kind: 'refused', operationRef: published.operationRef, reason: 'operation_not_found' })
    expect(providerFetch).not.toHaveBeenCalled()
  })

  it('projects admitted path parameter braces without decoding reserved path bytes', async () => {
    const backend = convexTestWithMarketComponents()
    const published = await publishKeyless(backend, 'path-template', {
      method: 'GET',
      effectClass: 'data_release',
      endpointPath: '/users/%2F{id}%3F',
      pathParameter: true,
    })
    const detail = await backend.query(api.capabilitySupplyOperations.detail, {
      operationRef: published.operationRef,
    })
    expect(detail.kind).toBe('found')
    if (detail.kind !== 'found') return
    expect(detail.operation.transport.pathTemplate).toBe('/users/%2F{id}%3F')
  })
})
