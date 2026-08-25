import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  agentOwnerSupplyFunnelReadArgs,
  readAgentOwnerSupplyFunnelHandler,
} from './capabilitySupplyOwnerFunnelAgentRead'
import { ownerSupplyFunnelResultValue } from './capabilitySupplyOwnerFunnelProjection'
import { readOwnerSupplyFunnelHandler } from './capabilitySupplyOwnerFunnelRead'
import {
  ownerPublishReservationArgsValue,
  ownerPublishReservationResultValue,
  ownerSupplyCommandArgsValue,
  ownerSupplyCommandResultValue,
  refreshOwnerCapabilityHandler,
  republishOwnerCapabilityHandler,
  reserveOwnerCapabilityPublicationHandler,
  withdrawOwnerCapabilityHandler,
} from './capabilitySupplyOwnerFunnelCommands'

export const readOwnerSupplyFunnel = queryGeneric({
  args: {
    businessId: v.id('businesses'),
  },
  returns: ownerSupplyFunnelResultValue,
  handler: readOwnerSupplyFunnelHandler,
})

export const readAgentOwnerSupplyFunnel = mutationGeneric({
  args: agentOwnerSupplyFunnelReadArgs,
  returns: ownerSupplyFunnelResultValue,
  handler: readAgentOwnerSupplyFunnelHandler,
})

export const reserveOwnerCapabilityPublication = mutationGeneric({
  args: ownerPublishReservationArgsValue.fields,
  returns: ownerPublishReservationResultValue,
  handler: reserveOwnerCapabilityPublicationHandler,
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
