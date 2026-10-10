"use node"

import { createClerkClient } from '@clerk/backend'
import { v, type Infer } from 'convex/values'

import { degradeBackend } from '../src/lib/observability/degrade-backend'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { sendApprovalEmailResult } from './lib/principalAccount/notifications/delivery'
import { postResendEmail } from './lib/principalAccount/notifications/resend'
import { buildDigest, operatorDate } from './operatorDigest'

/** The operator reads the digest in Sydney, so the subject and idempotency key use that calendar day. */

export const sendApprovalEmail = internalAction({
  args: { deliveryId: v.id('notificationDeliveries') },
  returns: sendApprovalEmailResult,
  handler: async (ctx, { deliveryId }): Promise<Infer<typeof sendApprovalEmailResult>> => {
    const resendApiKey = process.env.RESEND_API_KEY?.trim()
    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim()
    const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim()
    if (!resendApiKey || !fromEmail || !clerkSecretKey) {
      degradeBackend(new Error('notification_sender_credentials_missing'), undefined, {
        site: 'sendApprovalEmail',
        reason: 'source_unavailable',
      })
      return { outcome: 'suppressed', code: 'sender_not_configured' }
    }

    const context = await ctx.runQuery(internal.notifications.readNotificationContext, { deliveryId })
    if (context.kind === 'skip') return { outcome: 'suppressed', code: context.code }

    const clerk = createClerkClient({ secretKey: clerkSecretKey })
    const user = await clerk.users.getUser(context.clerkUserId)
    const primaryEmail = user.primaryEmailAddress
    if (primaryEmail?.verification?.status !== 'verified' || primaryEmail.emailAddress.length === 0) {
      return { outcome: 'failed', code: 'no_verified_email' }
    }

    const fresh=await ctx.runQuery(internal.notifications.readNotificationContext,{deliveryId})
    if(fresh.kind==='skip')return {outcome:'suppressed',code:fresh.code}
    if(fresh.deliveryRef!==context.deliveryRef||fresh.clerkUserId!==context.clerkUserId||fresh.subject!==context.subject||fresh.text!==context.text||fresh.unsubscribeUrl!==context.unsubscribeUrl)return {outcome:'suppressed',code:'notification_context_changed'}

    return await postResendEmail({
      apiKey: resendApiKey,
      from: fromEmail,
      to: primaryEmail.emailAddress,
      subject: context.subject,
      text: context.text,
      idempotencyKey: context.deliveryRef,
      ...(context.unsubscribeUrl === undefined ? {} : {
        headers: { 'List-Unsubscribe': `<${context.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    })
  },
})

export const sendOperatorDigest = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const resendApiKey = process.env.RESEND_API_KEY?.trim()
    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim()
    const operatorEmail = process.env.OPERATOR_EMAIL?.trim()
    if (!resendApiKey || !fromEmail || !operatorEmail) {
      degradeBackend(new Error('operator_digest_credentials_missing'), undefined, {
        site: 'sendOperatorDigest',
        reason: 'source_unavailable',
      })
      return null
    }

    // A zero digest is still sent, so a missing email means the job is broken, not that nobody stalled.
    const now = Date.now()
    const digest = await buildDigest(ctx, now)
    const date = operatorDate(now)
    const result = await postResendEmail({
      apiKey: resendApiKey,
      from: fromEmail,
      to: operatorEmail,
      subject: `AE stalled accounts, ${date}`,
      text: digest.text,
      idempotencyKey: `operator-digest:${date}`,
    })
    // 429/409/5xx throw inside postResendEmail and the workpool retries; a 4xx rejection will not change on retry.
    if (result.outcome === 'failed') {
      degradeBackend(new Error(result.code), undefined, { site: 'sendOperatorDigest', reason: 'invalid_response' })
    }
    return null
  },
})
