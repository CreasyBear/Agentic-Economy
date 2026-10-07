import { z } from 'zod'
import { env, type MutationCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { TRIAL_DURATION_MS } from '@/modules/money/public'
import type { AdminCommandSpec } from '../commands/commandEnvelope'
import type { AdminCommandWireArgs } from '../commands/contracts'
import { activateTrialOffer, readAccountTrial, readTrialAccount } from '../../money/trials/activation'
import { trialOfferRef } from '../../money/trials/authority'
import { financialEnvironmentMatches } from '../../money/formance/contracts'

export function trialSpec(ctx: MutationCtx, args: AdminCommandWireArgs<'issue_trial'>): AdminCommandSpec<'issue_trial'> {
  const input = args.input
  const offerRef = trialOfferRef(input)
  return {
    targetType: 'protected_action', targetRef: offerRef, auditEventType: 'money.trial_approved',
    currentStateDigest: async () => {
      const existing = await ctx.db.query('moneyTrialOffers').withIndex('by_offerRef', q => q.eq('offerRef', offerRef)).unique()
      return existing === null ? null : canonicalDigest({ offerRef, activation: existing.activation, updatedAt: existing.updatedAt })
    },
    apply: async authority => {
      if (deploymentPaymentEnvironment(env) !== input.environment || !financialEnvironmentMatches(input.environment)) return { kind: 'refused', code: 'environment_mismatch' }
      const recipient = input.recipient
      if (recipient.kind === 'email' && (recipient.email !== recipient.email.trim().toLowerCase()
        || recipient.email.length > 254 || !z.email().safeParse(recipient.email).success)) return { kind: 'refused', code: 'trial_recipient_invalid' }
      if (await ctx.db.query('moneyTrialOffers').withIndex('by_offerRef', q => q.eq('offerRef', offerRef)).unique() !== null) {
        return { kind: 'refused', code: 'trial_already_approved' }
      }
      const account = recipient.kind === 'account' ? await readTrialAccount(ctx, recipient.accountRef) : null
      if (recipient.kind === 'account') {
        if (account === null) return { kind: 'refused', code: 'account_not_found' }
        if (await readAccountTrial(ctx, input.environment, recipient.accountRef) !== null) return { kind: 'refused', code: 'trial_already_approved' }
      }
      const now = Date.now()
      const actorRef = authority.membership.clerkUserId
      const commandDigest = canonicalDigest({ scope: 'admin_operator', action: args.action, input,
        reasonCode: args.reasonCode, evidenceRefs: args.evidenceRefs,
        ...(args.expectedStateDigest === undefined ? {} : { expectedStateDigest: args.expectedStateDigest }),
      })
      const requestHash = canonicalDigest({ commandDigest, actorRef, approval: args.approval })
      const auditEventRef = `audit:money.trial_approved:${canonicalDigest({ actorRef, operationName: 'admin:issue_trial', key: args.operationKey, requestHash })}`
      const id = await ctx.db.insert('moneyTrialOffers', {
        offerRef, environment: input.environment, recipient,
        activation: { kind: 'unclaimed', claimBy: now + TRIAL_DURATION_MS },
        delivery: recipient.kind === 'email' ? { kind: 'queued' } : { kind: 'not_required' },
        createdAt: now, updatedAt: now, actorRef, operationKey: args.operationKey, correlationId: args.correlationId,
        commandDigest, auditEventRef, reasonCode: args.reasonCode, evidenceRefs: [...args.evidenceRefs],
        ...(args.expectedStateDigest === undefined ? {} : { expectedStateDigest: args.expectedStateDigest }),
      })
      if (recipient.kind === 'account' && account !== null) {
        const offer = await ctx.db.get(id)
        if (offer === null) throw new Error('trial_offer_insert_missing')
        const activated = await activateTrialOffer(ctx, offer, recipient.accountRef, account.ownerPrincipalRef, now)
        if (activated.kind !== 'granted') throw new Error('trial_activation_conflict')
      } else {
        await ctx.scheduler.runAfter(0, internal.trialAccessActions.deliverInvitation, { offerRef })
      }
      return { kind: 'applied', code: 'trial_approved', effectRefs: [offerRef], beforeState: 'absent', afterState: 'approved' }
    },
  }
}
