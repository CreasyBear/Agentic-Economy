import { v } from 'convex/values'
import { query } from './_generated/server'
import { mutation } from './usageTrackedMutation'
import { callFeedbackViewValue } from '@/modules/capability-execution/call-feedback'
import { readCallFeedback, writeCallFeedback, writeCallFeedbackArgs } from './lib/capabilityExecution/callFeedback'

export const readOwner = query({ args: { callRef: v.string() }, returns: callFeedbackViewValue, handler: readCallFeedback })
export const writeOwner = mutation({ args: writeCallFeedbackArgs, returns: callFeedbackViewValue, handler: writeCallFeedback })
