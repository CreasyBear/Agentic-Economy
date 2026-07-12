import { describe, expect, it } from 'vitest'

import { preparedActionDigest } from '@/modules/customer-request/preparation'
import type { PreparedAction } from '@/modules/customer-request/public'
import { claimPreparation, commitCompilation, completePreparation, getRequest, getRequestRevision, putPlanRevision, putRequest } from '../../../convex/customerRequests'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type Handler<Args> = (ctx: { db: FakeDb }, args: Args) => Promise<unknown>

const putRequestHandler = (putRequest as unknown as { _handler: Handler<{ request: ReturnType<typeof request> }> })._handler
const putPlanHandler = (putPlanRevision as unknown as { _handler: Handler<{ plan: ReturnType<typeof plan> }> })._handler
const claimHandler = (claimPreparation as unknown as { _handler: Handler<ReturnType<typeof claim>> })._handler
const completeHandler = (completePreparation as unknown as { _handler: Handler<{
  preparationScope: string; claimToken: string; preparedAction: PreparedAction; completedAt: number
}> })._handler
const commitCompilationHandler = (commitCompilation as unknown as { _handler: Handler<{
  compilationKey: string; commandDigest: string; expectedRevision: number
  request: ReturnType<typeof request>; planRevision?: ReturnType<typeof plan>
  outcome: { kind: 'plan_ready' } | { kind: 'unsupported'; reason: 'unsafe_proposal' }
}> })._handler
const getRequestHandler = (getRequest as unknown as { _handler: Handler<{ requestId: string }> })._handler
const getRequestRevisionHandler = (getRequestRevision as unknown as {
  _handler: Handler<{ requestId: string; revision: number }>
})._handler

