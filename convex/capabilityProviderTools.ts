import { internalMutation, query } from './_generated/server'
import {
  listAgentArgs,
  listAgentResult,
  listOwnerArgs,
  listOwnerResult,
  readAgentArgs,
  readAgentResult,
  readOwnerArgs,
  readOwnerResult,
} from './lib/capabilitySupply/providerTools/contracts'
import { listAgentHandler, readAgentHandler } from './lib/capabilitySupply/providerTools/agentReads'
import { listOwnerHandler, readOwnerHandler } from './lib/capabilitySupply/providerTools/ownerReads'
import {
  resolveOwnerToolSlugArgs,
  resolveOwnerToolSlugHandler,
  resolveOwnerToolSlugResult,
} from './lib/capabilitySupply/providerTools/ownerSlug'
import {
  backfillInventoryPageArgs,
  backfillInventoryPageHandler,
  backfillInventoryPageResult,
  backfillDraftPageArgs,
  backfillDraftPageHandler,
  backfillDraftPageResult,
} from './lib/capabilitySupply/providerTools/backfill'

export const readOwner = query({ args: readOwnerArgs, returns: readOwnerResult, handler: readOwnerHandler })
export const listOwner = query({ args: listOwnerArgs, returns: listOwnerResult, handler: listOwnerHandler })
export const resolveOwnerToolSlug = query({ args: resolveOwnerToolSlugArgs, returns: resolveOwnerToolSlugResult, handler: resolveOwnerToolSlugHandler })
export const listAgent = query({ args: listAgentArgs, returns: listAgentResult, handler: listAgentHandler })
export const readAgent = query({ args: readAgentArgs, returns: readAgentResult, handler: readAgentHandler })
export const backfillDraftPage = internalMutation({ args: backfillDraftPageArgs, returns: backfillDraftPageResult, handler: backfillDraftPageHandler })

export const backfillInventoryPage = internalMutation({ args: backfillInventoryPageArgs, returns: backfillInventoryPageResult, handler: backfillInventoryPageHandler })
