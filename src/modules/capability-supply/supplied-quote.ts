import type {
  ActionInvocationOrigin,
  ActionInvocationTracer,
  ActionInvocationView,
  InvocationActor,
} from '@/modules/action-invocation'
import type { ActionContext } from '@/modules/common/action'

import type { SuppliedCandidateQualification } from './internal/graph'
import type {
  SuppliedCandidateQuoteInput,
  SuppliedCandidateQuoteResult,
} from './supplied-quote.actions'

export type SuppliedQuotePreparation =
  | Readonly<{ kind: 'prepared'; view: ActionInvocationView<SuppliedCandidateQuoteResult> }>
  | Readonly<{
      kind: 'refused'
      code: 'qualification_blocked' | 'qualification_stale' | 'candidate_mismatch' | 'qualification_digest_mismatch'
    }>

export function prepareSuppliedCandidateQuote(input: Readonly<{
  tracer: ActionInvocationTracer<SuppliedCandidateQuoteInput, SuppliedCandidateQuoteResult>
  qualification: SuppliedCandidateQualification
  invocationInput: SuppliedCandidateQuoteInput
  origin: ActionInvocationOrigin
  actor: InvocationActor
  context: ActionContext
  now: number
}>): SuppliedQuotePreparation {
  if (input.qualification.status !== 'eligible') return { kind: 'refused', code: 'qualification_blocked' }
  if (
    input.qualification.validUntil === undefined
    || input.now >= input.qualification.validUntil
    || input.invocationInput.qualificationValidUntil !== input.qualification.validUntil
  ) return { kind: 'refused', code: 'qualification_stale' }
  if (input.invocationInput.qualificationDigest !== input.qualification.qualificationDigest) {
    return { kind: 'refused', code: 'qualification_digest_mismatch' }
  }
  if (JSON.stringify(input.invocationInput.target) !== JSON.stringify(input.qualification.candidate)) {
    return { kind: 'refused', code: 'candidate_mismatch' }
  }

  return {
    kind: 'prepared',
    view: input.tracer.prepare({
      origin: input.origin,
      actor: input.actor,
      input: input.invocationInput,
      context: input.context,
      freshnessMs: input.qualification.validUntil - input.now,
    }),
  }
}
