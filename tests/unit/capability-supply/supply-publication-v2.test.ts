import { describe, expect, it } from 'vitest'
import { declareDiscoveryExtension, bazaarResourceServerExtension, type DiscoveryExtension } from '@x402/extensions/bazaar'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  prepareSupplyPublicationV2,
  selectSupplyProviderAuthority,
  type PublishSupplyToolV2Input,
} from '@/modules/capability-supply/supply-publication-v2'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  inspectX402SellerEndpoint,
} from '@/modules/capability-supply/server'
import { encodeX402PaymentRequiredHeader, type X402PaymentRequired } from '@/modules/capability-supply/server'

const endpointUrl = 'https://provider.example/paid'

function bazaarExtension() {
  const declared = declareDiscoveryExtension({
    bodyType: 'json',
    input: { query: 'example' },
    inputSchema: z.toJSONSchema(z.object({ query: z.string() })),
    output: {
      example: { value: 'example' },
      schema: z.toJSONSchema(z.object({ value: z.string() })),
    },
  })
  const enriched = bazaarResourceServerExtension.enrichDeclaration?.(declared.bazaar, {
    method: 'POST',
    routePattern: '/paid',
    adapter: { getPath: () => '/paid' },
  } as never) as DiscoveryExtension | undefined
  if (enriched === undefined) throw new Error('expected Bazaar enrichment')
  return { bazaar: enriched }
}

function challenge(): X402PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: endpointUrl },
    accepts: [{
      scheme: 'exact',
      network: BASE_MAINNET_NETWORK,
      amount: '1000',
      asset: BASE_MAINNET_USDC_ADDRESS,
      payTo: '0x0000000000000000000000000000000000000002',
      maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }] as X402PaymentRequired['accepts'],
    extensions: bazaarExtension(),
  } as X402PaymentRequired
}

async function inspect() {
  return inspectX402SellerEndpoint({
    endpointUrl,
    method: 'POST',
    deriveAeEnvironment: true,
  }, {
    now: () => 1_000,
    validatePublicTarget: async () => true,
    send: async () => new Response(null, {
      status: 402,
      headers: { 'payment-required': encodeX402PaymentRequiredHeader(challenge()) },
    }),
  })
}

function publishInput(preview: Awaited<ReturnType<typeof import('@/modules/capability-supply/source-preview').previewSupplySource>>): PublishSupplyToolV2Input {
  if (preview.kind !== 'ready') throw new Error('preview_not_ready')
  const candidate = preview.candidates[0]
  if (candidate === undefined || candidate.x402 === undefined) throw new Error('candidate_missing')
  return {
    businessRef: 'business:reference',
    source: { kind: 'x402', resourceUrl: endpointUrl, method: 'POST', environment: candidate.x402.environment },
    candidateRef: candidate.candidateRef,
    expectedSourceDigest: preview.sourceDigest,
    connectionRef: 'connection:one',
    presentation: { name: 'Paid lookup', description: 'Reads one paid value.', category: 'x402' },
    consequences: { effects: [], dataUse: [], evidence: [{ outputPointer: '', purpose: 'completion' }] },
    pricing: { kind: 'source_x402' },
    environment: candidate.x402.environment,
    idempotencyKey: 'publish-x402',
    attestation: { authorisedToPublish: true, informationAccurate: true, publishAfterSuccessfulValidation: true },
  }
}

describe('prepareSupplyPublicationV2', () => {
  it('uses only the selected active connection owned by the same Business', () => {
    const available = {
      connectionRef: 'connection:one',
      businessId: 'business:reference',
      providerRef: 'provider:reference',
      lifecycle: 'active' as const,
      available: true,
    }
    expect(selectSupplyProviderAuthority('business:reference', 'connection:one', [available])).toEqual({
      kind: 'provider_connection',
      connectionRef: 'connection:one',
      providerRef: 'provider:reference',
    })
    expect(selectSupplyProviderAuthority('business:other', 'connection:one', [available])).toBeUndefined()
  })

  it('prices the Tool from the challenge and refuses a declared environment that disagrees', async () => {
    const observation = await inspect()
    if (observation.kind !== 'observed') throw new Error(observation.reason)
    const { previewSupplySource } = await import('@/modules/capability-supply/source-preview')
    const preview = await previewSupplySource({ kind: 'x402', resourceUrl: endpointUrl, method: 'POST' }, {
      inspectX402: async () => observation,
    })
    const input = publishInput(preview)
    const prepared = await prepareSupplyPublicationV2(input, {
      inspectX402: async () => observation,
      providerAuthority: { kind: 'provider_connection', connectionRef: 'connection:one', providerRef: 'provider:reference' },
    })
    expect(prepared.kind).toBe('prepared')
    if (prepared.kind !== 'prepared') return
    expect(JSON.parse(prepared.prepared.prepared.pricingConfigJson)).toMatchObject({
      kind: 'managed_x402',
      sourceRequirement: { atomicUnits: '1000', network: BASE_MAINNET_NETWORK },
    })

    const mismatched = await prepareSupplyPublicationV2({
      ...input,
      environment: input.environment === 'production' ? 'sandbox' : 'production',
    }, {
      inspectX402: async () => observation,
      providerAuthority: { kind: 'provider_connection', connectionRef: 'connection:one', providerRef: 'provider:reference' },
    })
    expect(mismatched).toMatchObject({ kind: 'refused', reason: 'environment_mismatch' })
  })

  it('names the missing payee connection and authority statement', async () => {
    const observation = await inspect()
    const { previewSupplySource } = await import('@/modules/capability-supply/source-preview')
    const preview = await previewSupplySource({ kind: 'x402', resourceUrl: endpointUrl, method: 'POST' }, {
      inspectX402: async () => observation,
    })
    const input = publishInput(preview)
    const { connectionRef: _connection, ...withoutConnection } = input
    expect(await prepareSupplyPublicationV2(withoutConnection, { inspectX402: async () => observation }))
      .toMatchObject({ kind: 'refused', reason: 'connection_required' })
    expect(await prepareSupplyPublicationV2({
      ...input,
      attestation: { ...input.attestation, authorisedToPublish: false },
    }, {
      inspectX402: async () => observation,
      providerAuthority: { kind: 'provider_connection', connectionRef: 'connection:one', providerRef: 'provider:reference' },
    })).toMatchObject({ kind: 'refused', reason: 'attestation_required' })
  })

  it('refuses when the source digest changes after preview', async () => {
    const observation = await inspect()
    const { previewSupplySource } = await import('@/modules/capability-supply/source-preview')
    const preview = await previewSupplySource({ kind: 'x402', resourceUrl: endpointUrl, method: 'POST' }, {
      inspectX402: async () => observation,
    })
    const input = publishInput(preview)
    expect(await prepareSupplyPublicationV2({
      ...input,
      expectedSourceDigest: canonicalDigest({ changed: true }),
    }, {
      inspectX402: async () => observation,
      providerAuthority: { kind: 'provider_connection', connectionRef: 'connection:one', providerRef: 'provider:reference' },
    })).toMatchObject({ kind: 'refused', reason: 'source_changed' })
  })
})
