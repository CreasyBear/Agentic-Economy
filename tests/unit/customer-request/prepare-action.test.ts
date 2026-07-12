import { describe, expect, it } from 'vitest'

import {
  createInMemoryCustomerRequestPreparationStore,
  prepareCustomerRequestAction,
  projectPreparedActionForReview,
  type CustomerRequestActionRouter,
  type PreparedRouteQuote,
} from '@/modules/customer-request/preparation'
import {
  createCapabilityContractRegistry,
  createCustomerRequest,
  createPlanRevision,
  defineCapabilityContract,
} from '@/modules/customer-request/public'

describe('prepare customer request action', () => {
  it('persists one decision-ready quote without creating execution authority', async () => {
    const fixture = setup()

    const result = await prepareCustomerRequestAction(command(), fixture.dependencies)

    expect(result).toMatchObject({
      kind: 'prepared',
      preparedAction: {
        requestId: 'request:shipping:1',
        requestRevision: 1,
        planRevisionId: 'plan:shipping:1',
        actionId: 'action:quote',
        quoteId: 'quote:shipping:1',
        selectedBusiness: { bindingId: 'binding:courier-a', name: 'Courier A' },
        expectedCost: { currency: 'AUD', amountMinor: 1_295 },
        maximumGrossCost: { currency: 'AUD', amountMinor: 1_295 },
        comparisonBasis: { objective: 'cost', commercialInfluence: 'none' },
        cancellation: { kind: 'unsupported' },
      },
    })
    expect(fixture.routeCalls).toBe(1)
    expect(Object.keys(fixture.router)).toEqual(['route'])
  })

  it('lets two workers converge on one claimed preparation and one provider quote', async () => {
    let releaseRoute: (() => void) | undefined
    const routeBarrier = new Promise<void>((resolve) => { releaseRoute = resolve })
    const fixture = setup({ beforeRouteReturn: async () => await routeBarrier })

    const first = prepareCustomerRequestAction(command(), fixture.dependencies)
    await Promise.resolve()
    const concurrent = await prepareCustomerRequestAction(command(), fixture.dependencies)
    expect(concurrent).toEqual({ kind: 'preparation_in_progress', preparationScope: 'request:shipping:1:1:plan:shipping:1:action:quote' })

    releaseRoute?.()
    const prepared = await first
    const replay = await prepareCustomerRequestAction(command(), fixture.dependencies)

    expect(prepared.kind).toBe('prepared')
    expect(replay).toEqual(prepared)
    expect(fixture.routeCalls).toBe(1)
  })

  it('recovers the same kernel quote after a crash between route and persistence', async () => {
    const fixture = setup({ failFirstCommit: true })

    await expect(prepareCustomerRequestAction(command(), fixture.dependencies)).rejects.toThrowError('simulated_commit_crash')
    fixture.setNow(1_200)
    const recovered = await prepareCustomerRequestAction(command(), fixture.dependencies)

    expect(recovered.kind).toBe('prepared')
    expect(fixture.routeCalls).toBe(2)
    expect(fixture.providerQuoteCalls).toBe(1)
    if (recovered.kind !== 'prepared') throw new Error(recovered.kind)
    expect(recovered.preparedAction.quoteId).toBe('quote:shipping:1')
  })

  it('persists unsupported supply and does not repeatedly route it', async () => {
    const fixture = setup({ routeResult: { kind: 'no_route', reason: 'no_eligible_graph' } })

    const first = await prepareCustomerRequestAction(command(), fixture.dependencies)
    const replay = await prepareCustomerRequestAction(command(), fixture.dependencies)

    expect(first).toEqual({
      kind: 'preparation_refused', preparationScope: 'request:shipping:1:1:plan:shipping:1:action:quote',
      reason: 'no_connected_option',
    })
    expect(replay).toEqual(first)
    expect(fixture.routeCalls).toBe(1)
  })

  it('persists an expired quote as refused instead of silently requoting it', async () => {
    const expired = quote()
    const fixture = setup({ quote: { ...expired, expiresAt: 1_000 } })

    const first = await prepareCustomerRequestAction(command(), fixture.dependencies)
    const replay = await prepareCustomerRequestAction(command(), fixture.dependencies)

    expect(first).toEqual({
      kind: 'preparation_refused', preparationScope: 'request:shipping:1:1:plan:shipping:1:action:quote',
      reason: 'route_quote_expired',
    })
    expect(replay).toEqual(first)
    expect(fixture.providerQuoteCalls).toBe(1)
  })

  it('requires bounded preparation authority before sharing non-public request data', async () => {
    const fixture = setup()
    const { preparationGrant: _grant, ...withoutGrant } = command()

    const result = await prepareCustomerRequestAction(withoutGrant, fixture.dependencies)

    expect(result).toEqual({
      kind: 'preparation_refused', preparationScope: 'request:shipping:1:1:plan:shipping:1:action:quote',
      reason: 'preparation_authority_required',
    })
    expect(fixture.routeCalls).toBe(0)
  })

  it('changes the prepared digest when any customer decision material changes', async () => {
    const base = setup()
    const baselineQuote = quote()
    const changed = setup({ quote: {
      ...baselineQuote,
      selected: { ...baselineQuote.selected, maximumCost: { currency: 'AUD', amountMinor: 1_395 } },
    } })
    const first = await prepareCustomerRequestAction(command('preparation:base'), base.dependencies)
    const second = await prepareCustomerRequestAction(command('preparation:changed'), changed.dependencies)
    if (first.kind !== 'prepared' || second.kind !== 'prepared') throw new Error('expected_prepared')

    expect(first.preparedAction.preparedActionDigest).not.toBe(second.preparedAction.preparedActionDigest)
  })

  it('projects the exact customer decision without exposing routing protocol by default', async () => {
    const fixture = setup()
    const result = await prepareCustomerRequestAction(command(), fixture.dependencies)
    if (result.kind !== 'prepared') throw new Error(result.kind)

    const review = projectPreparedActionForReview(result.preparedAction)

    expect(review).toMatchObject({
      kind: 'review_required', business: { name: 'Courier A' },
      price: { currency: 'AUD', expectedAmountMinor: 1_295, maximumAmountMinor: 1_295 },
      whyThisOption: ['Lowest expected cost among the connected eligible options.'],
      fallbacks: [],
      dataUse: [
        { field: 'destinationPostcode', timing: 'already_shared_to_prepare', recipientName: 'Courier A', purposes: ['shipping_rate_quote'] },
        { field: 'destinationPostcode', timing: 'already_shared_to_prepare', recipientName: 'Courier B', purposes: ['shipping_rate_quote'] },
      ],
      actions: [
        { kind: 'approve', label: 'Approve this option' },
        { kind: 'change', label: 'Change request' },
        { kind: 'decline', label: 'Decline' },
      ],
    })
    expect(JSON.stringify(review)).not.toMatch(/quoteId|quoteDigest|bindingId|routing|protocol|rootRun/i)
  })
})

