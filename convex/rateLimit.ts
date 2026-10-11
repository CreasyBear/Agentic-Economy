import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'

import { env, internalMutation } from './_generated/server'
import { assertAdmission } from './lib/platform/rateLimit'
import { serviceAssertion } from './serviceAssertion'

const HTTP_ADMIT_OPERATION = 'rateLimit.admitHttp'
const HTTP_ADMIT_SCOPE = 'rate_limit:admit_http'

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
  v.literal('mcp-anonymous'),
  v.literal('funding-checkout'),
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

async function httpAdmitAuthorized(
  name: string,
  key: string,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const serviceKey = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (
    serviceKey === undefined
    || serviceKey.length < 32
    || !assertion.scopes.includes(HTTP_ADMIT_SCOPE)
  ) return false
  return await verifyCustomerRequestServiceAssertion({
    key: serviceKey,
    operation: HTTP_ADMIT_OPERATION,
    command: { name, key },
    assertion,
  })
}

export const admitHttp = mutationGeneric({
  args: {
    name: publicHttpRateLimitName,
    key: v.string(),
    serviceAuth: serviceAssertion,
  },
  returns: v.union(
    v.object({ ok: v.literal(true), retryAfter: v.optional(v.number()) }),
    v.object({ ok: v.literal(false), retryAfter: v.number() }),
  ),
  handler: async (ctx, args) => {
    if (!await httpAdmitAuthorized(args.name, args.key, args.serviceAuth)) {
      throw new Error('authentication_required')
    }
    const admission = await assertAdmission(ctx, { name: args.name, key: args.key })
    if (!admission.ok) return { ok: false as const, retryAfter: admission.retryAfter }
    return admission.retryAfter === undefined
      ? { ok: true as const }
      : { ok: true as const, retryAfter: admission.retryAfter }
  },
})
