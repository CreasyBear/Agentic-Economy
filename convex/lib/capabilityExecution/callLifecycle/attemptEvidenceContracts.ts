import { v } from 'convex/values'
import { literalUnion } from '@/modules/common/convex-literals'
import { attemptHistoryKinds } from '@/modules/capability-execution/call-attempt-evidence'
export const callAttemptEvidenceValue = v.union(v.object({ kind: v.literal('available'), source: v.literal('durable_action_execution'), complete: v.literal(true),
  attempts: v.array(v.object({ attemptRef: v.string(), attemptNumber: v.number(), effectGeneration: v.number(),
    release: v.union(v.literal('not_released'), v.literal('released'), v.literal('possibly_released')),
    outcome: v.union(v.literal('running'), v.literal('returned'), v.literal('failed'), v.literal('uncertain'), v.literal('timed_out'), v.literal('reconciled_not_released'), v.literal('reconciled_released')),
    errorDigest: v.union(v.string(), v.null()), recordedAt: v.number() })),
  history: v.array(v.object({ executionVersion: v.number(), kind: literalUnion(attemptHistoryKinds), current: v.boolean(), commandDigest: v.union(v.string(), v.null()), evidenceDigest: v.union(v.string(), v.null()), recordedAt: v.number() })),
  authoritativeForConsequences: v.literal(false) }), v.object({ kind: v.literal('not_recorded') }), v.object({ kind: v.literal('unavailable'), code: v.string() }))
