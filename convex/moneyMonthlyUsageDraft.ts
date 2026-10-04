import { action, query, internalMutation, internalQuery } from './_generated/server'
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
