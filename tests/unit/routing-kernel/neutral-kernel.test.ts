import { describe, expect, it, vi } from 'vitest'


import {
  createNeutralRoutingKernel,
  type CapabilityBindingAdapter,
  type KernelIdFactory,
} from '@/modules/routing-kernel/application'
import {
  createInMemoryKernelStore,
  createStepGrant,
  canonicalAuthorityDigest,
  type KernelStore,
  type RootRunSnapshot,
  type RouteQuote,
} from '@/modules/routing-kernel/runtime'
import { createIncidentControlTestHarness } from '@/modules/routing-kernel/incident-control'

const ids = createSequentialIds()

describe('neutral routing kernel', () => {
  it('returns one immutable quote for an idempotent routing request and refuses changed payload', async () => {
    let quoteCalls = 0
    const adapter = parcelBinding({ bindingId: 'binding:idempotent:v1', nodeId: 'node:idempotent', amountMinor: 1_145, dispatched: [] })
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000,
      bindings: [{ ...adapter, quote: async (input) => { quoteCalls += 1; return await adapter.quote(input) } }],
    })
    const caller = { agentId: 'agent:request:1', principalId: 'principal:request:1' }
    const input = {
      routingRequestId: 'request:1:revision:1:action:purchase',
      networkId: 'network:au-first', caller, query: 'Purchase parcel label.',
      constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
    } as const

    const first = await kernel.operations.route(input)
    const replay = await kernel.operations.route(input)
    const changed = await kernel.operations.route({ ...input, constraints: { ...input.constraints, maximumSpendMinor: 2_000 } })

    expect(first).toEqual(replay)
    expect(quoteCalls).toBe(1)
    expect(changed).toEqual({ kind: 'no_route', reason: 'routing_request_conflict' })
  })

  it('binds an exact provider quote reference into the route digest and forwards it before expiry', async () => {
    let releasedQuoteRef: string | undefined
    const base = parcelBinding({ bindingId: 'binding:shippo:v1', nodeId: 'node:shippo', amountMinor: 1_145, dispatched: [] })
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000,
      bindings: [{
        ...base,
        quote: async () => ({
          kind: 'quoted' as const, expectedCost: { currency: 'AUD', amountMinor: 1_145 },
          maximumCost: { currency: 'AUD', amountMinor: 1_145 }, expectedLatencyMs: 2_000,
          dataFields: [], disclosures: [], providerQuoteRef: 'rate:shippo:exact-1',
          providerQuoteExpiresAt: 1_750_000_020_000,
        }),
        execute: async (input) => { releasedQuoteRef = input.providerQuoteRef; return { kind: 'effect_committed' as const, providerReference: 'transaction:1', outcome: {} } },
      }],
    })
    const caller = { agentId: 'agent:quote-ref', principalId: 'principal:quote-ref' }
    const routed = await kernel.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 1_500 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    expect(routed.quote.expiresAt).toBe(1_750_000_020_000)
    expect(routed.quote.selectedGraph.steps[0]).toMatchObject({ providerQuoteRef: 'rate:shippo:exact-1', providerQuoteExpiresAt: 1_750_000_020_000 })
    const authorization = await kernel.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 1_500, currency: 'AUD', expiresAt: 1_750_000_019_000, allowedDataFields: [] })
    await kernel.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'quote-ref:1' })
    expect(releasedQuoteRef).toBe('rate:shippo:exact-1')
  })

  it('routes an external-agent query across admitted bindings, executes the authorized quote, and exposes one inspectable root run', async () => {
    const dispatched: string[] = []
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000,
      executionMode: 'simulation',
      ids,
      quoteTtlMs: 60_000,
      bindings: [
        parcelBinding({
          bindingId: 'binding:shippo:v1',
          nodeId: 'node:shippo',
          amountMinor: 1_295,
          dispatched,
        }),
        parcelBinding({
          bindingId: 'binding:easypost:v1',
          nodeId: 'node:easypost',
          amountMinor: 1_145,
          dispatched,
        }),
      ],
    })

    const routed = await kernel.operations.route({
      networkId: 'network:au-first',
      caller: { agentId: 'agent:external-1', principalId: 'principal:merchant-1' },
      query: 'Purchase one tracked domestic parcel label for a 1 kg box.',
      constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
    })

    expect(routed).toMatchObject({
      kind: 'quoted',
      quote: {
        networkId: 'network:au-first',
        executionMode: 'simulation',
        selectedGraph: {
          bindingId: 'binding:easypost:v1',
          nodeId: 'node:easypost',
          expectedCost: { currency: 'AUD', amountMinor: 1_145 },
        },
        alternatives: [
          {
            bindingId: 'binding:shippo:v1',
            expectedCost: { currency: 'AUD', amountMinor: 1_295 },
          },
        ],
        effects: ['purchase_label'],
        enforcement: 'required',
      },
    })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)

    const authorization = await kernel.authority.authorize({
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      principalId: 'principal:merchant-1',
      agentId: 'agent:external-1',
      maximumSpendMinor: 1_295,
      currency: 'AUD',
      expiresAt: 1_750_000_030_000,
    })

    const executed = await kernel.operations.execute({
      caller: { agentId: 'agent:external-1', principalId: 'principal:merchant-1' },
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef,
      idempotencyKey: 'execute:parcel-label:1',
    })

    expect(executed).toMatchObject({
      kind: 'run_admitted',
      run: {
        state: 'completed',
        executionMode: 'simulation',
        enforcement: 'enforced',
        effectState: 'committed',
        cost: {
          authorized: { currency: 'AUD', amountMinor: 1_295 },
          quotedMaximum: { currency: 'AUD', amountMinor: 1_145 },
          reserved: null,
          providerReported: null,
          settled: null,
        },
        leaves: [
          {
            bindingId: 'binding:easypost:v1',
            state: 'completed',
            attemptDisposition: 'dispatched',
            effectState: 'committed',
            enforcement: 'enforced',
          },
        ],
      },
    })
    if (executed.kind !== 'run_admitted') throw new Error(executed.kind)

    expect(dispatched).toEqual(['binding:easypost:v1'])

    const inspected = await kernel.operations.inspect({
      caller: { agentId: 'agent:external-1', principalId: 'principal:merchant-1' },
      rootRunId: executed.run.rootRunId,
    })

    expect(inspected).toMatchObject({
      kind: 'run_found',
      run: executed.run,
    })
    if (inspected.kind !== 'run_found') throw new Error(inspected.kind)
    expect(inspected.run.records.map((record) => record.type)).toEqual([
      'root_run_admitted',
      'step_grant_consumed',
      'provider_attempt_released',
      'provider_outcome_reported',
      'root_run_completed',
    ])
  })

  it('returns a deeply immutable route quote so material route facts cannot drift after authorization', async () => {
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000,
      executionMode: 'simulation',
      ids: createSequentialIds(),
      quoteTtlMs: 60_000,
      bindings: [parcelBinding({
        bindingId: 'binding:easypost:v1',
        nodeId: 'node:easypost',
        amountMinor: 1_145,
        dispatched: [],
      })],
    })

    const routed = await kernel.operations.route({
      networkId: 'network:au-first',
      caller: { agentId: 'agent:external-1', principalId: 'principal:merchant-1' },
      query: 'Purchase one tracked domestic parcel label.',
      constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
    })

    expect(routed.kind).toBe('quoted')
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    expect(Object.isFrozen(routed.quote)).toBe(true)
    expect(Object.isFrozen(routed.quote.caller)).toBe(true)
    expect(Object.isFrozen(routed.quote.routingSnapshot)).toBe(true)
    expect(Object.isFrozen(routed.quote.routingSnapshot.constraints)).toBe(true)
    expect(Object.isFrozen(routed.quote.routingSnapshot.eligibleBindingIds)).toBe(true)
    expect(Object.isFrozen(routed.quote.organicDecision)).toBe(true)
    expect(Object.isFrozen(routed.quote.organicDecision.factors)).toBe(true)
    expect(Object.isFrozen(routed.quote.selectedGraph)).toBe(true)
    expect(Object.isFrozen(routed.quote.selectedGraph.expectedCost)).toBe(true)
    expect(Object.isFrozen(routed.quote.selectedGraph.maximumCost)).toBe(true)
    expect(Object.isFrozen(routed.quote.selectedGraph.dataFields)).toBe(true)
    expect(Object.isFrozen(routed.quote.selectedGraph.disclosures)).toBe(true)
    expect(Object.isFrozen(routed.quote.alternatives)).toBe(true)
    expect(Object.isFrozen(routed.quote.effects)).toBe(true)
    expect(Object.isFrozen(routed.quote.disclosures)).toBe(true)

    const latencyKernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000,
      bindings: [parcelBinding({ bindingId: 'binding:easypost:v1', nodeId: 'node:easypost', amountMinor: 1_145, dispatched: [] })],
    })
    const latencyRoute = await latencyKernel.operations.route({
      networkId: 'network:au-first', caller: routed.quote.caller, query: routed.quote.query,
      constraints: { currency: 'AUD', maximumSpendMinor: 1_500, optimizeFor: 'latency' },
    })
    expect(latencyRoute.kind).toBe('quoted')
    if (latencyRoute.kind !== 'quoted') throw new Error(latencyRoute.kind)
    expect(latencyRoute.quote.quoteDigest).not.toBe(routed.quote.quoteDigest)
  })

  it('holds an indeterminate effect and replays inspection without blindly dispatching again', async () => {
    let dispatchCount = 0
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000,
      executionMode: 'simulation',
      ids: createSequentialIds(),
      quoteTtlMs: 60_000,
      bindings: [{
        binding: {
          bindingId: 'binding:easypost:v1',
          nodeId: 'node:easypost',
          networkId: 'network:au-first',
          capabilityContractId: 'capability:parcel-label-purchase:v1',
          operation: 'purchase_label',
          admission: 'admitted',
          conformance: 'conformant',
          queryTerms: ['parcel', 'label'],
        },
        quote: async () => ({
          kind: 'quoted',
          expectedCost: { currency: 'AUD', amountMinor: 1_145 },
          maximumCost: { currency: 'AUD', amountMinor: 1_145 },
          expectedLatencyMs: 2_000,
          dataFields: ['recipient_address'],
          disclosures: ['Recipient address is released to the selected shipping provider.'],
        }),
        reconcile: async () => ({ kind: 'reconciliation_pending' }),
        execute: async () => {
          dispatchCount += 1
          return { kind: 'outcome_unknown', providerReference: 'shipment:shp_ambiguous' }
        },
      }],
    })

    const routed = await kernel.operations.route({
      networkId: 'network:au-first',
      caller: { agentId: 'agent:external-1', principalId: 'principal:merchant-1' },
      query: 'Purchase one tracked domestic parcel label.',
      constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
    })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize({
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      principalId: 'principal:merchant-1',
      agentId: 'agent:external-1',
      maximumSpendMinor: 1_200,
      currency: 'AUD',
      expiresAt: 1_750_000_030_000,
    })
    const executeInput = {
      caller: { agentId: 'agent:external-1', principalId: 'principal:merchant-1' },
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef,
      idempotencyKey: 'execute:parcel-label:ambiguous',
    } as const

    const first = await kernel.operations.execute(executeInput)
    const replay = await kernel.operations.execute(executeInput)

    expect(dispatchCount).toBe(1)
    expect(replay).toEqual(first)
    expect(first).toMatchObject({
      kind: 'run_admitted',
      run: {
        state: 'outcome_unknown',
        effectState: 'unknown',
        cost: {
          quotedMaximum: { currency: 'AUD', amountMinor: 1_145 },
          reserved: { currency: 'AUD', amountMinor: 1_145 },
          providerReported: null,
          settled: null,
        },
        leaves: [{
          attemptDisposition: 'indeterminate',
          effectState: 'unknown',
          providerReference: 'shipment:shp_ambiguous',
        }],
      },
    })
    if (first.kind !== 'run_admitted') throw new Error(first.kind)
    expect(first.run.records.map((record) => record.type)).toEqual([
      'root_run_admitted',
      'step_grant_consumed',
      'provider_attempt_released',
      'provider_outcome_unknown',
      'root_run_outcome_unknown',
    ])
  })

  it('quotes a bounded fallback graph and releases the fallback only after definite primary non-commitment', async () => {
    const dispatched: string[] = []
    const primary = parcelBinding({
      bindingId: 'binding:primary:v1',
      nodeId: 'node:primary',
      amountMinor: 100,
      dispatched,
    })
    const fallback = parcelBinding({
      bindingId: 'binding:fallback:v1',
      nodeId: 'node:fallback',
      amountMinor: 125,
      dispatched,
    })
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000,
      executionMode: 'simulation',
      ids: createSequentialIds(),
      quoteTtlMs: 60_000,
      bindings: [
        { ...primary, execute: async (input) => {
          dispatched.push(primary.binding.bindingId)
          return { kind: 'effect_not_committed', reason: 'provider_declined', providerReference: `primary:${input.leafRunId}` }
        } },
        fallback,
      ],
    })
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const routed = await kernel.operations.route({
      networkId: 'network:au-first',
      caller,
      query: 'Purchase one parcel label.',
      constraints: { currency: 'AUD', maximumSpendMinor: 225 },
    })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)

    expect(routed.quote.selectedGraph).toMatchObject({
      expectedCost: { currency: 'AUD', amountMinor: 100 },
      maximumCost: { currency: 'AUD', amountMinor: 225 },
      steps: [
        { role: 'primary', bindingId: 'binding:primary:v1' },
        { role: 'fallback', trigger: 'on_effect_not_committed', bindingId: 'binding:fallback:v1' },
      ],
    })

    const authorization = await kernel.authority.authorize({
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      principalId: caller.principalId,
      agentId: caller.agentId,
      maximumSpendMinor: 225,
      currency: 'AUD',
      expiresAt: 1_750_000_030_000,
    })
    const executed = await kernel.operations.execute({
      caller,
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef,
      idempotencyKey: 'fallback:definite-failure',
    })

    expect(dispatched).toEqual(['binding:primary:v1', 'binding:fallback:v1'])
    expect(executed).toMatchObject({
      kind: 'run_admitted',
      run: {
        state: 'completed',
        effectState: 'committed',
        cost: {
          authorized: { currency: 'AUD', amountMinor: 225 },
          quotedMaximum: { currency: 'AUD', amountMinor: 225 },
          reserved: null,
          providerReported: null,
          settled: null,
        },
        leaves: [
          { bindingId: 'binding:primary:v1', state: 'failed', effectState: 'not_committed', failureReason: 'provider_declined' },
          { bindingId: 'binding:fallback:v1', state: 'completed', effectState: 'committed' },
        ],
      },
    })
    if (executed.kind !== 'run_admitted') throw new Error(executed.kind)
    expect(executed.run.records.map((record) => record.type)).toEqual([
      'root_run_admitted',
      'step_grant_consumed',
      'provider_attempt_released',
      'provider_effect_not_committed',
      'fallback_released',
      'step_grant_consumed',
      'provider_attempt_released',
      'provider_outcome_reported',
      'root_run_completed',
    ])
  })

  it('releases only each selected step data fields across primary and fallback execution', async () => {
    const received: Record<string, Readonly<Record<string, string>>> = {}
    const epochForBinding = (bindingId: string | undefined) => canonicalAuthorityDigest({ incidentScope: bindingId ?? 'network' })
    const baseStore = createInMemoryKernelStore()
    const store: KernelStore = {
      ...baseStore,
      authorizeProviderRelease: async (release) => release.grant.incidentEpochDigest === epochForBinding(release.grant.bindingId)
        ? await baseStore.authorizeProviderRelease(release)
        : { kind: 'incident_epoch_stale', epochDigest: epochForBinding(release.grant.bindingId) },
    }
    const primaryBase = parcelBinding({ bindingId: 'binding:primary:v1', nodeId: 'node:primary', amountMinor: 100, dispatched: [] })
    const fallbackBase = parcelBinding({ bindingId: 'binding:fallback:v1', nodeId: 'node:fallback', amountMinor: 125, dispatched: [] })
    const primary: CapabilityBindingAdapter = {
      ...primaryBase,
      quote: async () => ({
        kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 100 }, maximumCost: { currency: 'AUD', amountMinor: 100 },
        expectedLatencyMs: 2_000, dataFields: ['recipient_address'], disclosures: ['Recipient address is released to the primary provider.'],
      }),
      execute: async (input) => {
        received.primary = input.data
        return { kind: 'effect_not_committed', reason: 'provider_declined' }
      },
    }
    const fallback: CapabilityBindingAdapter = {
      ...fallbackBase,
      quote: async () => ({
        kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 125 }, maximumCost: { currency: 'AUD', amountMinor: 125 },
        expectedLatencyMs: 2_000, dataFields: ['parcel_dimensions'], disclosures: ['Parcel dimensions are released to the fallback provider.'],
      }),
      execute: async (input) => {
        received.fallback = input.data
        return { kind: 'effect_committed', providerReference: 'shipment:projected', reportedCost: { currency: 'AUD', amountMinor: 120 }, outcome: {} }
      },
    }
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000,
      bindings: [primary, fallback], store,
      incidentControl: { evaluate: async (scope) => ({ kind: 'allowed', epochDigest: epochForBinding(scope.bindingId) }) },
    })
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const routed = await kernel.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 225 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    expect(routed.quote.selectedGraph.steps.map((step) => [step.bindingId, step.incidentEpochDigest])).toEqual([
      ['binding:primary:v1', epochForBinding('binding:primary:v1')],
      ['binding:fallback:v1', epochForBinding('binding:fallback:v1')],
    ])
    const authorization = await kernel.authority.authorize({
      quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId,
      maximumSpendMinor: 225, currency: 'AUD', expiresAt: 1_750_000_030_000,
      allowedDataFields: ['recipient_address', 'parcel_dimensions'],
    })

    const executed = await kernel.operations.execute({
      caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef,
      idempotencyKey: 'fallback:minimum-disclosure', data: { recipient_address: '1 Main St', parcel_dimensions: '10x10x10' },
    })

    expect(received).toEqual({
      primary: { recipient_address: '1 Main St' },
      fallback: { parcel_dimensions: '10x10x10' },
    })
    if (executed.kind !== 'run_admitted') throw new Error(executed.kind)
    expect(executed.run.cost).toMatchObject({
      quotedMaximum: { currency: 'AUD', amountMinor: 225 }, reserved: null,
      providerReported: { currency: 'AUD', amountMinor: 120 }, settled: null,
    })
    expect(executed.run.records.find((record) => record.type === 'provider_outcome_reported')).toMatchObject({
      reportedCost: { currency: 'AUD', amountMinor: 120 }, financialObservation: 'provider_reported',
    })
    expect(executed.run.records.filter((record) => record.type === 'provider_attempt_released')).toMatchObject([
      { bindingId: 'binding:primary:v1', disclosedDataFields: ['recipient_address'], incidentEpochDigest: epochForBinding('binding:primary:v1') },
      { bindingId: 'binding:fallback:v1', disclosedDataFields: ['parcel_dimensions'], incidentEpochDigest: epochForBinding('binding:fallback:v1') },
    ])
    expect(executed.run.records.find((record) => record.type === 'fallback_released')).toMatchObject({
      bindingId: 'binding:fallback:v1', incidentEpochDigest: epochForBinding('binding:fallback:v1'),
    })
    const grants = executed.run.records.filter((record) => record.type === 'step_grant_consumed')
    expect(grants).toMatchObject([
      { bindingId: 'binding:primary:v1', disclosedDataFields: ['recipient_address'], maximumCost: { currency: 'AUD', amountMinor: 100 }, attempt: 1, enforcementPoint: 'provider_release' },
      { bindingId: 'binding:fallback:v1', disclosedDataFields: ['parcel_dimensions'], maximumCost: { currency: 'AUD', amountMinor: 125 }, attempt: 2, enforcementPoint: 'provider_release' },
    ])
    expect(grants[0]?.stepGrantDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(grants[1]?.stepGrantDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(grants[0]?.stepGrantDigest).not.toBe(grants[1]?.stepGrantDigest)
    expect(JSON.stringify(executed.run.records)).not.toContain('1 Main St')
    expect(JSON.stringify(executed.run.records)).not.toContain('10x10x10')
  })

  it('terminates outcome_unknown without releasing a quoted fallback after an indeterminate primary', async () => {
    let fallbackDispatches = 0
    const primary = parcelBinding({ bindingId: 'binding:primary:v1', nodeId: 'node:primary', amountMinor: 100, dispatched: [] })
    const fallback = parcelBinding({ bindingId: 'binding:fallback:v1', nodeId: 'node:fallback', amountMinor: 125, dispatched: [] })
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000,
      bindings: [
        { ...primary, execute: async () => ({ kind: 'outcome_unknown', providerReference: 'primary:unknown' }) },
        { ...fallback, execute: async () => { fallbackDispatches += 1; return { kind: 'effect_committed', providerReference: 'must-not-run', outcome: {} } } },
      ],
    })
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const routed = await kernel.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 225 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 225, currency: 'AUD', expiresAt: 1_750_000_030_000 })
    const executed = await kernel.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'fallback:unknown-primary' })

    expect(fallbackDispatches).toBe(0)
    expect(executed).toMatchObject({ kind: 'run_admitted', run: { state: 'outcome_unknown', effectState: 'unknown', leaves: [{ bindingId: 'binding:primary:v1' }] } })
    if (executed.kind !== 'run_admitted') throw new Error(executed.kind)
    expect(executed.run.records.map((record) => record.type)).not.toContain('fallback_released')
  })

  it('requires a fresh quote when only the fallback incident epoch changes before authorization or execution', async () => {
    const epochs = new Map([
      ['binding:primary:v1', 'epoch:primary:1'],
      ['binding:fallback:v1', 'epoch:fallback:1'],
    ])
    let primaryDispatches = 0
    const primary = parcelBinding({ bindingId: 'binding:primary:v1', nodeId: 'node:primary', amountMinor: 100, dispatched: [] })
    const fallback = parcelBinding({ bindingId: 'binding:fallback:v1', nodeId: 'node:fallback', amountMinor: 125, dispatched: [] })
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000,
      bindings: [
        { ...primary, execute: async () => { primaryDispatches += 1; return { kind: 'effect_not_committed', reason: 'provider_declined' } } },
        fallback,
      ],
      incidentControl: { evaluate: async (scope) => ({ kind: 'allowed', epochDigest: epochs.get(scope.bindingId ?? '') ?? 'epoch:network:1' }) },
    })
    const route = async () => await kernel.operations.route({
      networkId: 'network:au-first', caller, query: 'Purchase one parcel label.',
      constraints: { currency: 'AUD', maximumSpendMinor: 225 },
    })
    const staleBeforeAuthorization = await route()
    if (staleBeforeAuthorization.kind !== 'quoted') throw new Error(staleBeforeAuthorization.kind)
    epochs.set('binding:fallback:v1', 'epoch:fallback:2')
    await expect(kernel.authority.authorize({
      quoteId: staleBeforeAuthorization.quote.quoteId, quoteDigest: staleBeforeAuthorization.quote.quoteDigest,
      principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 225,
      currency: 'AUD', expiresAt: 1_750_000_030_000,
    })).rejects.toMatchObject({ code: 'incident_epoch_stale' })

    const staleBeforeExecution = await route()
    if (staleBeforeExecution.kind !== 'quoted') throw new Error(staleBeforeExecution.kind)
    const authorization = await kernel.authority.authorize({
      quoteId: staleBeforeExecution.quote.quoteId, quoteDigest: staleBeforeExecution.quote.quoteDigest,
      principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 225,
      currency: 'AUD', expiresAt: 1_750_000_030_000,
    })
    epochs.set('binding:fallback:v1', 'epoch:fallback:3')
    await expect(kernel.operations.execute({
      caller, quoteId: staleBeforeExecution.quote.quoteId, quoteDigest: staleBeforeExecution.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef, idempotencyKey: 'fallback:epoch-stale',
    })).resolves.toEqual({ kind: 'execution_refused', reason: 'incident_epoch_stale' })
    expect(primaryDispatches).toBe(0)
  })

  it('terminates an inspectable failed root without dispatch when fallback release authority is refused', async () => {
    const base = createInMemoryKernelStore()
    let releases = 0
    const store: KernelStore = {
      ...base,
      authorizeProviderRelease: async (release) => {
        releases += 1
        return releases === 1 ? await base.authorizeProviderRelease(release) : 'release_conflict'
      },
    }
    let fallbackDispatches = 0
    const primary = parcelBinding({ bindingId: 'binding:primary:v1', nodeId: 'node:primary', amountMinor: 100, dispatched: [] })
    const fallback = parcelBinding({ bindingId: 'binding:fallback:v1', nodeId: 'node:fallback', amountMinor: 125, dispatched: [] })
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000, store,
      bindings: [
        { ...primary, execute: async () => ({ kind: 'effect_not_committed', reason: 'provider_declined' }) },
        { ...fallback, execute: async () => { fallbackDispatches += 1; return { kind: 'effect_committed', providerReference: 'must-not-run', outcome: {} } } },
      ],
    })
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const routed = await kernel.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 225 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 225, currency: 'AUD', expiresAt: 1_750_000_030_000 })
    const executed = await kernel.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'fallback:release-refused' })

    expect(fallbackDispatches).toBe(0)
    expect(executed).toMatchObject({ kind: 'run_admitted', run: { state: 'failed', effectState: 'not_committed', leaves: [{ bindingId: 'binding:primary:v1' }] } })
    if (executed.kind !== 'run_admitted') throw new Error(executed.kind)
    expect(executed.run.records.map((record) => record.type)).toContain('fallback_release_refused')
    await expect(kernel.operations.inspect({ caller, rootRunId: executed.run.rootRunId })).resolves.toEqual({ kind: 'run_found', run: executed.run })
  })

  it('records a provider refusal as a definite failure with no committed or held effect', async () => {
    const kernel = await preparedKernel(async () => ({ kind: 'effect_not_committed', reason: 'provider_declined' }))
    const executed = await kernel.execute()

    expect(executed).toMatchObject({
      kind: 'run_admitted',
      run: {
        state: 'failed', effectState: 'not_committed',
        cost: { reserved: null, providerReported: null, settled: null },
        leaves: [{ state: 'failed', attemptDisposition: 'dispatched', effectState: 'not_committed', failureReason: 'provider_declined' }],
      },
    })
    if (executed.kind !== 'run_admitted') throw new Error(executed.kind)
    expect(executed.run.records.map((record) => record.type)).toContain('provider_effect_not_committed')
    expect(executed.run.records.map((record) => record.type)).toContain('root_run_failed')
  })

  it('converts a thrown provider boundary into outcome_unknown and never dispatches it again', async () => {
    let attempts = 0
    const kernel = await preparedKernel(async () => { attempts += 1; throw new Error('connection reset after write') }, ['recipient_address'])
    const first = await kernel.execute({ recipient_address: '1 Main St' })
    const replay = await kernel.execute({ recipient_address: '1 Main St' })

    expect(attempts).toBe(1)
    expect(replay).toEqual(first)
    expect(first).toMatchObject({ kind: 'run_admitted', run: { state: 'outcome_unknown', effectState: 'unknown' } })
    expect(await kernel.store.getDataAuthorizationBudget(kernel.authorization.dataAuthorizationBudgetRef)).toMatchObject({
      consumedAttempts: 1,
      consumedExposures: 1,
      attempts: [{ disposition: 'indeterminate', fields: ['recipient_address'] }],
    })
  })

  it('reconciles an uncertain run through the persisted provider binding without another dispatch or caller evidence', async () => {
    let dispatches = 0
    let reconciliations = 0
    const prepared = await preparedKernel(
      async () => { dispatches += 1; return { kind: 'outcome_unknown', providerReference: 'shippo-rate:rate-1' } },
      [],
      undefined,
      async () => {
        reconciliations += 1
        return {
          kind: 'effect_committed', providerReference: 'shippo-transaction:transaction-1',
          outcome: { provider: 'shippo', transaction_state: 'success' },
          reportedCost: { currency: 'AUD', amountMinor: 1_145 },
        }
      },
    )
    const first = await prepared.execute()
    if (first.kind !== 'run_admitted') throw new Error(first.kind)

    await expect(prepared.kernel.operations.reconcileProviderOutcome({
      caller: { agentId: 'agent:other', principalId: 'principal:other' }, rootRunId: first.run.rootRunId,
    })).resolves.toEqual({ kind: 'provider_reconciliation_refused', reason: 'run_not_found' })

    const reconciled = await prepared.kernel.operations.reconcileProviderOutcome({
      caller: first.run.caller, rootRunId: first.run.rootRunId,
    })
    expect(reconciled).toMatchObject({
      kind: 'provider_outcome_reconciled',
      run: {
        rootRunId: first.run.rootRunId, state: 'completed', effectState: 'committed',
        leaves: [{ providerReference: 'shippo-transaction:transaction-1' }],
      },
    })
    expect(dispatches).toBe(1)
    expect(reconciliations).toBe(1)
    if (reconciled.kind !== 'provider_outcome_reconciled') throw new Error(reconciled.kind)
    expect(reconciled.run.records.at(-2)).toMatchObject({
      type: 'provider_reconciliation_observed', evidenceSource: 'provider_adapter_reconcile',
      providerReference: 'shippo-transaction:transaction-1',
    })
    await expect(prepared.kernel.operations.reconcileProviderOutcome({
      caller: first.run.caller, rootRunId: first.run.rootRunId,
    })).resolves.toEqual({ kind: 'provider_reconciliation_refused', reason: 'run_not_unknown' })
    expect(reconciliations).toBe(1)
  })

  it('keeps provider reconciliation pending without mutating the uncertain root or dispatching again', async () => {
    let dispatches = 0
    let reconciliations = 0
    const prepared = await preparedKernel(
      async () => { dispatches += 1; return { kind: 'outcome_unknown', providerReference: 'shipment:pending' } },
      [], undefined,
      async () => { reconciliations += 1; return { kind: 'reconciliation_pending' } },
    )
    const first = await prepared.execute()
    if (first.kind !== 'run_admitted') throw new Error(first.kind)
    await expect(prepared.kernel.operations.reconcileProviderOutcome({ caller: first.run.caller, rootRunId: first.run.rootRunId }))
      .resolves.toEqual({ kind: 'provider_reconciliation_pending', rootRunId: first.run.rootRunId })
    await expect(prepared.kernel.operations.inspect({ caller: first.run.caller, rootRunId: first.run.rootRunId }))
      .resolves.toEqual({ kind: 'run_found', run: first.run })
    expect(dispatches).toBe(1)
    expect(reconciliations).toBe(1)
  })

  it('requires and consumes a bounded recovery grant before reconciling under an active freeze', async () => {
    const incidents = createIncidentControlTestHarness()
    const recoveryClaims: Array<{ recoveryGrantId: string; operationRef: string }> = []
    const prepared = await preparedKernel(
      async () => ({ kind: 'outcome_unknown', providerReference: 'shipment:frozen-recovery' }),
      [],
      {
        evaluate: incidents.evaluate,
        claimRecovery: async (input) => {
          recoveryClaims.push({ recoveryGrantId: input.recoveryGrantId, operationRef: input.operationRef })
          return input.recoveryGrantId === 'recovery-grant:1'
            ? { kind: 'recovery_authorized', replay: false }
            : { kind: 'recovery_refused', reason: 'recovery_grant_not_found' }
        },
      },
      async () => ({ kind: 'effect_not_committed', reason: 'provider_confirms_no_effect' }),
    )
    const first = await prepared.execute()
    if (first.kind !== 'run_admitted') throw new Error(first.kind)
    await incidents.issueFreeze({
      freezeOrderId: 'freeze:reconcile', incidentId: 'incident:reconcile', issuerId: 'test:operator',
      reason: 'Contain reconciliation.', scope: { networkId: first.run.networkId, bindingId: first.run.leaves[0]!.bindingId },
      blockedActions: ['reconcile'], issuedAt: 1_750_000_000_001,
    })
    await expect(prepared.kernel.operations.reconcileProviderOutcome({ caller: first.run.caller, rootRunId: first.run.rootRunId }))
      .resolves.toEqual({ kind: 'provider_reconciliation_refused', reason: 'incident_frozen' })
    const recovered = await prepared.kernel.operations.reconcileProviderOutcome({
      caller: first.run.caller, rootRunId: first.run.rootRunId, recoveryGrantId: 'recovery-grant:1',
    })
    expect(recovered).toMatchObject({ kind: 'provider_outcome_reconciled', run: { state: 'failed', effectState: 'not_committed' } })
    expect(recoveryClaims).toEqual([{ recoveryGrantId: 'recovery-grant:1', operationRef: expect.stringMatching(/^provider-reconcile:sha256:/) }])
  })

  it('cancels atomically before provider release and persists an inspectable cancelled root', async () => {
    const base = createInMemoryKernelStore()
    let releaseClaim!: () => void
    const gate = new Promise<void>((resolve) => { releaseClaim = resolve })
    let firstClaim = true
    const store: KernelStore = { ...base, claimExecution: async (input) => {
      const result = await base.claimExecution(input)
      if (firstClaim && result.kind === 'claimed') { firstClaim = false; await gate }
      return result
    } }
    let dispatches = 0
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const kernel = createNeutralRoutingKernel({ now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000, store, bindings: [{ ...parcelBinding({ bindingId: 'binding:easypost:v1', nodeId: 'node:easypost', amountMinor: 1_145, dispatched: [] }), execute: async () => { dispatches += 1; return { kind: 'effect_committed', providerReference: 'must-not-run', outcome: {} } } }] })
    const routed = await kernel.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 1_500 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 1_200, currency: 'AUD', expiresAt: 1_750_000_030_000 })
    const executionInput = { caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'cancel-before-release' }
    const executing = kernel.operations.execute(executionInput)
    await vi.waitFor(async () => expect((await base.getExecution(`${caller.agentId}:${caller.principalId}:cancel-before-release`))?.kind).toBe('pending'))
    const pending = await kernel.operations.execute(executionInput)
    if (pending.kind !== 'execution_pending') throw new Error(pending.kind)
    expect(await kernel.operations.cancel({ caller, rootRunId: pending.rootRunId })).toEqual({ kind: 'cancellation_requested', rootRunId: pending.rootRunId })
    releaseClaim()
    const cancelled = await executing
    expect(dispatches).toBe(0)
    expect(cancelled).toMatchObject({ kind: 'run_admitted', run: { state: 'cancelled', effectState: 'not_committed', leaves: [] } })
  })

  it('releases only explicitly authorized data fields and records names without values', async () => {
    let received: Readonly<Record<string, string>> | undefined
    const prepared = await preparedKernel(async (input) => { received = input.data; return { kind: 'effect_committed', providerReference: 'shipment:data-1', outcome: {} } }, ['recipient_address'])
    const refused = await prepared.execute({ recipient_address: '1 Main St', parcel_dimensions: '10x10x10' })
    expect(refused).toEqual({ kind: 'execution_refused', reason: 'data_authority_exceeded' })
    expect(received).toBeUndefined()
    const completed = await prepared.execute({ recipient_address: '1 Main St' })
    expect(received).toEqual({ recipient_address: '1 Main St' })
    if (completed.kind !== 'run_admitted') throw new Error(completed.kind)
    const release = completed.run.records.find((record) => record.type === 'provider_attempt_released')
    expect(release?.disclosedDataFields).toEqual(['recipient_address'])
    expect(JSON.stringify(completed.run.records)).not.toContain('1 Main St')
  })

  it('refuses caller-authorized data that the selected graph did not quote', async () => {
    let dispatches = 0
    const prepared = await preparedKernel(async () => {
      dispatches += 1
      return { kind: 'effect_committed', providerReference: 'must-not-dispatch', outcome: {} }
    }, ['private_note'])

    await expect(prepared.execute({ private_note: 'not in the quote' })).resolves.toEqual({
      kind: 'execution_refused',
      reason: 'data_not_declared_by_quote',
    })
    expect(dispatches).toBe(0)
  })

  it('recovers quotes, authorizations, runs, and idempotent execution after a kernel restart', async () => {
    const store = createInMemoryKernelStore()
    let dispatchCount = 0
    const binding: CapabilityBindingAdapter = {
      binding: {
        bindingId: 'binding:easypost:v1',
        nodeId: 'node:easypost',
        networkId: 'network:au-first',
        capabilityContractId: 'capability:parcel-label-purchase:v1',
        operation: 'purchase_label',
        admission: 'admitted',
        conformance: 'conformant',
        queryTerms: ['parcel', 'label'],
      },
      quote: async () => ({
        kind: 'quoted',
        expectedCost: { currency: 'AUD', amountMinor: 1_145 },
        maximumCost: { currency: 'AUD', amountMinor: 1_145 },
        expectedLatencyMs: 2_000,
        dataFields: ['recipient_address'],
        disclosures: ['Recipient address is released to the selected shipping provider.'],
      }),
      reconcile: async () => ({ kind: 'reconciliation_pending' }),
      execute: async () => {
        dispatchCount += 1
        return {
          kind: 'effect_committed',
          providerReference: 'shipment:shp_durable',
          outcome: { labelReference: 'label:durable' },
        }
      },
    }
    const firstKernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000,
      executionMode: 'simulation',
      ids: createSequentialIds(),
      quoteTtlMs: 60_000,
      bindings: [binding],
      store,
    })
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const routed = await firstKernel.operations.route({
      networkId: 'network:au-first',
      caller,
      query: 'Purchase one tracked domestic parcel label.',
      constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
    })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await firstKernel.authority.authorize({
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      principalId: caller.principalId,
      agentId: caller.agentId,
      maximumSpendMinor: 1_200,
      currency: 'AUD',
      expiresAt: 1_750_000_030_000,
    })
    const executeInput = {
      caller,
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef,
      idempotencyKey: 'execute:parcel-label:durable',
    } as const
    const executed = await firstKernel.operations.execute(executeInput)
    if (executed.kind !== 'run_admitted') throw new Error(executed.kind)

    const restartedKernel = createNeutralRoutingKernel({
      now: () => 1_750_000_001_000,
      executionMode: 'simulation',
      ids: createSequentialIds(),
      quoteTtlMs: 60_000,
      bindings: [binding],
      store,
    })

    expect(await restartedKernel.operations.inspect({ caller, rootRunId: executed.run.rootRunId })).toEqual({
      kind: 'run_found',
      run: executed.run,
    })
    expect(await restartedKernel.operations.execute(executeInput)).toEqual(executed)
    expect(dispatchCount).toBe(1)
  })

  it('atomically claims concurrent execution so one authorization can release only one provider attempt', async () => {
    let releaseProvider: (() => void) | undefined
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve })
    let dispatchCount = 0
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000,
      executionMode: 'simulation',
      ids: createSequentialIds(),
      quoteTtlMs: 60_000,
      bindings: [{
        binding: {
          bindingId: 'binding:easypost:v1',
          nodeId: 'node:easypost',
          networkId: 'network:au-first',
          capabilityContractId: 'capability:parcel-label-purchase:v1',
          operation: 'purchase_label',
          admission: 'admitted',
          conformance: 'conformant',
          queryTerms: ['parcel', 'label'],
        },
        quote: async () => ({
          kind: 'quoted',
          expectedCost: { currency: 'AUD', amountMinor: 1_145 },
          maximumCost: { currency: 'AUD', amountMinor: 1_145 },
          expectedLatencyMs: 2_000,
          dataFields: ['recipient_address'],
          disclosures: ['Recipient address is released to the selected shipping provider.'],
        }),
        reconcile: async () => ({ kind: 'reconciliation_pending' }),
        execute: async () => {
          dispatchCount += 1
          await providerGate
          return {
            kind: 'effect_committed',
            providerReference: 'shipment:shp_concurrent',
            outcome: { labelReference: 'label:concurrent' },
          }
        },
      }],
    })
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const routed = await kernel.operations.route({
      networkId: 'network:au-first',
      caller,
      query: 'Purchase one tracked domestic parcel label.',
      constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
    })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize({
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      principalId: caller.principalId,
      agentId: caller.agentId,
      maximumSpendMinor: 1_200,
      currency: 'AUD',
      expiresAt: 1_750_000_030_000,
    })
    const executeInput = {
      caller,
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef,
      idempotencyKey: 'execute:parcel-label:concurrent',
    } as const

    const firstPromise = kernel.operations.execute(executeInput)
    await vi.waitFor(() => expect(dispatchCount).toBe(1))
    const concurrent = await kernel.operations.execute(executeInput)

    expect(concurrent).toMatchObject({
      kind: 'execution_pending',
      rootRunId: expect.stringMatching(/^root-run:/),
    })
    expect(dispatchCount).toBe(1)

    if (releaseProvider === undefined) throw new Error('provider release was not initialized')
    releaseProvider()
    const completed = await firstPromise
    expect(completed.kind).toBe('run_admitted')
    expect(dispatchCount).toBe(1)

    await expect(kernel.operations.execute(executeInput)).resolves.toEqual(completed)
    await expect(kernel.operations.execute({
      ...executeInput,
      quoteDigest: canonicalAuthorityDigest({ changed: 'quote' }),
    })).resolves.toEqual({ kind: 'execution_refused', reason: 'idempotency_payload_mismatch' })
    await expect(kernel.operations.execute({
      ...executeInput,
      authorizationRef: 'route-authorization:changed',
    })).resolves.toEqual({ kind: 'execution_refused', reason: 'idempotency_payload_mismatch' })
    await expect(kernel.operations.execute({
      ...executeInput,
      data: { recipient_address: 'changed after completion' },
    })).resolves.toEqual({ kind: 'execution_refused', reason: 'idempotency_payload_mismatch' })
    expect(dispatchCount).toBe(1)
  })

  it('exposes the durable running root and released leaf while the provider call is in flight', async () => {
    let releaseProvider: (() => void) | undefined
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve })
    let dispatches = 0
    const binding = parcelBinding({ bindingId: 'binding:primary:v1', nodeId: 'node:primary', amountMinor: 100, dispatched: [] })
    const kernel = createNeutralRoutingKernel({
      now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000,
      bindings: [{ ...binding, execute: async () => {
        dispatches += 1
        await providerGate
        return { kind: 'effect_committed', providerReference: 'provider:completed', outcome: {} }
      } }],
    })
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const routed = await kernel.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 150 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 100, currency: 'AUD', expiresAt: 1_750_000_030_000 })
    const executeInput = { caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'in-flight:inspect' } as const

    const first = kernel.operations.execute(executeInput)
    await vi.waitFor(() => expect(dispatches).toBe(1))
    const duplicate = await kernel.operations.execute(executeInput)
    expect(duplicate).toMatchObject({ kind: 'execution_pending', rootRunId: expect.any(String) })
    if (duplicate.kind !== 'execution_pending') throw new Error(duplicate.kind)
    await expect(kernel.operations.inspect({ caller, rootRunId: duplicate.rootRunId })).resolves.toMatchObject({
      kind: 'run_found',
      run: {
        state: 'running',
        effectState: 'released',
        leaves: [{ bindingId: 'binding:primary:v1', state: 'released', attemptDisposition: 'released', effectState: 'released' }],
        records: [
          { type: 'root_run_admitted' },
          { type: 'step_grant_consumed' },
          { type: 'provider_attempt_released' },
        ],
      },
    })

    if (releaseProvider === undefined) throw new Error('provider release was not initialized')
    releaseProvider()
    await first
  })

  it('reconciles a durably released primary after restart without redispatching it', async () => {
    const store = createInMemoryKernelStore()
    let dispatches = 0
    let reconciliations = 0
    const baseBinding = parcelBinding({ bindingId: 'binding:primary:v1', nodeId: 'node:primary', amountMinor: 100, dispatched: [] })
    const binding = {
      ...baseBinding,
      execute: async () => { dispatches += 1; return { kind: 'effect_committed' as const, providerReference: 'must-not-dispatch', outcome: {} } },
      reconcile: async () => { reconciliations += 1; return { kind: 'effect_committed' as const, providerReference: 'provider:recovered', outcome: { recovered: 'true' } } },
    }
    const ids = createSequentialIds()
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const firstKernel = createNeutralRoutingKernel({ now: () => 1_750_000_000_000, executionMode: 'simulation', ids, quoteTtlMs: 60_000, bindings: [binding], store })
    const routed = await firstKernel.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 150 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await firstKernel.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 100, currency: 'AUD', expiresAt: 1_750_000_030_000 })
    const rootRunId = 'root-run:crashed'
    const leafRunId = 'leaf-run:crashed'
    const stepGrantId = 'step-grant:crashed'
    const admitted = runningRunFixture({ routed: routed.quote, caller, rootRunId, leafRunId, stepGrantId, state: 'pending' })
    const released = runningRunFixture({ routed: routed.quote, caller, rootRunId, leafRunId, stepGrantId, state: 'released' })
    const executionScope = `${caller.agentId}:${caller.principalId}:restart:reconcile`
    await store.claimExecution({ executionScope, rootRunId, authorizationRef: authorization.authorizationRef, consumedAt: 1_750_000_000_000, caller, run: admitted, requestDigest: executionRequestDigest(routed.quote, authorization.authorizationRef, {}) })
    await store.authorizeProviderRelease({ grant: testStepGrant(routed.quote, rootRunId, leafRunId, stepGrantId, executionRequestDigest(routed.quote, authorization.authorizationRef, {}), 1_750_000_000_000, 1_750_000_030_000), releasedAt: 1_750_000_000_001, run: released })

    const incidents = createIncidentControlTestHarness()
    await incidents.issueFreeze({
      freezeOrderId: 'freeze:restart-reconcile', incidentId: 'incident:restart-reconcile',
      issuerId: 'principal:incident-responder', reason: 'Contain recovery egress.',
      scope: { networkId: routed.quote.networkId, bindingId: binding.binding.bindingId },
      blockedActions: ['reconcile'], issuedAt: 1_750_000_030_000,
    })
    const restarted = createNeutralRoutingKernel({ now: () => 1_750_000_031_000, executionMode: 'simulation', ids, quoteTtlMs: 60_000, bindings: [binding], store, incidentControl: incidents })
    await expect(restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'restart:reconcile', data: { changed: 'refused' } })).resolves.toEqual({ kind: 'execution_refused', reason: 'idempotency_payload_mismatch' })
    await expect(restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: 'changed-digest', authorizationRef: authorization.authorizationRef, idempotencyKey: 'restart:reconcile' })).resolves.toEqual({ kind: 'execution_refused', reason: 'idempotency_payload_mismatch' })
    await expect(restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: 'changed-authorization', idempotencyKey: 'restart:reconcile' })).resolves.toEqual({ kind: 'execution_refused', reason: 'idempotency_payload_mismatch' })
    expect(reconciliations).toBe(0)
    await expect(restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'restart:reconcile' })).resolves.toEqual({ kind: 'execution_pending', rootRunId })
    expect(reconciliations).toBe(0)
    await incidents.issueResume({
      resumeOrderId: 'resume:restart-reconcile', freezeOrderId: 'freeze:restart-reconcile',
      approverIds: ['principal:incident-responder', 'principal:independent-approver'],
      evidenceRefs: ['evidence:recovery-safe'], issuedAt: 1_750_000_030_500,
    })
    const recovered = await restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'restart:reconcile' })

    expect(dispatches).toBe(0)
    expect(reconciliations).toBe(1)
    expect(recovered).toMatchObject({ kind: 'run_admitted', run: { rootRunId, state: 'completed', effectState: 'committed', leaves: [{ providerReference: 'provider:recovered' }] } })
  })

  it('resumes a durably admitted but unreleased primary after restart', async () => {
    const store = createInMemoryKernelStore()
    let dispatches = 0
    let reconciliations = 0
    let received: Readonly<Record<string, string>> | undefined
    const base = parcelBinding({ bindingId: 'binding:primary:v1', nodeId: 'node:primary', amountMinor: 100, dispatched: [] })
    const binding: CapabilityBindingAdapter = {
      ...base,
      quote: async () => ({ kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 100 }, maximumCost: { currency: 'AUD', amountMinor: 100 }, expectedLatencyMs: 2_000, dataFields: ['recipient_address'], disclosures: ['Recipient address is released to the primary provider.'] }),
      execute: async (input) => { dispatches += 1; received = input.data; return { kind: 'effect_committed' as const, providerReference: 'provider:resumed', outcome: { resumed: 'true' } } },
      reconcile: async () => { reconciliations += 1; return { kind: 'reconciliation_pending' as const } },
    }
    const fallbackBase = parcelBinding({ bindingId: 'binding:fallback:v1', nodeId: 'node:fallback', amountMinor: 125, dispatched: [] })
    const fallback: CapabilityBindingAdapter = {
      ...fallbackBase,
      quote: async () => ({ kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 125 }, maximumCost: { currency: 'AUD', amountMinor: 125 }, expectedLatencyMs: 2_000, dataFields: ['parcel_dimensions'], disclosures: ['Parcel dimensions are released to the fallback provider.'] }),
    }
    const ids = createSequentialIds()
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const first = createNeutralRoutingKernel({ now: () => 1_750_000_000_000, executionMode: 'simulation', ids, quoteTtlMs: 60_000, bindings: [binding, fallback], store })
    const routed = await first.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 225 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await first.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 225, currency: 'AUD', expiresAt: 1_750_000_120_000, allowedDataFields: ['recipient_address', 'parcel_dimensions'] })
    const admitted = runningRunFixture({ routed: routed.quote, caller, rootRunId: 'root-run:admitted-crash', leafRunId: 'leaf-run:admitted-crash', stepGrantId: 'step-grant:admitted-crash', state: 'pending' })
    const executionScope = `${caller.agentId}:${caller.principalId}:restart:admitted`
    const data = { recipient_address: '1 Main St', parcel_dimensions: '10x10x10' }
    await store.claimExecution({ executionScope, rootRunId: admitted.rootRunId, authorizationRef: authorization.authorizationRef, consumedAt: 1_750_000_000_000, caller, run: admitted, requestDigest: executionRequestDigest(routed.quote, authorization.authorizationRef, data) })

    const restarted = createNeutralRoutingKernel({ now: () => 1_750_000_031_000, executionMode: 'simulation', ids, quoteTtlMs: 60_000, bindings: [binding, fallback], store })
    const recovered = await restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'restart:admitted', data })

    expect(dispatches).toBe(1)
    expect(reconciliations).toBe(0)
    expect(received).toEqual({ recipient_address: '1 Main St' })
    expect(recovered).toMatchObject({ kind: 'run_admitted', run: { state: 'completed', leaves: [{ providerReference: 'provider:resumed' }] } })
    if (recovered.kind !== 'run_admitted') throw new Error(recovered.kind)
    expect(recovered.run.records.find((record) => record.type === 'provider_attempt_released')?.disclosedDataFields).toEqual(['recipient_address'])
  })

  it('terminates crash recovery without dispatch when a fallback epoch changes after durable admission', async () => {
    const store = createInMemoryKernelStore()
    const epochs = new Map([
      ['binding:primary:v1', 'epoch:primary:1'],
      ['binding:fallback:v1', 'epoch:fallback:1'],
    ])
    const incidentControl = { evaluate: async (scope: { bindingId?: string }) => ({
      kind: 'allowed' as const, epochDigest: epochs.get(scope.bindingId ?? '') ?? 'epoch:network:1',
    }) }
    let dispatches = 0
    const primaryBase = parcelBinding({ bindingId: 'binding:primary:v1', nodeId: 'node:primary', amountMinor: 100, dispatched: [] })
    const primary = { ...primaryBase, execute: async () => { dispatches += 1; return await primaryBase.execute({} as never) } }
    const fallback = parcelBinding({ bindingId: 'binding:fallback:v1', nodeId: 'node:fallback', amountMinor: 125, dispatched: [] })
    const ids = createSequentialIds()
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const first = createNeutralRoutingKernel({ now: () => 1_750_000_000_000, executionMode: 'simulation', ids, quoteTtlMs: 60_000, bindings: [primary, fallback], store, incidentControl })
    const routed = await first.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 225 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await first.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 225, currency: 'AUD', expiresAt: 1_750_000_120_000 })
    const admitted = runningRunFixture({ routed: routed.quote, caller, rootRunId: 'root-run:stale-recovery', leafRunId: 'leaf-run:stale-recovery', stepGrantId: 'step-grant:stale-recovery', state: 'pending' })
    const executionScope = `${caller.agentId}:${caller.principalId}:restart:stale-recovery`
    await store.claimExecution({ executionScope, rootRunId: admitted.rootRunId, authorizationRef: authorization.authorizationRef, consumedAt: 1_750_000_000_000, caller, run: admitted, requestDigest: executionRequestDigest(routed.quote, authorization.authorizationRef, {}) })
    epochs.set('binding:fallback:v1', 'epoch:fallback:2')

    const restarted = createNeutralRoutingKernel({ now: () => 1_750_000_031_000, executionMode: 'simulation', ids, quoteTtlMs: 60_000, bindings: [primary, fallback], store, incidentControl })
    const recovered = await restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'restart:stale-recovery' })

    expect(dispatches).toBe(0)
    expect(recovered).toMatchObject({
      kind: 'run_admitted', run: { state: 'failed', effectState: 'not_committed', leaves: [{ attemptDisposition: 'not_released', failureReason: 'incident_epoch_stale' }] },
    })
    await expect(restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'restart:stale-recovery' })).resolves.toEqual(recovered)
  })

  it('releases the quoted fallback after restart only when primary reconciliation proves no effect committed', async () => {
    const store = createInMemoryKernelStore()
    let primaryDispatches = 0
    let primaryReconciliations = 0
    let fallbackDispatches = 0
    let reconciliationOutcome: 'failure' | 'unknown' = 'failure'
    const primary = {
      ...parcelBinding({ bindingId: 'binding:primary:v1', nodeId: 'node:primary', amountMinor: 100, dispatched: [] }),
      execute: async () => { primaryDispatches += 1; return { kind: 'effect_committed' as const, providerReference: 'must-not-dispatch', outcome: {} } },
      reconcile: async () => {
        primaryReconciliations += 1
        return reconciliationOutcome === 'failure'
          ? { kind: 'effect_not_committed' as const, reason: 'provider_declined' }
          : { kind: 'outcome_unknown' as const, providerReference: 'provider:still-unknown' }
      },
    }
    const fallbackBase = parcelBinding({ bindingId: 'binding:fallback:v1', nodeId: 'node:fallback', amountMinor: 125, dispatched: [] })
    const fallback = { ...fallbackBase, execute: async (request: Parameters<CapabilityBindingAdapter['execute']>[0]) => { fallbackDispatches += 1; return await fallbackBase.execute(request) } }
    const ids = createSequentialIds()
    const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
    const first = createNeutralRoutingKernel({ now: () => 1_750_000_000_000, executionMode: 'simulation', ids, quoteTtlMs: 60_000, bindings: [primary, fallback], store })
    const routed = await first.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 225 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await first.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 225, budgetMaximumGrossMinor: 450, currency: 'AUD', expiresAt: 1_750_000_030_000 })
    const rootRunId = 'root-run:fallback-crash'
    const leafRunId = 'leaf-run:primary-crash'
    const stepGrantId = 'step-grant:primary-crash'
    const admitted = runningRunFixture({ routed: routed.quote, caller, rootRunId, leafRunId, stepGrantId, state: 'pending' })
    const released = runningRunFixture({ routed: routed.quote, caller, rootRunId, leafRunId, stepGrantId, state: 'released' })
    const executionScope = `${caller.agentId}:${caller.principalId}:restart:fallback`
    await store.claimExecution({ executionScope, rootRunId, authorizationRef: authorization.authorizationRef, consumedAt: 1_750_000_000_000, caller, run: admitted, requestDigest: executionRequestDigest(routed.quote, authorization.authorizationRef, {}) })
    await store.authorizeProviderRelease({ grant: testStepGrant(routed.quote, rootRunId, leafRunId, stepGrantId, executionRequestDigest(routed.quote, authorization.authorizationRef, {}), 1_750_000_000_000, 1_750_000_030_000), releasedAt: 1_750_000_000_001, run: released })

    const restarted = createNeutralRoutingKernel({ now: () => 1_750_000_001_000, executionMode: 'simulation', ids, quoteTtlMs: 60_000, bindings: [primary, fallback], store })
    const recovered = await restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'restart:fallback' })

    expect(primaryDispatches).toBe(0)
    expect(primaryReconciliations).toBe(1)
    expect(fallbackDispatches).toBe(1)
    expect(recovered).toMatchObject({ kind: 'run_admitted', run: { state: 'completed', leaves: [{ bindingId: 'binding:primary:v1', state: 'failed' }, { bindingId: 'binding:fallback:v1', state: 'completed' }] } })

    reconciliationOutcome = 'unknown'
    const unknownAuthorization = await first.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 225, budgetMaximumGrossMinor: 450, currency: 'AUD', expiresAt: 1_750_000_030_000 })
    const unknownRootRunId = 'root-run:unknown-crash'
    const unknownLeafRunId = 'leaf-run:unknown-crash'
    const unknownStepGrantId = 'step-grant:unknown-crash'
    const unknownAdmitted = runningRunFixture({ routed: routed.quote, caller, rootRunId: unknownRootRunId, leafRunId: unknownLeafRunId, stepGrantId: unknownStepGrantId, state: 'pending' })
    const unknownReleased = runningRunFixture({ routed: routed.quote, caller, rootRunId: unknownRootRunId, leafRunId: unknownLeafRunId, stepGrantId: unknownStepGrantId, state: 'released' })
    const unknownScope = `${caller.agentId}:${caller.principalId}:restart:unknown`
    await store.claimExecution({ executionScope: unknownScope, rootRunId: unknownRootRunId, authorizationRef: unknownAuthorization.authorizationRef, consumedAt: 1_750_000_000_000, caller, run: unknownAdmitted, requestDigest: executionRequestDigest(routed.quote, unknownAuthorization.authorizationRef, {}) })
    await store.authorizeProviderRelease({ grant: testStepGrant(routed.quote, unknownRootRunId, unknownLeafRunId, unknownStepGrantId, executionRequestDigest(routed.quote, unknownAuthorization.authorizationRef, {}), 1_750_000_000_000, 1_750_000_030_000), releasedAt: 1_750_000_000_001, run: unknownReleased })
    const unknown = await restarted.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: unknownAuthorization.authorizationRef, idempotencyKey: 'restart:unknown' })

    expect(unknown).toMatchObject({ kind: 'run_admitted', run: { state: 'outcome_unknown', leaves: [{ state: 'outcome_unknown' }] } })
    expect(fallbackDispatches).toBe(1)
  })
})

