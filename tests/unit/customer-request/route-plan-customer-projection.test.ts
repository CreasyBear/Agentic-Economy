import { describe, expect, it } from 'vitest'

import type { CustomerRequestRoutePlan } from '@/modules/customer-request/compiler'
import {
  projectCustomerRoutePlanDecision,
} from '@/modules/customer-request/route-plan-customer-projection'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'
import { customerRequestViewSchema } from '@/modules/customer-request/agent-contract'

describe('RoutePlan customer projection', () => {
  it('projects one exact generation without exposing compiler choreography or creating authority', () => {
    const decision = projectCustomerRoutePlanDecision({
      current: generation(1, [route({ amountMinor: 1_200 })]),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })

    expect(decision).toMatchObject({
      generationRef: 'generation:1',
      requestRevision: 3,
      outcome: { kind: 'routes_available', routeCount: 1 },
      routes: [{
        routeRef: 'route:one',
        result: {
          summary: 'Prepare a governed result for the customer.',
          deliverables: ['Result reference'],
        },
        businesses: [{ name: 'North Star Services' }],
        stepCount: 1,
        maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 1_200 },
        dataUse: {
          recipients: [{ name: 'North Star Services', purposes: ['prepare_result'] }],
        },
        effects: [{ kind: 'information_shared', reversibility: 'irreversible' }],
        evidence: [{ label: 'Result reference', purpose: 'completion' }],
        uncertainty: [],
        validUntil: 50_000,
        fallback: { available: false, alternatives: [] },
        recovery: [{ step: 1, businessName: 'North Star Services', posture: 'retry_safe' }],
      }],
      changes: { kind: 'initial' },
      nextBoundary: { kind: 'confirmation', authorityCreated: false },
    })
    expect(JSON.stringify(decision)).not.toMatch(/capabilityId|bindingId|offeringId|publicationRef|graph|transport/u)

    expect(customerRequestViewSchema.safeParse({
      kind: 'request', requestRef: 'request:one', revision: 3,
      routeGenerationRef: 'generation:1',
      state: 'routes_ready', summary: 'A route is ready.', nextAction: 'inspect_routes',
      missingFields: [], criteria: [], options: [], decision,
    }).success).toBe(true)
  })

  it('derives a price-only delta from immutable generation material without reporting unchanged categories', () => {
    const previous = generation(1, [route({ amountMinor: 1_200 })])
    const current = generation(2, [route({ amountMinor: 900, routePlanId: 'route:two' })])

    const decision = projectCustomerRoutePlanDecision({
      current,
      previous,
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })

    expect(decision.changes).toEqual({
      kind: 'changed',
      previousGenerationRef: 'generation:1',
      items: [{
        kind: 'maximum_cost',
        before: [{
          resultRef: expect.stringMatching(/^result:/u),
          cost: { kind: 'known', currency: 'AUD', amountMinor: 1_200 },
        }],
        after: [{
          resultRef: expect.stringMatching(/^result:/u),
          cost: { kind: 'known', currency: 'AUD', amountMinor: 900 },
        }],
      }],
    })
  })

  it('makes an expired generation legible without discarding its exact routes', () => {
    const decision = projectCustomerRoutePlanDecision({
      current: generation(1, [route({ amountMinor: 1_200 })]),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 60_000,
    })

    expect(decision).toMatchObject({
      outcome: { kind: 'routes_expired', summary: 'These ways forward have expired.' },
      routes: [{ availability: 'expired' }],
    })
    expect(customerRequestViewSchema.safeParse({
      kind: 'request', requestRef: 'request:one', revision: 3,
      routeGenerationRef: decision.generationRef,
      state: 'needs_attention', summary: decision.outcome.summary, nextAction: 'retry',
      missingFields: [], criteria: [], options: [], decision,
    }).success).toBe(true)
  })

  it('detects every customer-material category independently of opaque route identity', () => {
    const original = route({ amountMinor: 1_200 })
    const cases: Array<readonly [string, CustomerRequestRoutePlan]> = [
      ['route_result', changed(original, (value) => { value.comparison.ordering = { kind: 'unranked' } })],
      ['businesses', changed(original, (value) => { value.steps[0]!.businessId = 'business:two' })],
      ['step_shape', changed(original, (value) => {
        value.steps.push({ ...structuredClone(value.steps[0]!), actionId: 'action:two' })
      })],
      ['data_use', changed(original, (value) => { value.steps[0]!.dataUse[0]!.purposes = ['prepare_changed_result'] })],
      ['effects', changed(original, (value) => { value.steps[0]!.effects[0]!.reversibility = 'conditional' })],
      ['evidence', changed(original, (value) => { value.steps[0]!.evidence[0]!.label = 'Changed result evidence' })],
      ['uncertainty', changed(original, (value) => { value.uncertainty = ['cost_requires_preparation'] })],
      ['expiry', changed(original, (value) => { value.expiresAt = 55_000 })],
      ['fallback', changed(original, (value) => {
        value.fallbacks.alternatives = [{
          alternativeRouteRef: 'route:alternative', when: 'route_unavailable_before_approval',
        }]
      })],
      ['recovery', changed(original, (value) => { value.steps[0]!.recovery.recovery = 'reconcile_required' })],
    ]

    for (const [expectedKind, changedRoute] of cases) {
      const decision = projectCustomerRoutePlanDecision({
        previous: generation(1, [original]),
        current: generation(2, [changedRoute]),
        businessNames: {
          'business:one': 'North Star Services',
          'business:two': 'City Ledger',
        },
        capabilitySemantics,
        now: 10_000,
      })
      expect(decision.changes.kind, expectedKind).toBe('changed')
      if (decision.changes.kind !== 'changed') continue
      expect(decision.changes.items.map(({ kind }) => kind), expectedKind).toContain(expectedKind)
    }

    const identityOnly = projectCustomerRoutePlanDecision({
      previous: generation(1, [original]),
      current: generation(2, [{ ...original, routePlanId: 'route:new-opaque-ref' }]),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })
    expect(identityOnly.changes).toEqual({
      kind: 'unchanged', previousGenerationRef: 'generation:1',
    })
  })

  it('explains a one-for-one route-result change and ignores storage-order churn', () => {
    const original = route({ amountMinor: 1_200 })
    const replacement = changed(original, (value) => {
      value.steps[0]!.contractRef = {
        capabilityId: 'generic.result.replace', version: 1, contractDigest: 'digest:replacement',
      }
      value.routePlanId = 'route:replacement'
    })
    const changedDecision = projectCustomerRoutePlanDecision({
      previous: generation(1, [original]),
      current: generation(2, [replacement]),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })
    expect(changedDecision.changes.kind).toBe('changed')
    if (changedDecision.changes.kind !== 'changed') return
    const routeResult = changedDecision.changes.items.find(({ kind }) => kind === 'route_result')
    expect(routeResult).toMatchObject({
      kind: 'route_result',
      before: { routeCount: 1, results: [{ summary: 'Prepare a governed result for the customer.' }] },
      after: { routeCount: 1, results: [{ summary: 'Replace the governed result for the customer.' }] },
    })

    const second = changed(original, (value) => {
      value.routePlanId = 'route:second'
      value.steps[0]!.businessId = 'business:two'
      value.steps[0]!.publicationRef = 'publication:two'
      value.maximumTotalCost = { kind: 'known', currency: 'AUD', amountMinor: 2_400 }
    })
    const reordered = projectCustomerRoutePlanDecision({
      previous: generation(1, [original, second]),
      current: generation(2, [second, original]),
      businessNames: {
        'business:one': 'North Star Services',
        'business:two': 'City Ledger',
      },
      capabilitySemantics,
      now: 10_000,
    })
    expect(reordered.changes).toEqual({
      kind: 'unchanged', previousGenerationRef: 'generation:1',
    })
  })

  it('refuses an unbounded projection before it can exceed the response boundary', () => {
    const routes = Array.from({ length: 257 }, (_, index) => ({
      ...route({ amountMinor: 1_200 }), routePlanId: `route:${index}`,
    }))
    expect(() => projectCustomerRoutePlanDecision({
      current: generation(1, routes),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })).toThrow('customer_route_plan_projection_limit_exceeded')
  })

  it('counts a business once when it receives information for more than one purpose', () => {
    const multiPurpose = changed(route({ amountMinor: 1_200 }), (value) => {
      value.steps[0]!.dataUse.push({
        ...structuredClone(value.steps[0]!.dataUse[0]!), purposes: ['confirm_result'],
      })
    })
    const decision = projectCustomerRoutePlanDecision({
      current: generation(1, [multiPurpose]),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })

    expect(decision.routes[0]?.dataUse).toEqual({
      recipientCount: 1,
      recipients: [{
        recipientRef: expect.stringMatching(/^recipient:/u),
        name: 'North Star Services',
        purposes: ['confirm_result', 'prepare_result'],
      }],
      purposes: ['confirm_result', 'prepare_result'],
    })
  })

  it('keeps distinct recipients separate when their customer-facing names collide', () => {
    const sameNameBusinesses = changed(route({ amountMinor: 1_200 }), (value) => {
      value.steps.push({
        ...structuredClone(value.steps[0]!),
        actionId: 'action:two',
        businessId: 'business:two',
      })
    })
    const businessDecision = projectCustomerRoutePlanDecision({
      current: generation(1, [sameNameBusinesses]),
      businessNames: {
        'business:one': 'North Star Services',
        'business:two': 'North Star Services',
      },
      capabilitySemantics,
      now: 10_000,
    })
    const businessRecipients = businessDecision.routes[0]?.dataUse.recipients ?? []
    expect(businessRecipients).toHaveLength(2)
    expect(new Set(businessRecipients.map(({ recipientRef }) => recipientRef)).size).toBe(2)

    const normalizedNamedRecipients = changed(route({ amountMinor: 1_200 }), (value) => {
      value.steps[0]!.dataUse = [
        { ...structuredClone(value.steps[0]!.dataUse[0]!), recipient: { kind: 'named_recipient', recipientId: 'foo_bar' } },
        { ...structuredClone(value.steps[0]!.dataUse[0]!), recipient: { kind: 'named_recipient', recipientId: 'foo-bar' } },
      ]
    })
    const namedDecision = projectCustomerRoutePlanDecision({
      current: generation(1, [normalizedNamedRecipients]),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })
    const namedRecipients = namedDecision.routes[0]?.dataUse.recipients ?? []
    expect(namedRecipients).toHaveLength(2)
    expect(namedRecipients.map(({ name }) => name)).toEqual(['Foo bar', 'Foo bar'])
    expect(new Set(namedRecipients.map(({ recipientRef }) => recipientRef)).size).toBe(2)
  })

  it('reports a same-count fallback substitution as a material fallback change', () => {
    const base = route({ amountMinor: 1_200 })
    const alternativeA = changed(base, (value) => {
      value.routePlanId = 'route:alternative-a'
      value.steps[0]!.offeringId = 'offering:alternative-a'
      value.steps[0]!.bindingId = 'binding:alternative-a'
      value.steps[0]!.publicationRef = 'publication:alternative-a'
    })
    const alternativeB = changed(base, (value) => {
      value.routePlanId = 'route:alternative-b'
      value.steps[0]!.offeringId = 'offering:alternative-b'
      value.steps[0]!.bindingId = 'binding:alternative-b'
      value.steps[0]!.publicationRef = 'publication:alternative-b'
    })
    const previous = changed(base, (value) => {
      value.fallbacks.alternatives = [{
        alternativeRouteRef: 'route:alternative-a', when: 'route_unavailable_before_approval',
      }]
    })
    const current = changed(previous, (value) => {
      value.fallbacks.alternatives = [{
        alternativeRouteRef: 'route:alternative-b', when: 'route_unavailable_before_approval',
      }]
    })
    const decision = projectCustomerRoutePlanDecision({
      previous: generation(1, [previous, alternativeA, alternativeB]),
      current: generation(2, [current, alternativeA, alternativeB]),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })

    expect(decision.changes.kind).toBe('changed')
    if (decision.changes.kind !== 'changed') return
    expect(decision.changes.items.map(({ kind }) => kind)).toContain('fallback')
  })

  it('keeps same-business same-contract offerings as distinct exact route choices', () => {
    const first = route({ amountMinor: 1_200 })
    const second = changed(first, (value) => {
      value.routePlanId = 'route:second-offering'
      value.steps[0]!.offeringId = 'offering:two'
      value.steps[0]!.bindingId = 'binding:two'
      value.steps[0]!.publicationRef = 'publication:two'
    })
    const decision = projectCustomerRoutePlanDecision({
      current: generation(1, [first, second]),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })

    expect(decision.routes.map(({ routeRef }) => routeRef)).toEqual(['route:one', 'route:second-offering'])
    expect(new Set(decision.routes.map(({ result }) => result.resultRef)).size).toBe(2)
  })

  it('detects reciprocal per-route material swaps instead of comparing global value bags', () => {
    const first = route({ amountMinor: 1_200 })
    const second = changed(first, (value) => {
      value.routePlanId = 'route:second'
      value.steps[0]!.offeringId = 'offering:two'
      value.steps[0]!.bindingId = 'binding:two'
      value.steps[0]!.publicationRef = 'publication:two'
      value.maximumTotalCost = { kind: 'known', currency: 'AUD', amountMinor: 2_400 }
      value.expiresAt = 60_000
      value.uncertainty = ['cost_requires_preparation']
      value.steps[0]!.dataUse[0]!.purposes = ['second_purpose']
      value.steps[0]!.effects[0]!.reversibility = 'conditional'
      value.steps[0]!.evidence[0]!.label = 'Second evidence'
      value.steps[0]!.recovery.recovery = 'reconcile_required'
    })
    const currentFirst = changed(first, (value) => copyCustomerMaterial(value, second))
    const currentSecond = changed(second, (value) => copyCustomerMaterial(value, first))
    const decision = projectCustomerRoutePlanDecision({
      previous: generation(1, [first, second]),
      current: generation(2, [currentFirst, currentSecond]),
      businessNames: { 'business:one': 'North Star Services' },
      capabilitySemantics,
      now: 10_000,
    })

    expect(decision.changes.kind).toBe('changed')
    if (decision.changes.kind !== 'changed') return
    expect(decision.changes.items.map(({ kind }) => kind).sort()).toEqual([
      'data_use', 'effects', 'evidence', 'expiry', 'maximum_cost', 'recovery', 'uncertainty',
    ])
  })

  it('detects reciprocal business swaps between stable route choices', () => {
    const first = changed(route({ amountMinor: 1_200 }), (value) => {
      value.steps.push({
        ...structuredClone(value.steps[0]!),
        actionId: 'action:second-business',
        businessId: 'business:two',
      })
    })
    const second = changed(first, (value) => {
      value.routePlanId = 'route:second'
      value.steps[0]!.offeringId = 'offering:two'
      value.steps[0]!.bindingId = 'binding:two'
      value.steps[0]!.publicationRef = 'publication:two'
      value.steps[1]!.businessId = 'business:three'
    })
    const currentFirst = changed(first, (value) => {
      value.steps[1]!.businessId = 'business:three'
    })
    const currentSecond = changed(second, (value) => {
      value.steps[1]!.businessId = 'business:two'
    })
    const decision = projectCustomerRoutePlanDecision({
      previous: generation(1, [first, second]),
      current: generation(2, [currentFirst, currentSecond]),
      businessNames: {
        'business:one': 'North Star Services',
        'business:two': 'City Ledger',
        'business:three': 'Harbour Works',
      },
      capabilitySemantics,
      now: 10_000,
    })

    expect(decision.changes.kind).toBe('changed')
    if (decision.changes.kind !== 'changed') return
    const businessChange = decision.changes.items.find(({ kind }) => kind === 'businesses')
    expect(businessChange?.kind).toBe('businesses')
    if (businessChange?.kind !== 'businesses') return
    const globalNames = (snapshots: typeof businessChange.before) => [...new Set(
      snapshots.flatMap(({ businesses }) => businesses.map(({ name }) => name)),
    )].sort()
    expect(globalNames(businessChange.before)).toEqual(globalNames(businessChange.after))
    expect(businessChange.before.every(({ resultRef }) => resultRef.startsWith('result:'))).toBe(true)
    expect(businessChange.after.every(({ resultRef }) => resultRef.startsWith('result:'))).toBe(true)
    expect(businessChange.before).not.toEqual(businessChange.after)
  })
})

