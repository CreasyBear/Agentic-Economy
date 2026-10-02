import type { ActionCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { FormanceManagedCallBooking as MoneyFormanceManagedCallBooking, FormanceMoneyResult as MoneyFormanceResult } from '@/modules/money/public'
import {
  providerReversalArgsValue,
  providerReversalResultValue,
  type ProviderReversalArgs,
  type ProviderReversalResult,
} from './contracts'
import { reversalRefused } from './state'

type ManagedCallMaterial = Readonly<
  | {
      kind: 'available'
      expectedEnvironment: 'sandbox' | 'production'
      booking: MoneyFormanceManagedCallBooking
      financialState?: 'reservation_pending' | 'reserved' | 'possibly_submitted'
        | 'outcome_unknown' | 'released' | 'settled'
      settlementRefs?: string[]
    }
  | { kind: 'not_found' | 'not_required' }
>

export const reverseOwnerSettlementArgs = providerReversalArgsValue.fields
export const reverseOwnerSettlementResult = providerReversalResultValue
export async function reverseOwnerSettlementHandler(
  ctx: ActionCtx,
  args: ProviderReversalArgs,
): Promise<ProviderReversalResult> {
  const prepared = await ctx.runMutation(internal.moneyProviderObligations.prepareOwnerReversal, args)
  if (prepared.kind !== 'prepared') return prepared
  const material: ManagedCallMaterial = await ctx.runQuery(internal.moneyManagedCall.readBooking, {
    callRef: args.callRef,
  })
  if (material.kind !== 'available'
    || material.financialState !== 'settled'
    || material.settlementRefs?.[1] !== args.settlementTransactionRef) {
    return reversalRefused('provider_settlement_evidence_invalid')
  }
  const result: MoneyFormanceResult = await ctx.runAction(
    internal.moneyFormance.reverseProviderSettlement,
    {
      expectedEnvironment: material.expectedEnvironment,
      booking: material.booking,
      originalSettlementRef: args.settlementTransactionRef,
      correctionEvidenceDigest: args.evidenceDigest,
    },
  )
  if (result.kind === 'completed') {
    const [reversalTransactionRef] = result.transactionRefs
    if (result.transactionRefs.length !== 1 || reversalTransactionRef === undefined) {
      return reversalRefused('formance_reference_invalid')
    }
    return await ctx.runMutation(internal.moneyProviderObligations.finalizeOwnerReversal, {
      obligationRef: args.obligationRef,
      callRef: args.callRef,
      commandRef: args.commandRef,
      idempotencyKey: args.idempotencyKey,
      evidenceRef: args.evidenceRef,
      evidenceDigest: args.evidenceDigest,
      settlementTransactionRef: args.settlementTransactionRef,
      reversalTransactionRef,
    })
  }
  if (result.kind === 'outcome_unknown') {
    await ctx.runMutation(internal.moneyProviderObligations.markOwnerReversalUnknown, {
      obligationRef: args.obligationRef,
      commandRef: args.commandRef,
      evidenceDigest: args.evidenceDigest,
      statusRef: result.statusRef,
    })
    return result
  }
  return result
}
