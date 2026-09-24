import { mutation, query } from './_generated/server'
import {
  readPolicyArgs,
  readPolicyHandler,
  readPolicyResult,
  updatePolicyArgs,
  updatePolicyHandler,
  updatePolicyResult,
} from './lib/principalAccount/workspaceSecurity/policy'

export const readPolicy = query({
  args: readPolicyArgs,
  returns: readPolicyResult,
  handler: readPolicyHandler,
})

export const updatePolicy = mutation({
  args: updatePolicyArgs.fields,
  returns: updatePolicyResult,
  handler: updatePolicyHandler,
})
