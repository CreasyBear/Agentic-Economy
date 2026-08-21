export {
  kernelArtifactsFromSnapshot as buildArtifactsFromSnapshot,
} from './internal/build-message-parts'
export {
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
} from './internal/copy-guard-patterns'
export type {
  AnswerSnapshot,
  AnswerWorkStep,
} from './answer-synthesizer'
export type { AnswerLayoutProfile } from './internal/answer-layout-profile'
const BIDI_FORMATTING_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

/** Remove invisible Unicode direction controls from compact public labels. */
export function neutralizeBidiFormattingControls(value: string): string {
  return value.replace(BIDI_FORMATTING_CONTROLS, '')
}
