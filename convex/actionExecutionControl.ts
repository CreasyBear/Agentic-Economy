import { internalMutation, internalQuery } from './_generated/server'
import {
  actionExecutionTransactArgs,
  executionRefArgs,
  lateObservationArgs,
  persistControlResult,
  readAttemptResult,
  readAttemptsResult,
  readControlResult,
  readHistoryCommandResult,
  readHistoryResult,
  readExecutionAttemptArgs,
  readExecutionAttemptsArgs,
  readExecutionHistoryArgs,
  readExecutionHistoryCommandArgs,
} from './lib/actionExecution/control/contracts'
import { transactHandler } from './lib/actionExecution/control/transaction'
import {
  readAttemptHandler,
  readAttemptsHandler,
  readControlHandler,
  readHistoryCommandHandler,
  readHistoryHandler,
} from './lib/actionExecution/control/reads'
import { recordLateObservationHandler } from './lib/actionExecution/control/observation'

export const transact = internalMutation({
  args: actionExecutionTransactArgs,
  returns: persistControlResult,
  handler: transactHandler,
})

export const readControl = internalQuery({
  args: executionRefArgs,
  returns: readControlResult,
  handler: readControlHandler,
})

export const recordLateObservation = internalMutation({
  args: lateObservationArgs,
  returns: persistControlResult,
  handler: recordLateObservationHandler,
})

export const readAttempts = internalQuery({
  args: readExecutionAttemptsArgs,
  returns: readAttemptsResult,
  handler: readAttemptsHandler,
})

export const readAttempt = internalQuery({
  args: readExecutionAttemptArgs,
  returns: readAttemptResult,
  handler: readAttemptHandler,
})

export const readHistory = internalQuery({
  args: readExecutionHistoryArgs,
  returns: readHistoryResult,
  handler: readHistoryHandler,
})

export const readHistoryCommand = internalQuery({
  args: readExecutionHistoryCommandArgs,
  returns: readHistoryCommandResult,
  handler: readHistoryCommandHandler,
})
