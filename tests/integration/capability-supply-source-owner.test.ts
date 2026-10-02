import { afterEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), provider: vi.fn() }))
vi.mock('@/lib/server/convex-source', async (original) => ({
  ...await original<typeof import('@/lib/server/convex-source')>(),
  callSourceQuery: boundary.query,
  callSourceMutation: boundary.mutation,
}))
vi.mock('@/lib/server/clerk-consequence-proof', () => ({
  requireStrictClerkConsequenceProof: async (command: string) => ({
    reverificationId: `test:${command}`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: -1,
  }),
}))
vi.mock('undici', async (original) => ({
  ...await original<typeof import('undici')>(),
  fetch: boundary.provider,
}))

import { declareDiscoveryExtension, bazaarResourceServerExtension, type DiscoveryExtension } from '@x402/extensions/bazaar'
import { z } from 'zod'

import { getFunctionName } from 'convex/server'

import { api } from '../../convex/_generated/api'
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  encodeX402PaymentRequiredHeader,
  type X402PaymentRequired,
} from '@/modules/capability-supply/server'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { sourceWriteRequestFromRequest } from '@/lib/server/source-write-admission'
import { assessOwnerSupplySource, previewOwnerSupplySource, publishOwnerSupplySource } from '@/modules/capability-supply/source-first-owner'
import { createX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { toRow } from '../../convex/lib/capabilitySupply/providerConnections/codecs'
import type { PublishSupplyToolV2Input } from '@/modules/capability-supply/supply-publication-v2'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import { installTestSourceWriteSecret } from '../helpers/source-write-admission'
import { createPublishedBusinessOwner } from './capability-supply-owner-funnel-harness'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  boundary.query.mockReset()
  boundary.mutation.mockReset()
  boundary.provider.mockReset()
})


function paymentChallenge(version: string): X402PaymentRequired {
  const declared = declareDiscoveryExtension({
    bodyType: 'json',
    input: { value: 'validation' },
    inputSchema: z.toJSONSchema(z.object({ value: z.string().describe('A quasar reference.') })),
    output: {
      example: { value: 'validation' },
      schema: z.toJSONSchema(z.object({ value: z.string().describe('The matching reference.') })),
    },
  })
  const enriched = bazaarResourceServerExtension.enrichDeclaration?.(declared.bazaar, {
    method: 'POST',
    routePattern: '/paid',
    adapter: { getPath: () => '/paid' },
  } as never) as DiscoveryExtension | undefined
  if (enriched === undefined) throw new Error('expected Bazaar enrichment')
  return {
    x402Version: 2,
    resource: { url: 'https://provider.example/paid' },
    accepts: [{
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      amount: version === '1' ? '1000' : '2000',
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: '0x0000000000000000000000000000000000000002',
      maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }],
    extensions: { bazaar: enriched },
  } as X402PaymentRequired
}

