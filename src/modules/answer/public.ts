/**
 * Public seam for the answer module.
 *
 * Routes and components import from here, never from `./internal`. The
 * deterministic Phase-1 synthesizer lives in `./internal` and is re-exported
 * through this seam so a future LLM-backed implementation can swap in without
 * touching callers.
 */

export { deterministicSynthesizer } from './internal/deterministic-synthesizer'

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
