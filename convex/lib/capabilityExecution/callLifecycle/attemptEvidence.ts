import type { QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { isCanonicalDigest } from '@/modules/common/canonical-digest'
import { attemptHistoryKinds, callAttemptEvidenceSchema, type CallAttemptEvidence } from '@/modules/capability-execution/call-attempt-evidence'

/** Owner receipt projection over the existing durable execution history. Never
 * return keys, lease owners, input, result, URLs or arbitrary error messages. */
export async function readCallAttemptEvidence(ctx: Pick<QueryCtx, 'db'>, call: Doc<'capabilityCalls'>): Promise<CallAttemptEvidence> {
  const [attempts, history] = await Promise.all([
    ctx.db.query('actionExecutionAttempts').withIndex('by_executionRef_and_attemptNumber', q => q.eq('executionRef', call.callRef)).take(101),
    ctx.db.query('actionExecutionHistory').withIndex('by_executionRef_and_executionVersion', q => q.eq('executionRef', call.callRef)).take(201),
  ])
  if (attempts.length > 100 || history.length > 200) return { kind: 'unavailable', code: 'attempt_evidence_window_too_large' }
  if (attempts.length === 0 && history.length === 0) return { kind: 'not_recorded' }
  if (attempts.some(row => row.actor.principalRef !== call.principalId || row.attemptRef !== `operation-attempt:${call.callRef}:${row.attemptNumber}`)) return { kind: 'unavailable', code: 'attempt_evidence_identity_conflict' }
  const safeDigest = (raw: string | undefined) => raw !== undefined && isCanonicalDigest(raw) ? raw : null
  const projected = callAttemptEvidenceSchema.safeParse({ kind: 'available', source: 'durable_action_execution', complete: true,
    attempts: attempts.map(row => ({ attemptRef: row.attemptRef, attemptNumber: row.attemptNumber, effectGeneration: row.effectGeneration,
      release: row.release.state, outcome: row.outcome.state, errorDigest: safeDigest('errorDigest' in row.outcome ? row.outcome.errorDigest : undefined), recordedAt: Date.parse(row.recordedAt) })),
    history: history.map(row => ({ executionVersion: row.executionVersion, kind: attemptHistoryKinds.includes(row.kind as typeof attemptHistoryKinds[number]) ? row.kind : 'other', current: row.current,
      commandDigest: safeDigest(row.commandDigest), evidenceDigest: safeDigest(row.observation?.evidenceDigest), recordedAt: Date.parse(row.recordedAt) })),
    authoritativeForConsequences: false })
  return projected.success ? projected.data : { kind: 'unavailable', code: 'attempt_evidence_invalid' }
}