describe('Provider source owner adapter with real Convex mutations', () => {
  it('submits an accepted current suggestion once and refuses stale source and wrong-owner retries', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId, owner } = await createPublishedBusinessOwner(backend, 'source-owner')
    const { owner: otherOwner } = await createPublishedBusinessOwner(backend, 'source-foreign')
    await backend.run(ctx => ctx.db.patch(businessId, { publicStatus: 'unpublished' }))
    const createdConnection = createX402ProviderConnection({
      commandId: 'command:x402-source-owner',
      connectionRef: 'connection:x402',
      businessId: String(businessId),
      providerRef: 'provider:x402',
      providerAccountRef: 'account:x402',
      resourceUrl: 'https://example.com/paid',
      method: 'POST',
      payee: '0x0000000000000000000000000000000000000002',
      evidenceRefs: ['evidence:x402'],
      owningAccountRef: `acc_${'1'.repeat(32)}`,
      installedByPrincipalRef: `prn_${'2'.repeat(32)}`,
      authorityGrantRef: `grt_${'3'.repeat(32)}`,
      authorityGrantGeneration: 1,
    }, 1_700_000_000_000)
    if (createdConnection.kind !== 'applied') {
      if (createdConnection.kind === 'refused') throw new Error(createdConnection.code)
      throw new Error(createdConnection.kind)
    }
    await backend.run((ctx) => ctx.db.insert('capabilityProviderConnections', toRow(
      createdConnection.connection,
      createdConnection.connection.lastCommandId ?? createdConnection.commandDigest,
      createdConnection.commandDigest,
    )))
    const connections = [{
      connectionRef: createdConnection.connection.connectionRef,
      businessId,
      providerRef: createdConnection.connection.providerRef,
      lifecycle: 'active' as const,
      available: true,
    }]
    const queryFor = (actor: typeof owner) => (reference: { name?: string }, args: unknown) => {
      const name = typeof reference.name === 'string' ? reference.name : getFunctionName(reference as never)
      if (name === 'capabilityProviderConnections:listOwner') return connections
      return (actor.query as (ref: unknown, args: unknown) => Promise<unknown>)(reference, args)
    }
    boundary.query.mockImplementation(queryFor(owner))
    // Convex's HTTP transport serializes away optional undefined properties.
    boundary.mutation.mockImplementation((reference, args) => owner.mutation(reference, JSON.parse(JSON.stringify(args))))
    installTestSourceWriteSecret()
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const document = {
      openapi: '3.0.3', info: { title: 'References', version: '1' }, servers: [{ url: 'https://provider.example' }],
      paths: { '/lookup': { post: {
        operationId: 'lookup', summary: 'Returns the supplied reference.',
        requestBody: { required: true, content: { 'application/json': {
          schema: { type: 'object', properties: { value: { type: 'string', description: 'A quasar reference.' } }, required: ['value'], additionalProperties: false },
          example: { value: 'validation' },
        } } },
        responses: { '200': { description: 'Reference', content: { 'application/json': {
          schema: { type: 'object', properties: { value: { type: 'string', description: 'The matching reference.' } }, required: ['value'], additionalProperties: false },
        } } } },
      } } },
    }
    boundary.provider.mockImplementation(async () => new Response(null, {
      status: 402,
      headers: { 'payment-required': encodeX402PaymentRequiredHeader(paymentChallenge(document.info.version)) },
    }))
    vi.stubEnv('TYPESAFE_API_KEY', 'ts-test')
    const inference = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ model: 'jev-test', answers: {
      summary: { type: 'choice', choice: 'excerpt_0', confidence: 0.9 },
      input: { type: 'choice', choice: 'excerpt_1', confidence: 0.9 },
      output: { type: 'choice', choice: 'excerpt_2', confidence: 0.9 },
    } }))
    vi.stubGlobal('fetch', inference)
    const source = { kind: 'x402' as const, resourceUrl: 'https://provider.example/paid', method: 'POST' as const, environment: 'sandbox' as const }
    const context = { sourceWriteRequest: sourceWriteRequestFromRequest({
      request: new Request('https://ae.example/owner/operations/new', { method: 'POST' }), body: '{}',
    }) }
    const preview = await previewOwnerSupplySource({ data: { businessId, source, idempotencyKey: 'source-preview' }, context })
    if (preview.kind !== 'ready' || preview.candidates[0] === undefined) throw new Error(`preview_${preview.kind}`)
    const assessmentInput = {
      businessId, source, expectedSourceDigest: preview.sourceDigest, expectedSourceRevision: preview.sourceRevision,
      candidateRef: preview.candidates[0].candidateRef, idempotencyKey: 'source-assessment',
    }
    const assessment = await assessOwnerSupplySource({ data: { ...assessmentInput, mode: 'suggest' }, context })
    if (assessment.kind !== 'suggested') throw new Error(`assessment_${assessment.kind}`)
    expect(await assessOwnerSupplySource({ data: { ...assessmentInput, mode: 'verify' }, context }))
      .toMatchObject({ kind: 'current' })
    expect(inference).toHaveBeenCalledOnce()
    expect(boundary.mutation).not.toHaveBeenCalled()
    const data: PublishSupplyToolV2Input = {
      businessRef: businessId, source, candidateRef: assessment.candidateRef, expectedSourceDigest: assessment.sourceDigest,
      presentation: { name: 'Reference lookup', description: assessment.description, category: 'Research' },
      consequences: {
        effects: [{ class: 'data_release', authority: 'explicit', reversibility: 'not_applicable' }],
        dataUse: [{ inputPointer: '/value', classification: 'public', phase: 'execution', purposes: ['Reference lookup'] }],
        evidence: [{ outputPointer: '', purpose: 'completion' }],
      },
      connectionRef: 'connection:x402', pricing: { kind: 'source_x402' }, environment: 'sandbox', idempotencyKey: 'source-publication',
      attestation: { authorisedToPublish: true, informationAccurate: true, publishAfterSuccessfulValidation: true },
    }
    const attempts = await Promise.all([
      publishOwnerSupplySource({ data, context }),
      publishOwnerSupplySource({ data, context }),
    ])
    expect(attempts.map(attempt => attempt.kind).sort()).toEqual(['replayed', 'submitted'])
    const submitted = attempts.find(attempt => attempt.kind === 'submitted')
    if (submitted?.kind !== 'submitted') throw new Error('submission_missing')
    expect(submitted.state).toBe('Submitted')
    expect(await publishOwnerSupplySource({ data, context })).toMatchObject({ kind: 'replayed', toolRef: submitted.toolRef })
    expect(await publishOwnerSupplySource({ data: { ...data, presentation: { ...data.presentation, description: 'Changed after submission.' } }, context }))
      .toMatchObject({ kind: 'refused', reason: 'operation_key_conflict' })
    const readback = await owner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, { businessId })
    expect(readback).toMatchObject({ kind: 'available', offerings: [{
      summary: 'Paid POST Tool discovered from the live x402 payment challenge. Input: value — A quasar reference. Output: value — The matching reference.',
      status: 'draft',
    }] })
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toHaveLength(1)
    expect(await backend.query(api.capabilitySupplyTools.search, { query: 'quasar' })).toMatchObject({ kind: 'no_candidates' })

    document.info.version = '2'
    const writesBeforeChange = boundary.mutation.mock.calls.length
    expect(await publishOwnerSupplySource({ data, context })).toEqual({ kind: 'refused', reason: 'source_changed' })
    expect(boundary.mutation).toHaveBeenCalledTimes(writesBeforeChange)
    document.info.version = '1'
    boundary.query.mockImplementation(queryFor(otherOwner))
    boundary.mutation.mockImplementation((reference, args) => otherOwner.mutation(reference, JSON.parse(JSON.stringify(args))))
    expect(await assessOwnerSupplySource({ data: { ...assessmentInput, mode: 'verify' }, context }))
      .toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(await publishOwnerSupplySource({ data, context })).toMatchObject({ kind: 'refused', reason: 'authorization_denied' })
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toHaveLength(1)
    expect(inference).toHaveBeenCalledOnce()
  })
})
