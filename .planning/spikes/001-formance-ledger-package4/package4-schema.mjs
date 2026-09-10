const DIGEST_PATTERN = '^[a-f0-9]{64}$'

const leaf = Object.freeze({ dotSelf: {} })

function fixed(children) {
  return { additionalProperties: children }
}

function digestSegment(children) {
  return {
    additionalProperties: {
      '$digest': {
        dotPattern: DIGEST_PATTERN,
        additionalProperties: children,
      },
    },
  }
}

const transfer = (description) => ({
  description,
  runtime: 'machine',
  script: `vars {
  account $source
  account $destination
  monetary $amount
}
send $amount (
  source = $source
  destination = $destination
)`,
})

export const package4Schema = Object.freeze({
  chart: {
    world: leaf,
    processor: digestSegment({ settlement: leaf }),
    accounts: digestSegment({ available: leaf }),
    calls: digestSegment({ buyer_reserved: leaf }),
    agents: digestSegment({ budget_available: leaf, budget_reserved: leaf }),
    legal_customers: digestSegment({ exposure_available: leaf, exposure_reserved: leaf }),
    provider_obligations: digestSegment({ accrued: leaf, settled: leaf }),
    providers: digestSegment({ settlement: leaf }),
    adjustments: digestSegment({ buyer: leaf }),
    treasury: fixed({
      corporate: fixed({ available: leaf, committed: leaf }),
    }),
    platform: fixed({
      expense: fixed({ providers: leaf }),
      revenue: fixed({ sales: leaf }),
      tax: fixed({ gst: leaf }),
    }),
  },
  queries: {},
  transactions: {
    FUNDING_SETTLED: {
      description: 'Record processor settlement and credit Account AUD principal',
      runtime: 'machine',
      script: `vars {
  account $processor
  account $account
  monetary $amount
}
send $amount (
  source = @world
  destination = $processor
)
send $amount (
  source = $processor
  destination = $account
)`,
    },
    CALL_RESERVED: {
      description: 'Reserve Account AUD, Agent budget, and legal-customer exposure',
      runtime: 'machine',
      script: `vars {
  account $account_available
  account $call_reserved
  account $agent_available
  account $agent_reserved
  account $legal_available
  account $legal_reserved
  monetary $buyer_amount
  monetary $budget_amount
  monetary $exposure_amount
}
send $buyer_amount (
  source = $account_available
  destination = $call_reserved
)
send $budget_amount (
  source = $agent_available
  destination = $agent_reserved
)
send $exposure_amount (
  source = $legal_available
  destination = $legal_reserved
)`,
    },
    CALL_RELEASED: {
      description: 'Release Account AUD, Agent budget, and legal-customer exposure',
      runtime: 'machine',
      script: `vars {
  account $account_available
  account $call_reserved
  account $agent_available
  account $agent_reserved
  account $legal_available
  account $legal_reserved
  monetary $buyer_amount
  monetary $budget_amount
  monetary $exposure_amount
}
send $buyer_amount (
  source = $call_reserved
  destination = $account_available
)
send $budget_amount (
  source = $agent_reserved
  destination = $agent_available
)
send $exposure_amount (
  source = $legal_reserved
  destination = $legal_available
)`,
    },
    BUYER_SALE_SETTLED: {
      description: 'Recognize buyer AUD revenue and applicable GST from a Call reserve',
      runtime: 'machine',
      script: `vars {
  account $call_reserved
  account $revenue
  account $tax
  monetary $revenue_amount
  monetary $tax_amount
}
send $revenue_amount (
  source = $call_reserved
  destination = $revenue
)
send $tax_amount (
  source = $call_reserved
  destination = $tax
)`,
    },
    BUYER_ADJUSTED: transfer('Append a buyer AUD adjustment'),
    TREASURY_CAPACITY_SYNCED: {
      description: 'Record an observed capacity ceiling for a controlled resource',
      runtime: 'machine',
      script: `vars {
  account $capacity
  monetary $amount
}
send $amount (
  source = @world
  destination = $capacity
)`,
    },
    TREASURY_RESERVED: transfer('Reserve corporate USDC capacity'),
    TREASURY_RELEASED: transfer('Release corporate USDC capacity'),
    PROVIDER_OBLIGATION_ACCRUED: {
      description: 'Accrue the Provider USDC expense and payable separately from buyer AUD',
      runtime: 'machine',
      script: `vars {
  account $expense
  account $obligation
  monetary $amount
}
send $amount (
  source = $expense allowing unbounded overdraft
  destination = $obligation
)`,
    },
    PROVIDER_SETTLED: {
      description: 'Settle corporate USDC and mark the linked Provider obligation paid',
      runtime: 'machine',
      script: `vars {
  account $treasury_committed
  account $provider_settlement
  account $obligation_accrued
  account $obligation_settled
  monetary $amount
}
send $amount (
  source = $treasury_committed
  destination = $provider_settlement
)
send $amount (
  source = $obligation_accrued
  destination = $obligation_settled
)`,
    },
  },
})

export const PACKAGE4_TEMPLATE_NAMES = Object.freeze([
  'FUNDING_SETTLED',
  'CALL_RESERVED',
  'CALL_RELEASED',
  'BUYER_SALE_SETTLED',
  'BUYER_ADJUSTED',
  'TREASURY_CAPACITY_SYNCED',
  'TREASURY_RESERVED',
  'TREASURY_RELEASED',
  'PROVIDER_OBLIGATION_ACCRUED',
  'PROVIDER_SETTLED',
])
