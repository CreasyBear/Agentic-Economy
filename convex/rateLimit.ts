import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation } from './_generated/server'
import { assertAdmission } from './lib/rateLimit'

const internalRateLimitName = v.union(
  v.literal('public-read'),
  v.literal('public-mutation'),
  v.literal('oauth-issuance'),
  v.literal('oauth-device-poll'),
  v.literal('chat-submit'),
  v.literal('chat-anonymous'),
  v.literal('dispute-open'),
)

const publicHttpRateLimitName = v.union(
  v.literal('public-read'),
  v.literal('public-mutation'),
  v.literal('oauth-issuance'),
  v.literal('oauth-device-poll'),
  v.literal('dispute-open'),
)

export const admit = internalMutation({
  args: {
    name: internalRateLimitName,
    key: v.string(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), retryAfter: v.optional(v.number()) }),
    v.object({ ok: v.literal(false), retryAfter: v.number() }),
  ),
  handler: async (ctx, args) => {
    const admission = await assertAdmission(ctx, args)
    if (!admission.ok) return { ok: false as const, retryAfter: admission.retryAfter }
    return admission.retryAfter === undefined
      ? { ok: true as const }
      : { ok: true as const, retryAfter: admission.retryAfter }
  },
})

export const admitHttp = mutationGeneric({
  args: {
    name: publicHttpRateLimitName,
    key: v.string(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), retryAfter: v.optional(v.number()) }),
    v.object({ ok: v.literal(false), retryAfter: v.number() }),
  ),
  handler: async (ctx, args) => {
    const admission = await assertAdmission(ctx, args)
    if (!admission.ok) return { ok: false as const, retryAfter: admission.retryAfter }
    return admission.retryAfter === undefined
      ? { ok: true as const }
      : { ok: true as const, retryAfter: admission.retryAfter }
  },
})
