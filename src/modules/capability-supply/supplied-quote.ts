import type {
  ActionInvocationOrigin,
  ActionInvocationTracer,
  ActionInvocationView,
  InvocationActor,
} from '@/modules/action-invocation'
import type { ActionContext } from '@/modules/common/action'

import {
  qualifySuppliedCandidate,
  type CapabilityGraphPorts,
} from './internal/graph'
import type {
  SuppliedCandidateQuoteInput,
  SuppliedCandidateQuoteResult,
} from './supplied-quote.actions'
import { validateDevelopmentQuoteDisclosure } from './supplied-quote.actions'

export type SuppliedQuotePreparation =
  | Readonly<{ kind: 'prepared'; view: ActionInvocationView<SuppliedCandidateQuoteResult> }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'qualification_blocked'
        | 'qualification_stale'
        | 'candidate_mismatch'
        | 'qualification_digest_mismatch'
        | 'disclosure_invalid'
    }>

export async function prepareSuppliedCandidateQuote(input: Readonly<{
  tracer: ActionInvocationTracer<SuppliedCandidateQuoteInput, SuppliedCandidateQuoteResult>
  qualificationPorts: CapabilityGraphPorts
  invocationInput: SuppliedCandidateQuoteInput
  origin: ActionInvocationOrigin
  actor: InvocationActor
  context: ActionContext
  now: () => number
}>): Promise<SuppliedQuotePreparation> {
  const now = input.now()
  const qualification = await qualifySuppliedCandidate(input.qualificationPorts, {
    candidate: input.invocationInput.target,
    now,
  })
  if (qualification.status !== 'eligible') return { kind: 'refused', code: 'qualification_blocked' }
  if (
    qualification.validUntil === undefined
    || now >= qualification.validUntil
    || input.invocationInput.qualificationValidUntil !== qualification.validUntil
  ) return { kind: 'refused', code: 'qualification_stale' }
  if (input.invocationInput.qualificationDigest !== qualification.qualificationDigest) {
    return { kind: 'refused', code: 'qualification_digest_mismatch' }
  }
  if (validateDevelopmentQuoteDisclosure(input.invocationInput).kind === 'invalid') {
    return { kind: 'refused', code: 'disclosure_invalid' }
  }

  return {
    kind: 'prepared',
    view: input.tracer.prepare({
      origin: input.origin,
      actor: input.actor,
      input: input.invocationInput,
      context: {
        ...input.context,
        developmentOnlySuppliedQuoteQualificationPorts: input.qualificationPorts,
        developmentOnlySuppliedQuoteNow: input.now,
      },
      freshnessMs: qualification.validUntil - now,
    }),
  }
}
