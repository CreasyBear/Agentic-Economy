import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import type { TestConvex } from 'convex-test'
import type {
  OperationSearchWireResult,
  OperationSurfaceWireDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

type CuratedSeedPublication = Pick<Doc<'capabilityPublications'>, 'capabilityId' | 'publicationRef'>

type OperationItem = Pick<OperationSurfaceWireDescriptor, 'operationRef' | 'contract' | 'availability'>

// Cluster B — keyed HTTP operations. Each requires a real env credential; with no
// key they must be discoverable but NOT ready and NOT buildable into a real plan.
const KEYED_OPS: Readonly<{ capabilityId: string; token: string }[]> = [
  { capabilityId: 'openweathermap.current-weather', token: 'weather' },
  { capabilityId: 'tavily.search', token: 'research' },
  { capabilityId: 'serpapi.google-search', token: 'serp' },
  { capabilityId: 'coingecko.simple-price-demo', token: 'bitcoin' },
]

// Cluster C — observed Agentic-Market x402 listings. They use paid
// provider-connection authority and have no credential secret; they must be
// discoverable but NEVER executable until payment/readiness authority is admitted.
const X402_OPS: Readonly<{ capabilityId: string; token: string }[]> = [
  { capabilityId: 'exa-search-x402', token: 'x402' },
  { capabilityId: 'timezone-convert-x402', token: 'timezone' },
  { capabilityId: 'wolframalpha-query-x402', token: 'wolframalpha' },
  { capabilityId: 'coinmarketcap-quotes-x402', token: 'coinmarketcap' },
  { capabilityId: 'flightaware-nearby-x402', token: 'flightaware' },
  { capabilityId: 'bizintel-forex-rate-x402', token: 'bizintel' },
  { capabilityId: 'tavily-search-x402', token: 'x402' },
]

const X402_CAPABILITY_IDS = X402_OPS.map(({ capabilityId }) => capabilityId)
const KEYED_CAPABILITY_IDS = KEYED_OPS.map(({ capabilityId }) => capabilityId)

async function findOperation(
  backend: TestConvex<typeof schema>,
  capabilityId: string,
  token: string,
): Promise<OperationItem> {
  const res: OperationSearchWireResult = await backend.query(api.capabilitySupplyOperations.search, { query: token, limit: 20 })
  if (res.kind === 'unavailable') throw new Error(`search_unavailable (${capabilityId}): ${res.reason}`)
  if (res.kind !== 'ok') throw new Error(`search_unavailable (${capabilityId})`)
  const item = res.items.find((it) => it.contract.capabilityId === capabilityId)
  if (item === undefined) throw new Error(`operation_not_discoverable: ${capabilityId}`)
  return item
}

async function expectNotExecutable(
  backend: TestConvex<typeof schema>,
  capabilityId: string,
  token: string,
) {
  // Discoverable, but honestly not ready -> posture is never 'routeable'.
  const item = await findOperation(backend, capabilityId, token)
  expect(item.availability.posture).not.toBe('routeable')

  // The engine plan surface must refuse to produce a real plan against it.
  const plan = await backend.query(api.capabilitySupplyOperations.inspectPlan, {
    operationRefs: [item.operationRef],
    mappingRefs: [],
    expiresInMs: 300_000,
  })
  expect(plan.kind).toBe('unavailable')
  if (plan.kind === 'unavailable') expect(plan.reason).toBe('operation_unavailable')
}

async function capabilityIdsInRouteableSupply(
  backend: TestConvex<typeof schema>,
): Promise<Set<string>> {
  const routeable = await backend.query(internal.capabilitySupply.listRouteable, {
    networkId: 'ae:public', limit: 100, now: Date.now(),
  })
  if (routeable.kind !== 'available') return new Set()
  const ids = new Set<string>()
  for (const supply of routeable.supplies) {
    if (supply.binding.capabilityId !== undefined) ids.add(supply.binding.capabilityId)
  }
  return ids
}

describe('keyed + observed-x402 readiness honesty', () => {
  it('keyed ops with no credential are discoverable but not ready and never plan-able', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })

    for (const { capabilityId, token } of KEYED_OPS) {
      await expectNotExecutable(backend, capabilityId, token)
    }

    const routeable = await capabilityIdsInRouteableSupply(backend)
    for (const id of KEYED_CAPABILITY_IDS) expect(routeable.has(id)).toBe(false)
  })

  it('keyed ops stay inert when the readiness probe reports credential_unavailable', async () => {
    const backend = convexTest(schema, modules)
    const seeded = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })

    const byCapability = new Map<string, CuratedSeedPublication>(
      seeded.publications.map((p: CuratedSeedPublication): readonly [string, CuratedSeedPublication] => [p.capabilityId, p]),
    )
    for (const { capabilityId, token } of KEYED_OPS) {
      const publication = byCapability.get(capabilityId)
      expect(publication).toBeDefined()
      if (publication === undefined) throw new Error(`seeded publication missing: ${capabilityId}`)
      const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
        expectedRevision: 1,
        publicationRef: publication.publicationRef,
        credentialState: 'unavailable',
        healthState: 'healthy',
        validUntil: Date.now() + 300_000,
        operationKey: `test:keyed-unavailable:${capabilityId}`,
        correlationId: 'test:keyed-readiness-honesty',
        reasonCode: 'credential_unavailable',
        evidenceRefs: ['test:keyed-credential-unavailable'],
      })
      expect(observed).toMatchObject({ kind: 'observed' })
      await expectNotExecutable(backend, capabilityId, token)
    }

    const routeable = await capabilityIdsInRouteableSupply(backend)
    for (const id of KEYED_CAPABILITY_IDS) expect(routeable.has(id)).toBe(false)
  })

  it('persists credential_rejected readiness as unavailable instead of target_changed', async () => {
    const backend = convexTest(schema, modules)
    const seeded = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    const publication = seeded.publications.find((item: CuratedSeedPublication) => item.capabilityId === 'frankfurter.single-rate')
    if (publication === undefined) throw new Error('frankfurter publication missing')

    const targetResult = await backend.query(internal.capabilitySupply.readCapabilityProbeTarget, {
      publicationRef: publication.publicationRef,
      expectedRevision: 1,
    })
    if (targetResult.kind !== 'available') throw new Error(`probe target unavailable: ${targetResult.reason}`)
    const target = targetResult.target
    const requestDigest = canonicalDigest({
      targetDigest: target.targetDigest,
      endpointUrl: target.endpointUrl,
      adapterId: target.adapterId,
      probeKind: target.probeKind ?? null,
      probeMethod: target.probeMethod ?? null,
      probeQuery: target.probeQuery ?? [],
      transportConfigJson: target.transportConfigJson ?? null,
      probeInputJson: target.probeInputJson ?? null,
      outputSchemaJson: target.outputSchemaJson ?? null,
      expectedPaymentJson: target.expectedPaymentJson ?? null,
    })
    const observedAt = Date.now()
    const observed = await backend.mutation(internal.capabilitySupply.recordCapabilityProbeResult, {
      publicationRef: target.publicationRef,
      expectedRevision: target.revision,
      targetDigest: target.targetDigest,
      requestDigest,
      responseStatus: 401,
      responseContentType: 'application/json',
      outcome: 'credential_rejected',
      credentialState: 'unavailable',
      healthState: 'unhealthy',
      observedAt,
      validUntil: observedAt + 60_000,
      evidenceRefs: ['probe:credential_rejected'],
    })
    expect(observed).toMatchObject({ kind: 'observed' })

    const persisted = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', target.publicationRef).eq('revision', target.revision)
        ))
        .unique()
    ))
    expect(persisted).toMatchObject({
      credentialState: 'unavailable',
      healthState: 'unhealthy',
      readinessOutcome: 'credential_rejected',
      readinessResponseStatus: 401,
    })
  })

  it('observed x402 ops are discoverable but never produce a real plan', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })

    for (const { capabilityId, token } of X402_OPS) {
      await expectNotExecutable(backend, capabilityId, token)
    }

    const routeable = await capabilityIdsInRouteableSupply(backend)
    for (const id of X402_CAPABILITY_IDS) expect(routeable.has(id)).toBe(false)
  })

  it('a routeable op still produces a real plan (honest executable path preserved)', async () => {
    const backend = convexTest(schema, modules)
    const seeded = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })

    const publication = seeded.publications.find((p: CuratedSeedPublication) => p.capabilityId === 'frankfurter.single-rate')
    expect(publication).toBeDefined()
    if (publication === undefined) throw new Error('frankfurter publication missing')
    await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef,
      expectedRevision: 1,
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: Date.now() + 300_000,
      operationKey: 'test:routeable:frankfurter',
      correlationId: 'test:keyed-readiness-honesty',
      reasonCode: 'test_ready',
      evidenceRefs: ['test:routeable-frankfurter'],
    })

    const item = await findOperation(backend, 'frankfurter.single-rate', 'frankfurter')
    expect(item.availability.posture).toBe('routeable')
    const plan = await backend.query(api.capabilitySupplyOperations.inspectPlan, {
      operationRefs: [item.operationRef],
      mappingRefs: [],
      expiresInMs: 300_000,
    })
    expect(plan.kind).toBe('ok')
  })
})
