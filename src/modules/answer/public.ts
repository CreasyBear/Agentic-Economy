/**
 * Public seam for the answer module.
 *
 * Routes and components import from here, never from `./internal`. Phase 7
 * collapsed the answer path onto a single LLM tool-use agent; the deterministic
 * synthesizer and the legacy gated-LLM prose path were deleted in slice 7G after
 * the eval gate went green. Boundary/unsupported intents answer from
 * `boundary-prose.ts` without an LLM call.
 */

export type { AnswerToolUseAgentCheckpoint } from './internal/answer-tool-use-agent'
export {
  runAnswerGate,
  type AnswerGateResult,
  type AnswerGateFailureCode,
} from './internal/answer-gate'
export {
  classifyAnswerQuerySafety,
  classifyAnswerRequestPreflight,
  buildRedactedPriorTurnContext,
  type AnswerQuerySafetyResult,
  type AnswerRequestPreflightResult,
  type AnswerPriorTurnContext,
} from './internal/answer-query-safety'
export {
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
} from './internal/copy-guard-patterns'
export {
  keylessDataAskFromCandidates,
  resolveKeylessDataAskFromInterpretation,
  resolveKeylessDataAskSelection,
  type KeylessDataAskDecision,
  type KeylessDataAskDecisionCandidate,
  type KeylessDataAskResolution,
} from './internal/keyless-data-ask'
export {
  ANSWER_OPERATION_INPUT_MAX_BYTES,
  parseAnswerOperationSelectionInput,
  type AnswerOperationSelectionInput,
} from './operation-selection'
export { answerOperationCandidateFromPublicDescriptor } from './internal/operation-artifacts'
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
export {
  extractRequestedLocation,
  isConfirmedSearchContext,
} from './internal/provider-location-filter'
export {
  type AnswerLayoutProfile,
  AnswerLayoutProfileValues,
  computeLayoutProfile,
  inferLayoutProfileFromArtifacts,
  resolveLayoutProfile,
} from './internal/answer-layout-profile'
export { neutralizeBidiFormattingControls } from './projection'
export {
  buildMessagePartsFromSnapshot,
  artifactsToMessageParts,
  type AnswerMessagePart,
  type AnswerMessagePartsResult,
} from './internal/build-message-parts'
export {
  projectAnswerOperationResult,
  sanitizeAnswerOperationOutcome,
  sanitizeAnswerOperationToolCallRecord,
  type AnswerOperationResultAnnotation,
  type AnswerOperationResultView,
} from './internal/operation-result-presentation'
export {
  validateCatalogGrounding,
  collectAllowedSlugsFromToolResults,
  sanitizeStructuredAnswer,
} from './internal/catalog-grounding'
export {
  buildBoundaryNextStep,
  buildBoundaryOneLine,
  buildBoundarySummary,
  buildSafetyCheckUnavailableNextStep,
  buildSafetyCheckUnavailableOneLine,
  buildSafetyCheckUnavailableSummary,
  buildSafetyRefusalNextStep,
  buildSafetyRefusalOneLine,
  buildSafetyRefusalSummary,
  buildUnsupportedNextStep,
  buildUnsupportedOneLine,
  buildUnsupportedSummary,
} from './internal/boundary-prose'
export {
  buildAnswerInquiryHref,
  type AnswerInquiryHrefInput,
} from './internal/inquiry-link'
export {
  readAnswerEvalPassed,
  readLlmFollowUpChipsEnabled,
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
  AnswerEventSchema,
  AnswerPlanEventSchema,
  AnswerSnapshotSchema,
  AnswerTurnFrameSchema,
  AnswerWorkStepSchema,
} from './answer-event-schema'
export {
  AnswerArtifactKindValues,
  AnswerArtifactSchema,
  AnswerOperationCandidateSchema,
  AnswerOperationOutcomeSchema,
  AnswerOperationPresentationSchema,
  AnswerOperationSelectionSchema,
  answerOperationCandidateSetDigest,
  AnswerSourceSchema,
  AeAnswerArtifactsSchema,
  WebDiscoveryClaimSchema,
  type AnswerArtifact,
  type AnswerCompareField,
  type AnswerOperationCandidate,
  type AnswerOperationOutcome,
  type AnswerOperationPresentation,
  type AnswerOperationSelection,
  type AeAnswerArtifacts,
  type EffectiveAnswerAgentRoute,
} from './answer-schema'

export {
  buildAgentJsonUrl,
  buildDetailUrl,
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerSynthesizerInput,
  type AnswerWorkStep,
  type AnswerWorkStepDetailRow,
  type AnswerWorkStepPhase,
  type AnswerWorkStepStatus,
} from './answer-synthesizer'

export {
  ANSWER_TURN_DATA_PART,
  AnswerTurnProtocolError,
  isAbortError,
  readAnswerTurnFrames,
  type AnswerTurnDataParts,
  type AnswerTurnFrame,
  type AnswerTurnProtocolErrorCode,
  type AnswerTurnUIMessage,
} from './answer-ui-stream'

export {
  ANSWER_TURN_PROBLEM_CODES,
  buildAnswerTurnProblem,
  parseAnswerTurnProblem,
  parseAnswerTurnProblemStrict,
  redactAnswerTurnProblem,
  type AnswerTurnProblem,
  type AnswerTurnProblemCode,
} from '@/lib/errors'

