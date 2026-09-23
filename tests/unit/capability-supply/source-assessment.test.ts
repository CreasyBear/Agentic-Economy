import { describe, expect, it, vi } from 'vitest'
import { assessSupplySource } from '@/modules/capability-supply/server'
import type { SupplySourcePreview } from '@/modules/capability-supply/source-preview'

const preview: Extract<SupplySourcePreview, { kind: 'ready' }> = {
  kind: 'ready', sourceDigest: `sha256:${'1'.repeat(64)}`, sourceRevision: 'revision:one',
  provenance: { sourceKind: 'openapi', sourceUrl: 'https://private.example/source', authority: 'unverified_public' },
  authentication: [{ kind: 'public' }], candidates: [{
    candidateRef: `sha256:${'2'.repeat(64)}`, sourceSelector: { serverUrl: 'https://private.example', path: '/lookup', method: 'post' },
    title: 'Reference lookup', description: 'Looks up public references. Returns matching titles.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'The reference to find.', examples: ['private-example'], default: 'private-default' } } },
    outputSchema: { type: 'object', properties: { result: { type: 'string', description: 'A matching title.' } } },
    authentication: { kind: 'public' }, validationExampleAvailable: true, disposition: { kind: 'supported' },
  }],
}
const candidateRef = preview.candidates[0]!.candidateRef
const choice = (value: string) => ({ type: 'choice', choice: value, confidence: 0.8 })
const response = (summary = 'excerpt_0') => Response.json({ model: 'jev-test', answers: {
  summary: choice(summary), input: choice('excerpt_2'), output: choice('excerpt_3'),
} })

describe('source-backed Provider description assessment', () => {
  it('copies selected source excerpts and sends no source endpoint, schema examples or defaults', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response())
    const result = await assessSupplySource(preview, candidateRef, { typesafeApiKey: 'ts-test', fetchImpl })
    expect(result).toMatchObject({ kind: 'suggested', sourceDigest: preview.sourceDigest, sourceRevision: preview.sourceRevision,
      candidateRef, description: 'Looks up public references.\nInput: query — The reference to find.\nOutput: result — A matching title.' })
    const sent = String(fetchImpl.mock.calls[0]?.[1]?.body)
    expect(sent).not.toMatch(/private-example|private-default|private.example/)
    expect(sent).toContain('The reference to find.')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('allows no useful summary instead of inventing one', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response('none'))
    expect(await assessSupplySource(preview, candidateRef, { typesafeApiKey: 'ts-test', fetchImpl }))
      .toEqual({ kind: 'not_suggested', reason: 'no_useful_excerpt' })
  })

  it('rejects a fabricated excerpt without displaying it', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response('invented guarantee'))
    expect(await assessSupplySource(preview, candidateRef, { typesafeApiKey: 'ts-test', fetchImpl }))
      .toEqual({ kind: 'unavailable', reason: 'invalid_response' })
  })

  it('makes one attempt on an outage and leaves recovery with the editor', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('private error', { status: 503 }))
    expect(await assessSupplySource(preview, candidateRef, { typesafeApiKey: 'ts-test', fetchImpl }))
      .toEqual({ kind: 'unavailable', reason: 'service_unavailable' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not send cancelled or oversized source evidence', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    expect(await assessSupplySource(preview, candidateRef, { typesafeApiKey: 'ts-test', fetchImpl, signal: AbortSignal.abort() }))
      .toEqual({ kind: 'unavailable', reason: 'cancelled' })
    const large = { ...preview, candidates: [{ ...preview.candidates[0]!, description: 'x'.repeat(16_001) }] }
    expect(await assessSupplySource(large, candidateRef, { typesafeApiKey: 'ts-test', fetchImpl }))
      .toEqual({ kind: 'unavailable', reason: 'evidence_too_large' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('blocks recognizable credentials in source descriptions before inference', async () => {
    const credential = { ...preview, candidates: [{ ...preview.candidates[0]!, description: 'Use Bearer abcdefghijklmnopqrstuvwxyz123456 to access this service.' }] }
    const fetchImpl = vi.fn<typeof fetch>()
    expect(await assessSupplySource(credential, candidateRef, { typesafeApiKey: 'ts-test', fetchImpl }))
      .toEqual({ kind: 'unavailable', reason: 'sensitive_evidence' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never offers a description beyond the existing publication limit', async () => {
    const long = { ...preview, candidates: [{ ...preview.candidates[0]!, description: `${'x'.repeat(1_001)}. Returns matching titles.` }] }
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response())
    expect(await assessSupplySource(long, candidateRef, { typesafeApiKey: 'ts-test', fetchImpl }))
      .toEqual({ kind: 'not_suggested', reason: 'no_useful_excerpt' })
  })
})
