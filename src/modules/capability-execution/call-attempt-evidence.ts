import { z } from 'zod'
const release = z.enum(['not_released', 'released', 'possibly_released'])
const outcome = z.enum(['running', 'returned', 'failed', 'uncertain', 'timed_out', 'reconciled_not_released', 'reconciled_released'])
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u).nullable()
const clock = z.number().int().nonnegative().safe()
export const attemptHistoryKinds = ['claim_before_effect', 'release_fence_before_network', 'begin_release', 'release_observation', 'late_observation', 'terminal_returned', 'terminal_completed', 'terminal_failed', 'terminal_uncertain', 'terminal_timed_out', 'reconciled_not_released', 'reconciled_released', 'other'] as const
export const callAttemptEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('available'), source: z.literal('durable_action_execution'), complete: z.literal(true),
    attempts: z.array(z.strictObject({ attemptRef: z.string(), attemptNumber: z.number().int().positive().safe(), effectGeneration: clock,
      release, outcome, errorDigest: digest, recordedAt: clock })).max(100),
    history: z.array(z.strictObject({ executionVersion: z.number().int().positive().safe(), kind: z.enum(attemptHistoryKinds), current: z.boolean(),
      commandDigest: digest, evidenceDigest: digest, recordedAt: clock })).max(200), authoritativeForConsequences: z.literal(false) }),
  z.strictObject({ kind: z.literal('not_recorded') }),
  z.strictObject({ kind: z.literal('unavailable'), code: z.string() }),
])
export type CallAttemptEvidence = z.infer<typeof callAttemptEvidenceSchema>
