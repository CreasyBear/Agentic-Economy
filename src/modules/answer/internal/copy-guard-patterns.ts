/** Shared human-copy guard patterns for answer gate and follow-up chip validation. */

const EPISTEMIC_VOCABULARY_PATTERN = /\b(?:KNOWN|UNKNOWN|UNAVAILABLE|NEXT_STEP)\b/

const OVERCLAIM_PATTERN =
  /\b(?:book instantly|book now|booking confirmed|confirmed booking|appointment booked|booked for|pay now|payment required|payment required on ae|charge(?:d)? (?:your|the) card|dispatch now|dispatch(?:ed)? (?:a|the) (?:provider|technician|plumber|electrician|cleaner|crew)|send(?:ing)? (?:a|the) (?:provider|technician|plumber|electrician|cleaner|crew)|schedule confirmed|scheduled for|callable endpoint|agent-native|autonomous agent|verified by default|live availability|guaranteed availability|available now)\b/i

const BOUNDARY_COPY_PATTERN =
  /\b(?:the business|businesses) (?:confirms?|handles?|reviews?) (?:timing|the request|your request|fit|price|availability|scope|what happens next)\b/i

const INJECTION_UPGRADE_PATTERN =
  /(?:\b(?:ignore (?:all )?(?:previous|prior) instructions|disregard (?:all )?(?:previous|prior) instructions|system prompt|developer message|assistant should|tool result says|override (?:the )?(?:rules|instructions)|callable=true|paymentrequired=true|mark as verified|verified emergency)\b|<\/?(?:catalog_data|system|assistant|user|tool)\b)/i

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
