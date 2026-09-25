import { internalMutation } from './_generated/server'
import {
  cancelByNameArgs, cancelByNameHandler, cancelByNameResult,
} from './lib/platform/scheduledFunctionRetirement'

/** Auditable alternative to the dashboard: returns cancellation counts for closeout. */
export const cancelByName = internalMutation({
  args: cancelByNameArgs.fields,
  returns: cancelByNameResult,
  handler: cancelByNameHandler,
})
