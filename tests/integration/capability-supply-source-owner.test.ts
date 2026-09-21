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

import { api } from '../../convex/_generated/api'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { sourceWriteRequestFromRequest } from '@/lib/server/source-write-admission'
import { assessOwnerSupplySource, previewOwnerSupplySource, publishOwnerSupplySource } from '@/modules/capability-supply/source-first-owner'
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

describe('Provider source owner adapter with real Convex mutations', () => {
  it('submits an accepted current suggestion once and refuses stale source and wrong-owner retries', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId, owner } = await createPublishedBusinessOwner(backend, 'source-owner')
    const { owner: otherOwner } = await createPublishedBusinessOwner(backend, 'source-foreign')
    await backend.run(ctx => ctx.db.patch(businessId, { publicStatus: 'unpublished' }))
    boundary.query.mockImplementation((reference, args) => owner.query(reference, args))
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
    boundary.provider.mockImplementation(async () => Response.json(document))
    vi.stubEnv('TYPESAFE_API_KEY', 'ts-test')
    const inference = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ model: 'jev-test', answers: {
      summary: { type: 'choice', choice: 'excerpt_0', confidence: 0.9 },
      input: { type: 'choice', choice: 'excerpt_1', confidence: 0.9 },
      output: { type: 'choice', choice: 'excerpt_2', confidence: 0.9 },
    } }))
    vi.stubGlobal('fetch', inference)
    const source = { kind: 'openapi' as const, definitionUrl: 'https://provider.example/openapi.json', environment: 'sandbox' as const }
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
      pricing: { kind: 'free' }, environment: 'sandbox', idempotencyKey: 'source-publication',
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
      summary: 'Returns the supplied reference. Input: value — A quasar reference. Output: value — The matching reference.',
      status: 'draft',
    }] })
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toHaveLength(1)
    expect(await backend.query(api.capabilitySupplyTools.search, { query: 'quasar' })).toMatchObject({ kind: 'no_candidates' })

    document.info.version = '2'
    const writesBeforeChange = boundary.mutation.mock.calls.length
    expect(await publishOwnerSupplySource({ data, context })).toEqual({ kind: 'refused', reason: 'source_changed' })
    expect(boundary.mutation).toHaveBeenCalledTimes(writesBeforeChange)
    document.info.version = '1'
    boundary.query.mockImplementation((reference, args) => otherOwner.query(reference, args))
    boundary.mutation.mockImplementation((reference, args) => otherOwner.mutation(reference, JSON.parse(JSON.stringify(args))))
    expect(await assessOwnerSupplySource({ data: { ...assessmentInput, mode: 'verify' }, context }))
      .toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(await publishOwnerSupplySource({ data, context })).toMatchObject({ kind: 'refused', reason: 'authorization_denied' })
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toHaveLength(1)
    expect(inference).toHaveBeenCalledOnce()
  })
})
