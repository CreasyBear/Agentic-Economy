import { describe, expect, it } from 'vitest'

import { compileRoutingSnapshot, createBindingRoutingEvidenceSnapshot } from '@/modules/routing-kernel/internal/routing-compiler'
import { createNeutralRoutingKernel } from '@/modules/routing-kernel/application'

const caller = { agentId: 'agent:1', principalId: 'principal:1' }

describe('versioned Routing Snapshot compiler', () => {
  it('separates relevance and hard feasibility before organic optimization', () => {
    const compiled = compileRoutingSnapshot({
      networkId: 'network:1', caller, query: '  Purchase Parcel LABEL  ',
      constraints: { currency: 'AUD', maximumSpendMinor: 150, optimizeFor: 'cost' },
      bindings: [
        binding('binding:eligible', ['parcel', 'label']),
        binding('binding:irrelevant', ['plumber']),
        { ...binding('binding:not-admitted', ['parcel']), admission: 'not_admitted' },
      ],
      quotes: [
        quoted('binding:eligible', 100, 140, 900),
        quoted('binding:irrelevant', 10, 10, 10),
        quoted('binding:not-admitted', 1, 1, 1),
      ],
    })

    expect(compiled.snapshot).toMatchObject({
      compilerVersion: 'routing-compiler:v2', optimizerVersion: 'organic-cost-latency-evidence:v2',
      networkPolicyVersion: 'network-policy:binding-evidence:v2', normalizedQuery: 'purchase parcel label',
      relevantBindingIds: ['binding:eligible'], eligibleBindingIds: ['binding:eligible', 'binding:irrelevant'],
    })
    expect(compiled.graphs.map((graph) => graph.bindingId)).toEqual(['binding:eligible'])
    expect(compiled.decision.factors).toEqual([expect.objectContaining({ bindingId: 'binding:eligible', feasible: true, expectedCostMinor: 100, expectedLatencyMs: 900 })])
  })

  it('selects a non-cheapest graph when the declared caller priority is latency', () => {
    const compiled = compileRoutingSnapshot({
      networkId: 'network:1', caller, query: 'parcel label',
      constraints: { currency: 'AUD', maximumSpendMinor: 200, optimizeFor: 'latency' },
      bindings: [binding('binding:cheap'), binding('binding:fast')],
      quotes: [quoted('binding:cheap', 50, 100, 2_000), quoted('binding:fast', 75, 125, 200)],
    })
    expect(compiled.selectedGraph?.bindingId).toBe('binding:fast')
    expect(compiled.decision).toMatchObject({ optimizeFor: 'latency', selectedBindingId: 'binding:fast' })
  })

  it('uses binding identity as a deterministic final tie and excludes infeasible quotes', () => {
    const compiled = compileRoutingSnapshot({
      networkId: 'network:1', caller, query: 'parcel label',
      constraints: { currency: 'AUD', maximumSpendMinor: 100, optimizeFor: 'cost' },
      bindings: [binding('binding:z'), binding('binding:a'), binding('binding:over-cap'), binding('binding:wrong-currency')],
      quotes: [
        quoted('binding:z', 50, 100, 500), quoted('binding:a', 50, 100, 500),
        quoted('binding:over-cap', 1, 101, 1), quoted('binding:wrong-currency', 1, 1, 1, 'USD'),
      ],
    })
    expect(compiled.selectedGraph?.bindingId).toBe('binding:a')
    expect(compiled.decision.factors).toEqual(expect.arrayContaining([
      expect.objectContaining({ bindingId: 'binding:over-cap', feasible: false, refusalReason: 'maximum_spend_exceeded' }),
      expect.objectContaining({ bindingId: 'binding:wrong-currency', feasible: false, refusalReason: 'currency_mismatch' }),
    ]))
    expect(compiled.graphs.flatMap((graph) => graph.steps.map((step) => step.bindingId))).not.toContain('binding:over-cap')
  })

  it('ignores commercial metadata because it is not an organic compiler input', () => {
    const input = {
      networkId: 'network:1', caller, query: 'parcel label',
      constraints: { currency: 'AUD', maximumSpendMinor: 200, optimizeFor: 'cost' as const },
      bindings: [binding('binding:organic'), binding('binding:sponsor')],
      quotes: [quoted('binding:organic', 50, 100, 500), quoted('binding:sponsor', 75, 100, 100)],
    }
    const organic = compileRoutingSnapshot(input)
    const decoratedInput = {
      ...input,
      commercialInfluence: { sponsoredBindingId: 'binding:sponsor', revenueMinor: 1_000_000, plan: 'enterprise' },
    }
    const commerciallyDecorated = compileRoutingSnapshot(decoratedInput)
    expect(organic.selectedGraph?.bindingId).toBe('binding:organic')
    expect(commerciallyDecorated).toEqual(organic)
  })

  it('quotes a conditional fallback graph at the cumulative gross step maximum', () => {
    const compiled = compileRoutingSnapshot({
      networkId: 'network:1', caller, query: 'parcel label',
      constraints: { currency: 'AUD', maximumSpendMinor: 300, optimizeFor: 'cost' },
      bindings: [binding('binding:primary'), binding('binding:fallback')],
      quotes: [quoted('binding:primary', 50, 100, 500), quoted('binding:fallback', 75, 125, 250)],
    })
    expect(compiled.selectedGraph).toMatchObject({
      bindingId: 'binding:primary', expectedCost: { amountMinor: 50 }, maximumCost: { currency: 'AUD', amountMinor: 225 },
      steps: [{ bindingId: 'binding:primary' }, { bindingId: 'binding:fallback', role: 'fallback' }],
    })
  })

  it('omits a fallback whose cumulative maximum exceeds the caller ceiling or safe-integer range', () => {
    const capped = compileRoutingSnapshot({
      networkId: 'network:1', caller, query: 'parcel label',
      constraints: { currency: 'AUD', maximumSpendMinor: 200, optimizeFor: 'cost' },
      bindings: [binding('binding:primary'), binding('binding:fallback')],
      quotes: [quoted('binding:primary', 50, 100, 500), quoted('binding:fallback', 75, 125, 250)],
    })
    expect(capped.selectedGraph).toMatchObject({ maximumCost: { amountMinor: 100 }, steps: [{ bindingId: 'binding:primary' }] })

    const overflow = compileRoutingSnapshot({
      networkId: 'network:1', caller, query: 'parcel label',
      constraints: { currency: 'AUD', maximumSpendMinor: Number.MAX_SAFE_INTEGER, optimizeFor: 'cost' },
      bindings: [binding('binding:primary'), binding('binding:fallback')],
      quotes: [quoted('binding:primary', 1, Number.MAX_SAFE_INTEGER, 500), quoted('binding:fallback', 1, 1, 250)],
    })
    expect(overflow.graphs.every((graph) => graph.steps.length === 1 && Number.isSafeInteger(graph.maximumCost.amountMinor))).toBe(true)
  })

  it('uses current confidence-aware standing only as an organic final tie-break', () => {
    const compiled = compileRoutingSnapshot({
      networkId: 'network:1', caller, query: 'parcel label', now: 1_100,
      constraints: { currency: 'AUD', maximumSpendMinor: 100, optimizeFor: 'cost' },
      bindings: [boundBinding('binding:a'), boundBinding('binding:z')],
      quotes: [quoted('binding:a', 50, 100, 500), quoted('binding:z', 50, 100, 500)],
      evidenceSnapshots: [evidence('binding:a', { reliability: 600 }), evidence('binding:z', { reliability: 900 })],
    })
    expect(compiled.selectedGraph?.bindingId).toBe('binding:z')
    expect(compiled.decision.factors).toEqual(expect.arrayContaining([
      expect.objectContaining({ bindingId: 'binding:z', evidence: expect.objectContaining({
        disposition: 'current', healthState: 'healthy', executionReliabilityLowerBoundPermille: 900,
      }) }),
    ]))
  })

  it('hard-excludes unavailable health and active incident routing effects', () => {
    const compiled = compileRoutingSnapshot({
      networkId: 'network:1', caller, query: 'parcel label', now: 1_100,
      constraints: { currency: 'AUD', maximumSpendMinor: 100 },
      bindings: [boundBinding('binding:healthy'), boundBinding('binding:unavailable'), boundBinding('binding:incident')],
      quotes: [quoted('binding:healthy', 50, 100, 500), quoted('binding:unavailable', 1, 1, 1), quoted('binding:incident', 1, 1, 1)],
      evidenceSnapshots: [
        evidence('binding:healthy'), evidence('binding:unavailable', { health: 'unavailable' }),
        evidence('binding:incident', { incident: 'exclude_new_routes' }),
      ],
    })
    expect(compiled.selectedGraph?.bindingId).toBe('binding:healthy')
    expect(compiled.decision.factors).toEqual(expect.arrayContaining([
      expect.objectContaining({ bindingId: 'binding:unavailable', feasible: false, refusalReason: 'health_unavailable' }),
      expect.objectContaining({ bindingId: 'binding:incident', feasible: false, refusalReason: 'incident_excluded', evidence: expect.objectContaining({
        activeIncidentIds: ['incident:1'], healthEvidenceStanding: 'eligible_observed',
        incidentEvidenceStanding: 'eligible_corroborated', standingEvidenceStanding: 'eligible_run_bound',
      }) }),
    ]))
  })

  it('treats expired, version-mismatched, and unbound evidence as explicit unknown rather than success', () => {
    const expired = evidence('binding:a', { expiresAt: 1_050, reliability: 1_000 })
    const ineligible = evidence('binding:z', { standing: 'visible_unbound', reliability: 1_000 })
    const versionMismatch = { ...evidence('binding:mismatch', { reliability: 1_000 }), bindingRegistrationHash: 'sha256:previous-registration' }
    const compiled = compileRoutingSnapshot({
      networkId: 'network:1', caller, query: 'parcel label', now: 1_100,
      constraints: { currency: 'AUD', maximumSpendMinor: 100 },
      bindings: [boundBinding('binding:a'), boundBinding('binding:z'), boundBinding('binding:mismatch'), binding('binding:legacy')],
      quotes: [quoted('binding:a', 50, 100, 500), quoted('binding:z', 50, 100, 500), quoted('binding:mismatch', 50, 100, 500), quoted('binding:legacy', 50, 100, 500)],
      evidenceSnapshots: [expired, ineligible, versionMismatch],
    })
    expect(compiled.snapshot.bindingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ bindingId: 'binding:a', disposition: 'expired', healthState: 'unknown' }),
      expect.objectContaining({ bindingId: 'binding:z', disposition: 'ineligible_evidence', executionReliabilityStatus: 'insufficient_evidence' }),
      expect.objectContaining({ bindingId: 'binding:mismatch', disposition: 'version_mismatch' }),
      expect.objectContaining({ bindingId: 'binding:legacy', disposition: 'legacy_unbound' }),
    ]))
    expect(compiled.selectedGraph?.bindingId).toBe('binding:a')
  })

  it('binds a material standing change into the immutable quote digest', async () => {
    const routeWith = async (reliability: number) => {
      let id = 0
      const bindingValue = boundBinding('binding:a')
      const kernel = createNeutralRoutingKernel({
        now: () => 1_100, executionMode: 'simulation', quoteTtlMs: 1_000,
        ids: { next: (prefix) => `${prefix}:${++id}` }, routingEvidenceSnapshots: [evidence('binding:a', { reliability })],
        bindings: [{ binding: bindingValue, quote: async () => quoted('binding:a', 50, 100, 500).quote,
          execute: async () => ({ kind: 'effect_not_committed', reason: 'not_run' }),
          reconcile: async () => ({ kind: 'reconciliation_pending' }) }],
      })
      const result = await kernel.operations.route({ caller, networkId: 'network:1', query: 'parcel label', constraints: { currency: 'AUD', maximumSpendMinor: 100 } })
      if (result.kind !== 'quoted') throw new Error(result.kind)
      return result.quote
    }
    const lower = await routeWith(600)
    const higher = await routeWith(900)
    expect(lower.quoteId).toBe(higher.quoteId)
    expect(lower.quoteDigest).not.toBe(higher.quoteDigest)
    expect(lower.routingSnapshot.bindingEvidence[0]?.snapshotDigest).not.toBe(higher.routingSnapshot.bindingEvidence[0]?.snapshotDigest)
  })

  it('applies hard evidence policy before provider quote egress', async () => {
    let quoteCalls = 0
    const bindingValue = boundBinding('binding:frozen')
    const kernel = createNeutralRoutingKernel({
      now: () => 1_100, executionMode: 'simulation', quoteTtlMs: 1_000, ids: { next: (prefix) => `${prefix}:1` },
      routingEvidenceSnapshots: [evidence('binding:frozen', { health: 'frozen' })],
      bindings: [{ binding: bindingValue, quote: async () => { quoteCalls += 1; return quoted('binding:frozen', 1, 1, 1).quote },
        execute: async () => ({ kind: 'effect_not_committed', reason: 'not_run' }), reconcile: async () => ({ kind: 'reconciliation_pending' }) }],
    })
    await expect(kernel.operations.route({ caller, networkId: 'network:1', query: 'parcel label', constraints: { currency: 'AUD', maximumSpendMinor: 100 } }))
      .resolves.toEqual({ kind: 'no_route', reason: 'no_eligible_graph' })
    expect(quoteCalls).toBe(0)
  })
})

