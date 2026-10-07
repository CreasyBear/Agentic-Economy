import { v, type Infer } from 'convex/values'
import { env, type QueryCtx } from '../../../_generated/server'
import { resolveAdminAuthority } from '../../../authz'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { trialRecipientValue, trialActivationValue, trialDeliveryValue } from '@/modules/money/public'
import { readAccountTrial } from './activation'

export const adminTrialArgs = { accountRef: v.optional(v.string()) }
export const adminTrialViewValue = v.object({
  offerRef: v.string(), recipient: trialRecipientValue, activation: trialActivationValue, delivery: trialDeliveryValue,
  createdAt: v.number(), booking: v.union(v.literal('not_started'), v.literal('pending'), v.literal('booked'), v.literal('unavailable')),
})
export const adminTrialResultValue = v.union(
  v.object({ kind: v.literal('refused') }),
  v.object({ kind: v.literal('ready'), environment: v.union(v.literal('sandbox'), v.literal('production')), offers: v.array(adminTrialViewValue) }),
)

export async function readAdminTrialsHandler(ctx: QueryCtx, args: { accountRef?: string }): Promise<Infer<typeof adminTrialResultValue>> {
  const authority = await resolveAdminAuthority(ctx, 'grant_promotional_credit')
  const environment = deploymentPaymentEnvironment(env)
  if (authority.kind === 'denied' || environment === undefined) return { kind: 'refused' }
  const accountOffer = args.accountRef === undefined ? undefined : await readAccountTrial(ctx, environment, args.accountRef)
  const offers = accountOffer === undefined
    ? await ctx.db.query('moneyTrialOffers').withIndex('by_environment_and_createdAt', q => q.eq('environment', environment)).order('desc').take(25)
    : accountOffer === null ? [] : [accountOffer]
  return { kind: 'ready', environment, offers: await Promise.all(offers.map(async offer => {
    const activation = offer.activation
    const grant = activation.kind === 'granted'
      ? await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', activation.grantRef)).unique()
      : null
    return { offerRef: offer.offerRef, recipient: offer.recipient, activation, delivery: offer.delivery,
      createdAt: offer.createdAt, booking: activation.kind === 'unclaimed' ? 'not_started' as const : grant?.bookingState ?? 'unavailable' as const }
  })) }
}
