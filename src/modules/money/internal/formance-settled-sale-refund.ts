import { FORMANCE_SCHEMA_VERSION, type FormanceMoneyCommand } from '../formance'
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
export function managedCallPostingsMatch(
  command: FormanceMoneyCommand,
  postings: readonly { source: string; destination: string; asset: string; amountUnits: string }[],
): boolean {
  type Leg = readonly [string, string, string]
  const variables = command.variables
  let legs: readonly Leg[]
  switch (command.template) {
    case 'CALL_RESERVED_AUD':
      legs = [
        ['account_available', 'call_reserved', 'buyer_amount'],
        ['legal_available', 'legal_reserved', 'exposure_amount'],
        ...(variables.agent_available === undefined
          ? [['daily_available', 'daily_reserved', 'daily_amount'], ['monthly_available', 'monthly_reserved', 'monthly_amount']] as const
          : [['agent_available', 'agent_reserved', 'budget_amount']] as const),
      ]
      break
    case 'PROVIDER_OBLIGATION_ACCRUED':
      legs = [['expense', 'obligation', 'amount']]
      break
    case 'CALL_RELEASED_AUD':
      legs = [
        ['call_reserved', 'account_available', 'buyer_amount'],
        ['legal_reserved', 'legal_available', 'exposure_amount'],
        ...(variables.agent_reserved === undefined
          ? [['daily_reserved', 'daily_available', 'daily_amount'], ['monthly_reserved', 'monthly_available', 'monthly_amount']] as const
          : [['agent_reserved', 'agent_available', 'budget_amount']] as const),
      ]
      break
    case 'CALL_RELEASED_USDC':
      legs = [['treasury_committed', 'treasury_available', 'amount'], ['obligation_accrued', 'expense', 'amount']]
      break
    case 'BUYER_SALE_SETTLED':
      legs = [
        ['call_reserved', 'revenue', 'revenue_amount'], ['call_reserved', 'tax', 'tax_amount'],
        ['legal_reserved', 'legal_settled', 'exposure_amount'],
        ...(variables.agent_reserved === undefined
          ? [['daily_reserved', 'daily_spent', 'daily_amount'], ['monthly_reserved', 'monthly_spent', 'monthly_amount']] as const
          : [['agent_reserved', 'agent_spent', 'budget_amount']] as const),
      ]
      break
    case 'PROVIDER_SETTLED':
      legs = [['treasury_committed', 'provider_settlement', 'amount'], ['obligation_accrued', 'obligation_settled', 'amount']]
      break
    case 'BUYER_SALE_REFUNDED':
      legs = [['revenue', 'account_available', 'revenue_amount'], ['tax', 'account_available', 'tax_amount'],
        ['legal_settled', 'legal_available', 'exposure_amount']]
      break
    case 'CALL_PROMO_SETTLED':
    case 'CALL_RESERVED_USDC':
    case 'CALL_PROMO_RESERVED':
    case 'CALL_PROMO_RELEASED':
    case 'CALL_PROMO_REFUNDED':
    case 'CALL_SPEND_REFUNDED':
      legs = [['source', 'destination', 'amount']]
      break
    default: return false
  }
  const expected: string[] = []
  for (const [sourceKey, destinationKey, amountKey] of legs) {
    const source = variables[sourceKey]
    const destination = variables[destinationKey]
    const monetary = variables[amountKey]?.match(/^(AUD|USDC)\/6 (0|[1-9]\d*)$/u)
    if (source === undefined || destination === undefined || monetary === undefined || monetary === null) return false
    if (monetary[2] !== '0') expected.push(JSON.stringify([source, destination, `${monetary[1]}/6`, monetary[2]]))
  }
  const observed = postings.filter(posting => posting.amountUnits !== '0')
    .map(posting => JSON.stringify([posting.source, posting.destination, posting.asset, posting.amountUnits]))
  return JSON.stringify(expected.sort()) === JSON.stringify(observed.sort())
}