function binding(bindingId: string, queryTerms = ['parcel', 'label']) {
  return { bindingId, nodeId: `node:${bindingId}`, networkId: 'network:1', capabilityContractId: 'capability:parcel:v1', operation: 'purchase_label', admission: 'admitted' as const, conformance: 'conformant' as const, queryTerms }
}

function boundBinding(bindingId: string) {
  return { ...binding(bindingId), registrationHash: `sha256:registration:${bindingId}`, environment: 'test' }
}

function evidence(bindingId: string, input: {
  health?: 'healthy' | 'degraded' | 'unavailable' | 'frozen' | 'unknown'
  incident?: 'none' | 'deprioritize' | 'exclude_new_routes' | 'freeze'
  standing?: 'eligible_observed' | 'eligible_run_bound' | 'eligible_corroborated' | 'visible_unbound'
  reliability?: number
  expiresAt?: number
} = {}) {
  const standing = input.standing ?? 'eligible_run_bound'
  return createBindingRoutingEvidenceSnapshot({
    contractVersion: 'routing-evidence:v1', networkId: 'network:1', bindingId,
    bindingRegistrationHash: `sha256:registration:${bindingId}`, environment: 'test',
    networkPolicyVersion: 'network-policy:binding-evidence:v2', estimatorVersion: 'execution-reliability-lcb:v1',
    sourceCommitment: `sha256:source:${bindingId}`, observedAt: 1_000, expiresAt: input.expiresAt ?? 2_000,
    health: { state: input.health ?? 'healthy', evidenceStanding: 'eligible_observed' },
    incident: { routingEffect: input.incident ?? 'none', activeIncidentIds: input.incident === undefined || input.incident === 'none' ? [] : ['incident:1'], evidenceStanding: 'eligible_corroborated' },
    standing: { evidenceStanding: standing, executionReliability: input.reliability === undefined
      ? { status: 'insufficient_evidence', sampleSize: 0 }
      : { status: 'sufficient', sampleSize: 20, lowerConfidenceBoundPermille: input.reliability } },
  })
}

function quoted(bindingId: string, expected: number, maximum: number, latency: number, currency = 'AUD') {
  return { bindingId, quote: { kind: 'quoted' as const, expectedCost: { currency, amountMinor: expected }, maximumCost: { currency, amountMinor: maximum }, expectedLatencyMs: latency, dataFields: [], disclosures: [] } }
}
