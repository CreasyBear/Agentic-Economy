import {
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
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
  const trimmed = value.trim()
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
 * Collapse internal reasoning phases (interpret/route/assemble) to the public
 * 'read' phase; search/read/compare stay as-is.
 */
function publicWorkStepPhase(phase: AnswerWorkStep['phase']): AnswerWorkStep['phase'] {
  switch (phase) {
    case 'search':
    case 'read':
    case 'compare':
      return phase
    case 'interpret':
    case 'route':
    case 'assemble':
      return 'read'
  }
}

/** Re-number and phase-collapse a work-log for public exposure. */
export function publicWorkLog(steps: readonly AnswerWorkStep[]): AnswerWorkStep[] {
  return steps.map((step, index) => ({
    ...step,
    id: `step-${index + 1}`,
    phase: publicWorkStepPhase(step.phase),
  }))
}