function runningRunFixture(input: {
  routed: RouteQuote
  caller: Readonly<{ agentId: string; principalId: string }>
  rootRunId: string
  leafRunId: string
  stepGrantId: string
  state: 'pending' | 'released'
}): RootRunSnapshot {
  const step = input.routed.selectedGraph.steps[0]!
  const released = input.state === 'released'
  return {
    rootRunId: input.rootRunId, quoteId: input.routed.quoteId, quoteDigest: input.routed.quoteDigest, incidentEpochDigest: input.routed.incidentEpochDigest,
    networkId: input.routed.networkId, executionMode: input.routed.executionMode, caller: input.caller,
    state: 'running', enforcement: 'enforced', effectState: released ? 'released' : 'not_started',
    cost: { authorized: input.routed.selectedGraph.maximumCost, quotedMaximum: input.routed.selectedGraph.maximumCost, reserved: released ? input.routed.selectedGraph.steps[0]!.maximumCost : null, providerReported: null, settled: null },
    leaves: [{
      leafRunId: input.leafRunId, stepGrantId: input.stepGrantId, bindingId: step.bindingId,
      nodeId: step.nodeId, capabilityContractId: step.capabilityContractId,
      state: input.state, attemptDisposition: released ? 'released' : 'not_released',
      effectState: released ? 'released' : 'not_started', enforcement: 'enforced',
    }],
    records: released
      ? [
          { recordId: 'record:1', type: 'root_run_admitted', rootRunId: input.rootRunId, incidentEpochDigest: input.routed.incidentEpochDigest, occurredAt: 1_750_000_000_000 },
          { recordId: 'record:2', type: 'step_grant_consumed', rootRunId: input.rootRunId, leafRunId: input.leafRunId, bindingId: step.bindingId, incidentEpochDigest: input.routed.incidentEpochDigest, occurredAt: 1_750_000_000_001 },
          { recordId: 'record:3', type: 'provider_attempt_released', rootRunId: input.rootRunId, leafRunId: input.leafRunId, bindingId: step.bindingId, incidentEpochDigest: input.routed.incidentEpochDigest, occurredAt: 1_750_000_000_001 },
        ]
      : [{ recordId: 'record:1', type: 'root_run_admitted', rootRunId: input.rootRunId, incidentEpochDigest: input.routed.incidentEpochDigest, occurredAt: 1_750_000_000_000 }],
  }
}