type DeepWritable<Value> = Value extends string | number | boolean | null | undefined
  ? Value
  : Value extends readonly (infer Item)[]
  ? DeepWritable<Item>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: DeepWritable<Value[Key]> }
    : Value

function changed(
  source: CustomerRequestRoutePlan,
  mutate: (value: DeepWritable<CustomerRequestRoutePlan>) => void,
): CustomerRequestRoutePlan {
  const value = structuredClone(source) as unknown as DeepWritable<CustomerRequestRoutePlan>
  mutate(value)
  return value as CustomerRequestRoutePlan
}

function copyCustomerMaterial(
  target: DeepWritable<CustomerRequestRoutePlan>,
  source: CustomerRequestRoutePlan,
): void {
  target.maximumTotalCost = structuredClone(source.maximumTotalCost)
  target.expiresAt = source.expiresAt
  target.uncertainty = [...source.uncertainty]
  target.steps[0]!.dataUse = structuredClone(source.steps[0]!.dataUse)
  target.steps[0]!.effects = structuredClone(source.steps[0]!.effects)
  target.steps[0]!.evidence = source.steps[0]!.evidence.map((evidence) => ({ ...evidence }))
  target.steps[0]!.recovery = structuredClone(source.steps[0]!.recovery)
}

function generation(
  generationNumber: number,
  routes: readonly CustomerRequestRoutePlan[],
): CustomerRequestRoutePlanGeneration {
  return {
    format: 'ae.route-plan-generation:v1',
    generationRef: `generation:${generationNumber}`,
    generation: generationNumber,
    generationDigest: `digest:generation:${generationNumber}`,
    requestId: 'request:one',
    requestRevision: 3,
    compiler: {
      compilerVersion: 'customer-request-route-compiler:v1',
      interpreterId: 'interpreter:test',
      interpretationEvidence: { kind: 'deterministic_input' },
      proposalDigest: 'digest:proposal',
    },
    registrySnapshotDigest: 'digest:registry',
    routes,
    authority: 'proposal_only',
    createdAt: 1_000 + generationNumber,
  }
}

