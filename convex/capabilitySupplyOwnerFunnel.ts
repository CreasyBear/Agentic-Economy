import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  agentOwnerSupplyFunnelReadArgs,
  readAgentOwnerSupplyFunnelHandler,
} from './capabilitySupplyOwnerFunnelAgentRead'
import {
  ownerPublishReservationArgsValue,
  ownerPublishReservationResultValue,
  ownerSupplyCommandArgsValue,
  ownerSupplyCommandResultValue,
  ownerSupplyFunnelResultValue,
} from './lib/capabilitySupply/ownerFunnel/contracts'
import { readOwnerSupplyFunnelHandler } from './capabilitySupplyOwnerFunnelRead'
import { reserveOwnerCapabilityPublicationHandler } from './lib/capabilitySupply/ownerFunnel/reserve'
import { withdrawOwnerCapabilityHandler } from './lib/capabilitySupply/ownerFunnel/withdraw'
import { republishOwnerCapabilityHandler } from './lib/capabilitySupply/ownerFunnel/republish'
import { refreshOwnerCapabilityHandler } from './lib/capabilitySupply/ownerFunnel/refresh'
import {
  readOwnerSupplyIntegrationDraftResult,
  saveAgentSupplyIntegrationDraftArgs,
  saveOwnerSupplyIntegrationDraftArgs,
  saveSupplyIntegrationDraftResult,
} from './lib/capabilitySupply/integrationDrafts/contracts'
import { readOwnerSupplyIntegrationDraftHandler } from './lib/capabilitySupply/integrationDrafts/read'
import {
  saveAgentSupplyIntegrationDraftHandler,
  saveOwnerSupplyIntegrationDraftHandler,
} from './lib/capabilitySupply/integrationDrafts/save'

export const readOwnerSupplyFunnel = queryGeneric({
  args: {
    businessId: v.id('businesses'),
    editorOfferingRef: v.optional(v.string()),
  },
  returns: ownerSupplyFunnelResultValue,
  handler: readOwnerSupplyFunnelHandler,
})

export const readAgentOwnerSupplyFunnel = queryGeneric({
  args: agentOwnerSupplyFunnelReadArgs,
  returns: ownerSupplyFunnelResultValue,
  handler: readAgentOwnerSupplyFunnelHandler,
})

export const reserveOwnerCapabilityPublication = mutationGeneric({
  args: ownerPublishReservationArgsValue.fields,
  returns: ownerPublishReservationResultValue,
  handler: reserveOwnerCapabilityPublicationHandler,
})

export const saveAgentSupplyIntegrationDraft = mutationGeneric({
  args: saveAgentSupplyIntegrationDraftArgs.fields,
  returns: saveSupplyIntegrationDraftResult,
  handler: saveAgentSupplyIntegrationDraftHandler,
})

export const saveOwnerSupplyIntegrationDraft = mutationGeneric({
  args: saveOwnerSupplyIntegrationDraftArgs.fields,
  returns: saveSupplyIntegrationDraftResult,
  handler: saveOwnerSupplyIntegrationDraftHandler,
})

export const readOwnerSupplyIntegrationDraft = queryGeneric({
  args: {
    businessId: v.id('businesses'),
    candidateRef: v.string(),
  },
  returns: readOwnerSupplyIntegrationDraftResult,
  handler: readOwnerSupplyIntegrationDraftHandler,
})

export const withdrawOwnerCapability = mutationGeneric({
  args: ownerSupplyCommandArgsValue.fields,
  returns: ownerSupplyCommandResultValue,
  handler: withdrawOwnerCapabilityHandler,
})

export const republishOwnerCapability = mutationGeneric({
  args: ownerSupplyCommandArgsValue.fields,
  returns: ownerSupplyCommandResultValue,
  handler: republishOwnerCapabilityHandler,
})

export const refreshOwnerCapability = mutationGeneric({
  args: ownerSupplyCommandArgsValue.fields,
  returns: ownerSupplyCommandResultValue,
  handler: refreshOwnerCapabilityHandler,
})
