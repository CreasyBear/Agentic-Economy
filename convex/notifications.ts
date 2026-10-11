import {requestUsageAlertReportHandler} from './lib/principalAccount/notifications/usageReports'
import {usageHistoryArgs,usageHistoryResult,readUsageAlertHistoryHandler} from './lib/principalAccount/notifications/usageHistory'
import {activeUsagePolicy,usageMoneyEvidenceArgs,enqueueMoneyUsageAlertsHandler,evaluateUsageMoneyAlertsHandler} from './lib/principalAccount/notifications/usageAlerts'
import { v } from 'convex/values'
import { internalAction,internalQuery, query } from './_generated/server'
import { degradeBackend } from '../src/lib/observability/degrade-backend'
import { internalMutation, mutation } from './usageTrackedMutation'
import {
  applyResendEventHandler,
  completeDeliveryArgs,
  completeDeliveryHandler,
  readNotificationContextArgs,
  readNotificationContextHandler,
  readNotificationContextResult,
  readSendSuppressionArgs,
  readSendSuppressionHandler,
  resendEventArgs,
  resendEventResult,
} from './lib/principalAccount/notifications/delivery'
import { enqueueAgentApprovalRequestedHandler, enqueueDataExportHandler, enqueuePaymentStuckHandler } from './lib/principalAccount/notifications/enqueue'
import { paginationOptsValidator } from 'convex/server'
import { internal } from './_generated/api'
import { STALLED_STEP_NAMES, stalledStepValue } from './lib/journey/stalled'
import {
  enqueueStalledStepEmailsHandler,
  stalledEmailsEnabled,
} from './lib/principalAccount/notifications/stalled'
import {
  readPreferencesArgs,
  readPreferencesHandler,
  readPreferencesResult,
  unsubscribeEmailStreamArgs,
  unsubscribeEmailStreamHandler,
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

export const enqueuePaymentStuck = internalMutation({
  args: { commandRef: v.string() },
  returns: v.null(),
  handler: enqueuePaymentStuckHandler,
})

export const recordDataExportRequested = mutation({
  args: {},
  returns: v.null(),
  handler: enqueueDataExportHandler,
})

export const enqueueAgentApprovalRequested = internalMutation({
  args: { callRef: v.string() },
  returns: v.object({
    kind: v.union(v.literal('enqueued'), v.literal('exists'), v.literal('skipped'), v.literal('suppressed')),
  }),
  handler: enqueueAgentApprovalRequestedHandler,
})

export const enqueueStalledStepEmails = internalMutation({
  args: { step: stalledStepValue, now: v.number(), paginationOpts: paginationOptsValidator },
  returns: v.object({ isDone: v.boolean(), continueCursor: v.string() }),
  handler: enqueueStalledStepEmailsHandler,
})

const STALLED_EMAIL_PAGE_SIZE = 50

/** Walks every stalled step to its last page, so each step gets its own pass and none starves another. */
export const sweepStalledStepEmails = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    if (!stalledEmailsEnabled()) return null
    const now = Date.now()
    for (const step of STALLED_STEP_NAMES) {
      let cursor: string | null = null
      try {
        for (;;) {
          const page: { isDone: boolean; continueCursor: string } = await ctx.runMutation(internal.notifications.enqueueStalledStepEmails, {
            step, now, paginationOpts: { numItems: STALLED_EMAIL_PAGE_SIZE, cursor },
          })
          if (page.isDone) break
          cursor = page.continueCursor
        }
      } catch (error) {
        // One failing step is reported and the sweep moves on; the next daily run retries it.
        degradeBackend(error, undefined, { site: `sweepStalledStepEmails.${step}`, reason: 'source_unavailable' })
      }
    }
    return null
  },
})

export const unsubscribeEmailStream = internalMutation({
  args: unsubscribeEmailStreamArgs,
  returns: v.boolean(),
  handler: unsubscribeEmailStreamHandler,
})

export const readNotificationContext = internalQuery({
  args: readNotificationContextArgs,
  returns: readNotificationContextResult,
  handler: readNotificationContextHandler,
})

export const readSendSuppression = internalQuery({
  args: readSendSuppressionArgs,
  returns: v.union(v.string(), v.null()),
  handler: readSendSuppressionHandler,
})

export const applyResendEvent = internalMutation({
  args: resendEventArgs,
  returns: resendEventResult,
  handler: applyResendEventHandler,
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
