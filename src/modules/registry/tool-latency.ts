import { z } from 'zod'

export const TOOL_MIN_LATENCY_SAMPLE_SIZE = 5
export const TOOL_MAX_LATENCY_SAMPLE_SIZE = 48

const latencyFields = {
  sampleSize: z.number().int().nonnegative().max(TOOL_MAX_LATENCY_SAMPLE_SIZE),
  samplesMs: z.array(z.number().int().nonnegative()).max(TOOL_MAX_LATENCY_SAMPLE_SIZE).optional(),
  definition: z.string(),
}
const measuredFields = {
  ...latencyFields,
  kind: z.literal('measured'),
  medianMs: z.number().int().nonnegative(),
  p95Ms: z.number().int().nonnegative(),
  sampleSize: z.number().int().min(TOOL_MIN_LATENCY_SAMPLE_SIZE).max(TOOL_MAX_LATENCY_SAMPLE_SIZE),
  display: z.string(),
}
const insufficientFields = {
  ...latencyFields,
  kind: z.literal('insufficient_sample'),
  sampleSize: z.number().int().nonnegative().max(TOOL_MIN_LATENCY_SAMPLE_SIZE - 1),
  minimumSampleSize: z.literal(TOOL_MIN_LATENCY_SAMPLE_SIZE),
  display: z.literal('Not enough data'),
}
const projectionSchema = z.discriminatedUnion('kind', [
  z.strictObject(measuredFields),
  z.strictObject(insufficientFields),
])
export type ToolLatencyProjection = z.infer<typeof projectionSchema>

const observationFields = {
  measurement: z.literal('admitted_to_completed').describe('Time from AE Call admission to recorded completion, including recovery; not network time to first byte or Provider execution alone. Completed Calls only; not a deadline or SLA.'),
  window: z.strictObject({
    from: z.number().int().nonnegative().describe('Actual inclusive observation cutoff in Unix milliseconds.'),
    to: z.number().int().nonnegative().describe('Time this observation query completed, in Unix milliseconds.'),
  }),
}
export const toolLatencyEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...measuredFields, ...observationFields }),
  z.strictObject({ ...insufficientFields, ...observationFields }),
])
export type ToolLatencyEvidence = z.infer<typeof toolLatencyEvidenceSchema>

/**
 * Requires newest-first completed Call observations for one exact Tool/window.
 * Ensures the existing bounded sample and nearest-rank percentile policy is shared by UI/API.
 * Invariant: no first-byte, pending, failed, or Provider-only latency is inferred.
 * Invalid durations are excluded; fewer than five valid samples never produce percentiles.
 */
export function projectToolLatency(samples: readonly number[]): ToolLatencyProjection {
  const valid = samples.filter(sample => Number.isSafeInteger(sample) && sample >= 0)
    .slice(0, TOOL_MAX_LATENCY_SAMPLE_SIZE)
  if (valid.length < TOOL_MIN_LATENCY_SAMPLE_SIZE) return {
    kind: 'insufficient_sample', sampleSize: valid.length,
    minimumSampleSize: TOOL_MIN_LATENCY_SAMPLE_SIZE, samplesMs: valid,
    display: 'Not enough data',
    definition: 'Time from AE Call admission to recorded completion, including recovery. Median and p95 appear after five completed Calls in the observation window; not a deadline or SLA.',
  }
  const sorted = [...valid].sort((left, right) => left - right)
  const medianMs = sorted[Math.ceil(sorted.length * 0.5) - 1]
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1]
  if (medianMs === undefined || p95Ms === undefined) throw new Error('tool_latency_samples_missing')
  return {
    kind: 'measured', medianMs, p95Ms, sampleSize: valid.length, samplesMs: valid,
    display: formatToolDuration(medianMs),
    definition: 'Time from AE Call admission to recorded completion, including recovery. Median and p95 use up to the latest 48 completed Calls in the observation window; not network time to first byte, Provider execution alone, or an SLA.',
  }
}

export function formatToolDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`
  const seconds = milliseconds / 1_000
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`
  const minutes = seconds / 60
  return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`
}
