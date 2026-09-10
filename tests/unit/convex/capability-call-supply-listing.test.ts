import { describe, expect, it } from 'vitest'

import { listAgentSupplyCallsHandler } from '../../../convex/capabilityCallProjection'

type Row = Record<string, unknown>

function business(overrides: Row = {}): Row {
  return {
    _id: 'business:a',
    owningAccountRef: 'owner:a',
    updatedAt: 100,
    ...overrides,
  }
}

function toolProjection(overrides: Row = {}): Row {
  return {
    businessId: 'business:a',
    toolRef: 'tool:a1',
    updatedAt: 100,
    ...overrides,
  }
}

function call(overrides: Row = {}): Row {
  return {
    callRef: 'call:a1',
    principalId: 'buyer-principal',
    ownerId: 'buyer-owner-account',
    credentialId: 'buyer-credential',
    applicationRef: 'application:one',
    toolRef: 'tool:a1',
    idempotencyKey: 'idempotency-secret',
    environment: 'sandbox',
    grantRef: 'grant:one',
    grantGeneration: 1,
    policyDigest: 'policy:one',
    grantExpiresAt: 10_000,
    inputJson: JSON.stringify({ buyerSecretPayload: true }),
    toolJson: JSON.stringify({ buyerSecretPayload: true }),
    inputDigest: 'input:one',
    requestDigest: 'request:one',
    state: 'completed',
    createdAt: 30,
    updatedAt: 30,
    ...overrides,
  }
}

function sortRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const aKey = (a.createdAt ?? a.updatedAt) as number
    const bKey = (b.createdAt ?? b.updatedAt) as number
    if (bKey !== aKey) return bKey - aKey
    const aRef = String(a.callRef ?? a.toolRef ?? a._id ?? '')
    const bRef = String(b.callRef ?? b.toolRef ?? b._id ?? '')
    return aRef < bRef ? 1 : aRef > bRef ? -1 : 0
  })
}

function makeChain(rows: Row[]) {
  let filtered = rows
  const range = {
    eq(field: string, value: unknown) {
      filtered = filtered.filter((row) => row[field] === value)
      return range
    },
    lte(field: string, value: unknown) {
      filtered = filtered.filter((row) => (row[field] as number) <= (value as number))
      return range
    },
  }
  const chain = {
    withIndex(_name: string, apply: (query: typeof range) => unknown) {
      apply(range)
      return chain
    },
    order(_direction: 'asc' | 'desc') {
      return {
        take: async (count: number) => sortRows(filtered).slice(0, count),
      }
    },
  }
  return chain
}

function context(tables: { businesses: Row[]; tools: Row[]; calls: Row[] }) {
  return {
    db: {
      query: (table: 'businesses' | 'capabilityProviderToolProjections' | 'capabilityCalls') => {
        if (table === 'businesses') return makeChain(tables.businesses)
        if (table === 'capabilityProviderToolProjections') return makeChain(tables.tools)
        return makeChain(tables.calls)
      },
    },
  }
}

