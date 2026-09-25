import { internalMutation } from './_generated/server'
import { issueArgs, issueResult, issueHandler } from './lib/capabilitySupply/providerApprovals/issue'

export const issue = internalMutation({
  args: issueArgs,
  returns: issueResult,
  handler: issueHandler,
})
