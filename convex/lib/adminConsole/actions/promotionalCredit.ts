import type { MutationCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import type { AdminCommandSpec } from '../commands/commandEnvelope'
import type { AdminCommandWireArgs } from '../commands/contracts'

/** Grant admission records intent only; a separate action confirms the ledger posting. */
export function promotionalCreditSpec(
  ctx: MutationCtx,
  args: AdminCommandWireArgs<'grant_promotional_credit'>,
): AdminCommandSpec<'grant_promotional_credit'> {
  const input = args.input
  return {
    targetType: 'account',
    targetRef: input.accountRef,
    auditEventType: 'money.promotional_credit_requested',
    currentStateDigest: async () => {
      const account = await ctx.db.query('accounts')
        .withIndex('by_accountRef', q => q.eq('accountRef', input.accountRef)).unique()
      return account === null ? null : canonicalDigest({ accountRef: account.accountRef, lifecycle: account.lifecycle, updatedAt: account.updatedAt })
    },
    apply: async authority => {
      const now = Date.now()
      if (deploymentPaymentEnvironment(env) !== input.environment) return { kind: 'refused', code: 'environment_mismatch' }
      if (!/^[1-9]\d{0,15}$/u.test(input.amountUnits)
        || BigInt(input.amountUnits) > BigInt(Number.MAX_SAFE_INTEGER)
        || !Number.isSafeInteger(input.expiresAt)
        || input.expiresAt <= now) return { kind: 'refused', code: 'promotional_credit_invalid' }
      const account = await ctx.db.query('accounts')
        .withIndex('by_accountRef', q => q.eq('accountRef', input.accountRef)).unique()
      if (account === null || account.lifecycle !== 'active') return { kind: 'refused', code: 'account_not_found' }
      const actorRef = authority.membership.clerkUserId
      const grantRef = canonicalDigest({ format: 'ae.promotional-credit-grant:v1', actorRef, operationKey: args.operationKey, input })
      const existing = await ctx.db.query('moneyPromotionalGrants')
        .withIndex('by_grantRef', q => q.eq('grantRef', grantRef)).unique()
      if (existing !== null) return { kind: 'refused', code: 'promotional_credit_invalid' }
      const commandDigest = canonicalDigest({
        scope: 'admin_operator', action: args.action, input,
        reasonCode: args.reasonCode, evidenceRefs: args.evidenceRefs,
        ...(args.expectedStateDigest === undefined ? {} : { expectedStateDigest: args.expectedStateDigest }),
      })
      const requestHash = canonicalDigest({ commandDigest, actorRef, approval: args.approval })
      const auditEventRef = `audit:money.promotional_credit_requested:${canonicalDigest({
        actorRef, operationName: 'admin:grant_promotional_credit', key: args.operationKey, requestHash,
      })}`
      await ctx.db.insert('moneyPromotionalGrants', {
        grantRef, accountRef: input.accountRef, environment: input.environment,
        amountUnits: input.amountUnits, availableUnits: '0', expiresAt: input.expiresAt,
        createdAt: now, updatedAt: now, operationKey: args.operationKey,
        actorRef, correlationId: args.correlationId, commandDigest,
        reasonCode: args.reasonCode, evidenceRefs: [...args.evidenceRefs],
        auditEventRef,
        bookingState: 'pending', nextWorkAt: now, expiryRevision: 0,
      })
      await ctx.scheduler.runAfter(0, internal.moneyPromotionalCredit.process, { grantRef })
      return { kind: 'pending', effectRefs: [grantRef], beforeState: 'absent', afterState: 'pending' }
    },
  }
}
