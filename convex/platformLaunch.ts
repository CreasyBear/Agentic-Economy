import { accountHasTrialAccess } from './lib/money/trials/authority'
import { readTrialAccount } from './lib/money/trials/activation'
import { v } from 'convex/values'
import { env, query } from './_generated/server'
import { resolveBusinessActor, readCurrentActiveAdminMembership } from './authz'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { treasuryEnvironmentValue } from '@/modules/money/treasury'
import { readPaymentReadiness } from './lib/money/readiness/store'
import { readPaymentsAudience } from './lib/money/treasury/paymentAdmission'

export const readOwnerPaymentAccess = query({
  args: { environment: treasuryEnvironmentValue },
  returns: v.union(
    v.object({ kind: v.literal('allowed') }),
    v.object({ kind: v.literal('refused'), code: v.union(v.literal('authentication_required'), v.literal('environment_mismatch'), v.literal('payments_paused'), v.literal('payments_admins_only'), v.literal('payments_not_ready')) }),
  ),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'authentication_required' as const }
    if (deploymentPaymentEnvironment(env) !== args.environment) return { kind: 'refused' as const, code: 'environment_mismatch' as const }
    const audience = await readPaymentsAudience(ctx, args.environment)
    if (audience === 'none') return { kind: 'refused' as const, code: 'payments_paused' as const }
    if (args.environment === 'production' && (await readPaymentReadiness(ctx, args.environment, Date.now())).kind !== 'ready') {
      return { kind: 'refused' as const, code: 'payments_not_ready' as const }
    }
    if (audience === 'everyone' || await readCurrentActiveAdminMembership(ctx) !== undefined) return { kind: 'allowed' as const }
    const account = await readTrialAccount(ctx, actor.canonicalAccountRef)
    if (account !== null && await accountHasTrialAccess(ctx, { environment: args.environment,
      accountRef: actor.canonicalAccountRef, ownerPrincipalRef: account.ownerPrincipalRef, now: Date.now() })) return { kind: 'allowed' as const }
    return { kind: 'refused' as const, code: 'payments_admins_only' as const }
  },
})

/** The one public availability value: paid calls open only under the same two gates as readOwnerPaymentAccess. */
export const readPublicAvailability = query({
  args: {},
  returns: v.object({ paidCalls: v.union(v.literal('open'), v.literal('soon')) }),
  handler: async (ctx) => {
    const environment = deploymentPaymentEnvironment(env)
    if (environment === undefined || await readPaymentsAudience(ctx, environment) !== 'everyone') return { paidCalls: 'soon' as const }
    if (environment === 'production' && (await readPaymentReadiness(ctx, environment, Date.now())).kind !== 'ready') return { paidCalls: 'soon' as const }
    return { paidCalls: 'open' as const }
  },
})
