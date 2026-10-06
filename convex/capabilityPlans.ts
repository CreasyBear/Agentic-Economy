import { v } from 'convex/values'
import { action, internalAction, internalQuery, query } from './_generated/server'
import { internalMutation, mutation } from './usageTrackedMutation'
import { outstandingPlanExposureArgs, outstandingPlanExposureResult, readOutstandingPlanExposureHandler } from './lib/capabilityExecution/plans/planCommands'

import {
  authenticatePlanQuoteArgs,
  authenticatePlanQuoteHandler,
  authenticatePlanQuoteResult,
  planQuoteResultValue,
  quotePlanActionArgs,
  quotePlanActionHandler,
  quotePlanHandler as handleQuotePlan,
  quotePlanHandlerArgs,
  readPlanQuoteMaterialArgs,
  readPlanQuoteMaterialHandler,
  readPlanQuoteMaterialResult,
} from './lib/capabilityExecution/plans/quotePlan'

export const authenticateQuote = internalMutation({
  args: authenticatePlanQuoteArgs,
  returns: authenticatePlanQuoteResult,
  handler: authenticatePlanQuoteHandler,
})

export const readQuoteMaterial = internalQuery({
  args: readPlanQuoteMaterialArgs,
  returns: readPlanQuoteMaterialResult,
  handler: readPlanQuoteMaterialHandler,
})

export const quotePlanHandler = internalMutation({
  args: quotePlanHandlerArgs,
  returns: planQuoteResultValue,
  handler: handleQuotePlan,
})

export const quote = action({
  args: quotePlanActionArgs,
  returns: planQuoteResultValue,
  handler: quotePlanActionHandler,
})

export const readOutstandingPlanExposure = internalQuery({
  args: outstandingPlanExposureArgs,
  returns: outstandingPlanExposureResult,
  handler: readOutstandingPlanExposureHandler,
})


import { beginRunHandler, beginRunResult, prepareRunHandler, prepareRunResult, runArgsValue } from './lib/capabilityExecution/plans/runAdmission'
import { continueRunHandler, runActionHandler } from './lib/capabilityExecution/plans/runAction'
import { claimHoldArgsValue, claimHoldHandler, claimHoldRecoveryHandler, claimHoldResult, attachHoldArgsValue, attachHoldHandler, failPreparationHandler } from './lib/capabilityExecution/plans/holdLifecycle'
import { planProgressValue, planRunResultValue } from './lib/capabilityExecution/plans/planState'
import { readPlanArgsValue, readPlanResult, getPlanHandler, readProgressHandler } from './lib/capabilityExecution/plans/planReads'
import { planNodeValue } from './lib/capabilityExecution/plans/nodeMaterial'
import {
  prepareNodeSubjectsResult, prepareNodeSubjectsHandler, prepareNodeResult, prepareNodeHandler,
  admitNodeArgsValue, admitNodeHandler, nodeAdmissionResult, startNodeMaterialResult, readStartNodeHandler, startNodeHandler,
  nodeAuthorityResult, readNodeAuthorityHandler,
  nodeProbeArgsValue, readNodeProbeAdmissionHandler,
} from './lib/capabilityExecution/plans/nodeCommands'
import {
  workflowCompleteArgs, workflowCompleteHandler, startWorkflowHandler, cancelPlanHandler, deadlineHandler,
  terminalPreparationResult, prepareTerminalHandler, freezeRemainderArgsValue, freezeRemainderHandler,
  remainderValue, attachRemainderHandler, finishPlanHandler,
} from './lib/capabilityExecution/plans/terminalLifecycle'

