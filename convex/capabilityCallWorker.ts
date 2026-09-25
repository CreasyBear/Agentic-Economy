"use node";

import { internalAction } from './_generated/server'
import {
  reconcilePreClaimRefundArgs,
  reconcilePreClaimRefundHandler,
  reconcilePreClaimRefundResult,
} from './lib/capabilityExecution/callWorker/preClaimRefund'
import { runArgs, runHandler, runResult } from './lib/capabilityExecution/callWorker/run'
import {
  recoverArgs,
  recoverHandler,
  recoverResult,
} from './lib/capabilityExecution/callWorker/recover'
import {
  reconcileScheduledArgs,
  reconcileScheduledHandler,
  reconcileScheduledResult,
} from './lib/capabilityExecution/callWorker/reconcileScheduled'

export const reconcilePreClaimRefund = internalAction({
  args: reconcilePreClaimRefundArgs,
  returns: reconcilePreClaimRefundResult,
  handler: reconcilePreClaimRefundHandler,
})

export const run = internalAction({
  args: runArgs,
  returns: runResult,
  handler: runHandler,
})

export const recover = internalAction({
  args: recoverArgs,
  returns: recoverResult,
  handler: recoverHandler,
})

export const reconcileScheduled = internalAction({
  args: reconcileScheduledArgs,
  returns: reconcileScheduledResult,
  handler: reconcileScheduledHandler,
})
