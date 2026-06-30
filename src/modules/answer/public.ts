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
  hasBoundaryCopy,
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
  hasOverclaim,
} from './internal/copy-guard-patterns'
export {
  assembleAnswerEvidence,
  type AssembledAnswerEvidence,
} from './internal/evidence-assembler'
export {
  runAnswerToolUseAgent,
  setAnswerToolUseAgentForTests,
  isAnswerToolUseAgentError,
  AnswerToolUseAgentError,
  type AnswerToolUseAgentInput,
  type AnswerToolUseAgentResult,
  type AnswerToolUseAgentPlan,
  type AgentPlannedToolCall,
  type AnswerToolUseAgentGenerator,
} from './internal/answer-tool-use-agent'
export {
  AnswerProseSchema,
  type AnswerProse,
  snapshotProseFromAnswer,
} from './answer-prose'
export { buildArtifactsFromSnapshot } from './internal/snapshot-artifacts'
export { toAnswerSource } from './internal/dto-to-answer-source'
export { emitSnapshotEvents } from './internal/emit-snapshot-events'
export { mergeAnswerArtifact } from './internal/merge-answer-artifact'
export { artifactsFromStructured } from './internal/structured-artifacts'
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
  registrySearchTool,
  registrySearchToolDef,
} from './tools/registry-search.tool'
export {
  DEFAULT_OPENROUTER_MODEL,
  readAnswerLlmConfig,
  readToolUseAgentEnabled,
  readChatApiAllowed,
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
  extractQueryFromChatBody,
  extractModelFromChatBody,
  synthesizeChatAnswer,
} from './internal/chat-answer-stream'
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
  AnswerSourceSchema,
  AeAnswerArtifactsSchema,
  type AnswerArtifact,
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
} from './answer-synthesizer'

export { encodeAnswerId, decodeAnswerId } from './answer-id'
