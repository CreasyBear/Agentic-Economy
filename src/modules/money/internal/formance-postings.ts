import type { FormanceMoneyCommand } from './formance-config'

export function formanceCommandPostingsMatch(
  command: FormanceMoneyCommand,
  postings: readonly { source: string; destination: string; asset: string; amountUnits: string }[],
): boolean {
  type Leg = readonly [string, string, string]
  const variables: Readonly<Record<string, string>> = command.template === 'PROMO_GRANTED' || command.template === 'PROMO_EXPIRED'
    ? { ...command.variables, world: 'world' } : command.variables
  let legs: readonly Leg[]
  switch (command.template) {
    case 'PROMO_GRANTED':
      legs = [['world', 'destination', 'amount']]
      break
    case 'PROMO_EXPIRED':
      legs = [['source', 'world', 'amount']]
      break
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
    case 'PROVIDER_REVERSED':
      legs = [['provider_settlement', 'treasury_available', 'amount'], ['obligation_settled', 'obligation_reversed', 'amount']]
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
