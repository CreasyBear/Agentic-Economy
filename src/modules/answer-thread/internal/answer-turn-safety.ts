import { createPrefixedRandomId } from '@/modules/common/random-id'

import {
  runAnswerGate,
  sanitizeStructuredAnswer,
  type AnswerGateFailureCode,
  type AnswerGateResult,
  type AnswerSnapshot,
} from '@/modules/answer/public'

import type { AnswerRunGateSummary } from '../answer-thread.schema'

export type FinalizeAnswerTurnSnapshotResult =
  | { ok: true; snapshot: AnswerSnapshot; gate: AnswerRunGateSummary }
  | { ok: false; code: AnswerGateFailureCode; copyId: string; gate: AnswerRunGateSummary }

export function finalizeAnswerTurnSnapshot(input: {
  snapshot: AnswerSnapshot
  allowedSlugs: ReadonlySet<string>
}): FinalizeAnswerTurnSnapshotResult {
  const sanitized = sanitizeStructuredAnswer(input.snapshot, input.allowedSlugs)
  const candidate = sanitized ?? input.snapshot
  const gate = runAnswerGate({ snapshot: candidate, allowedSlugs: input.allowedSlugs })

  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      copyId: gate.copyId,
      gate: answerRunGateFromAnswerGate(gate),
    }
  }

  if (sanitized === undefined) {
    const copyId = makeSafetyCopyId()
    return {
      ok: false,
      code: 'grounding_failed',
      copyId,
      gate: { ok: false, source: 'answer_gate', code: 'grounding_failed' },
    }
  }

  return {
    ok: true,
    snapshot: sanitized,
    gate: answerRunGateFromAnswerGate(gate),
  }
}

export function answerRunGateFromAnswerGate(gate: AnswerGateResult): AnswerRunGateSummary {
  if (gate.ok) {
    return {
      ok: true,
      source: 'answer_gate',
    }
  }

  return {
    ok: false,
    source: 'answer_gate',
    code: gate.code,
  }
}

function makeSafetyCopyId(): string {
  return createPrefixedRandomId(`gate-${Date.now().toString(36)}-`)
}
