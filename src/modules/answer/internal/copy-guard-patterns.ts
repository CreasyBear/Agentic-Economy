/**
 * Shared human-copy guards for the answer gate and follow-up chip validation.
 *
 * These protect against fabrication and prompt injection. They deliberately do
 * not police confidence: an answer may state what a business can do without
 * appending a caveat, and no pattern here blocks a capability claim.
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
