"use node"

import { createClerkClient } from '@clerk/backend'
import { v } from 'convex/values'

import { degradeBackend } from '../src/lib/observability/degrade-backend'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { internalAction, type ActionCtx } from './_generated/server'
import { classifyResendOutcome } from './lib/principalAccount/notifications/resendOutcome'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from './lib/platform/workloadCron/context'

const MAX_BATCH_SIZE = 20

export const deliverDueOwnerNotifications = internalAction({
  args: { workload: workloadCronSnapshotValue },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.runQuery(internal.workloadCron.reconcile, {
      name: 'deliver owner notifications',
      snapshot: parseWorkloadCronSnapshot(args.workload),
    })
    const resendApiKey = process.env.RESEND_API_KEY?.trim()
    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim()
    const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim()
    if (!resendApiKey || !fromEmail || !clerkSecretKey) {
      degradeBackend(new Error('notification_sender_credentials_missing'), undefined, {
        site: 'deliverDueOwnerNotifications',
        reason: 'source_unavailable',
      })
      return null
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey })
    const deliveries = await ctx.runMutation(internal.notifications.claimDueNotificationDeliveries, {
      limit: MAX_BATCH_SIZE,
    })
    for (const delivery of deliveries) {
      const context = await ctx.runQuery(internal.notifications.readNotificationContext, {
        deliveryId: delivery.deliveryId,
      })
      if (context.kind === 'skip') {
        await ctx.runMutation(internal.notifications.finishNotificationDelivery, {
          deliveryId: delivery.deliveryId,
          outcome: 'suppressed',
          code: context.code,
        })
        continue
      }

      let email: string | undefined
      try {
        const user = await clerk.users.getUser(context.clerkUserId)
        const primaryEmail = user.primaryEmailAddress
        if (primaryEmail?.verification?.status === 'verified') email = primaryEmail.emailAddress
      } catch {
        await finishRetry(ctx, delivery.deliveryId, delivery.attemptCount, 'network_error')
        continue
      }
      if (email === undefined || email.length === 0) {
        await ctx.runMutation(internal.notifications.finishNotificationDelivery, {
          deliveryId: delivery.deliveryId,
          outcome: 'failed',
          code: 'no_verified_email',
        })
        continue
      }

      let status: number | 'network_error'
      let response: Response | undefined
      try {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': delivery.deliveryRef,
            'User-Agent': 'aecon-notifications/1',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: context.subject,
            text: context.text,
          }),
        })
        status = response.status
      } catch {
        status = 'network_error'
      }
      const result = classifyResendOutcome(status, delivery.attemptCount)
      let vendorMessageId: string | undefined
      if (result.outcome === 'sent' && response !== undefined) {
        try {
          const body: unknown = await response.json()
          if (typeof body === 'object' && body !== null && 'id' in body
            && typeof body.id === 'string' && body.id.length > 0) vendorMessageId = body.id
        } catch {
          // The provider message id is optional after an accepted send.
        }
      }
      if (result.outcome === 'retry') {
        await ctx.runMutation(internal.notifications.finishNotificationDelivery, {
          deliveryId: delivery.deliveryId,
          outcome: 'retry',
          code: result.code,
          nextAttemptAt: Date.now() + result.retryDelayMs,
        })
      } else {
        await ctx.runMutation(internal.notifications.finishNotificationDelivery, {
          deliveryId: delivery.deliveryId,
          outcome: result.outcome,
          ...(result.outcome === 'failed' ? { code: result.code } : {}),
          ...(vendorMessageId === undefined ? {} : { vendorMessageId }),
        })
      }
    }
    return null
  },
})

async function finishRetry(
  ctx: ActionCtx,
  deliveryId: Id<'notificationDeliveries'>,
  attemptCount: number,
  status: 'network_error',
): Promise<void> {
  const result = classifyResendOutcome(status, attemptCount)
  if (result.outcome === 'retry') {
    await ctx.runMutation(internal.notifications.finishNotificationDelivery, {
      deliveryId,
      outcome: 'retry',
      code: result.code,
      nextAttemptAt: Date.now() + result.retryDelayMs,
    })
    return
  }
  await ctx.runMutation(internal.notifications.finishNotificationDelivery, {
    deliveryId,
    outcome: 'failed',
    code: result.code,
  })
}
