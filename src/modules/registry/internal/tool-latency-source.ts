import { z } from 'zod'
import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { projectToolLatency, type ToolLatencyEvidence } from '../tool-latency'

const OBSERVATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000
const EVIDENCE_READ_TIMEOUT_MS = 2_000
const evidenceRowsSchema = z.array(z.object({
  toolRef: z.string(), latencySamplesMs: z.array(z.number()),
}))
const readEvidence = sourceQuery<{ toolRefs: string[]; since: number }, unknown>('marketListingEvidence:read')

/**
 * Read existing completion facts once for the exact resolved Tools. Unavailable or
 * malformed evidence remains unknown (field omitted), distinct from a successful
 * read with too few samples. An evidence outage cannot erase a usable Tool contract.
 */
export async function readToolLatencyEvidence(toolRefs: readonly string[]): Promise<ReadonlyMap<string, ToolLatencyEvidence>> {
  const refs = [...new Set(toolRefs)]
  if (refs.length === 0) return new Map()
  const from = Date.now() - OBSERVATION_WINDOW_MS
  let raw: unknown
  try {
    raw = await callPublicSourceQuery(readEvidence, { toolRefs: refs, since: from }, {
      signal: AbortSignal.timeout(EVIDENCE_READ_TIMEOUT_MS),
    })
  } catch (cause) {
    return degradeBackend(cause, new Map(), { site: 'readToolLatencyEvidence', reason: 'source_unavailable' })
  }
  const parsed = evidenceRowsSchema.safeParse(raw)
  if (!parsed.success) return degradeBackend(parsed.error, new Map(), {
    site: 'readToolLatencyEvidence', reason: 'invalid_response',
  })
  const window = { from, to: Date.now() }
  const evidence = new Map<string, ToolLatencyEvidence>()
  for (const toolRef of refs) {
    const matches = parsed.data.filter(row => row.toolRef === toolRef)
    if (matches.length !== 1) continue
    const { samplesMs: _samples, ...latency } = projectToolLatency(matches[0]!.latencySamplesMs)
    evidence.set(toolRef, { ...latency, measurement: 'admitted_to_completed', window })
  }
  return evidence
}