describe('customer request durable preparation store', () => {
  it('atomically advances one Request revision and preserves immutable history', async () => {
    const db = new FakeDb()
    const firstRequest = request()
    await expect(commitCompilationHandler({ db }, {
      compilationKey: 'compile:1', commandDigest: 'sha256:' + '1'.repeat(64), expectedRevision: 0,
      request: firstRequest, planRevision: plan(), outcome: { kind: 'plan_ready' },
    })).resolves.toEqual({ kind: 'stored' })

    const secondRequest = { ...firstRequest, revision: 2, intent: 'Compare express courier prices.' }
    const winner = await commitCompilationHandler({ db }, {
      compilationKey: 'compile:2:a', commandDigest: 'sha256:' + '2'.repeat(64), expectedRevision: 1,
      request: secondRequest, outcome: { kind: 'unsupported', reason: 'unsafe_proposal' },
    })
    const stale = await commitCompilationHandler({ db }, {
      compilationKey: 'compile:2:b', commandDigest: 'sha256:' + '3'.repeat(64), expectedRevision: 1,
      request: { ...secondRequest, intent: 'Compare same-day courier prices.' },
      outcome: { kind: 'unsupported', reason: 'unsafe_proposal' },
    })

    expect(winner).toEqual({ kind: 'stored' })
    expect(stale).toEqual({ kind: 'revision_conflict' })
    expect(db.rows('customerRequests')).toHaveLength(1)
    expect(db.rows('customerRequestRevisions').map((row) => row.revision)).toEqual([1, 2])
    expect(db.rows('customerRequestPlanRevisions')).toHaveLength(1)
  })

  it('normalizes legacy Request rows during the expand migration window', async () => {
    const db = new FakeDb()
    await db.insert('customerRequests', {
      requestId: 'request:legacy', principalId: 'principal:1', delegatedAgentId: 'agent:1',
      intent: 'Compare courier prices.', revision: 1,
      routing: { networkId: 'network:au-first', currency: 'AUD', maximumSpendMinor: 1_500, optimizeFor: 'cost' },
      createdAt: 900, requestDigest: 'sha256:' + '1'.repeat(64), updatedAt: 900,
    })

    await expect(getRequestHandler({ db }, { requestId: 'request:legacy' })).resolves.toMatchObject({
      requestId: 'request:legacy', knownFacts: {},
      understanding: { outcome: 'Compare courier prices.', completionCriterion: 'Compare courier prices.' },
    })

    const revised = {
      ...request(), requestId: 'request:legacy', revision: 2, intent: 'Compare express courier prices.',
    }
    await expect(commitCompilationHandler({ db }, {
      compilationKey: 'compile:legacy:2', commandDigest: 'sha256:' + '2'.repeat(64), expectedRevision: 1,
      request: revised, outcome: { kind: 'unsupported', reason: 'unsafe_proposal' },
    })).resolves.toEqual({ kind: 'stored' })
    await expect(getRequestRevisionHandler({ db }, { requestId: 'request:legacy', revision: 1 })).resolves.toMatchObject({
      requestId: 'request:legacy', revision: 1, compilationState: 'submitted',
    })
    await expect(getRequestRevisionHandler({ db }, { requestId: 'request:legacy', revision: 2 })).resolves.toMatchObject({
      requestId: 'request:legacy', revision: 2,
    })
  })

  it('uses Request revision and preparation scope as a CAS boundary for concurrent workers', async () => {
    const db = new FakeDb()
    await seed(db)

    const first = await claimHandler({ db }, claim(1_000))
    const concurrent = await claimHandler({ db }, claim(1_001))
    const reclaimed = await claimHandler({ db }, claim(1_200))

    expect(first).toEqual({ kind: 'claimed', claimToken: 'claim:1', routingRequestId: 'route:1', claimedAt: 1_000 })
    expect(concurrent).toEqual({ kind: 'in_progress' })
    expect(reclaimed).toEqual({ kind: 'claimed', claimToken: 'claim:1:retry:1200', routingRequestId: 'route:1', claimedAt: 1_000 })

    const prepared = preparedAction()
    await expect(completeHandler({ db }, {
      preparationScope: scope, claimToken: 'claim:1:retry:1200', preparedAction: prepared, completedAt: 1_210,
    })).resolves.toEqual(prepared)
    await expect(claimHandler({ db }, claim(1_220))).resolves.toEqual({ kind: 'prepared', preparedAction: prepared })
    expect(db.rows('customerRequestPreparedActions')).toHaveLength(1)
  })

  it('rejects changed commands, stale Request revisions, and tampered prepared evidence', async () => {
    const db = new FakeDb()
    await seed(db)
    await claimHandler({ db }, claim(1_000))

    await expect(claimHandler({ db }, { ...claim(1_001), commandDigest: 'sha256:' + '9'.repeat(64) })).resolves.toEqual({ kind: 'conflict' })
    await expect(claimHandler({ db }, { ...claim(1_001), preparationScope: `${scope}:stale`, requestRevision: 2 })).resolves.toEqual({ kind: 'stale' })
    await expect(completeHandler({ db }, {
      preparationScope: scope, claimToken: 'claim:1',
      preparedAction: { ...preparedAction(), maximumGrossCost: { currency: 'AUD', amountMinor: 1_499 } },
      completedAt: 1_010,
    })).rejects.toThrowError('prepared_action_digest_invalid')
    expect(db.rows('customerRequestPreparedActions')).toEqual([])
  })
})

const scope = 'request:shipping:1:1:plan:shipping:1:action:quote'

async function seed(db: FakeDb) {
  await putRequestHandler({ db }, { request: request() })
  await putPlanHandler({ db }, { plan: plan() })
}

function request() {
  return {
    requestId: 'request:shipping:1', principalId: 'principal:1', delegatedAgentId: 'agent:1',
    intent: 'Compare courier prices.', revision: 1, compilationState: 'plan_ready' as const,
    understanding: {
      outcome: 'Comparable courier prices', hardConstraints: [], preferences: [],
      substitutions: { allowed: false, boundaries: [] }, completionCriterion: 'Return comparable quotes.',
      completionRequirement: { evidenceRole: 'provider_offer' as const, valueType: 'provider_offer_ref' as const },
    },
    knownFacts: { destinationPostcode: '3000' },
    routing: { networkId: 'network:au-first', currency: 'AUD', maximumSpendMinor: 1_500, optimizeFor: 'cost' as const },
    createdAt: 900,
  }
}

