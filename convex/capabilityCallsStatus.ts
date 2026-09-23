import { v } from 'convex/values'
import { query } from './_generated/server'
import { principalAndSourceArgs } from './lib/callLifecycle/contracts'
import { statusResultValue } from '@/modules/capability-execution/convex'
import { readCallStatusQueryHandler } from './lib/callLifecycle/statusQuery'

export const readCallStatus = query({
  args: { ...principalAndSourceArgs, callRef: v.string(), afterVersion: v.optional(v.number()) },
  returns: statusResultValue,
  handler: readCallStatusQueryHandler,
})
