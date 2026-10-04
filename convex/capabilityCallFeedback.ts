import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { callFeedbackViewValue } from '@/modules/capability-execution/call-feedback'
import { readCallFeedback, writeCallFeedback, writeCallFeedbackArgs } from './lib/capabilityExecution/callFeedback'

export const readOwner = query({ args: { callRef: v.string() }, returns: callFeedbackViewValue, handler: readCallFeedback })
export const writeOwner = mutation({ args: writeCallFeedbackArgs, returns: callFeedbackViewValue, handler: writeCallFeedback })
