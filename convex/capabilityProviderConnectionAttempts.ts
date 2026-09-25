import { mutationGeneric, queryGeneric } from 'convex/server'

import {
  bindOAuthOwnerArgs,
  bindOAuthOwnerResult,
  cancelOwnerResult,
  prepareOAuthOwnerArgs,
  prepareOAuthOwnerResult,
  prepareOwnerArgs,
  prepareOwnerResult,
} from './lib/capabilitySupply/providerConnectionAttempts/contracts'
import {
  bindOAuthOwnerHandler,
  readOAuthCallbackOwnerArgs,
  readOAuthCallbackOwnerHandler,
  readOAuthCallbackOwnerResult,
} from './lib/capabilitySupply/providerConnectionAttempts/bindOAuth'
import { cancelOwnerHandler } from './lib/capabilitySupply/providerConnectionAttempts/cancel'
import { finalizeOwnerArgs, finalizeOwnerHandler, finalizeOwnerResult } from './lib/capabilitySupply/providerConnectionAttempts/finalize'
import { prepareOAuthOwnerHandler } from './lib/capabilitySupply/providerConnectionAttempts/prepareOAuth'
import { prepareOwnerHandler } from './lib/capabilitySupply/providerConnectionAttempts/prepare'
import {
  readOwnerArgs,
  readOwnerHandler,
  readOwnerResult,
  readOwnerSourceDraftArgs,
  readOwnerSourceDraftHandler,
  readOwnerSourceDraftResult,
} from './lib/capabilitySupply/providerConnectionAttempts/read'
import {
  reserveAgentArgs,
  reserveAgentHandler,
  reserveAgentResult,
  reserveOwnerArgs,
  reserveOwnerHandler,
  reserveOwnerResult,
} from './lib/capabilitySupply/providerConnectionAttempts/reserve'

// -- Registrations only. Validators, handler bodies, and DB logic live under --
// -- convex/lib/providerConnections/* attempt modules. ------------------------

export const reserveAgent = mutationGeneric({
  args: reserveAgentArgs,
  returns: reserveAgentResult,
  handler: reserveAgentHandler,
})

export const reserveOwner = mutationGeneric({
  args: reserveOwnerArgs,
  returns: reserveOwnerResult,
  handler: reserveOwnerHandler,
})

export const readOwner = queryGeneric({
  args: readOwnerArgs,
  returns: readOwnerResult,
  handler: readOwnerHandler,
})

export const cancelOwner = mutationGeneric({
  args: prepareOwnerArgs,
  returns: cancelOwnerResult,
  handler: cancelOwnerHandler,
})

export const readOwnerSourceDraft = queryGeneric({
  args: readOwnerSourceDraftArgs,
  returns: readOwnerSourceDraftResult,
  handler: readOwnerSourceDraftHandler,
})

export const prepareOwner = mutationGeneric({
  args: prepareOwnerArgs,
  returns: prepareOwnerResult,
  handler: prepareOwnerHandler,
})

export const prepareOAuthOwner = mutationGeneric({
  args: prepareOAuthOwnerArgs,
  returns: prepareOAuthOwnerResult,
  handler: prepareOAuthOwnerHandler,
})

export const bindOAuthOwner = mutationGeneric({
  args: bindOAuthOwnerArgs,
  returns: bindOAuthOwnerResult,
  handler: bindOAuthOwnerHandler,
})

export const readOAuthCallbackOwner = queryGeneric({
  args: readOAuthCallbackOwnerArgs,
  returns: readOAuthCallbackOwnerResult,
  handler: readOAuthCallbackOwnerHandler,
})

export const finalizeOwner = mutationGeneric({
  args: finalizeOwnerArgs,
  returns: finalizeOwnerResult,
  handler: finalizeOwnerHandler,
})
