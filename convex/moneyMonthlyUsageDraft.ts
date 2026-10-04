import { action, query, internalQuery, internalAction } from './_generated/server'
import { internalMutation, mutation } from './usageTrackedMutation'
import { captureFinancialArgs, captureResult, draftAdmissionResult, draftIntentArgs, draftReadArgs, draftResult } from './lib/money/monthlyDraft/contracts'
import { admitOwnerDraftHandler, captureFinancialHandler, readOwnerDraftHandler } from './lib/money/monthlyDraft/store'
import { freezeOwnerDraftHandler } from './lib/money/monthlyDraft/freeze'
import { createOwnerDraftHandler } from './lib/money/monthlyDraft/create'

export const createOwnerDraft = action({ args: draftIntentArgs, returns: draftResult, handler: createOwnerDraftHandler })
export const readOwnerDraft = query({ args: draftReadArgs, returns: draftResult, handler: readOwnerDraftHandler })
export const admitOwnerDraft = internalMutation({ args: draftIntentArgs, returns: draftAdmissionResult, handler: admitOwnerDraftHandler })
export const captureFinancial = internalMutation({ args: captureFinancialArgs, returns: captureResult, handler: captureFinancialHandler })
export const freezeOwnerDraft = internalMutation({ args: draftReadArgs, returns: draftResult, handler: freezeOwnerDraftHandler })
export const readOwnerDraftInternal = internalQuery({ args: draftReadArgs, returns: draftResult, handler: readOwnerDraftHandler })

import { v } from 'convex/values'
import { reportingPolicyValue,configureReportingArgs,configureReportingResult,completeMonthArgs,closeRefArgs,monthlyCloseResult,advanceCompleteMonthResult,monthlyDocumentPartsArgs,monthlyDocumentPartsResult,automaticMonthArgs,automaticMonthResult } from './lib/money/monthlyDraft/completeContracts'
import { configureReportingHandler,readReportingPolicyHandler } from './lib/money/monthlyDraft/reportingPolicy'
import { requestCompleteMonthHandler,readCompleteMonthHandler,readMonthlyDocumentPartsHandler,requestAutomaticMonthsHandler } from './lib/money/monthlyDraft/completeStore'
import { continueCompleteMonthHandler,readCompleteMonthWorkHandler,completeMonthReadRequest,applyMonthlyFinancialPageArgs,applyMonthlyFinancialPageHandler } from './lib/money/monthlyDraft/completeFinancial'
import { advanceCompleteMonthHandler } from './lib/money/monthlyDraft/completeFreeze'
import { completeMonthWorkArgs,completeMonthWorkHandler } from './lib/money/monthlyDraft/completeWork'
export const readReportingPolicy=query({args:{},returns:reportingPolicyValue,handler:readReportingPolicyHandler})
export const configureReporting=mutation({args:configureReportingArgs,returns:configureReportingResult,handler:configureReportingHandler})
export const requestCompleteMonth=mutation({args:completeMonthArgs,returns:monthlyCloseResult,handler:requestCompleteMonthHandler})
export const readCompleteMonth=query({args:closeRefArgs,returns:monthlyCloseResult,handler:readCompleteMonthHandler})
export const readMonthlyDocumentParts=query({args:monthlyDocumentPartsArgs,returns:monthlyDocumentPartsResult,handler:readMonthlyDocumentPartsHandler})
export const readMonthlyFinancialParts=query({args:monthlyDocumentPartsArgs,returns:monthlyDocumentPartsResult,handler:(ctx,args)=>readMonthlyDocumentPartsHandler(ctx,args,'financial')})
export const readCompleteMonthWork=internalQuery({args:closeRefArgs,returns:completeMonthReadRequest,handler:readCompleteMonthWorkHandler})
export const continueCompleteMonth=internalAction({args:closeRefArgs,returns:advanceCompleteMonthResult,handler:continueCompleteMonthHandler})
export const applyMonthlyFinancialPage=internalMutation({args:applyMonthlyFinancialPageArgs,returns:advanceCompleteMonthResult,handler:applyMonthlyFinancialPageHandler})
export const advanceCompleteMonth=internalMutation({args:closeRefArgs,returns:advanceCompleteMonthResult,handler:advanceCompleteMonthHandler})
export const completeMonthWork=internalMutation({args:completeMonthWorkArgs,returns:v.null(),handler:completeMonthWorkHandler})
export const requestAutomaticMonths=internalMutation({args:automaticMonthArgs,returns:automaticMonthResult,handler:requestAutomaticMonthsHandler})