function setup(options: {
  quote?: PreparedRouteQuote
  routeResult?: Awaited<ReturnType<CustomerRequestActionRouter['route']>>
  beforeRouteReturn?: () => Promise<void>
  failFirstCommit?: boolean
} = {}) {
  let now = 1_000
  let routeCalls = 0
  let providerQuoteCalls = 0
  let failedCommit = false
  const quotes = new Map<string, PreparedRouteQuote>()
  const store = createInMemoryCustomerRequestPreparationStore()
  const registry = contracts()
  const request = customerRequest()
  const plan = planRevision(registry)
  store.putRequest(request)
  store.putPlanRevision(plan)

  const router: CustomerRequestActionRouter = {
    route: async (input) => {
      routeCalls += 1
      await options.beforeRouteReturn?.()
      if (options.routeResult !== undefined) return options.routeResult
      const existing = quotes.get(input.routingRequestId)
      if (existing !== undefined) return { kind: 'quoted', quote: existing }
      providerQuoteCalls += 1
      const value = options.quote ?? quote()
      quotes.set(input.routingRequestId, value)
      return { kind: 'quoted', quote: value }
    },
  }
  const commit = store.completePreparation.bind(store)
  if (options.failFirstCommit === true) {
    store.completePreparation = (input) => {
      if (!failedCommit) { failedCommit = true; throw new Error('simulated_commit_crash') }
      return commit(input)
    }
  }
  const dependencies = { store, router, registry, now: () => now, leaseMs: 100 }
  return {
    dependencies, router,
    setNow: (value: number) => { now = value },
    get routeCalls() { return routeCalls },
    get providerQuoteCalls() { return providerQuoteCalls },
  }
}

