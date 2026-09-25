import { internalMutation, internalQuery } from './_generated/server'
import {
  readPolicyArgs,
  readPolicyHandler,
  readPolicyResult,
  updatePolicyArgs,
  updatePolicyHandler,
  updatePolicyResult,
} from './lib/principalAccount/workspaceSecurity/policy'

export const readPolicy = internalQuery({
  args: readPolicyArgs,
  returns: readPolicyResult,
  handler: readPolicyHandler,
})

export const updatePolicy = internalMutation({
  args: updatePolicyArgs.fields,
  returns: updatePolicyResult,
  handler: updatePolicyHandler,
})
