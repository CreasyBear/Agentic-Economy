import { describe, expect, it, vi } from 'vitest'

import {
  buildDevelopmentPublishedOperationEvidence,
  verifyDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'
import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type ProviderConnectionAuthorityLookup,
  type RouteTransportInvocation,
  type RouteTransportRuntime,
  type X402PaymentSignatureRequest,
  type X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import {
  admitRegisteredTransport,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  createPublicOperationRef,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  importX402Capability,
  materializePublishedOperation,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'

async function invokeRouteTransport(
  routeInvocation: RouteTransportInvocation,
  runtime: RouteTransportRuntime,
) {
  const preparation = prepareRegisteredRouteTransportInvocation(
    routeInvocation,
    runtime.x402PaymentSigningAvailable,
  )
  return preparation.kind === 'refused'
    ? preparation.observation
    : await invokePreparedRouteTransport(preparation.prepared, runtime)
}
type ProviderRouteTransportBinding = Extract<
  RouteTransportInvocation,
  { readonly binding: { readonly authority: { readonly kind: 'provider_connection' } } }
>['binding']

function providerRouteTransportBinding(
  operation: PublishedOperation,
): ProviderRouteTransportBinding {
  const authority = operation.binding.authority
  if (authority.kind !== 'provider_connection') {
    throw new Error('provider_connection_required')
  }
  return {
    adapterId: operation.identity.adapterId,
    endpointUrl: operation.binding.endpointUrl,
    authority,
    ...operation.transport,
  }
}

function currentProviderAuthority(operation: Readonly<{
  connectionAuthority?: Readonly<{ authorityGeneration: number; authorityDigest: string }>
}>): Readonly<{ authorityGeneration: number; authorityDigest: string }> {
  const snapshot = operation.connectionAuthority
  if (snapshot === undefined) throw new Error('connection_authority_missing')
  return {
    authorityGeneration: snapshot.authorityGeneration,
    authorityDigest: snapshot.authorityDigest,
  }
}

function providerCredentialReader(operation: PublishedOperation) {
  const snapshot = operation.connectionAuthority
  if (snapshot === undefined) throw new Error('connection_authority_missing')
  return (input: ProviderConnectionAuthorityLookup) => {
    if (
      input.connectionRef !== snapshot.connectionRef
      || input.providerRef !== snapshot.providerRef
      || input.adapterId !== snapshot.adapterId
    ) {
      return { kind: 'unavailable' as const, reason: 'not_found' as const }
    }
    if (input.authorityGeneration !== snapshot.authorityGeneration) {
      return { kind: 'unavailable' as const, reason: 'stale_generation' as const }
    }
    if (input.authorityDigest !== snapshot.authorityDigest) {
      return { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
    }
    return { kind: 'resolved' as const, credentialRef: snapshot.connectionRef }
  }
}

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
      price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 2 } },
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
      binding: providerRouteTransportBinding(packet.operation),
      authority: {
        attemptRef: 'mock:attempt:get',
        operationKeyDigest: canonicalDigest({ operation: packet.operation.operationId }),
        mandateDigest: canonicalDigest({ mandate: 'mock' }),
        grantDigest: canonicalDigest({ grant: 'mock' }),
        capabilityContractDigest: packet.operation.identity.contractDigest,
        maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        ...currentProviderAuthority(packet.operation),
        expiresAt: Date.now() + 60_000,
        callIdentity: { keyId: 'mock:key', signature: 'mock:signature' },
      },
      inputJson: JSON.stringify({ symbol: 'BTC', convert: 'USD' }),
    }
    await expect(invokeRouteTransport(invocation, {
      readProviderConnectionCredentialRef: providerCredentialReader(packet.operation),
      send,
      resolveCredential: () => 'mock-credential',
      ...preparedX402Custody(async () => 'mock:payment-signature'),
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
      await expect(invokeRouteTransport({
        binding: providerRouteTransportBinding(operation),
        authority: {
          attemptRef: `mock:attempt:${method}`,
          operationKeyDigest: canonicalDigest({ operation: operation.operationId, method }),
          mandateDigest: canonicalDigest({ mandate: 'mock' }),
          grantDigest: canonicalDigest({ grant: 'mock' }),
          capabilityContractDigest: operation.identity.contractDigest,
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
          ...currentProviderAuthority(operation),
          expiresAt: Date.now() + 60_000,
          callIdentity: { keyId: 'mock:key', signature: 'mock:signature' },
        },
        inputJson: JSON.stringify({ symbol: 'BTC', convert: 'USD' }),
      }, {
        readProviderConnectionCredentialRef: providerCredentialReader(operation),
        send,
        resolveCredential: () => 'mock-credential',
        ...preparedX402Custody(async () => 'mock:payment-signature'),
      })).resolves.toMatchObject({ transport: 'x402', disposition: 'succeeded' })
    },
  )

  it('rejects independently rebuilt material tampering', () => {
    const baseline = buildDevelopmentPublishedOperationEvidence()
    type Packet = typeof baseline
    const config = (packet: Packet): Record<string, unknown> => {
      const value = packet.sourceMaterial.binding.adapter.config
      if (!isRecord(value)) throw new Error('binding_config_missing')
      return value
    }
    const tamperers: readonly [string, (packet: Packet) => void][] = [
      ['offering price', (packet) => {
        const price = packet.sourceMaterial.offering.presentation.price
        if (price.kind !== 'fixed') throw new Error('fixed_price_missing')
        Object.assign(price.amount, { units: '2' })
      }],
      ['binding payTo', (packet) => { config(packet).payTo = '0xattacker' }],
      ['binding network', (packet) => { config(packet).network = 'eip155:1' }],
      ['binding asset', (packet) => { config(packet).asset = '0xattacker' }],
      ['offering amount', (packet) => {
        const price = packet.sourceMaterial.offering.presentation.price
        if (price.kind !== 'fixed') throw new Error('fixed_price_missing')
        Object.assign(price.amount, { units: '99' })
      }],
      ['method mismatch', (packet) => { config(packet).method = 'POST' }],
      ['admitted config', (packet) => { Object.assign(packet.sourceMaterial.admittedTransport, { configJson: '{"method":"POST"}' }) }],
      ['binding source digest', (packet) => {
        const source = packet.sourceMaterial.qualification.sources[3]
        if (source === undefined) throw new Error('binding_source_missing')
        Object.assign(source, { digest: canonicalDigest({ forged: true }) })
      }],
      ['operation material', (packet) => {
        if (packet.operation.identity.payment.kind !== 'x402') throw new Error('x402_payment_missing')
        Object.assign(packet.operation.identity.payment, { payTo: '0xattacker' })
      }],
      ['readiness', (packet) => { Object.assign(packet.readinessObservation, { validUntil: packet.readinessObservation.validUntil + 1 }) }],
      ['usage', (packet) => {
        if (packet.operation.usageObservation === undefined) throw new Error('usage_observation_missing')
        Object.assign(packet.operation.usageObservation, { calls: 9 })
        Object.assign(packet.operation, { materialDigest: canonicalDigest(packet.operation.identity) })
      }],
      ['endpoint', (packet) => {
        Object.assign(packet.operation.identity.endpoint, { path: '/attacker' })
        Object.assign(packet.operation, { materialDigest: canonicalDigest(packet.operation.identity) })
      }],
      ['descriptor', (packet) => { Object.assign(packet.descriptor, { retryClass: 'replayable' }) }],
    ]
    for (const [_label, tamper] of tamperers) {
      const packet = buildDevelopmentPublishedOperationEvidence()
      tamper(packet)
      expect(() => verifyDevelopmentPublishedOperationEvidence(packet)).toThrow(
        'development_published_operation_evidence_invalid',
      )
    }
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
      price: { currency: 'USD', units: '1', exponent: 2 },
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
      authority: source.binding.authority,
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
    authority: binding.authority,
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
  const publication = {
    ...source.publication,
    sourceDigest: imported.draft.source.descriptorDigest,
  }
  let connectionAuthority = source.connectionAuthority
  if (binding.authority.kind === 'provider_connection') {
    if (connectionAuthority === undefined) throw new Error('connection_authority_missing')
    connectionAuthority = {
      ...connectionAuthority,
      connectionRef: binding.authority.connectionRef,
      providerRef: binding.authority.providerRef,
      adapterId: binding.adapter.adapterId,
      operationRef: createPublicOperationRef({
        operationId: capabilityOperationId(contract.ref.capabilityId),
        publicationRef: publication.publicationRef,
        publicationRevision: publication.revision,
        contractRef: contract.ref,
      }),
    }
  }
  return materializePublishedOperation({
    publication,
    contract,
    offering,
    binding,
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
    admittedTransport: admission.transport,
    qualification,
    ...(source.usageObservation === undefined ? {} : { usageObservation: source.usageObservation }),
  })
}
function preparedX402Custody(
  create: (request: X402PaymentSignatureRequest) => Promise<string | undefined>,
): Pick<
  X402RouteTransportRuntime,
  'prepareX402PaymentAuthorization'
  | 'readX402PaymentAuthorization'
  | 'readX402PaymentAuthorizationByDigest'
> {
  const custody = new Map<string, Readonly<{
    authorizationDigest: string
    paymentSignature: string
  }>>()
  return {
    prepareX402PaymentAuthorization: async (request) => {
      const paymentSignature = await create(request)
      if (paymentSignature === undefined || paymentSignature.length === 0) return undefined
      const custodyRef = canonicalDigest({
        kind: 'test-x402-custody:v1',
        paymentIdentifier: request.paymentIdentifier,
        challengeDigest: request.challengeDigest,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      })
      const authorizationDigest = canonicalDigest(paymentSignature)
      custody.set(custodyRef, { authorizationDigest, paymentSignature })
      return { custodyRef, authorizationDigest }
    },
    readX402PaymentAuthorization: async ({ custodyRef, authorizationDigest }) => {
      const prepared = custody.get(custodyRef)
      return prepared?.authorizationDigest === authorizationDigest
        ? prepared.paymentSignature
        : undefined
    },
    readX402PaymentAuthorizationByDigest: async ({ custodyRef, authorizationDigest }) => {
      const prepared = custody.get(custodyRef)
      return prepared?.authorizationDigest === authorizationDigest
        ? prepared.paymentSignature
        : undefined
    },
  }
}
