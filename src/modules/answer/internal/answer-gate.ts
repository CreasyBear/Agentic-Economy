import type { AnswerSnapshot } from '../answer-synthesizer'
import {
  hasBoundaryCopy,
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
  hasOverclaim,
  joinHumanCopy,
} from './copy-guard-patterns'

export type AnswerGateFailureCode =
  | 'grounding_failed'
  | 'epistemic_vocabulary'
  | 'overclaim'
  | 'boundary_missing'
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

  if (hasOverclaim(humanText)) {
    return { ok: false, code: 'overclaim', copyId }
  }

  if (snapshot.providers.length > 0 && !hasBoundaryCopy(humanText)) {
    return { ok: false, code: 'boundary_missing', copyId }
  }

  return { ok: true }
}

function makeGateCopyId(): string {
  return `gate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
