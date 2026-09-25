import { mutation } from './_generated/server'
import { resolveAgentBindingArgs, resolveAgentBindingResult } from './lib/authority/boundary/contracts'
import { resolveAgentBindingHandler } from './lib/authority/boundary/binding'

export const resolveAgentBinding = mutation({
  args: resolveAgentBindingArgs,
  returns: resolveAgentBindingResult,
  handler: resolveAgentBindingHandler,
})