function command(preparationKey = 'preparation:shipping:1') {
  return {
    preparationKey,
    requestId: 'request:shipping:1', requestRevision: 1,
    planRevisionId: 'plan:shipping:1', actionId: 'action:quote',
    resolvedInput: { destinationPostcode: '3000' },
    preparationGrant: {
      preparationGrantId: 'preparation-grant:1', requestId: 'request:shipping:1', requestRevision: 1,
      principalId: 'principal:customer:1', allowedDataFields: ['destinationPostcode'],
      allowedRecipientKinds: ['candidate_provider'] as const, allowedPurposes: ['shipping_rate_quote'],
      maximumRecipients: 2, authenticationEvidenceRef: 'auth:evidence:1', expiresAt: 2_000, grantedAt: 900,
    },
  } as const
}

function customerRequest() {
  return createCustomerRequest({
    requestId: 'request:shipping:1', principalId: 'principal:customer:1', delegatedAgentId: 'agent:customer:1',
    intent: 'Compare courier prices.', routing: { networkId: 'network:au-first', currency: 'AUD', maximumSpendMinor: 1_500, optimizeFor: 'cost' },
    createdAt: 900,
  })
}

function planRevision(registry: ReturnType<typeof contracts>) {
  return createPlanRevision({
    planRevisionId: 'plan:shipping:1', requestId: 'request:shipping:1', requestRevision: 1,
    proposedByAgentId: 'agent:customer:1',
    proposalProvenance: { kind: 'direct_structured', proposalDigest: 'sha256:' + '1'.repeat(64) }, createdAt: 950,
    completionEvidence: [{ actionId: 'action:quote', field: 'offerRef' }],
    actions: [{
      actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1', dependsOn: [],
      input: { destinationPostcode: { kind: 'literal', value: '3000' } },
    }],
  }, registry)
}

function contracts() {
  return createCapabilityContractRegistry([defineCapabilityContract({
    capabilityContractId: 'shipping.rate.query:v1', name: 'Query shipping rates', operation: 'query',
    input: {
      destinationPostcode: {
        valueType: 'string', customerLabel: 'Destination postcode', required: true,
        disclosure: { classification: 'personal', phase: 'preparation', recipient: 'candidate_provider', purposes: ['shipping_rate_quote'] },
      },
    },
    output: { offerRef: { valueType: 'provider_offer_ref', customerLabel: 'Provider offer', required: true, evidenceRole: 'provider_offer' } },
    consequence: { commitment: 'none', spend: 'none', reversibility: 'not_applicable', approval: 'mandate_or_explicit' },
  })])
}

function quote(): PreparedRouteQuote {
  return {
    quoteId: 'quote:shipping:1', quoteDigest: 'sha256:' + '1'.repeat(64), capabilityContractId: 'shipping.rate.query:v1',
    selected: {
      business: { nodeId: 'node:courier-a', bindingId: 'binding:courier-a', name: 'Courier A' },
      expectedCost: { currency: 'AUD', amountMinor: 1_295 }, maximumCost: { currency: 'AUD', amountMinor: 1_295 },
      expectedLatencyMs: 800, executionDataFields: [],
      cancellation: { kind: 'unsupported', summary: 'A rate query creates no booking to cancel.' },
      materialTerms: [{ key: 'validity', label: 'Quote validity', value: 'Valid until the displayed expiry.' }],
    },
    fallbacks: [], alternatives: [{
      business: { nodeId: 'node:courier-b', bindingId: 'binding:courier-b', name: 'Courier B' },
      expectedCost: { currency: 'AUD', amountMinor: 1_395 }, maximumCost: { currency: 'AUD', amountMinor: 1_395 },
      expectedLatencyMs: 600, executionDataFields: [],
    }],
    preparationDisclosures: [
      { field: 'destinationPostcode', recipient: { nodeId: 'node:courier-a', bindingId: 'binding:courier-a', name: 'Courier A' } },
      { field: 'destinationPostcode', recipient: { nodeId: 'node:courier-b', bindingId: 'binding:courier-b', name: 'Courier B' } },
    ],
    optimizeFor: 'cost', commercialInfluence: 'none', expiresAt: 1_900,
  }
}
