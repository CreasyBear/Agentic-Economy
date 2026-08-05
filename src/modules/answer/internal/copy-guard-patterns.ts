/**
 * Shared human-copy guards for the answer gate and follow-up chip validation.
 *
 * These shared patterns protect against prompt injection and internal
 * epistemic labels. Provider-assurance checks live in `answer-gate.ts`, where
 * they can use the grounded provider names from the snapshot.
 */

const EPISTEMIC_VOCABULARY_PATTERN = /\b(?:KNOWN|UNKNOWN|UNAVAILABLE|NEXT_STEP)\b/

const INJECTION_UPGRADE_PATTERN =
  /(?:\b(?:ignore (?:all )?(?:previous|prior) instructions|disregard (?:all )?(?:previous|prior) instructions|system prompt|developer message|assistant should|tool result says|override (?:the )?(?:rules|instructions)|callable=true|paymentrequired=true|mark as verified|verified emergency)\b|<\/?(?:catalog_data|system|assistant|user|tool)\b)/i

export function hasEpistemicVocabulary(text: string): boolean {
  return EPISTEMIC_VOCABULARY_PATTERN.test(text)
}

export function hasInjectionUpgrade(text: string): boolean {
  return INJECTION_UPGRADE_PATTERN.test(text)
}

export function joinHumanCopy(parts: readonly string[]): string {
  return parts.join('\n')
}
