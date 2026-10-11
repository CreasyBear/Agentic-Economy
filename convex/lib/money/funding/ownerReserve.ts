import { financialEnvironmentMatches } from '../formance/contracts'

import type { MutationCtx } from '../../../_generated/server'
import { readCurrentActiveAdminMembership, resolveBusinessActor } from '../../../authz'
import { readFundingStartRefusal } from '../treasury/paymentAdmission'
import { admitInteractiveOwnerConsequence } from '../../authority/consequence/owner'
import { readCommercialPolicyGate } from '../../../moneyCommercialPolicy'
import { resolveAndBindLegalCustomer } from '../legalCustomer/binding'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import {
  AUD_EXPONENT,
  audFundingPolicyFromCommercialControls,
  quoteAudAccountFunding,
} from '../../../../src/modules/money/public'

import {
  fundingCommandView,
  fundingResultValue,
  POSITIVE_UNITS,
  RECOVERY_WINDOW_MS,
  refused,
  reserveFundingArgsValue,
  SHA256,
  type FundingResult,
  type ReserveFundingArgs,
} from './contracts'

export const reserveArgs = reserveFundingArgsValue
export const reserveResult = fundingResultValue

export async function reserveHandler(
  ctx: MutationCtx,
  args: ReserveFundingArgs,
): Promise<FundingResult> {
  if (!financialEnvironmentMatches(args.environment)) {
    return refused('environment_mismatch')
  }
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return refused('source_write_denied')
  if (!POSITIVE_UNITS.test(args.amountUnits)
    || !SHA256.test(args.inputDigest)
    || !SHA256.test(args.expectedPolicyDigest)) return refused('funding_amount_invalid')
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')
  const gate = await readFundingStartRefusal(ctx, args.environment, {
    admin: await readCurrentActiveAdminMembership(ctx) !== undefined,
  })
  if (gate !== null) return refused(gate)

  const prior = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_idempotencyKey', (builder) => builder.eq('idempotencyKey', args.idempotencyKey))
    .unique()
  if (prior !== null) {
    return prior.commandRef === args.commandRef
      && prior.accountRef === actor.canonicalAccountRef
      && prior.inputDigest === args.inputDigest
      && prior.principalUnits === args.amountUnits
      && prior.environment === args.environment
      ? { kind: 'accepted', command: fundingCommandView(prior) }
      : refused('funding_idempotency_conflict')
  }
  const now = Date.now()
  const policy = await readCommercialPolicyGate(ctx.db, {
    environment: args.environment,
    now,
    ...(args.environment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policy.kind === 'refused') return refused('commercial_policy_required')
  if (policy.policyDigest !== args.expectedPolicyDigest) return refused('price_changed')
  const fundingPolicy = audFundingPolicyFromCommercialControls(policy.controls)
  const quote = quoteAudAccountFunding(BigInt(args.amountUnits), fundingPolicy)
  if (quote === undefined) return refused('funding_amount_invalid')
  const legalCustomer = await resolveAndBindLegalCustomer(ctx, actor.canonicalAccountRef, now)
  if (legalCustomer.kind === 'refused') return refused(legalCustomer.code)

  const consequence = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'funding.top_up',
    target: {
      targetType: 'account_aud_prepayment',
      targetRef: actor.canonicalAccountRef,
      targetRevision: Math.max(1, actor.authorityRevision.account),
    },
    requiredScopes: ['billing'],
    resourceRefs: [`account:${actor.canonicalAccountRef}`],
    budgetAmount: 0,
    consequenceSummary: 'Fund this Account AUD prepayment through Stripe.',
    statusReadbackRef: '/owner/credit',
    command: {
      version: 'ae.account-funding-command:v1',
      commandRef: args.commandRef,
      accountRef: actor.canonicalAccountRef,
      legalCustomerRef: legalCustomer.legalCustomerRef,
      environment: args.environment,
      principalUnits: quote.principalUnits.toString(),
      serviceFeeUnits: quote.serviceFeeUnits.toString(),
      taxUnits: quote.taxUnits.toString(),
      totalUnits: quote.totalUnits.toString(),
      commercialPolicyDigest: policy.policyDigest,
      inputDigest: args.inputDigest,
    },
    correlationRef: args.correlationId,
    idempotencyRef: args.idempotencyKey,
    now,
  })
  if (consequence.kind === 'refused') return refused(consequence.code)
  const row = {
    commandRef: args.commandRef,
    accountRef: actor.canonicalAccountRef,
    legalCustomerRef: legalCustomer.legalCustomerRef,
    actorPrincipalRef: actor.canonicalPrincipalRef,
    environment: args.environment,
    currency: 'AUD' as const,
    exponent: AUD_EXPONENT,
    principalUnits: quote.principalUnits.toString(),
    serviceFeeUnits: quote.serviceFeeUnits.toString(),
    taxUnits: quote.taxUnits.toString(),
    totalUnits: quote.totalUnits.toString(),
    commercialPolicyDigest: policy.policyDigest,
    commercialPolicyRefs: [...policy.policyRefs],
    idempotencyKey: args.idempotencyKey,
    inputDigest: args.inputDigest,
    successReturnRef: args.successReturnRef,
    initiationKind: 'owner_top_up' as const,
    ...(args.checkoutMode === undefined ? {} : { checkoutMode: args.checkoutMode }),
    ...(args.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: args.checkoutExpiresAt }),
    ...(args.cancelReturnRef === undefined ? {} : { cancelReturnRef: args.cancelReturnRef }),
    providerRecoveryDeadlineAt: now + RECOVERY_WINDOW_MS,
    state: 'pending' as const,
    providerStatus: 'pending' as const,
    metadataDigest: canonicalDigest({ ae_command_ref: args.commandRef, ae_contract: 'account_funding_v2' }),
    createdAt: now,
    updatedAt: now,
  }
  await ctx.db.insert('moneyFundingCommands', row)
  return { kind: 'accepted', command: row }
}
