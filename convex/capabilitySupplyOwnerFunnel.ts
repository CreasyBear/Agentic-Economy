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
  readOwnerSupplyIntegrationDraftHandler,
  readOwnerSupplyIntegrationDraftResultValue,
  saveAgentSupplyIntegrationDraftArgsValue,
  saveAgentSupplyIntegrationDraftHandler,
  saveAgentSupplyIntegrationDraftResultValue,
  saveOwnerSupplyIntegrationDraftArgsValue,
  saveOwnerSupplyIntegrationDraftHandler,
} from './capabilitySupplyIntegrationDrafts'

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
  args: saveAgentSupplyIntegrationDraftArgsValue.fields,
  returns: saveAgentSupplyIntegrationDraftResultValue,
  handler: saveAgentSupplyIntegrationDraftHandler,
})

export const saveOwnerSupplyIntegrationDraft = mutationGeneric({
  args: saveOwnerSupplyIntegrationDraftArgsValue.fields,
  returns: saveAgentSupplyIntegrationDraftResultValue,
  handler: saveOwnerSupplyIntegrationDraftHandler,
})

export const readOwnerSupplyIntegrationDraft = queryGeneric({
  args: {
    businessId: v.id('businesses'),
    candidateRef: v.string(),
  },
  returns: readOwnerSupplyIntegrationDraftResultValue,
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
