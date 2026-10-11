"use node"

import { createClerkClient } from '@clerk/backend'
import { v, type Infer } from 'convex/values'

import { degradeBackend } from '../src/lib/observability/degrade-backend'
import { subject as operatorDigestSubject } from '../src/emails/templates/operator-digest'
import { EmailPropMissingError } from '../src/emails/templates/account-notice'
import { renderEmail, type EmailInput } from '../src/emails/render'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { sendDeliveryEmailResult } from './lib/principalAccount/notifications/delivery'
import { emailAddressHash } from './lib/principalAccount/notifications/suppression'
import { postResendEmail } from './lib/principalAccount/notifications/resend'
import { buildDigest, operatorDate } from './operatorDigest'
import { canonicalDigest } from '@/modules/common/canonical-digest'

/** The operator reads the digest in Sydney, so the subject and idempotency key use that calendar day. */

export const sendDeliveryEmail = internalAction({
  args: { deliveryId: v.id('notificationDeliveries') },
  returns: sendDeliveryEmailResult,
  handler: async (ctx, { deliveryId }): Promise<Infer<typeof sendDeliveryEmailResult>> => {
    const resendApiKey = process.env.RESEND_API_KEY?.trim()
    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim()
    const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim()
    if (!resendApiKey || !fromEmail || !clerkSecretKey) {
      degradeBackend(new Error('notification_sender_credentials_missing'), undefined, {
        site: 'sendDeliveryEmail',
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

    const fresh = await ctx.runQuery(internal.notifications.readNotificationContext, { deliveryId })
    if (fresh.kind === 'skip') return { outcome: 'suppressed', code: fresh.code }
    // Props digest: a change in what the email is built from between the two reads stops the send.
    if (canonicalDigest(fresh.email) !== canonicalDigest(context.email)) return { outcome: 'suppressed', code: 'notification_context_changed' }

    // The Clerk address is the one Resend will receive, so bounce and complaint records are matched here.
    const suppressed = await ctx.runQuery(internal.notifications.readSendSuppression, {
      deliveryId,
      addressHash: await emailAddressHash(primaryEmail.emailAddress),
    })
    if (suppressed !== null) return { outcome: 'suppressed', code: suppressed }

    // From A$1,000 the invoice names the buyer; without an ABN or legal name that is the Clerk name and the account email (design doc 6.1). Below it nothing is added.
    const props = context.email.eventKind === 'funding_receipt' ? context.email.props as { totalUnits: string; exponent: number; buyerName?: string } : undefined
    const needsBuyer = props !== undefined && BigInt(props.totalUnits) >= 1000n * 10n ** BigInt(props.exponent)
    const accountName = [user.firstName, user.lastName].filter(Boolean).join(' ')
    const email = props !== undefined && needsBuyer
      ? { ...context.email, props: { ...props, buyerEmail: primaryEmail.emailAddress, ...(props.buyerName === undefined && accountName !== '' ? { buyerName: accountName } : {}) } }
      : context.email
    // A missing required prop means the email must not exist: skip with a reason instead of retrying or printing a placeholder.
    const rendered = await renderEmail(email as EmailInput).catch((error: unknown) => {
      if (error instanceof EmailPropMissingError) return null
      throw error
    })
    if (rendered === null) return { outcome: 'suppressed', code: 'email_prop_missing' }
    // Only alert and lifecycle props carry an unsubscribe target; required mail has none.
    const unsubscribeUrl = (context.email.props as { unsubscribeUrl?: string }).unsubscribeUrl
    const post = (to: string, idempotencyKey: string) => postResendEmail({
      apiKey: resendApiKey,
      from: fromEmail,
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey,
      tags: [
        { name: 'stream', value: context.stream },
        { name: 'event_kind', value: context.email.eventKind },
        { name: 'env', value: process.env.AE_DEPLOYMENT_ENVIRONMENT?.trim() || 'unknown' },
      ],
      ...(unsubscribeUrl === undefined ? {} : {
        headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    })
    const result = await post(primaryEmail.emailAddress, context.deliveryRef)
    // Email change: the replaced inbox hears of it too. A retry reuses both keys, so neither mail doubles.
    if (result.outcome === 'sent' && context.previousAddress !== undefined && context.previousAddress !== primaryEmail.emailAddress.toLowerCase()) {
      const old = await post(context.previousAddress, `${context.deliveryRef}:old`)
      if (old.outcome !== 'sent') return old
    }
    return result
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
      subject: operatorDigestSubject({ date, siteUrl: '', lines: [] }),
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
