import { v } from 'convex/values'
import { internalQuery, query } from './_generated/server'
import { internalMutation, mutation } from './usageTrackedMutation'
import {
  completeDeliveryArgs,
  completeDeliveryHandler,
  readNotificationContextArgs,
  readNotificationContextHandler,
  readNotificationContextResult,
} from './lib/principalAccount/notifications/delivery'
import { enqueueAgentApprovalRequestedHandler } from './lib/principalAccount/notifications/enqueue'
import {
  readPreferencesArgs,
  readPreferencesHandler,
  readPreferencesResult,
  updatePreferencesArgs,
  updatePreferencesHandler,
  updatePreferencesResult,
} from './lib/principalAccount/notifications/preferences'

export const readPreferences = query({
  args: readPreferencesArgs,
  returns: readPreferencesResult,
  handler: readPreferencesHandler,
})

export const updatePreferences = mutation({
  args: updatePreferencesArgs,
  returns: updatePreferencesResult,
  handler: updatePreferencesHandler,
})

export const enqueueAgentApprovalRequested = internalMutation({
  args: { callRef: v.string() },
  returns: v.object({
    kind: v.union(v.literal('enqueued'), v.literal('exists'), v.literal('skipped'), v.literal('suppressed')),
  }),
  handler: enqueueAgentApprovalRequestedHandler,
})

export const readNotificationContext = internalQuery({
  args: readNotificationContextArgs,
  returns: readNotificationContextResult,
  handler: readNotificationContextHandler,
})

export const completeDelivery = internalMutation({
  args: completeDeliveryArgs,
  returns: v.null(),
  handler: completeDeliveryHandler,
})
