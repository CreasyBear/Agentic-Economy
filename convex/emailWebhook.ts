"use node"

import { Webhook } from 'svix'
import { v } from 'convex/values'

import { degradeBackend } from '../src/lib/observability/degrade-backend'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { emailAddressHash, emailDomain } from './lib/principalAccount/notifications/suppression'

type ResendEvent = { type: string; emailId: string; address: string; permanentBounce: boolean }

/** Pulls the fields the state machine needs from a signature-verified Resend payload. Null means the payload has no usable address. */
function parseResendEvent(event: unknown): ResendEvent | null {
  if (typeof event !== 'object' || event === null) return null
  const { type, data } = event as { type?: unknown; data?: unknown }
  if (typeof type !== 'string' || typeof data !== 'object' || data === null) return null
  const { email_id, to, bounce } = data as { email_id?: unknown; to?: unknown; bounce?: unknown }
  const address = Array.isArray(to) ? to[0] : undefined
  if (typeof email_id !== 'string' || typeof address !== 'string' || address.trim().length === 0) return null
  const permanentBounce = typeof bounce === 'object' && bounce !== null && (bounce as { type?: unknown }).type === 'Permanent'
  return { type, emailId: email_id, address, permanentBounce }
}

/** Verifies the raw body with Svix before anything is parsed. The address is hashed here so only the hash reaches the database. */
export const receiveResendWebhook = internalAction({
  args: {
    rawBody: v.string(),
    svixId: v.string(),
    svixTimestamp: v.string(),
    svixSignature: v.string(),
  },
  returns: v.union(v.literal('applied'), v.literal('duplicate'), v.literal('ignored'), v.literal('invalid')),
  handler: async (ctx, args): Promise<'applied' | 'duplicate' | 'ignored' | 'invalid'> => {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
    if (!secret) {
      degradeBackend(new Error('resend_webhook_secret_missing'), undefined, {
        site: 'receiveResendWebhook',
        reason: 'source_unavailable',
      })
      return 'invalid'
    }

    // svix verify returns nothing, so the body is parsed only after it has passed.
    let payload: unknown
    try {
      new Webhook(secret).verify(args.rawBody, {
        'svix-id': args.svixId,
        'svix-timestamp': args.svixTimestamp,
        'svix-signature': args.svixSignature,
      })
      payload = JSON.parse(args.rawBody)
    } catch {
      return 'invalid'
    }

    const event = parseResendEvent(payload)
    if (event === null) return 'ignored'
    return await ctx.runMutation(internal.notifications.applyResendEvent, {
      svixId: args.svixId,
      type: event.type,
      emailId: event.emailId,
      addressHash: await emailAddressHash(event.address),
      domain: emailDomain(event.address),
      permanentBounce: event.permanentBounce,
    })
  },
})
