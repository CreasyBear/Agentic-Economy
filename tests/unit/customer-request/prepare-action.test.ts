import { describe, expect, it } from 'vitest'

import {
  createInMemoryCustomerRequestPreparationStore,
  prepareCustomerRequestAction,
  projectPreparationRefusalForCustomer,
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
import {
  createInMemoryPreparationDisclosureStore,
  preparationAuthorityDigest,
  type VerifiedPreparationAuthority,
} from '@/modules/customer-request/preparation-authority'
import { canonicalDigest } from '@/modules/common/canonical-digest'

describe('prepare customer request action', () => {
  it('persists and replays unranked customer options without inventing a recommendation', async () => {
    const candidateSet = {
      inspectionRef: 'prepared-options:opaque-1',
      candidates: [{
        optionRef: 'option:opaque-1', business: { name: 'Courier A' },
        expectedCost: { currency: 'AUD', amountMinor: 1_200 }, maximumCost: { currency: 'AUD', amountMinor: 1_300 },
        expectedLatencyMs: 500, priceComponents: [{ label: 'Service', amountMinor: 1_200 }],
        comparableOutputs: [{ label: 'Service level', value: 'Tracked' }], materialTerms: ['Tracked service'],
        cancellation: { kind: 'unsupported' as const, summary: 'No booking is created.' }, expiresAt: 2_000,
        inspectionRef: 'evidence_opaque-1',
      }],
      attempts: [
        { business: { name: 'Courier A' }, status: 'option_received' as const, explanation: 'This business returned a usable option.' },
        { business: { name: 'Courier B' }, status: 'uncertain' as const, explanation: 'AE is checking this option.' },
      ],
    }
    const fixture = setup({ routeResult: { kind: 'candidate_set', candidateSet } })

    const first = await prepareCustomerRequestAction(command(), fixture.dependencies)
    const replay = await prepareCustomerRequestAction(command(), fixture.dependencies)

    expect(first).toEqual({
      kind: 'options_prepared', preparationScope: 'request:shipping:1:1:plan:shipping:1:action:quote', candidateSet,
    })
    expect(replay).toEqual(first)
    expect(fixture.routeCalls).toBe(1)
    const visible = JSON.stringify(first)
    expect(visible).not.toMatch(/selected|recommended|cheapest|best|bindingId|capabilityContractId|Digest|RootRun|grant/i)
  })

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
    const { preparationAuthorityEvidenceRef: _authority, ...withoutGrant } = command()

    const result = await prepareCustomerRequestAction(withoutGrant, fixture.dependencies)

    expect(result).toEqual({
      kind: 'preparation_refused', preparationScope: 'request:shipping:1:1:plan:shipping:1:action:quote',
      reason: 'preparation_authority_required',
    })
    expect(fixture.routeCalls).toBe(0)
  })

  it('turns authority refusal codes into a customer action instead of protocol copy', () => {
    expect(projectPreparationRefusalForCustomer('authority_recipient_capacity_exceeded')).toEqual({
      title: 'Sharing limit reached',
      explanation: 'This comparison would contact more businesses than the customer allowed.',
      nextAction: 'Reduce the businesses compared or ask the customer to raise the limit.',
    })
  })

  it('keeps protected values behind the allocation-bound release port', async () => {
    let observedInput: unknown
    const fixture = setup({ onRouteInput: (input) => { observedInput = input } })

    await prepareCustomerRequestAction(command(), fixture.dependencies)

    expect(observedInput).toMatchObject({ publicInput: {}, releasePreparationData: expect.any(Function) })
    expect(observedInput).not.toHaveProperty('resolvedInput')
    expect(JSON.stringify(observedInput)).not.toContain('3000')
  })

  it('resolves customer-fact plan inputs from the persisted Request before preparation', async () => {
    const fixture = setup({ useCustomerFact: true })
    await expect(prepareCustomerRequestAction(command(), fixture.dependencies)).resolves.toMatchObject({ kind: 'prepared' })
    expect(fixture.routeCalls).toBe(1)
  })

  it('preserves an inspection reference when provider data release is uncertain', async () => {
    const fixture = setup({ failDisclosureRelease: true })

    const result = await prepareCustomerRequestAction(command(), fixture.dependencies)

    expect(result).toMatchObject({
      kind: 'preparation_in_progress',
      inspectionRef: expect.stringMatching(/^preparation-allocation:/),
    })
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
        {
          dataCategory: 'Destination postcode', timing: 'already_shared_to_prepare', recipientName: 'Courier A',
          purposeLabels: ['Shipping rate quote'], status: 'released', recordedAt: 1_000,
        },
        {
          dataCategory: 'Destination postcode', timing: 'already_shared_to_prepare', recipientName: 'Courier B',
          purposeLabels: ['Shipping rate quote'], status: 'released', recordedAt: 1_000,
        },
      ],
      actions: [
        { kind: 'approve', label: 'Approve this option' },
        { kind: 'change', label: 'Change request' },
        { kind: 'decline', label: 'Decline' },
      ],
    })
    expect(JSON.stringify(review)).not.toMatch(/quoteId|quoteDigest|bindingId|routing|protocol|rootRun|destinationPostcode|shipping_rate_quote/i)
  })
})