async function preparedKernel(
  execute: CapabilityBindingAdapter['execute'],
  allowedDataFields: readonly string[] = [],
  incidentControl?: Parameters<typeof createNeutralRoutingKernel>[0]['incidentControl'],
  reconcile?: CapabilityBindingAdapter['reconcile'],
) {
  const caller = { agentId: 'agent:external-1', principalId: 'principal:merchant-1' } as const
  const store = createInMemoryKernelStore()
  const kernel = createNeutralRoutingKernel({
    now: () => 1_750_000_000_000, executionMode: 'simulation', ids: createSequentialIds(), quoteTtlMs: 60_000,
    store,
    bindings: [{ ...parcelBinding({ bindingId: 'binding:easypost:v1', nodeId: 'node:easypost', amountMinor: 1_145, dispatched: [] }), execute, ...(reconcile === undefined ? {} : { reconcile }) }],
    ...(incidentControl === undefined ? {} : { incidentControl }),
  })
  const routed = await kernel.operations.route({ networkId: 'network:au-first', caller, query: 'Purchase one parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 1_500 } })
  if (routed.kind !== 'quoted') throw new Error(routed.kind)
  const authorization = await kernel.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 1_200, currency: 'AUD', expiresAt: 1_750_000_030_000, allowedDataFields })
  return { kernel, store, authorization, execute: async (data?: Readonly<Record<string, string>>) => await kernel.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'failure-case', ...(data === undefined ? {} : { data }) }) }
}

