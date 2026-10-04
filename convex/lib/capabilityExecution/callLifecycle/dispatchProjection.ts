import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import type { CallDispatchProjectionShape } from './contracts'
import { recordDeliveredRequest } from './serviceUsage'
import { captureProviderUnits } from '../serviceUsage/providerObservations'

type CallRow = Doc<'capabilityCalls'>

function callProjectionOperation(row: CallRow) {
  if (row.toolJson === undefined) return undefined
  return parsePublishedToolSnapshot(row.toolJson)
}

function accountReceiptFromProjection(projection: CallDispatchProjectionShape) {
  const result = projection.result
  const receipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
  return {
    receipt,
    accountReceipt: receipt?.commercialModel === 'account_aud' ? receipt : undefined,
  }
}

function projectedAudAmountUnits(
  projection: CallDispatchProjectionShape,
  accountReceipt: ReturnType<typeof accountReceiptFromProjection>['accountReceipt'],
): string | undefined {
  if (accountReceipt?.buyerCharge.currency === 'AUD' && accountReceipt.buyerCharge.exponent === 6) {
    return accountReceipt.buyerCharge.units
  }
  const amount = projection.usage?.amount
  return amount?.currency === 'AUD' && amount.exponent === 6 ? amount.units : undefined
}

function projectedPaymentState(
  accountReceipt: ReturnType<typeof accountReceiptFromProjection>['accountReceipt'],
): 'settled' | 'released' | 'unknown' | 'not_applicable' {
  if (accountReceipt?.state === 'settled') return 'settled'
  if (accountReceipt?.state === 'refunded') return 'released'
  if (accountReceipt?.state === 'reconciliation_required') return 'unknown'
  return 'not_applicable'
}

function projectedDeliveryState(
  state: CallDispatchProjectionShape['state'],
): 'delivered' | 'not_delivered' | 'unknown' {
  if (state === 'completed') return 'delivered'
  return state === 'reconciliation_required' ? 'unknown' : 'not_delivered'
}

async function providerObligationProjectionFields(
  ctx: MutationCtx,
  callRef: string,
) {
  const obligation = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  return obligation === null
    ? {}
    : {
        providerObligationState: obligation.state,
        providerAmountUnits: obligation.providerAmountUnits,
      }
}

export async function upsertCallProjection(
  ctx: MutationCtx,
  row: CallRow,
  projection: CallDispatchProjectionShape,
  now: number,
): Promise<void> {
  const operation = callProjectionOperation(row)
  if (operation === undefined) throw new Error('call_projection_operation_invalid')
  const { receipt, accountReceipt } = accountReceiptFromProjection(projection)
  const audAmountUnits = projectedAudAmountUnits(projection, accountReceipt)
  const callState = projection.state === 'reconciliation_required'
    ? 'outcome_unknown' as const
    : projection.state
  const providerFields = await providerObligationProjectionFields(ctx, row.callRef)
  const serviceUsage = await recordDeliveredRequest(ctx, row, projection, operation.identity.businessId, operation.priceDigest, now)
  const measurementRoot = serviceUsage === undefined ? null : await ctx.db.query('capabilityServiceUsageRecords').withIndex('by_usageRef', q => q.eq('usageRef', serviceUsage.serviceUsageRef)).unique()
  const providerUnitObservation = measurementRoot === null ? undefined : await captureProviderUnits(ctx, { ...row, ...projection, updatedAt: now }, measurementRoot)
  const existing = await ctx.db.query('capabilityCallProjections').withIndex('by_callRef', q => q.eq('callRef', row.callRef)).unique()
  const retainedProviderUnitObservation = providerUnitObservation ?? existing?.providerUnitObservation
  const fields = {
    accountRef: row.ownerId,
    principalRef: row.principalId,
    credentialRef: row.credentialId,
    applicationRef: row.applicationRef,
    toolRef: row.toolRef,
    providerRef: operation.identity.businessId,
    toolLabel: operation.contract.name,
    state: callState,
    deliveryState: projectedDeliveryState(projection.state),
    paymentState: projectedPaymentState(accountReceipt),
    ...providerFields,
    ...serviceUsage,
    ...(retainedProviderUnitObservation === undefined ? {} : { providerUnitObservation: retainedProviderUnitObservation }),
    ...(audAmountUnits === undefined ? {} : { audAmountUnits }),
    ...(receipt?.receiptRef === undefined || !/^receipt:sha256:[a-f0-9]{64}$/u.test(receipt.receiptRef) ? {} : { receiptRef: receipt.receiptRef }),
    ...(projection.state === 'reconciliation_required' ? { recoveryRef: row.callRef } : {}),
    latencyMs: Math.max(0, now - row.createdAt),
    updatedAt: now,
    observedAt: Date.now(),
  }
  const next = {
    callRef: row.callRef,
    ...fields,
    createdAt: row.createdAt,
  }
  if (existing === null) {
    await ctx.db.insert('capabilityCallProjections', next)
  } else {
    await ctx.db.patch(existing._id, { ...fields,
      providerUnitObservation: retainedProviderUnitObservation,
      receiptRef: fields.receiptRef,
      recoveryRef: projection.state === 'reconciliation_required' ? row.callRef : undefined,
    })
  }
}