const planRefArgs = { planRef: v.string() }
export const run = action({ args: runArgsValue, returns: planRunResultValue, handler: runActionHandler })
export const get = query({ args: readPlanArgsValue, returns: readPlanResult, handler: getPlanHandler })
export const cancel = mutation({ args: readPlanArgsValue, returns: planRunResultValue, handler: cancelPlanHandler })
export const readProgress = internalQuery({ args: planRefArgs, returns: v.union(planProgressValue, v.null()), handler: readProgressHandler })
export const beginRun = internalMutation({ args: runArgsValue, returns: beginRunResult, handler: beginRunHandler })
export const prepareRun = internalMutation({ args: planRefArgs, returns: prepareRunResult, handler: prepareRunHandler })
export const continueRun = internalAction({ args: planRefArgs, returns: v.null(), handler: continueRunHandler })
export const claimHold = internalMutation({ args: claimHoldArgsValue, returns: claimHoldResult, handler: claimHoldHandler })
export const claimHoldRecovery = internalMutation({ args: planRefArgs, returns: claimHoldResult, handler: claimHoldRecoveryHandler })
export const attachHold = internalMutation({ args: attachHoldArgsValue, returns: v.null(), handler: attachHoldHandler })
export const failPreparation = internalMutation({ args: { ...planRefArgs, code: v.string() }, returns: v.null(), handler: failPreparationHandler })
export const prepareNodeSubjects = internalMutation({ args: planNodeValue, returns: prepareNodeSubjectsResult, handler: prepareNodeSubjectsHandler })
export const prepareNode = internalAction({ args: planNodeValue, returns: prepareNodeResult, handler: prepareNodeHandler })
export const readNodeProbeAdmission = internalQuery({ args: nodeProbeArgsValue, returns: v.boolean(), handler: readNodeProbeAdmissionHandler })
export const admitNode = internalMutation({ args: admitNodeArgsValue, returns: nodeAdmissionResult, handler: admitNodeHandler })
export const readStartNode = internalQuery({ args: planNodeValue, returns: startNodeMaterialResult, handler: readStartNodeHandler })
export const startNode = internalAction({ args: planNodeValue, returns: v.null(), handler: startNodeHandler })
export const readNodeAuthority = internalQuery({ args: planNodeValue.extend({ callRef: v.string() }), returns: nodeAuthorityResult, handler: readNodeAuthorityHandler })
export const startWorkflow = internalMutation({ args: planRefArgs, returns: v.null(), handler: startWorkflowHandler })
export const workflowComplete = internalMutation({ args: workflowCompleteArgs, returns: v.null(), handler: workflowCompleteHandler })
export const deadline = internalMutation({ args: planRefArgs, returns: v.null(), handler: deadlineHandler })
export const prepareTerminal = internalMutation({ args: planRefArgs, returns: terminalPreparationResult, handler: prepareTerminalHandler })
export const freezeRemainder = internalMutation({ args: freezeRemainderArgsValue, returns: v.union(remainderValue, v.null()), handler: freezeRemainderHandler })
export const attachRemainder = internalMutation({ args: { ...planRefArgs, transactionRefs: v.array(v.string()) }, returns: v.null(), handler: attachRemainderHandler })
export const finish = internalAction({ args: planRefArgs, returns: v.null(), handler: finishPlanHandler })

import { ownerPlanResult, ownerPlanSummaryValue, ownerPlanDecisionArgs, ownerPlanCancelArgs, cancelOwnerPlanHandler, readOwnerPlanHandler, listOwnerPlansHandler, decideOwnerPlanHandler } from './lib/capabilityExecution/plans/ownerPlans'
export const readOwner = query({ args: planRefArgs, returns: ownerPlanResult, handler: readOwnerPlanHandler })
export const listOwner = query({ args: {}, returns: v.array(ownerPlanSummaryValue), handler: listOwnerPlansHandler })
export const decideOwner = mutation({ args: ownerPlanDecisionArgs, returns: planRunResultValue, handler: decideOwnerPlanHandler })
export const cancelOwner = mutation({ args: ownerPlanCancelArgs, returns: planRunResultValue, handler: cancelOwnerPlanHandler })
