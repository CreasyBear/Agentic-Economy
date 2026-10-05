"use node"

import { createClerkClient } from '@clerk/backend'
import { v, type Infer } from 'convex/values'

import { degradeBackend } from '../src/lib/observability/degrade-backend'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { sendApprovalEmailResult } from './lib/principalAccount/notifications/delivery'

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
    if(fresh.deliveryRef!==context.deliveryRef||fresh.clerkUserId!==context.clerkUserId||fresh.subject!==context.subject||fresh.text!==context.text)return {outcome:'suppressed',code:'notification_context_changed'}

    let response: Response
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': context.deliveryRef,
          'User-Agent': 'aecon-notifications/1',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [primaryEmail.emailAddress],
          subject: context.subject,
          text: context.text,
        }),
      })
    } catch {
      throw new Error('resend_network_error')
    }

    if (response.status === 429 || response.status === 409 || response.status >= 500) {
      throw new Error(`resend_retryable_status_${response.status}`)
    }
    if (response.status < 200 || response.status >= 300) {
      return { outcome: 'failed', code: `provider_rejected_${response.status}` }
    }

    let vendorMessageId: string | undefined
    try {
      const body: unknown = await response.json()
      if (typeof body === 'object' && body !== null && 'id' in body
        && typeof body.id === 'string' && body.id.length > 0) vendorMessageId = body.id
    } catch {
      // An accepted send remains successful when Resend omits its response body.
    }
    return {
      outcome: 'sent',
      ...(vendorMessageId === undefined ? {} : { vendorMessageId }),
    }
  },
})
