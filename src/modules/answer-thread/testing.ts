export {
  appendAnswerTurnWithToolCalls,
  setAnswerThreadPortForTests,
} from './answer-thread.functions'
export { buildPublicThreadProjection } from './internal/public-projection'
export { readTurnToolCalls, setAnswerToolCallPortForTests } from './internal/commands'
export {
  setAnswerHarnessSessionJournalWriterForTests,
  type AnswerHarnessSessionJournalWriteInput,
  type AnswerHarnessSessionJournalWriter,
} from './internal/answer-turn-finalization'
export { setLlmFollowUpChipGeneratorForTests } from './internal/llm-follow-up-chips'
export {
  ANSWER_FOLLOW_UP_CHIPS_RATE_LIMIT,
  ANSWER_STREAM_RATE_LIMIT,
  ANSWER_TURN_RATE_LIMIT,
  resetAnswerTurnGuardForTests,
} from './internal/turn-guard'
