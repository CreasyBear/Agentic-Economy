import { createPrefixedRandomId } from '@/modules/common/random-id'

import type { AnswerSnapshot } from '../answer-synthesizer'
import {
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
  joinHumanCopy,
} from './copy-guard-patterns'

export type AnswerGateFailureCode =
  | 'grounding_failed'
  | 'epistemic_vocabulary'
  | 'injection_upgrade'
  | 'empty_prose'

export type AnswerGateResult =
  | { ok: true }
  | { ok: false; code: AnswerGateFailureCode; copyId: string; detail?: string }

export type RunAnswerGateInput = {
  snapshot: AnswerSnapshot
  allowedSlugs: ReadonlySet<string>
}

export function runAnswerGate(input: RunAnswerGateInput): AnswerGateResult {
  const { snapshot, allowedSlugs } = input
  const copyId = makeGateCopyId()

  if (snapshot.oneLine.trim().length === 0 || snapshot.summary.trim().length === 0 || snapshot.nextStep.trim().length === 0) {
    return { ok: false, code: 'empty_prose', copyId }
  }

  if (snapshot.providers.length > 0) {
    const grounded = snapshot.providers.every((provider) => allowedSlugs.has(provider.slug))
    if (!grounded) {
      return { ok: false, code: 'grounding_failed', copyId }
    }
  }

  const humanText = joinHumanCopy([snapshot.oneLine, snapshot.summary, snapshot.nextStep])

  if (hasEpistemicVocabulary(humanText)) {
    return { ok: false, code: 'epistemic_vocabulary', copyId }
  }

  if (hasInjectionUpgrade(humanText)) {
    return { ok: false, code: 'injection_upgrade', copyId }
  }

  return { ok: true }
}

function makeGateCopyId(): string {
  return createPrefixedRandomId(`gate-${Date.now().toString(36)}-`)
}
