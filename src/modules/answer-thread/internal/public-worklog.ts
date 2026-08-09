import {
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
  neutralizeBidiFormattingControls,
  type AnswerWorkStep,
} from '@/modules/answer/projection'

/**
 * Internal architecture words that must never reach a public human surface.
 * Kept here as the single source so the live orchestrator and the replay
 * projection scrub identically.
 */
const INTERNAL_PUBLIC_TERMS = [
  'source-owned',
  'readback',
  'manifest',
  'capability',
  'gateway',
  'operator',
  'MCP',
  'OpenAPI',
  'callable',
  'autonomous',
  'agent-native',
  'DTO',
  'fixture',
] as const

/**
 * Scrub free user text before it appears in a public work-log detail row.
 * Drops overclaim, epistemic vocabulary, injection-upgrade, and internal
 * architecture terms; returns a safe placeholder instead of leaking them.
 */
export function safeWorkLogUserText(value: string): string {
  const trimmed = neutralizeBidiFormattingControls(value.trim())
  if (trimmed.length === 0) {
    return 'Request shown above'
  }
  if (
    hasEpistemicVocabulary(trimmed) ||
    hasInjectionUpgrade(trimmed) ||
    INTERNAL_PUBLIC_TERMS.some((term) => trimmed.toLowerCase().includes(term.toLowerCase()))
  ) {
    return 'Request shown above'
  }
  return trimmed
}

/**
 * Internal architecture phases never reach a public human surface. Search,
 * read, and compare are the observable work a person can verify.
 */
export function isPublicWorkStep(step: AnswerWorkStep): boolean {
  return step.phase === 'search' || step.phase === 'read' || step.phase === 'compare'
}

/** Re-number and project only observable work-log steps for public exposure. */
export function publicWorkLog(steps: readonly AnswerWorkStep[]): AnswerWorkStep[] {
  return steps
    .filter(isPublicWorkStep)
    .map((step, index) => ({
      ...step,
      id: `step-${index + 1}`,
    }))
}