function parcelBinding(input: {
  bindingId: string
  nodeId: string
  amountMinor: number
  dispatched: string[]
}): CapabilityBindingAdapter {
  return {
    binding: {
      bindingId: input.bindingId,
      nodeId: input.nodeId,
      networkId: 'network:au-first',
      capabilityContractId: 'capability:parcel-label-purchase:v1',
      operation: 'purchase_label',
      admission: 'admitted',
      conformance: 'conformant',
      queryTerms: ['parcel', 'label'],
    },
    quote: async () => ({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', amountMinor: input.amountMinor },
      maximumCost: { currency: 'AUD', amountMinor: input.amountMinor },
      expectedLatencyMs: 2_000,
      dataFields: ['recipient_address', 'parcel_dimensions'],
      disclosures: ['Recipient address and parcel dimensions are released to the selected shipping provider.'],
    }),
    execute: async () => {
      input.dispatched.push(input.bindingId)
      return {
        kind: 'effect_committed',
        providerReference: `provider-ref:${input.bindingId}`,
        outcome: { labelReference: `label:${input.bindingId}` },
      }
    },
    reconcile: async () => ({ kind: 'reconciliation_pending' }),
  }
}

function createSequentialIds(): KernelIdFactory {
  let value = 0
  return {
    next: (prefix) => {
      value += 1
      return `${prefix}:${value}`
    },
  }
}

function executionRequestDigest(quote: RouteQuote, authorizationRef: string, data: Readonly<Record<string, string>>): string {
  return canonicalAuthorityDigest({ quoteId: quote.quoteId, quoteDigest: quote.quoteDigest, authorizationRef, data })
}

function testStepGrant(quote: RouteQuote, rootRunId: string, leafRunId: string, stepGrantId: string, requestDigest: string, issuedAt: number, expiresAt: number) {
  const step = quote.selectedGraph.steps[0]!
  return createStepGrant({
    stepGrantId, rootRunId, leafRunId, quoteId: quote.quoteId, quoteDigest: quote.quoteDigest, requestDigest,
    bindingId: step.bindingId, nodeId: step.nodeId, capabilityContractId: step.capabilityContractId,
    maximumCost: step.maximumCost, disclosedDataFields: [], attempt: 1, issuedAt, expiresAt,
    enforcementPoint: 'provider_release', incidentEpochDigest: quote.incidentEpochDigest,
  })
}
