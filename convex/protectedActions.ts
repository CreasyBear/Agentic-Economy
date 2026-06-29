import { queryGeneric } from 'convex/server'
import { v } from 'convex/values'

const selectedActionSlug = v.literal('contact-follow-up')

const selectedActionDescriptor = v.object({
  selectedActionName: v.literal('Owner-approved customer contact follow-up request'),
  selectedActionSlug,
  ownerApprovalRequired: v.literal(true),
  providerOrInternalBoundary: v.literal('source_owned_follow_up_outbox'),
  noMoneyMovement: v.literal(true),
  proposalOnly: v.literal(true),
})

const contactFollowUpDescriptor = {
  selectedActionName: 'Owner-approved customer contact follow-up request',
  selectedActionSlug: 'contact-follow-up',
  ownerApprovalRequired: true,
  providerOrInternalBoundary: 'source_owned_follow_up_outbox',
  noMoneyMovement: true,
  proposalOnly: true,
} as const

export const readSelectedProtectedActionDescriptor = queryGeneric({
  args: {},
  returns: selectedActionDescriptor,
  handler: () => contactFollowUpDescriptor,
})
