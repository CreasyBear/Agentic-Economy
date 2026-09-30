import { v } from 'convex/values'
import { action, query, internalMutation, internalQuery, internalAction } from './_generated/server'
import { callArgs, viewValue, readOwnerHandler, admitHandler } from './lib/capabilityExecution/paidCallReports/admission'
import { claimResult, claimHandler, finishArgs, finishHandler, reportOwnerHandler, processHandler, dueArgs, dueHandler, sweepArgs, sweepHandler } from './lib/capabilityExecution/paidCallReports/lifecycle'

export const readOwner = query({ args: callArgs.fields, returns: viewValue, handler: readOwnerHandler })
export const reportOwner = action({ args: callArgs.fields, returns: viewValue, handler: reportOwnerHandler })
export const admit = internalMutation({ args: callArgs.fields, returns: viewValue, handler: admitHandler })
export const claimWork = internalMutation({ args: callArgs.fields, returns: claimResult, handler: claimHandler })
export const finishWork = internalMutation({ args: finishArgs.fields, returns: v.boolean(), handler: finishHandler })
export const process = internalAction({ args: callArgs.fields, returns: v.boolean(), handler: processHandler })
export const due = internalQuery({ args: dueArgs.fields, returns: v.array(v.string()), handler: dueHandler })
export const sweep = internalAction({ args: sweepArgs.fields, returns: v.number(), handler: sweepHandler })
