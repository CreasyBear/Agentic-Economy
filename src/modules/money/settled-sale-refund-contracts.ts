import { canonicalDigest } from '@/modules/common/canonical-digest'

type RefundPart = 'buyer' | 'day' | 'month' | 'generation' | 'promo'

/** One immutable financial reversal per Call, independently of retry/actor/time. */
export function settledSaleRefundReference(callRef: string, part: RefundPart, grantRef?: string): string {
  const digest = canonicalDigest({ format: 'ae.settled-sale-refund:v1', callRef, part,
    ...(grantRef === undefined ? {} : { grantRef }),
  }).slice('sha256:'.length)
  return `ae-p4:${digest}:refund-${part}`
}

export function settledSaleRefundReferences(input: {
  callRef: string; spendingPeriods?: unknown;
  promotionalCreditAllocation?: { grants: readonly { grantRef: string }[] };
}): string[] {
  return [
    settledSaleRefundReference(input.callRef, 'buyer'),
    ...(input.spendingPeriods === undefined
      ? [settledSaleRefundReference(input.callRef, 'generation')]
      : [settledSaleRefundReference(input.callRef, 'day'), settledSaleRefundReference(input.callRef, 'month')]),
    ...(input.promotionalCreditAllocation?.grants ?? []).map(grant =>
      settledSaleRefundReference(input.callRef, 'promo', grant.grantRef)),
  ]
}
