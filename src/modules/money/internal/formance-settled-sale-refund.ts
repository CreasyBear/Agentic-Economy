import { FORMANCE_SCHEMA_VERSION } from '../formance-schema'
import type { FormanceMoneyCommand } from './formance-config'
import { refused } from '../formance-result'
import { settledSaleRefundReference } from '../settled-sale-refund-contracts'
import { digestReference, digestValue, stripDigest } from './formance-digest'
import {
  managedCallAccounts,
  managedCallAmounts,
  preparedBulk,
  prepareFormanceManagedCallSettlement,
  promotionalGrantAccount,
  type FormanceManagedCallBooking,
  type PreparedManagedCallBulk,
} from './formance-transaction-templates'

const SHA256 = /^sha256:[a-f0-9]{64}$/u

export type FormanceSettledSaleRefund = Readonly<{
  booking: FormanceManagedCallBooking
  originalSettlementRefs: readonly string[]
  reportDigest: string
}>

/**
 * CONTRACT: prepareFormanceSettledSaleRefund(input)
 *   Requires: a valid frozen booking, canonical report digest, and the complete
 *     ordered native settlement references for its buyer, Provider and grants.
 *   Ensures: returns one atomic v1.6 command per buyer, spent allowance and
 *     grant, restoring purchased revenue/GST and full legal exposure.
 *   Invariant: Provider obligation, Provider settlement and treasury accounts
 *     are never refund sources or destinations; identity depends only on the
 *     Call and part/grant, while command digest binds all frozen evidence.
 *   On violation: refuses without constructing a native write.
 */
export function prepareFormanceSettledSaleRefund(input: FormanceSettledSaleRefund): PreparedManagedCallBulk {
  const { booking } = input
  const accounts = managedCallAccounts(booking)
  const amounts = managedCallAmounts(booking)
  if (accounts === undefined || amounts === undefined || !SHA256.test(input.reportDigest)
    || !Array.isArray(input.originalSettlementRefs)
    || input.originalSettlementRefs.some(ref => typeof ref !== 'string' || !/^ae-p4:[a-f0-9]{64}(?::[a-z0-9_-]{1,32})?$/u.test(ref))) {
    return refused('formance_settled_sale_refund_input_invalid')
  }
  // Settlement references are independent of external evidence. This checks
  // cardinality and order before the workflow reads the native evidence.
  const expectedSettlement = prepareFormanceManagedCallSettlement({
    booking,
    externalEvidenceDigest: booking.x402RequirementDigest,
  })
  if (expectedSettlement.kind === 'refused'
    || expectedSettlement.bulk.commands.length !== input.originalSettlementRefs.length
    || expectedSettlement.bulk.commands.some((item, index) => item.commandRef !== input.originalSettlementRefs[index])) {
    return refused('formance_settled_sale_refund_input_invalid')
  }

  const command = (
    part: 'buyer' | 'generation' | 'day' | 'month' | 'promo',
    template: FormanceMoneyCommand['template'],
    variables: Readonly<Record<string, string>>,
    grantRef?: string,
  ): FormanceMoneyCommand => {
    const identity = { callRef: booking.callRef, part, ...(grantRef === undefined ? {} : { grantRef }) }
    const idempotencyDigest = digestValue('settled-sale-refund-idempotency', identity)
    return Object.freeze({
      commandRef: settledSaleRefundReference(booking.callRef, part, grantRef),
      idempotencyKey: idempotencyDigest,
      schemaVersion: FORMANCE_SCHEMA_VERSION,
      template,
      variables: Object.freeze({ ...variables }),
      metadata: Object.freeze({
        account_digest: digestReference('account', booking.accountRef),
        call_digest: digestReference('call', booking.callRef),
        command_digest: digestValue('settled-sale-refund-command', {
          format: 'ae.formance-settled-sale-refund:v1',
          booking,
          originalSettlementRefs: input.originalSettlementRefs,
          reportDigest: input.reportDigest,
          identity,
          template,
        }),
        commitment_digest: stripDigest(booking.quoteDigest),
        external_evidence_digest: stripDigest(input.reportDigest),
        idempotency_digest: idempotencyDigest,
        legal_customer_digest: digestReference('legal_customer', booking.legalCustomerRef),
        operation_digest: digestReference('operation', booking.toolRef),
        policy_digest: stripDigest(booking.policyDigest),
        principal_digest: digestReference('principal', booking.principalRef),
        provider_digest: digestReference('provider', booking.providerRef),
      }),
    })
  }

  const commands: FormanceMoneyCommand[] = [command('buyer', 'BUYER_SALE_REFUNDED', {
    account_available: accounts.accountAvailable,
    revenue: 'platform:revenue:sales',
    tax: 'platform:tax:gst',
    legal_settled: accounts.legalSettled,
    legal_available: accounts.legalAvailable,
    revenue_amount: amounts.purchasedRevenue,
    tax_amount: amounts.purchasedTax,
    exposure_amount: amounts.buyer,
  })]

  if (booking.spendingPeriods === undefined) {
    commands.push(command('generation', 'CALL_SPEND_REFUNDED', {
      source: accounts.agentSpent,
      destination: accounts.agentAvailable,
      amount: amounts.buyer,
    }))
  } else {
    if (accounts.dailySpent === undefined || accounts.dailyAvailable === undefined
      || accounts.monthlySpent === undefined || accounts.monthlyAvailable === undefined) {
      return refused('formance_settled_sale_refund_input_invalid')
    }
    commands.push(command('day', 'CALL_SPEND_REFUNDED', {
      source: accounts.dailySpent,
      destination: accounts.dailyAvailable,
      amount: amounts.buyer,
    }))
    commands.push(command('month', 'CALL_SPEND_REFUNDED', {
      source: accounts.monthlySpent,
      destination: accounts.monthlyAvailable,
      amount: amounts.buyer,
    }))
  }

  for (const grant of booking.promotionalCreditAllocation?.grants ?? []) {
    commands.push(command('promo', 'CALL_PROMO_REFUNDED', {
      source: 'platform:expense:marketing',
      destination: promotionalGrantAccount(booking.accountRef, grant.grantRef),
      amount: `AUD/6 ${grant.amountUnits}`,
    }, grant.grantRef))
  }
  return preparedBulk(commands)
}

/** Exact booked effects are the financial evidence; metadata alone cannot prove
 * amounts or destinations. Zero sends may be omitted by the native engine. */
export { formanceCommandPostingsMatch } from './formance-postings'
