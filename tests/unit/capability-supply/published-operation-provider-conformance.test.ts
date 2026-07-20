import { describe, expect, it } from 'vitest'

import {
  buildDevelopmentAlternatePublishedOperationEvidence,
  verifyDevelopmentAlternatePublishedOperationEvidence,
} from '@/modules/capability-supply/development-alternate-published-operation-evidence'
import {
  developmentAlternateBtcUsdQuoteSource,
  projectDevelopmentAlternateBtcUsdQuoteResult,
} from '@/modules/capability-supply/development-alternate-btc-usd-quote-result'
import {
  buildDevelopmentPublishedOperationEvidence,
  verifyDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'
import {
  developmentBtcUsdQuoteSource,
  presentDevelopmentBtcUsdQuoteResult,
  projectDevelopmentBtcUsdQuoteResult,
  type BtcUsdQuoteProjectionDecision,
  type BtcUsdQuoteResult,
} from '@/modules/capability-supply/public'

const receivedAt = '2026-07-20T08:05:00.000Z'

const providerARawPayload = {
  data: {
    BTC: {
      symbol: 'BTC',
      quote: {
        USD: {
          price: 118_245.12,
          last_updated: '2026-07-20T08:04:00.000Z',
        },
      },
    },
  },
}

const providerBRawPayload = {
  spot: {
    base: 'BTC',
    quote: 'USD',
    amount: '118245.12',
    observed_at: '2026-07-20T08:04:00.000Z',
  },
}

type Projector = (input: Readonly<{
  payload: unknown
  receivedAt: string
}>) => BtcUsdQuoteProjectionDecision

type ProviderCase = Readonly<{
  label: string
  buildAndVerify: () => Readonly<{
    descriptor: Readonly<{
      validateInput: (value: unknown) => boolean
    }>
    operation: Readonly<{
      identity: Readonly<{
        businessId: string
        publicationRevision: number
        endpoint: Readonly<{ url: string }>
        payment: Readonly<{ kind: string; payTo?: string }>
        price: Readonly<{ kind: string; currency?: string; amountMinor?: number }>
      }>
    }>
  }>
  projector: Projector
  source: BtcUsdQuoteResult['source']
  rawPayload: unknown
  invalidPayloads: readonly Readonly<{ label: string; payload: unknown }>[]
  expected: Readonly<{
    providerId: string
    endpoint: string
    operationRevision: number
    payee: string
  }>
  assertPacketTamperingRefuses: () => void
}>

function expectTamperRefused<T>(
  build: () => T,
  verify: (packet: T) => void,
  tamper: (packet: T) => void,
): void {
  const packet = structuredClone(build())
  tamper(packet)
  expect(() => verify(packet)).toThrow()
}

function assertProviderAPacketTamperingRefuses(): void {
  expectTamperRefused(
    buildDevelopmentPublishedOperationEvidence,
    verifyDevelopmentPublishedOperationEvidence,
    (packet) => Object.assign(packet.operation.identity, {
      businessId: 'mock:business:tampered',
    }),
  )
  expectTamperRefused(
    buildDevelopmentPublishedOperationEvidence,
    verifyDevelopmentPublishedOperationEvidence,
    (packet) => Object.assign(packet.operation.identity.endpoint, {
      url: 'https://attacker.example/quote',
    }),
  )
  expectTamperRefused(
    buildDevelopmentPublishedOperationEvidence,
    verifyDevelopmentPublishedOperationEvidence,
    (packet) => Object.assign(packet.operation.identity.payment, {
      payTo: '0xattacker',
    }),
  )
  expectTamperRefused(
    buildDevelopmentPublishedOperationEvidence,
    verifyDevelopmentPublishedOperationEvidence,
    (packet) => Object.assign(packet.operation.identity, {
      publicationRevision: packet.operation.identity.publicationRevision + 1,
    }),
  )
  expectTamperRefused(
    buildDevelopmentPublishedOperationEvidence,
    verifyDevelopmentPublishedOperationEvidence,
    (packet) => Object.assign(packet.sourceMaterial.contract.outputSchema, {
      title: 'tampered raw evidence contract',
    }),
  )
}

function assertProviderBPacketTamperingRefuses(): void {
  expectTamperRefused(
    buildDevelopmentAlternatePublishedOperationEvidence,
    verifyDevelopmentAlternatePublishedOperationEvidence,
    (packet) => Object.assign(packet.operation.identity, {
      businessId: 'mock:business:tampered',
    }),
  )
  expectTamperRefused(
    buildDevelopmentAlternatePublishedOperationEvidence,
    verifyDevelopmentAlternatePublishedOperationEvidence,
    (packet) => Object.assign(packet.operation.identity.endpoint, {
      url: 'https://attacker.example/quote',
    }),
  )
  expectTamperRefused(
    buildDevelopmentAlternatePublishedOperationEvidence,
    verifyDevelopmentAlternatePublishedOperationEvidence,
    (packet) => Object.assign(packet.operation.identity.payment, {
      payTo: '0xattacker',
    }),
  )
  expectTamperRefused(
    buildDevelopmentAlternatePublishedOperationEvidence,
    verifyDevelopmentAlternatePublishedOperationEvidence,
    (packet) => Object.assign(packet.operation.identity, {
      publicationRevision: packet.operation.identity.publicationRevision + 1,
    }),
  )
  expectTamperRefused(
    buildDevelopmentAlternatePublishedOperationEvidence,
    verifyDevelopmentAlternatePublishedOperationEvidence,
    (packet) => Object.assign(packet.sourceMaterial.contract.outputSchema, {
      title: 'tampered raw evidence contract',
    }),
  )
}

const providers = [
  {
    label: 'Provider A',
    buildAndVerify: () => {
      const packet = buildDevelopmentPublishedOperationEvidence()
      verifyDevelopmentPublishedOperationEvidence(packet)
      return packet
    },
    projector: projectDevelopmentBtcUsdQuoteResult,
    source: developmentBtcUsdQuoteSource,
    rawPayload: providerARawPayload,
    invalidPayloads: [
      { label: 'wrong pair', payload: { data: { BTC: { symbol: 'ETH', quote: { USD: { price: 118_245.12, last_updated: '2026-07-20T08:04:00.000Z' } } } } } },
      { label: 'missing price', payload: { data: { BTC: { symbol: 'BTC', quote: { USD: { last_updated: '2026-07-20T08:04:00.000Z' } } } } } },
      { label: 'zero price', payload: { data: { BTC: { symbol: 'BTC', quote: { USD: { price: 0, last_updated: '2026-07-20T08:04:00.000Z' } } } } } },
      { label: 'negative price', payload: { data: { BTC: { symbol: 'BTC', quote: { USD: { price: -1, last_updated: '2026-07-20T08:04:00.000Z' } } } } } },
      { label: 'nonfinite price', payload: { data: { BTC: { symbol: 'BTC', quote: { USD: { price: Number.POSITIVE_INFINITY, last_updated: '2026-07-20T08:04:00.000Z' } } } } } },
      { label: 'bad timestamp', payload: { data: { BTC: { symbol: 'BTC', quote: { USD: { price: 118_245.12, last_updated: 'later' } } } } } },
      { label: 'future timestamp', payload: { data: { BTC: { symbol: 'BTC', quote: { USD: { price: 118_245.12, last_updated: '2026-07-20T08:05:00.001Z' } } } } } },
      { label: 'crossed Provider B payload', payload: providerBRawPayload },
    ],
    expected: {
      providerId: 'mock:business:published-api',
      endpoint: 'https://provider.example/x402/v3/cryptocurrency/quotes/latest',
      operationRevision: 7,
      payee: '0xmock-provider-recipient',
    },
    assertPacketTamperingRefuses: assertProviderAPacketTamperingRefuses,
  },
  {
    label: 'Provider B',
    buildAndVerify: () => {
      const packet = buildDevelopmentAlternatePublishedOperationEvidence()
      verifyDevelopmentAlternatePublishedOperationEvidence(packet)
      return packet
    },
    projector: projectDevelopmentAlternateBtcUsdQuoteResult,
    source: developmentAlternateBtcUsdQuoteSource,
    rawPayload: providerBRawPayload,
    invalidPayloads: [
      { label: 'wrong pair', payload: { spot: { ...providerBRawPayload.spot, base: 'ETH' } } },
      { label: 'missing price', payload: { spot: { base: 'BTC', quote: 'USD', observed_at: '2026-07-20T08:04:00.000Z' } } },
      { label: 'zero price', payload: { spot: { ...providerBRawPayload.spot, amount: '0' } } },
      { label: 'negative price', payload: { spot: { ...providerBRawPayload.spot, amount: '-1' } } },
      { label: 'nonfinite price', payload: { spot: { ...providerBRawPayload.spot, amount: 'Infinity' } } },
      { label: 'bad timestamp', payload: { spot: { ...providerBRawPayload.spot, observed_at: 'later' } } },
      { label: 'future timestamp', payload: { spot: { ...providerBRawPayload.spot, observed_at: '2026-07-20T08:05:00.001Z' } } },
      { label: 'whitespace amount', payload: { spot: { ...providerBRawPayload.spot, amount: ' 118245.12 ' } } },
      { label: 'exponent notation amount', payload: { spot: { ...providerBRawPayload.spot, amount: '1.1824512e5' } } },
      { label: 'non-decimal amount', payload: { spot: { ...providerBRawPayload.spot, amount: 'one hundred' } } },
      { label: 'crossed Provider A payload', payload: providerARawPayload },
    ],
    expected: {
      providerId: 'mock:business:alternate-quote-api',
      endpoint: 'https://alternate-provider.example/v1/spot',
      operationRevision: 3,
      payee: '0xmock-alternate-recipient',
    },
    assertPacketTamperingRefuses: assertProviderBPacketTamperingRefuses,
  },
] as const satisfies readonly ProviderCase[]

describe.each(providers)('$label published-operation provider conformance', (provider) => {
  it('independently rebuilds its evidence packet and binds exact distinct material', () => {
    const packet = provider.buildAndVerify()
    expect(packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD' })).toBe(true)
    expect(packet.descriptor.validateInput({ symbol: 'ETH', convert: 'USD' })).toBe(false)
    expect(packet.descriptor.validateInput({ symbol: 'BTC', convert: 'EUR' })).toBe(false)
    expect(packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD', extra: true })).toBe(false)
    expect(packet.operation.identity).toMatchObject({
      businessId: provider.expected.providerId,
      publicationRevision: provider.expected.operationRevision,
      endpoint: { url: provider.expected.endpoint },
      payment: { kind: 'x402', payTo: provider.expected.payee },
      price: { kind: 'fixed', currency: 'USD', amountMinor: 1 },
    })
  })

  it('normalizes its raw success payload to the shared result and presents its selected source', () => {
    const decision = provider.projector({ payload: provider.rawPayload, receivedAt })
    expect(decision).toEqual({
      kind: 'accepted',
      result: {
        base: 'BTC',
        quote: 'USD',
        price: 118_245.12,
        source: provider.source,
        observedAt: '2026-07-20T08:04:00.000Z',
        receivedAt,
        freshness: 'fresh',
        rawEvidenceRef: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    })
    const normalized = {
      base: 'BTC',
      quote: 'USD',
      price: 118_245.12,
      source: provider.source,
      observedAt: '2026-07-20T08:04:00.000Z',
      receivedAt,
      freshness: 'fresh',
      rawEvidenceRef: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    } satisfies BtcUsdQuoteResult
    const presentation = presentDevelopmentBtcUsdQuoteResult(normalized)
    expect(presentation.presentationBlocks).toContainEqual(expect.objectContaining({
      kind: 'source',
      providerId: provider.source.providerId,
      operationRevision: String(provider.source.operationRevision),
    }))
  })

  it.each(provider.invalidPayloads)('refuses $label', ({ payload }) => {
    expect(provider.projector({ payload, receivedAt })).toMatchObject({ kind: 'refused' })
  })

  it('refuses tampered provider identity, endpoint, payee, revision and raw evidence', () => {
    provider.assertPacketTamperingRefuses()
  })
})

it('keeps provider identity, endpoint, operation revision and payee distinct', () => {
  const [providerA, providerB] = providers
  expect(providerA.expected.providerId).not.toBe(providerB.expected.providerId)
  expect(providerA.expected.endpoint).not.toBe(providerB.expected.endpoint)
  expect(providerA.expected.operationRevision).not.toBe(providerB.expected.operationRevision)
  expect(providerA.expected.payee).not.toBe(providerB.expected.payee)
})
