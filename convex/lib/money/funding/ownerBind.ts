import { financialEnvironmentMatches } from '../formance/contracts'
import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { AUD_EXPONENT, compareExactAmounts } from '../../../../src/modules/money/public'

import {
  bindFundingArgsValue,
  fundingCommandView,
  fundingResultValue,
  refused,
  type BindFundingArgs,
  type FundingResult,
} from './contracts'

export const bindArgs = bindFundingArgsValue
export const bindResult = fundingResultValue

export async function bindHandler(
  ctx: MutationCtx,
  args: BindFundingArgs,
): Promise<FundingResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return refused('source_write_denied')
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  if (command !== null && !financialEnvironmentMatches(command.environment)) return refused('environment_mismatch')
  if (command === null || command.accountRef !== actor.canonicalAccountRef) {
    return refused('funding_pending', true)
  }
  if (compareExactAmounts(args.evidence.amount, {
      currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits,
    }) !== 0
    || (command.externalRef !== undefined && command.externalRef !== args.evidence.externalRef)
    || (command.metadataDigest !== undefined && command.metadataDigest !== args.evidence.metadataDigest)) {
    return refused('payment_binding_invalid')
  }
  await ctx.db.patch(command._id, {
    externalRef: args.evidence.externalRef,
    providerStatus: args.evidence.status,
    providerEvidenceRef: args.evidence.evidenceRef,
    requestDigest: args.evidence.requestDigest,
    metadataDigest: args.evidence.metadataDigest,
    checkoutSessionDigest: args.evidence.checkoutSessionDigest,
    ...(args.evidence.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: args.evidence.paymentIntentDigest }),
    evidenceDigest: args.evidence.evidenceDigest,
    ...(args.evidence.paymentId === undefined ? {} : { paymentId: args.evidence.paymentId }),
    ...(args.evidence.checkoutStatus === undefined ? {} : { providerCheckoutStatus: args.evidence.checkoutStatus }),
    ...(args.evidence.paymentStatus === undefined ? {} : { providerPaymentStatus: args.evidence.paymentStatus }),
    ...(args.evidence.checkoutMode === undefined ? {} : { checkoutMode: args.evidence.checkoutMode }),
    ...(args.evidence.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: args.evidence.checkoutExpiresAt }),
    updatedAt: Date.now(),
  })
  const updated = await ctx.db.get(command._id)
  return updated === null ? refused('funding_pending', true) : { kind: 'accepted', command: fundingCommandView(updated) }
}
