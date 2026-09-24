import { mutation } from './_generated/server'
import { resolveAgentBindingArgs, resolveAgentBindingResult } from './lib/authority/validators'
import { resolveAgentBindingHandler } from './lib/authority/binding'

export const resolveAgentBinding = mutation({
  args: resolveAgentBindingArgs,
  returns: resolveAgentBindingResult,
  handler: resolveAgentBindingHandler,
})
