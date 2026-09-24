import { mutation } from './_generated/server'
import {
  registerArgs,
  registerHandler,
  registerResult,
} from './lib/capabilityContract/documents/registration'

export const register = mutation({
  args: registerArgs,
  returns: registerResult,
  handler: registerHandler,
})