function plan() {
  return {
    planRevisionId: 'plan:shipping:1', requestId: 'request:shipping:1', requestRevision: 1,
    proposedByAgentId: 'agent:1',
    proposalProvenance: { kind: 'direct_structured' as const, proposalDigest: 'sha256:' + '1'.repeat(64) }, createdAt: 950,
    completionEvidence: [{ actionId: 'action:quote', field: 'offerRef', role: 'provider_offer' as const }],
    actions: [{
      actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1', dependsOn: [],
      input: { destinationPostcode: { kind: 'literal' as const, value: '3000' } },
    }],
  }
}

function claim(claimedAt: number) {
  return {
    preparationKey: 'preparation:1', preparationScope: scope, commandDigest: 'sha256:' + '2'.repeat(64),
    requestId: 'request:shipping:1', requestRevision: 1, planRevisionId: 'plan:shipping:1', actionId: 'action:quote',
    claimedAt, leaseExpiresAt: claimedAt + 100, claimToken: 'claim:1', routingRequestId: 'route:1',
  }
}

function preparedAction(): PreparedAction {
  const material = {
    preparedActionId: 'prepared:1', requestId: 'request:shipping:1', requestRevision: 1,
    planRevisionId: 'plan:shipping:1', actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1',
    resolvedInputDigest: 'sha256:' + '3'.repeat(64), quoteId: 'quote:1', quoteDigest: 'sha256:' + '4'.repeat(64),
    selectedBusiness: { nodeId: 'node:courier-a', bindingId: 'binding:courier-a', name: 'Courier A' },
    alternatives: [], comparisonBasis: { objective: 'cost' as const, selectedBecause: ['Lowest cost.'], commercialInfluence: 'none' as const },
    allowedFallbacks: [], expectedCost: { currency: 'AUD', amountMinor: 1_295 },
    maximumGrossCost: { currency: 'AUD', amountMinor: 1_295 },
    priceComponents: [{ kind: 'provider' as const, label: 'Provider price', amountMinor: 1_295 }],
    disclosures: [{
      field: 'destinationPostcode', dataCategory: 'Destination postcode', timing: 'already_shared_to_prepare' as const,
      recipientBindingId: 'binding:courier-a', recipientName: 'Courier A', purposes: ['shipping_rate_quote'],
      purposeLabels: ['Shipping rate quote'], status: 'released' as const, recordedAt: 1_000,
      inspectionRef: 'preparation-allocation:1',
    }],
    materialTerms: [{ key: 'validity', label: 'Validity', value: 'Until expiry.' }],
    cancellation: { kind: 'unsupported' as const, summary: 'No booking was created.' }, expiresAt: 1_900, preparedAt: 1_000,
  }
  return { ...material, preparedActionDigest: preparedActionDigest(material) }
}

class FakeDb {
  private readonly tables: Record<string, Row[]> = {}
  query(table: string) { return new FakeQuery(this.tables[table] ?? []) }
  async insert(table: string, value: Record<string, unknown>) {
    const rows = this.tables[table] ?? (this.tables[table] = [])
    const id = `${table}:${rows.length + 1}`
    rows.push({ _id: id, _creationTime: rows.length + 1, ...structuredClone(value) })
    return id
  }
  async patch(id: string, value: Record<string, unknown>) {
    const row = Object.values(this.tables).flat().find((candidate) => candidate._id === id)
    if (row === undefined) throw new Error(`row_not_found:${id}`)
    Object.assign(row, structuredClone(value))
  }
  rows(table: string) { return structuredClone(this.tables[table] ?? []) }
}

class FakeQuery {
  private readonly filters: Array<[string, unknown]> = []
  constructor(private readonly rowsValue: readonly Row[]) {}
  withIndex(_name: string, callback: (query: FakeQuery) => FakeQuery) { return callback(this) }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this }
  async unique() {
    const matches = this.rowsValue.filter((row) => this.filters.every(([field, value]) => row[field] === value))
    if (matches.length > 1) throw new Error('not_unique')
    return matches[0] ?? null
  }
}