describe('Provider Calls listing (ae supply calls)', () => {
  it("returns only the caller's Tools' Calls across two providers", async () => {
    const ctx = context({
      businesses: [business({ _id: 'business:a', owningAccountRef: 'owner:a' }), business({ _id: 'business:b', owningAccountRef: 'owner:b' })],
      tools: [
        toolProjection({ businessId: 'business:a', toolRef: 'tool:a1' }),
        toolProjection({ businessId: 'business:b', toolRef: 'tool:b1' }),
      ],
      calls: [
        call({ callRef: 'call:a1', toolRef: 'tool:a1', createdAt: 30 }),
        call({ callRef: 'call:b1', toolRef: 'tool:b1', createdAt: 40 }),
      ],
    })

    const result = await listAgentSupplyCallsHandler(ctx as never, { ownerId: 'owner:a', limit: 20 })

    expect(result.kind).toBe('available')
    expect(result.items.map((item) => item.callRef)).toEqual(['call:a1'])
    expect(result.items.every((item) => item.toolRef === 'tool:a1')).toBe(true)
  })

  it('never exposes buyer identity, credentials, idempotency keys, or input/tool payloads', async () => {
    const ctx = context({
      businesses: [business()],
      tools: [toolProjection()],
      calls: [
        call({
          callRef: 'call:a1',
          createdAt: 30,
          state: 'completed',
          result: {
            kind: 'completed',
            callRef: 'call:a1',
            toolRef: 'tool:a1',
            output: {},
            evidenceHash: 'evidence:one',
            receipt: {
              receiptRef: 'receipt:one',
              state: 'settled',
              priceDigest: 'price:one',
              evidenceHash: 'evidence:one',
              issuedAt: new Date(30).toISOString(),
              commercialModel: 'account_aud',
              buyerCharge: { currency: 'AUD', units: '600', exponent: 2 },
              serviceFee: { currency: 'AUD', units: '100', exponent: 2 },
              totalBuyerCharge: { currency: 'AUD', units: '700', exponent: 2 },
              providerObligation: {
                amount: { currency: 'AUD', units: '500', exponent: 2 },
                settlementMethod: 'managed_x402',
                payoutEligible: false,
              },
              providerSettlement: {
                amount: { currency: 'AUD', units: '500', exponent: 2 },
                network: 'eip155:8453',
                asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              },
            },
          },
        }),
      ],
    })

    const result = await listAgentSupplyCallsHandler(ctx as never, { ownerId: 'owner:a', limit: 20 })

    expect(result.kind).toBe('available')
    expect(result.items).toEqual([
      expect.objectContaining({
        callRef: 'call:a1',
        toolRef: 'tool:a1',
        state: 'completed',
        outcome: 'completed',
        settledAmount: { currency: 'AUD', units: '500', exponent: 2 },
      }),
    ])
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('buyer-principal')
    expect(serialized).not.toContain('buyer-owner-account')
    expect(serialized).not.toContain('buyer-credential')
    expect(serialized).not.toContain('idempotency-secret')
    expect(serialized).not.toContain('buyerSecretPayload')
    // the buyer's total/gross charge must never leak into the provider projection
    expect(serialized).not.toContain('700')
    expect(serialized).not.toContain('600')
  })

  it('paginates newest first with a stable keyset cursor', async () => {
    const ctx = context({
      businesses: [business()],
      tools: [toolProjection()],
      calls: [
        call({ callRef: 'call:newest', createdAt: 30 }),
        call({ callRef: 'call:oldest', createdAt: 20 }),
      ],
    })

    const firstPage = await listAgentSupplyCallsHandler(ctx as never, { ownerId: 'owner:a', limit: 1 })
    expect(firstPage.kind).toBe('available')
    expect(firstPage.items.map((item) => item.callRef)).toEqual(['call:newest'])
    expect(firstPage).toMatchObject({ hasMore: true, nextCursor: { createdAt: 30, callRef: 'call:newest' } })

    const secondPage = await listAgentSupplyCallsHandler(ctx as never, {
      ownerId: 'owner:a',
      limit: 1,
      cursor: (firstPage as { nextCursor: { createdAt: number; callRef: string } }).nextCursor,
    })
    expect(secondPage.kind).toBe('available')
    expect(secondPage.items.map((item) => item.callRef)).toEqual(['call:oldest'])
    expect(secondPage).toMatchObject({ hasMore: false })
  })

  it('filters by state within the returned page', async () => {
    const ctx = context({
      businesses: [business()],
      tools: [toolProjection()],
      calls: [
        call({ callRef: 'call:completed', createdAt: 30, state: 'completed' }),
        call({ callRef: 'call:pending', createdAt: 20, state: 'pending', result: undefined }),
      ],
    })

    const result = await listAgentSupplyCallsHandler(ctx as never, { ownerId: 'owner:a', limit: 20, state: 'pending' })
    expect(result.kind).toBe('available')
    expect(result.items.map((item) => item.callRef)).toEqual(['call:pending'])
  })

  it('reports no Calls when the owner has no current Tools', async () => {
    const ctx = context({ businesses: [business()], tools: [], calls: [] })
    const result = await listAgentSupplyCallsHandler(ctx as never, { ownerId: 'owner:a', limit: 20 })
    expect(result).toEqual({ kind: 'available', items: [], limit: 20, hasMore: false })
  })
})
