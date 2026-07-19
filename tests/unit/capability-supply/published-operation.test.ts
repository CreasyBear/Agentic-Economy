import { describe, expect, it } from 'vitest'

import {
  buildDevelopmentPublishedOperationEvidence,
  verifyDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'

describe('published operation materialization', () => {
  it('binds exact publication, contract, offering, transport, price, readiness and separate usage evidence', () => {
    const packet = buildDevelopmentPublishedOperationEvidence()
    expect(() => verifyDevelopmentPublishedOperationEvidence(packet)).not.toThrow()
    expect(packet.discovery).toHaveLength(5)
    expect(packet.operation.identity).toMatchObject({
      businessId: 'mock:business:published-api',
      publicationRevision: 7,
      contractId: 'cryptocurrency.quotes.latest',
      contractVersion: 1,
      adapterId: 'x402-fetch:v2',
      endpoint: {
        method: 'GET',
        path: '/x402/v3/cryptocurrency/quotes/latest',
      },
      price: { kind: 'fixed', currency: 'USD', amountMinor: 1 },
    })
    expect(packet.operation.usageObservation).toMatchObject({
      calls: 8,
      distinctPayers: 2,
      source: 'mock:provider-attributed-usage-export',
    })
    expect(packet.operation.usageObservation?.evidenceRefs).not.toEqual(
      packet.operation.readiness.evidenceRefs,
    )
    expect(packet.descriptor).toMatchObject({
      authorityRequirement: 'principal',
      retryClass: 'reconcile_before_retry',
      consequenceClass: 'communication',
    })
  })

  it('rejects a caller attempt to widen the closed operation input', () => {
    const packet = buildDevelopmentPublishedOperationEvidence()
    expect(packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD' })).toBe(true)
    expect(packet.descriptor.validateInput({
      symbol: 'BTC',
      convert: 'USD',
      method: 'POST',
      payTo: '0xattacker',
    })).toBe(false)
  })
})
