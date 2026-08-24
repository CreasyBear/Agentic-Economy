import { v, type Infer } from 'convex/values'

import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'

import { env, mutation } from './_generated/server'
import { assertAdmission } from './lib/rateLimit'
import { serviceAssertion } from './serviceAssertion'

const OPERATION = 'chatAdmission.admitAnonymousEdge'
const SCOPE = 'chat_anonymous:admit'

const admissionResult = v.union(
  v.object({ kind: v.literal('admitted'), retryAfter: v.optional(v.number()) }),
  v.object({ kind: v.literal('limited'), retryAfter: v.number() }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
)

async function assertionAuthorized(
  key: string,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const serviceKey = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (
    serviceKey === undefined
    || serviceKey.length < 32
    || !assertion.scopes.includes(SCOPE)
  ) return false
  return await verifyCustomerRequestServiceAssertion({
    key: serviceKey,
    operation: OPERATION,
    command: { key },
    assertion,
  })
}

export const admitAnonymousEdge = mutation({
  args: {
    key: v.string(),
    serviceAuth: serviceAssertion,
  },
  returns: admissionResult,
  handler: async (ctx, args): Promise<Infer<typeof admissionResult>> => {
    if (!await assertionAuthorized(args.key, args.serviceAuth)) {
      return { kind: 'refused', code: 'authentication_required' }
    }
    const admission = await assertAdmission(ctx, {
      name: 'chat-anonymous-edge',
      key: args.key,
    })
    if (!admission.ok) return { kind: 'limited', retryAfter: admission.retryAfter }
    return admission.retryAfter === undefined
      ? { kind: 'admitted' }
      : { kind: 'admitted', retryAfter: admission.retryAfter }
  },
})
