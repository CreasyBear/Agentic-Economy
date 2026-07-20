import { describe, expect, it, vi } from 'vitest'

import {
  buildDevelopmentPublishedOperationEvidence,
  verifyDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'
import {
  invokeRegisteredRouteTransport,
  type RouteTransportInvocation,
} from '@/modules/capability-supply/route-transport-runtime'
import {
  admitRegisteredTransport,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  importX402Capability,
  materializePublishedOperation,
} from '@/modules/capability-supply/public'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

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
    expect(packet.descriptor.validateInput({ symbol: 'ETH', convert: 'USD' })).toBe(false)
    expect(packet.descriptor.validateInput({ symbol: 'BTC', convert: 'EUR' })).toBe(false)
    expect(packet.descriptor.validateInput({
      symbol: 'BTC',
      convert: 'USD',
      method: 'POST',
      payTo: '0xattacker',
    })).toBe(false)
  })

  it('accepts only the exact BTC/USD provider evidence shape', () => {
    const { descriptor } = buildDevelopmentPublishedOperationEvidence()
    const exact = {
      data: {
        BTC: {
          symbol: 'BTC',
          quote: {
            USD: { price: 100_000, last_updated: '2026-07-20T08:00:00.000Z' },
          },
        },
      },
    }
    expect(descriptor.validateOutput(exact)).toBe(true)
    expect(descriptor.validateOutput({
      data: {
        BTC: {
          symbol: 'BTC',
          quote: {
            EUR: { price: 90_000, last_updated: '2026-07-20T08:00:00.000Z' },
          },
        },
      },
    })).toBe(false)
    expect(descriptor.validateOutput({ data: { BTC: { price: 100_000 } } })).toBe(false)
  })

  it('runs the admitted GET material rather than a hand-built binding', async () => {
    const packet = buildDevelopmentPublishedOperationEvidence()
    const send = vi.fn(async (url: URL, init?: { method?: string; body?: string }) => {
      expect(url.href).toBe(
        'https://provider.example/x402/v3/cryptocurrency/quotes/latest?symbol=BTC&convert=USD',
      )
      expect(init?.method).toBe('GET')
      expect(init?.body).toBeUndefined()
      return Response.json({
        data: {
          BTC: {
            symbol: 'BTC',
            quote: {
              USD: { price: 100_000, last_updated: '2026-07-20T08:00:00.000Z' },
            },
          },
        },
      })
    })
    const invocation: RouteTransportInvocation = {
      binding: {
        adapterId: packet.operation.identity.adapterId,
        endpointUrl: packet.operation.binding.endpointUrl,
        credentialRef: packet.operation.binding.credentialRef,
        ...packet.operation.transport,
      },
      authority: {
        attemptRef: 'mock:attempt:get',
        operationKeyDigest: canonicalDigest({ operation: packet.operation.operationId }),
        mandateDigest: canonicalDigest({ mandate: 'mock' }),
        grantDigest: canonicalDigest({ grant: 'mock' }),
        capabilityContractDigest: packet.operation.identity.contractDigest,
        maximumSpend: { currency: 'USD', amountMinor: 1 },
        expiresAt: Date.now() + 120_000,
        callIdentity: { keyId: 'mock:key', signature: 'mock:signature' },
      },
      inputJson: JSON.stringify({ symbol: 'BTC', convert: 'USD' }),
    }
    await expect(invokeRegisteredRouteTransport(invocation, {
      send,
      resolveCredential: () => 'mock-credential',
      createX402PaymentSignature: async () => undefined,
    })).resolves.toMatchObject({ transport: 'x402', disposition: 'succeeded' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each(['GET', 'POST'] as const)(
    'carries imported x402 %s through admission, materialization and runtime',
    async (method) => {
      const operation = buildImportedOperation(method)
      const send = vi.fn(async (url: URL, init?: { method?: string; body?: string }) => {
        expect(init?.method).toBe(method)
        if (method === 'GET') {
          expect(url.search).toBe('?symbol=BTC&convert=USD')
          expect(init?.body).toBeUndefined()
        } else {
          expect(url.search).toBe('')
          expect(JSON.parse(String(init?.body))).toEqual({ symbol: 'BTC', convert: 'USD' })
        }
        return Response.json({
          data: {
            BTC: {
              symbol: 'BTC',
              quote: {
                USD: { price: 100_000, last_updated: '2026-07-20T08:00:00.000Z' },
              },
            },
          },
        })
      })
      await expect(invokeRegisteredRouteTransport({
        binding: {
          adapterId: operation.identity.adapterId,
          endpointUrl: operation.binding.endpointUrl,
          credentialRef: operation.binding.credentialRef,
          ...operation.transport,
        },
        authority: {
          attemptRef: `mock:attempt:${method}`,
          operationKeyDigest: canonicalDigest({ operation: operation.operationId, method }),
          mandateDigest: canonicalDigest({ mandate: 'mock' }),
          grantDigest: canonicalDigest({ grant: 'mock' }),
          capabilityContractDigest: operation.identity.contractDigest,
          maximumSpend: { currency: 'USD', amountMinor: 1 },
          expiresAt: Date.now() + 120_000,
          callIdentity: { keyId: 'mock:key', signature: 'mock:signature' },
        },
        inputJson: JSON.stringify({ symbol: 'BTC', convert: 'USD' }),
      }, {
        send,
        resolveCredential: () => 'mock-credential',
        createX402PaymentSignature: async () => undefined,
      })).resolves.toMatchObject({ transport: 'x402', disposition: 'succeeded' })
    },
  )

  it.each([
    ['offering price', (packet: any) => { packet.sourceMaterial.offering.presentation.price.amountMinor = 2 }],
    ['binding payTo', (packet: any) => { packet.sourceMaterial.binding.adapter.config.payTo = '0xattacker' }],
    ['binding network', (packet: any) => { packet.sourceMaterial.binding.adapter.config.network = 'eip155:1' }],
    ['binding asset', (packet: any) => { packet.sourceMaterial.binding.adapter.config.asset = '0xattacker' }],
    ['offering amount', (packet: any) => { packet.sourceMaterial.offering.presentation.price.amountMinor = 99 }],
    ['method mismatch', (packet: any) => { packet.sourceMaterial.binding.adapter.config.method = 'POST' }],
    ['admitted config', (packet: any) => { packet.sourceMaterial.admittedTransport.configJson = '{"method":"POST"}' }],
    ['binding source digest', (packet: any) => { packet.sourceMaterial.qualification.sources[3].digest = canonicalDigest({ forged: true }) }],
    ['operation material', (packet: any) => { packet.operation.identity.payTo = '0xattacker' }],
    ['readiness', (packet: any) => { packet.readinessObservation.validUntil += 1 }],
    ['usage', (packet: any) => { packet.operation.usageObservation.calls = 9; packet.operation.materialDigest = canonicalDigest(packet.operation.identity) }],
    ['endpoint', (packet: any) => { packet.operation.identity.endpoint.path = '/attacker'; packet.operation.materialDigest = canonicalDigest(packet.operation.identity) }],
    ['descriptor', (packet: any) => { packet.descriptor.retryClass = 'replayable' }],
  ])('rejects independently rebuilt %s tampering', (_label, tamper) => {
    const packet: any = buildDevelopmentPublishedOperationEvidence()
    tamper(packet)
    expect(() => verifyDevelopmentPublishedOperationEvidence(packet)).toThrow(
      'development_published_operation_evidence_invalid',
    )
  })
})

function buildImportedOperation(method: 'GET' | 'POST') {
  const base = buildDevelopmentPublishedOperationEvidence()
  const source = base.sourceMaterial
  const { contractFormat: _format, inputSchema, outputSchema, ref: _ref, ...metadata } = source.contract
  const imported = importX402Capability({
    kind: 'x402',
    resource: {
      resourceUrl: source.binding.endpointUrl,
      method,
      ...(method === 'GET'
        ? { query: [{ inputPointer: '/symbol', parameter: 'symbol' }, { inputPointer: '/convert', parameter: 'convert' }] }
        : {}),
      inputSchema,
      outputSchema,
      price: { currency: 'USD', amountMinor: 1 },
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0xmock-usdc',
      payTo: '0xmock-provider-recipient',
      routeAmountExponent: 2,
      assetAmountExponent: 6,
    },
    contract: metadata,
    commercial: {
      offering: {
        offeringId: source.offering.offeringId,
        networkId: source.offering.networkId,
        presentation: source.offering.presentation,
        searchTerms: source.offering.searchTerms,
        registrationEvidenceRefs: source.offering.registrationEvidenceRefs,
      },
      bindingId: source.binding.bindingId,
      credentialRef: source.binding.credentialRef,
      registrationEvidenceRefs: source.binding.registrationEvidenceRefs,
      requestTimeoutMs: 5_000,
    },
    evidenceRefs: [`mock:source:${method}`],
  })
  if (imported.kind !== 'normalized') throw new Error(imported.reason)
  const contract = defineCapabilityContract(JSON.parse(imported.draft.documentJson))
  const offering = defineCapabilityOfferingRegistration({
    ...imported.draft.offering,
    businessId: source.offering.businessId,
    contractRef: contract.ref,
  })
  const binding = defineCapabilityTransportBindingRegistration({
    ...imported.draft.binding,
    offeringId: offering.offeringId,
    networkId: offering.networkId,
    contractRef: contract.ref,
  })
  const admission = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    credentialRef: binding.credentialRef,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config,
  })
  if (admission.kind !== 'admitted') throw new Error(admission.reason)
  const offeringDigest = capabilityOfferingRegistrationHash(offering)
  const bindingDigest = capabilityBindingRegistrationHash(binding, admission.transport)
  const qualification = {
    ...source.qualification,
    candidate: {
      ...source.qualification.candidate,
      contractRef: contract.ref,
    },
    sources: source.qualification.sources.map((entry) => {
      if (entry.kind === 'publication') {
        return { ...entry, digest: imported.draft.source.descriptorDigest }
      }
      if (entry.kind === 'contract') return { ...entry, digest: contract.ref.contractDigest }
      if (entry.kind === 'offering') return { ...entry, digest: offeringDigest }
      if (entry.kind === 'binding') return { ...entry, digest: bindingDigest }
      return entry
    }),
  }
  return materializePublishedOperation({
    publication: {
      ...source.publication,
      sourceDigest: imported.draft.source.descriptorDigest,
    },
    contract,
    offering,
    binding,
    admittedTransport: admission.transport,
    qualification,
    ...(source.usageObservation === undefined ? {} : { usageObservation: source.usageObservation }),
  })
}