function route(input: Readonly<{
  amountMinor: number
  routePlanId?: string
}>): CustomerRequestRoutePlan {
  const routePlanId = input.routePlanId ?? 'route:one'
  return {
    routePlanId,
    requestId: 'request:one',
    requestRevision: 3,
    registrySnapshotDigest: 'digest:registry',
    steps: [{
      actionId: 'action:one',
      candidateRef: 'candidate:one',
      businessId: 'business:one',
      offeringId: 'offering:one',
      bindingId: 'binding:one',
      contractRef: { capabilityId: 'generic.result.prepare', version: 1, contractDigest: 'digest:contract' },
      offeringRegistrationHash: 'digest:offering',
      bindingRegistrationHash: 'digest:binding',
      publicationRef: 'publication:one',
      publicationRevision: 1,
      resolvedInputs: [],
      deferredInputs: [],
      price: { kind: 'fixed', currency: 'AUD', amountMinor: input.amountMinor },
      dataUse: [{
        effectId: 'share_request', inputPointer: '/request', classification: 'public', phase: 'preparation',
        recipient: { kind: 'candidate_binding' }, purposes: ['prepare_result'],
      }],
      effects: [{
        effectId: 'share_request', class: 'data_release', authority: 'explicit', reversibility: 'irreversible',
      }],
      evidence: [{
        evidenceId: 'result_reference', outputPointer: '/resultReference', purpose: 'completion',
        annotationId: 'result_reference', label: 'Result reference', role: 'completion_evidence',
        guaranteed: true, schemaIdentity: 'schema:result-reference' as never,
      }],
      cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:binding:one'] },
      recovery: { idempotency: 'required', recovery: 'retry_safe' },
    }],
    edges: [],
    maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: input.amountMinor },
    expiresAt: 50_000,
    uncertainty: [],
    fallbacks: { ordering: 'unranked', alternatives: [] },
    comparison: {
      fit: 'all_steps_viable', completeness: 'complete', dataExposureCount: 1,
      irreversibleEffectCount: 1, evidenceRequirementCount: 1, trust: 'registered_live_supply',
      ordering: { kind: 'ranked', objective: 'lowest_maximum_price', position: 1 },
    },
    authority: 'proposal_only',
    routeDigest: `digest:${routePlanId}`,
  }
}

const capabilitySemantics = {
  'generic.result.prepare@1:digest:contract': {
    name: 'Prepare a governed result',
    description: 'Prepare a governed result for the customer.',
    resultLabels: ['Result reference'],
  },
  'generic.result.replace@1:digest:replacement': {
    name: 'Replace the governed result',
    description: 'Replace the governed result for the customer.',
    resultLabels: ['Replacement reference'],
  },
} as const
