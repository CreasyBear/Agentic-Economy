import {requestUsageAlertReportHandler} from './lib/principalAccount/notifications/usageReports'
import {usageHistoryArgs,usageHistoryResult,readUsageAlertHistoryHandler} from './lib/principalAccount/notifications/usageHistory'
import {activeUsagePolicy,usageMoneyEvidenceArgs,enqueueMoneyUsageAlertsHandler,evaluateUsageMoneyAlertsHandler} from './lib/principalAccount/notifications/usageAlerts'
import { v } from 'convex/values'
import { internalAction,internalQuery, query } from './_generated/server'
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

export const hasCurrentUsageAlertConsent=internalQuery({args:{accountRef:v.string()},returns:v.boolean(),handler:async(ctx,args)=>await activeUsagePolicy(ctx,args.accountRef)!==null})
export const evaluateUsageMoneyAlerts=internalAction({args:{accountRef:v.string(),captureOperational:v.optional(v.boolean())},returns:v.null(),handler:evaluateUsageMoneyAlertsHandler})
export const enqueueMoneyUsageAlerts=internalMutation({args:usageMoneyEvidenceArgs,returns:v.null(),handler:enqueueMoneyUsageAlertsHandler})

export const readUsageAlertHistory=query({args:usageHistoryArgs,returns:usageHistoryResult,handler:readUsageAlertHistoryHandler})

export const requestUsageAlertReport=internalMutation({args:{accountRef:v.string()},returns:v.null(),handler:requestUsageAlertReportHandler})
