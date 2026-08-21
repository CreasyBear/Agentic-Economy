import { createLocalE2eCheckpointHandlers } from './internal/answer-thread-checkpoint'
import { createLocalE2eFinalizeHandlers } from './internal/answer-thread-finalize'
import {
  createLocalE2eReadHandlers,
  setLocalE2eAnswerThreadPortFactory,
} from './internal/answer-thread-reads'
import { createLocalE2eReserveHandlers } from './internal/answer-thread-reserve'
import { createLocalE2eShareHandlers } from './internal/answer-thread-share'

setLocalE2eAnswerThreadPortFactory((state) => ({
  ...createLocalE2eReserveHandlers(state),
  ...createLocalE2eCheckpointHandlers(state),
  ...createLocalE2eFinalizeHandlers(state),
  ...createLocalE2eShareHandlers(state),
  ...createLocalE2eReadHandlers(state),
}))

export type {
  AnswerTurnReservationResult,
  RenewAnswerTurnLeaseArgs,
  RenewAnswerTurnLeaseResult,
  ReserveAnswerTurnArgs,
} from './internal/answer-thread-reserve'
export {
  renewAnswerTurnLease,
  renewAnswerTurnLeaseMutation,
  reserveAnswerTurn,
  reserveAnswerTurnMutation,
} from './internal/answer-thread-reserve'

export type {
  PersistAnswerTurnCheckpointArgs,
  PersistAnswerTurnCheckpointResult,
  ReadAnswerTurnCheckpointArgs,
  ReadAnswerTurnCheckpointResult,
  ReadAnswerTurnCheckpointWireResult,
} from './internal/answer-thread-checkpoint'
export {
  persistAnswerTurnCheckpoint,
  persistAnswerTurnCheckpointMutation,
  readAnswerTurnCheckpoint,
  readAnswerTurnCheckpointQuery,
} from './internal/answer-thread-checkpoint'

export type {
  AnswerHarnessFinalizationResult,
  FinalizeReservedAnswerTurnArgs,
  StopAnswerTurnArgs,
  StopAnswerTurnResult,
} from './internal/answer-thread-finalize'
export {
  finalizeReservedAnswerTurnFromRequest,
  finalizeReservedAnswerTurnFromSource,
  finalizeReservedAnswerTurnMutation,
  stopAnswerTurn,
  stopAnswerTurnMutation,
} from './internal/answer-thread-finalize'

export type {
  IssueAnswerThreadShareArgs,
  IssueAnswerThreadShareResult,
  RevokeAnswerThreadShareArgs,
  RevokeAnswerThreadShareResult,
} from './internal/answer-thread-share'
export {
  getSharedThreadProjection,
  getSharedThreadProjectionQuery,
  issueAnswerThreadShare,
  issueAnswerThreadShareMutation,
  revokeAnswerThreadShare,
  revokeAnswerThreadShareMutation,
} from './internal/answer-thread-share'

export type {
  AnswerThreadPage,
  AnswerThreadWithTurnCount,
  AnswerThreadWithTurns,
  DeleteAnswerThreadArgs,
  ListSessionThreadsResult,
} from './internal/answer-thread-reads'
export {
  deleteAnswerThread,
  deleteAnswerThreadMutation,
  getAnswerThread,
  getAnswerThreadQuery,
  getAnswerThreadWithTurns,
  getAnswerThreadWithTurnsQuery,
  getOwnedThreadProjection,
  getOwnedThreadProjectionQuery,
  getThreadTurns,
  getThreadTurnsQuery,
  listSessionThreads,
  listSessionThreadsQuery,
  setAnswerThreadPortForTests,
} from './internal/answer-thread-reads'
