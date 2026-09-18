import type { Infer } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import {
  AGENTIC_ECONOMY_SELLER_REF,
  buildPurchaseResolutionRecord,
  projectDeliveryStateForPurchaseResolution,
  projectPaymentStateForPurchaseResolution,
  type PurchaseResolutionRecord,
} from '@/modules/capability-execution/purchase-resolution'
import type { callReceiptValue, callResultValue, usageValue } from '@/modules/capability-execution/convex'

type CallRow = Doc<'capabilityCalls'>
type CallReceiptValue = Infer<typeof callReceiptValue>
type CallResultValue = Infer<typeof callResultValue>
type Usage = Infer<typeof usageValue>

export type CallDispatchProjectionShape = Readonly<{
  state: 'completed' | 'refused' | 'reconciliation_required'
  result?: CallResultValue
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
  dispatchState: 'completed' | 'failed' | 'reconciliation_required'
}>

export async function readPurchaseResolutionByCallRef(
  ctx: QueryCtx,
  callRef: string,
): Promise<PurchaseResolutionRecord | null> {
  const row = await ctx.db.query('purchaseResolutionRecords')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (row === null) return null
  const { _id, _creationTime, createdAt: _createdAt, ...record } = row
  return record
}

function accountReceiptFromProjection(projection: CallDispatchProjectionShape): Extract<CallReceiptValue, { commercialModel: 'account_aud' }> | undefined {
  const result = projection.result
  const receipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
  return receipt?.commercialModel === 'account_aud' ? receipt : undefined
}

export async function materializePurchaseResolutionRecord(
  ctx: MutationCtx,
  row: CallRow,
  projection: CallDispatchProjectionShape,
  resolvedAt: number,
): Promise<void> {
  if (row.sellerOnboardingCanary !== undefined) return
  const existing = await ctx.db.query('purchaseResolutionRecords')
    .withIndex('by_callRef', (query) => query.eq('callRef', row.callRef))
    .unique()
  if (existing !== null) return

  if (row.toolJson === undefined || row.quoteRef === undefined) return
  const quoteRef = row.quoteRef
  const operation = parsePublishedToolSnapshot(row.toolJson)
  if (operation === undefined) return

  const quote = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', quoteRef))
    .unique()
  if (quote === null) return

  const accountReceipt = accountReceiptFromProjection(projection)
  const obligation = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_callRef', (query) => query.eq('callRef', row.callRef))
    .unique()

  const considerationAmount = accountReceipt?.totalBuyerCharge ?? {
    currency: 'AUD',
    units: quote.decisionAudUnits,
    exponent: 6,
  }
  const providerObligationAmount = accountReceipt?.providerObligation.amount ?? {
    currency: 'USDC',
    units: quote.sourceUsdcUnits ?? obligation?.providerAmountUnits ?? '0',
    exponent: 6,
  }

  const built = buildPurchaseResolutionRecord({
    callRef: row.callRef,
    quoteRef: row.quoteRef,
    accountRef: row.ownerId,
    customerRef: quote.legalCustomerRef,
    agentPrincipalRef: row.principalId,
    sellerRef: AGENTIC_ECONOMY_SELLER_REF,
    providerRef: operation.identity.businessId,
    paymentRecipientRef: operation.identity.paymentRecipient,
    callState: projection.state,
    deliveryState: projectDeliveryStateForPurchaseResolution(projection.state),
    paymentState: projectPaymentStateForPurchaseResolution(accountReceipt?.state),
    ...(obligation === null ? {} : { providerObligationState: obligation.state }),
    ...(accountReceipt?.state === undefined ? {} : { receiptState: accountReceipt.state }),
    ...(accountReceipt?.refundState === undefined ? {} : { receiptRefundState: accountReceipt.refundState }),
    considerationAmount,
    considerationNetUnits: quote.buyerRevenueUnits,
    considerationGstUnits: quote.buyerTaxUnits,
    providerObligationAmount,
    resolvedAt,
  })
  if (built.kind !== 'admitted') return

  await ctx.db.insert('purchaseResolutionRecords', {
    ...built.record,
    createdAt: resolvedAt,
  })
}