function setup(options: {
  quote?: PreparedRouteQuote
  routeResult?: Awaited<ReturnType<CustomerRequestActionRouter['route']>>
  beforeRouteReturn?: () => Promise<void>
  failFirstCommit?: boolean
  failDisclosureRelease?: boolean
  onRouteInput?: (input: Parameters<CustomerRequestActionRouter['route']>[0]) => void
  useCustomerFact?: boolean
} = {}) {
  let now = 1_000
  let routeCalls = 0
  let providerQuoteCalls = 0
  let providerDisclosureCalls = 0
  let failedCommit = false
  const quotes = new Map<string, PreparedRouteQuote>()
  const store = createInMemoryCustomerRequestPreparationStore()
  const registry = contracts(options.useCustomerFact === true)
  const request = customerRequest(options.useCustomerFact === true)
  const plan = planRevision(registry, options.useCustomerFact === true)
  store.putRequest(request)
  store.putPlanRevision(plan)

  const router: CustomerRequestActionRouter = {
    route: async (input) => {
      routeCalls += 1
      options.onRouteInput?.(input)
      await options.beforeRouteReturn?.()
      if (options.routeResult !== undefined) return options.routeResult
      const existing = quotes.get(input.routingRequestId)
      if (existing === undefined) providerQuoteCalls += 1
      const value = existing ?? options.quote ?? quote()
      for (const disclosure of value.preparationDisclosures) {
        const definition = input.contract.input[disclosure.field]?.disclosure
        if (definition === undefined || input.releasePreparationData === undefined) {
          return { kind: 'no_route', reason: 'preparation_release_missing' }
        }
        for (const purpose of definition.purposes) {
          const released = await input.releasePreparationData({
            releaseKey: `${disclosure.recipient.bindingId}:${purpose}:${disclosure.field}`,
            recipient: { ...disclosure.recipient, kind: definition.recipient },
            purpose,
            purposeLabel: input.contract.preparation!.customerLabel,
            fields: [disclosure.field],
            release: async () => {
              providerDisclosureCalls += 1
              if (options.failDisclosureRelease === true) throw new Error('provider_release_timeout')
              return { kind: 'released', providerEvidenceRef: `provider:evidence:${disclosure.recipient.bindingId}:${purpose}` }
            },
          })
          if (released.kind !== 'released') return {
            kind: 'no_route', reason: released.kind === 'refused' ? released.reason : released.kind,
          }
        }
      }
      if (existing === undefined) quotes.set(input.routingRequestId, value)
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
  const preparationAuthority = authority()
  const dependencies = {
    store, router, registry,
    preparationAuthorityVerifier: {
      verify: async () => ({ kind: 'verified' as const, authority: preparationAuthority }),
    },
    preparationDisclosureStore: createInMemoryPreparationDisclosureStore([preparationAuthority]),
    commitProtectedProjection: (input: Readonly<Record<string, string | number | boolean>>) => `hmac-sha256:${canonicalDigest(input).slice(7)}`,
    now: () => now, leaseMs: 100,
  }
  return {
    dependencies, router,
    setNow: (value: number) => { now = value },
    get routeCalls() { return routeCalls },
    get providerQuoteCalls() { return providerQuoteCalls },
    get providerDisclosureCalls() { return providerDisclosureCalls },
  }
}

function command(preparationKey = 'preparation:shipping:1') {
  return {
    preparationKey,
    requestId: 'request:shipping:1', requestRevision: 1,
    planRevisionId: 'plan:shipping:1', actionId: 'action:quote',
    resolvedInput: { destinationPostcode: '3000' },
    preparationAuthorityEvidenceRef: 'auth:evidence:1',
  } as const
}

function authority(): VerifiedPreparationAuthority {
  const material: Omit<VerifiedPreparationAuthority, 'authorityDigest' | 'status' | 'verification'> = {
    authorityId: 'preparation-authority:1', authorityVersion: 1,
    principalId: 'principal:customer:1', delegatedAgentId: 'agent:customer:1',
    requestId: 'request:shipping:1', requestRevision: 1, mode: 'single_use' as const,
    permittedFields: ['destinationPostcode'], permittedRecipientKinds: ['candidate_provider'],
    permittedRecipientBindingIds: ['binding:courier-a', 'binding:courier-b'], permittedPurposes: ['shipping_rate_quote'],
    maximumRecipients: 2, maximumExposures: 2, maximumOperations: 1, grantedAt: 900, expiresAt: 2_000,
  }
  return {
    ...material, status: 'active', authorityDigest: preparationAuthorityDigest(material),
    verification: {
      evidenceRef: 'auth:evidence:1', issuerId: 'issuer:ae', signerId: 'signer:trusted', keyId: 'key:trusted:1',
    },
  }
}

function customerRequest(withKnownFact = false) {
  return createCustomerRequest({
    requestId: 'request:shipping:1', principalId: 'principal:customer:1', delegatedAgentId: 'agent:customer:1',
    intent: 'Compare courier prices.', routing: { networkId: 'network:au-first', currency: 'AUD', maximumSpendMinor: 1_500, optimizeFor: 'cost' },
    ...(withKnownFact ? { knownFacts: { destinationPostcode: '3000' } } : {}), createdAt: 900,
  })
}

function planRevision(registry: ReturnType<typeof contracts>, useCustomerFact = false) {
  return createPlanRevision({
    planRevisionId: 'plan:shipping:1', requestId: 'request:shipping:1', requestRevision: 1,
    proposedByAgentId: 'agent:customer:1',
    proposalProvenance: { kind: 'direct_structured', proposalDigest: 'sha256:' + '1'.repeat(64) }, createdAt: 950,
    completionEvidence: [{ actionId: 'action:quote', field: 'offerRef' }],
    actions: [{
      actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1', dependsOn: [],
      input: { destinationPostcode: useCustomerFact ? { kind: 'customer_fact', fact: 'destinationPostcode' } : { kind: 'literal', value: '3000' } },
    }],
  }, registry)
}

function contracts(customerFactAtPreparation = false) {
  return createCapabilityContractRegistry([defineCapabilityContract({
    capabilityContractId: 'shipping.rate.query:v1', name: 'Query shipping rates', operation: 'query',
    preparation: { purpose: 'shipping_rate_quote', customerLabel: 'Prepare shipping rates' },
    input: {
      destinationPostcode: {
        valueType: 'string', customerLabel: 'Destination postcode', required: true,
        ...(customerFactAtPreparation ? { decisionRelevance: 'commitment' as const } : {}),
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
