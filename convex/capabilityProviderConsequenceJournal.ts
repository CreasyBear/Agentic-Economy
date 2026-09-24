import { internalMutationGeneric, internalQueryGeneric } from 'convex/server'

import { abortProviderConsequenceArgs, abortProviderConsequenceHandler, abortProviderConsequenceResult } from './lib/providerConsequence/abort'
import { attestProviderConsequenceTicketArgs, attestProviderConsequenceTicketHandler, attestProviderConsequenceTicketResult } from './lib/providerConsequence/attest'
import { claimProviderConsequenceArgs, claimProviderConsequenceHandler, claimProviderConsequenceResult } from './lib/providerConsequence/claim'
import { completeProviderConsequenceArgs, completeProviderConsequenceHandler, completeProviderConsequenceResult } from './lib/providerConsequence/complete'
import { issueProviderConsequenceTicketArgs, issueProviderConsequenceTicketHandler, issueProviderConsequenceTicketResult } from './lib/providerConsequence/issue'
import { authorizeProviderConsequenceX402RpcArgs, authorizeProviderConsequenceX402RpcHandler, authorizeProviderConsequenceX402RpcResult } from './lib/providerConsequence/x402'

export const issueProviderConsequenceTicket = internalMutationGeneric({
  args: issueProviderConsequenceTicketArgs,
  returns: issueProviderConsequenceTicketResult,
  handler: issueProviderConsequenceTicketHandler,
})

export const attestProviderConsequenceTicket = internalQueryGeneric({
  args: attestProviderConsequenceTicketArgs,
  returns: attestProviderConsequenceTicketResult,
  handler: attestProviderConsequenceTicketHandler,
})

export const claimProviderConsequence = internalMutationGeneric({
  args: claimProviderConsequenceArgs,
  returns: claimProviderConsequenceResult,
  handler: claimProviderConsequenceHandler,
})

export const completeProviderConsequence = internalMutationGeneric({
  args: completeProviderConsequenceArgs,
  returns: completeProviderConsequenceResult,
  handler: completeProviderConsequenceHandler,
})

export const abortProviderConsequence = internalMutationGeneric({
  args: abortProviderConsequenceArgs,
  returns: abortProviderConsequenceResult,
  handler: abortProviderConsequenceHandler,
})

export const authorizeProviderConsequenceX402Rpc = internalMutationGeneric({
  args: authorizeProviderConsequenceX402RpcArgs,
  returns: authorizeProviderConsequenceX402RpcResult,
  handler: authorizeProviderConsequenceX402RpcHandler,
})
