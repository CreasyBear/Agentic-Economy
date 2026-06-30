/** Shared human-copy guard patterns for answer gate and follow-up chip validation. */

export const EPISTEMIC_VOCABULARY_PATTERN = /\b(?:KNOWN|UNKNOWN|UNAVAILABLE|NEXT_STEP)\b/

export const OVERCLAIM_PATTERN =
  /\b(?:book instantly|book now|booking confirmed|pay now|payment required|callable endpoint|agent-native|autonomous agent|verified by default|dispatch now|payment required on ae)\b/i

export const BOUNDARY_COPY_PATTERN =
  /\b(?:no booking|does not book|doesn't book|do not book|not book|no payment|does not pay|doesn't pay|do not pay|not pay|on this page|agentic economy does not)\b/i

export const INJECTION_UPGRADE_PATTERN =
  /\b(?:ignore previous instructions|callable=true|paymentrequired=true|mark as verified|verified emergency)\b/i

export function hasEpistemicVocabulary(text: string): boolean {
  return EPISTEMIC_VOCABULARY_PATTERN.test(text)
}

export function hasOverclaim(text: string): boolean {
  return OVERCLAIM_PATTERN.test(text)
}

export function hasBoundaryCopy(text: string): boolean {
  return BOUNDARY_COPY_PATTERN.test(text)
}

export function hasInjectionUpgrade(text: string): boolean {
  return INJECTION_UPGRADE_PATTERN.test(text)
}

export function joinHumanCopy(parts: readonly string[]): string {
  return parts.join('\n')
}
