/**
 * Public seam for the answer module.
 *
 * Routes and components import from here, never from `./internal`. Phase 7
 * collapsed the answer path onto a single LLM tool-use agent; the deterministic
 * synthesizer and the legacy gated-LLM prose path were deleted in slice 7G after
 * the eval gate went green. Boundary/unsupported intents answer from
 * `boundary-prose.ts` without an LLM call.
 */

export {
  runAnswerGate,
  type AnswerGateResult,
  type AnswerGateFailureCode,
} from './internal/answer-gate'
export {
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
} from './internal/copy-guard-patterns'
export {
  assembleAnswerEvidence,
  type AssembledAnswerEvidence,
} from './internal/evidence-assembler'
export {
  runAnswerToolUseAgent,
  isAnswerToolUseAgentError,
  AnswerToolUseAgentError,
  type AnswerToolUseAgentInput,
  type AnswerToolUseAgentResult,
} from './internal/answer-tool-use-agent'
export {
  AnswerProseSchema,
  type AnswerProse,
  snapshotProseFromAnswer,
} from './answer-prose'
export {
  buildArtifactsFromSnapshot,
  getDefaultArtifactBudgetForLayoutProfile,
  type AnswerArtifactBudget,
} from './internal/snapshot-artifacts'
export { toAnswerSource } from './internal/dto-to-answer-source'
export { emitSnapshotEvents } from './internal/emit-snapshot-events'
export { mergeAnswerArtifact } from './internal/merge-answer-artifact'
export { artifactsFromStructured } from './internal/structured-artifacts'
export { extractRequestedLocation } from './internal/provider-location-filter'
export {
  type AnswerLayoutProfile,
  AnswerLayoutProfileValues,
  computeLayoutProfile,
  inferLayoutProfileFromArtifacts,
  resolveLayoutProfile,
} from './internal/answer-layout-profile'
export {
  buildMessagePartsFromSnapshot,
  artifactsToMessageParts,
  type AnswerMessagePart,
  type AnswerMessagePartsResult,
} from './internal/build-message-parts'
export { buildCompactFollowUpProse } from './internal/follow-up-compact-prose'
export {
  validateCatalogGrounding,
  collectAllowedSlugsFromToolResults,
  sanitizeStructuredAnswer,
} from './internal/catalog-grounding'
export {
  buildBoundaryNextStep,
  buildBoundaryOneLine,
  buildBoundarySummary,
  buildUnsupportedNextStep,
  buildUnsupportedOneLine,
  buildUnsupportedSummary,
} from './internal/boundary-prose'
export {
  buildInquiryHandoffNextStep,
  buildInquiryHandoffOneLine,
  buildInquiryHandoffSummary,
  inquiryHandoffProviders,
  resolveInquiryHandoff,
  type InquiryHandoffResolution,
} from './internal/inquiry-handoff-prose'
export {
  buildAnswerInquiryHref,
  type AnswerInquiryHrefInput,
} from './internal/inquiry-link'
export {
  DEFAULT_OPENROUTER_MODEL,
  readAnswerLlmConfig,
  readToolUseAgentEnabled,
  readAnswerSynthesizerMode,
  readAnswerEvalPassed,
  readLlmFollowUpChipsEnabled,
  type AnswerLlmConfig,
  type AnswerSynthesizerMode,
} from './internal/llm-config'
export {
  buildFollowUpChipsSystemPrompt,
  buildFollowUpChipsUserPrompt,
  buildToolUseAgentSystemPrompt,
  buildToolUseAgentUserPrompt,
} from './internal/answer-llm-prompts'
export {
  buildFallbackModels,
  fetchOpenRouterModels,
  getAnswerModelSelectorData,
  groupModelsByProvider,
  normalizeOpenRouterModels,
  providerLabelFromModelId,
  readAnswerModelWhitelist,
  resolveChatModelId,
  resolveSelectedModelId,
  resetOpenRouterModelsCacheForTest,
  type AnswerModel,
  type AnswerModelSelectorData,
  type AnswerModelsByProvider,
} from './internal/openrouter-models'

export {
  AnswerArtifactSchema,
  AnswerCompareFieldSchema,
  AnswerSourceSchema,
  AeAnswerArtifactsSchema,
  type AnswerArtifact,
  type AnswerCompareField,
  type AeAnswerArtifacts,
} from './answer-schema'

export {
  buildAgentJsonUrl,
  buildDetailUrl,
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerSynthesizer,
  type AnswerSynthesizerInput,
  type AnswerWorkStep,
  type AnswerWorkStepDetailRow,
  type AnswerWorkStepPhase,
  type AnswerWorkStepStatus,
} from './answer-synthesizer'

export { encodeAnswerId, decodeAnswerId } from './answer-id'
