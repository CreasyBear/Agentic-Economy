import { canonicalDigest } from '@/modules/common/canonical-digest'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from './internal/commercial-policy'

export type FormanceChartSegment = {
  dotSelf?: Record<string, never> | undefined
  dotPattern?: string | undefined
  additionalProperties?: Record<string, FormanceChartSegment> | undefined
}

export type FormanceTransactionTemplate = Readonly<{
  description?: string | undefined
  runtime?: 'machine' | undefined
  script: string
}>

export type FormanceSchemaData = Readonly<{
  chart: Readonly<Record<string, FormanceChartSegment>>
  queries?: Readonly<Record<string, { description?: string | undefined }>> | undefined
  transactions?: Readonly<Record<string, FormanceTransactionTemplate>> | undefined
}>

/** The schema used by accepted periodless Calls before the alpha cutover. */
export const LEGACY_FORMANCE_SCHEMA_VERSION = 'v1.3.0' as const
/** The period-aware schema used by accepted Calls before promotional credit. */
export const PERIOD_FORMANCE_SCHEMA_VERSION = 'v1.4.0' as const
/** The current schema pin, shared with the commercial policy requirements. */
export const FORMANCE_SCHEMA_VERSION = PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion

export const PACKAGE4_FORMANCE_TEMPLATE_NAMES = Object.freeze([
  'FUNDING_SETTLED',
  'FUNDING_REVERSED',
  'CALL_RESERVED_AUD',
  'CALL_RESERVED_USDC',
  'CALL_RELEASED_AUD',
  'CALL_RELEASED_USDC',
  'BUYER_SALE_SETTLED',
  'BUYER_ADJUSTED',
  'TREASURY_CAPACITY_SYNCED',
  'PROVIDER_OBLIGATION_ACCRUED',
  'PROVIDER_SETTLED',
  'PROVIDER_REVERSED',
] as const)

export const PERIOD_FORMANCE_TEMPLATE_NAMES = Object.freeze([
  ...PACKAGE4_FORMANCE_TEMPLATE_NAMES,
  'SPENDING_PERIOD_INCREASED',
  'SPENDING_PERIOD_DECREASED',
] as const)

export const FORMANCE_TEMPLATE_NAMES = Object.freeze([
  ...PERIOD_FORMANCE_TEMPLATE_NAMES,
  'PROMO_GRANTED',
  'PROMO_EXPIRED',
  'CALL_PROMO_RESERVED',
  'CALL_PROMO_RELEASED',
  'CALL_PROMO_SETTLED',
] as const)

export type FormanceMoneyTemplate = (typeof FORMANCE_TEMPLATE_NAMES)[number]

export const LEGACY_FORMANCE_TEMPLATE_NAMES = PACKAGE4_FORMANCE_TEMPLATE_NAMES

export type FormanceLegacyMoneyTemplate = (typeof LEGACY_FORMANCE_TEMPLATE_NAMES)[number]

const leaf: FormanceChartSegment = { dotSelf: {} }

function fixed(children: Record<string, FormanceChartSegment>): FormanceChartSegment {
  return { additionalProperties: children }
}

function digestSegment(children: Record<string, FormanceChartSegment>): FormanceChartSegment {
  return {
    additionalProperties: {
      '$digest': {
        dotPattern: '^[a-f0-9]{64}$',
        additionalProperties: children,
      },
    },
  }
}

function transferTemplate(description: string) {
  return Object.freeze({
    description,
    runtime: 'machine' as const,
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
}

export const PACKAGE4_FORMANCE_SCHEMA: FormanceSchemaData = Object.freeze({
  chart: Object.freeze({
    world: leaf,
    processor: digestSegment({ settlement: leaf }),
    accounts: digestSegment({ available: leaf }),
    calls: digestSegment({ buyer_reserved: leaf }),
    agents: digestSegment({
      budget_available: leaf,
      budget_reserved: leaf,
      budget_spent: leaf,
    }),
    legal_customers: digestSegment({
      exposure_available: leaf,
      exposure_reserved: leaf,
      exposure_settled: leaf,
    }),
    provider_obligations: digestSegment({
      accrued: leaf,
      settled: leaf,
      reversed: leaf,
    }),
    providers: digestSegment({ settlement: leaf }),
    adjustments: digestSegment({ buyer: leaf }),
    treasury: fixed({
      corporate: digestSegment({ available: leaf, committed: leaf }),
    }),
    platform: fixed({
      expense: fixed({ providers: leaf }),
      revenue: fixed({ sales: leaf }),
      tax: fixed({ gst: leaf }),
    }),
  }),
  queries: Object.freeze({}),
  transactions: Object.freeze({
    FUNDING_SETTLED: Object.freeze({
      description: 'Record processor settlement, Account AUD principal, service fee, and GST',
      runtime: 'machine' as const,
      script: `vars {
  account $processor
  account $account
  account $revenue
  account $tax
  monetary $principal_amount
  monetary $service_fee_amount
  monetary $tax_amount
  monetary $total_amount
}
send $total_amount (
  source = @world
  destination = $processor
)
send $principal_amount (
  source = $processor
  destination = $account
)
send $service_fee_amount (
  source = $processor
  destination = $revenue
)
send $tax_amount (
  source = $processor
  destination = $tax
)`,
    }),
    FUNDING_REVERSED: Object.freeze({
      description: 'Append a full processor reversal across principal, fee, and GST',
      runtime: 'machine' as const,
      script: `vars {
  account $processor
  account $account
  account $revenue
  account $tax
  monetary $principal_amount
  monetary $service_fee_amount
  monetary $tax_amount
  monetary $total_amount
}
send $principal_amount (
  source = $account
  destination = $processor
)
send $service_fee_amount (
  source = $revenue
  destination = $processor
)
send $tax_amount (
  source = $tax
  destination = $processor
)
send $total_amount (
  source = $processor
  destination = @world
)`,
    }),
    CALL_RESERVED_AUD: Object.freeze({
      description: 'Atomically reserve Account AUD, Agent budget, and legal-customer exposure',
      runtime: 'machine' as const,
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
    }),
    CALL_RESERVED_USDC: transferTemplate('Reserve corporate USDC capacity'),
    CALL_RELEASED_AUD: Object.freeze({
      description: 'Release Account AUD, Agent budget, and legal-customer exposure',
      runtime: 'machine' as const,
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
    }),
    CALL_RELEASED_USDC: Object.freeze({
      description: 'Release corporate USDC capacity and cancel the pending Provider obligation',
      runtime: 'machine' as const,
      script: `vars {
  account $treasury_committed
  account $treasury_available
  account $obligation_accrued
  account $expense
  monetary $amount
}
send $amount (
  source = $treasury_committed
  destination = $treasury_available
)
send $amount (
  source = $obligation_accrued
  destination = $expense
)`,
    }),
    BUYER_SALE_SETTLED: Object.freeze({
      description: 'Settle buyer AUD sale, Agent spend, and legal-customer exposure',
      runtime: 'machine' as const,
      script: `vars {
  account $call_reserved
  account $revenue
  account $tax
  account $agent_reserved
  account $agent_spent
  account $legal_reserved
  account $legal_settled
  monetary $revenue_amount
  monetary $tax_amount
  monetary $budget_amount
  monetary $exposure_amount
}
send $revenue_amount (
  source = $call_reserved
  destination = $revenue
)
send $tax_amount (
  source = $call_reserved
  destination = $tax
)
send $budget_amount (
  source = $agent_reserved
  destination = $agent_spent
)
send $exposure_amount (
  source = $legal_reserved
  destination = $legal_settled
)`,
    }),
    BUYER_ADJUSTED: Object.freeze({
      description: 'Append a document-rounding adjustment without changing customer availability',
      runtime: 'machine' as const,
      script: `vars {
  account $source
  account $destination
  monetary $amount
}
send $amount (
  source = $source allowing unbounded overdraft
  destination = $destination
)`,
    }),
    TREASURY_CAPACITY_SYNCED: Object.freeze({
      description: 'Establish one immutable controlled-capacity generation',
      runtime: 'machine' as const,
      script: `vars {
  account $capacity
  monetary $amount
}
send $amount (
  source = @world
  destination = $capacity
)`,
    }),
    PROVIDER_OBLIGATION_ACCRUED: Object.freeze({
      description: 'Accrue Provider USDC expense separately from the buyer AUD sale',
      runtime: 'machine' as const,
      script: `vars {
  account $expense
  account $obligation
  monetary $amount
}
send $amount (
  source = $expense allowing unbounded overdraft
  destination = $obligation
)`,
    }),
    PROVIDER_SETTLED: Object.freeze({
      description: 'Settle corporate USDC and mark the linked Provider obligation paid',
      runtime: 'machine' as const,
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
    }),
    PROVIDER_REVERSED: Object.freeze({
      description: 'Append a Provider settlement reversal',
      runtime: 'machine' as const,
      script: `vars {
  account $treasury_available
  account $provider_settlement
  account $obligation_settled
  account $obligation_reversed
  monetary $amount
}
send $amount (
  source = $provider_settlement
  destination = $treasury_available
)
send $amount (
  source = $obligation_settled
  destination = $obligation_reversed
)`,
    }),
  }),
})

const PERIOD_RESERVATION_AUD_TEMPLATE = Object.freeze({
  description: 'Atomically reserve buyer AUD, both spending periods, and legal-customer exposure',
  runtime: 'machine' as const,
  script: `vars {
  account $account_available
  account $call_reserved
  account $legal_available
  account $legal_reserved
  account $daily_available
  account $daily_reserved
  account $monthly_available
  account $monthly_reserved
  monetary $buyer_amount
  monetary $exposure_amount
  monetary $daily_amount
  monetary $monthly_amount
}
send $buyer_amount (
  source = $account_available
  destination = $call_reserved
)
send $exposure_amount (
  source = $legal_available
  destination = $legal_reserved
)
send $daily_amount (
  source = $daily_available
  destination = $daily_reserved
)
send $monthly_amount (
  source = $monthly_available
  destination = $monthly_reserved
)`,
})

const PERIOD_RELEASE_AUD_TEMPLATE = Object.freeze({
  description: 'Release buyer AUD, both spending periods, and legal-customer exposure',
  runtime: 'machine' as const,
  script: `vars {
  account $account_available
  account $call_reserved
  account $legal_available
  account $legal_reserved
  account $daily_available
  account $daily_reserved
  account $monthly_available
  account $monthly_reserved
  monetary $buyer_amount
  monetary $exposure_amount
  monetary $daily_amount
  monetary $monthly_amount
}
send $buyer_amount (
  source = $call_reserved
  destination = $account_available
)
send $exposure_amount (
  source = $legal_reserved
  destination = $legal_available
)
send $daily_amount (
  source = $daily_reserved
  destination = $daily_available
)
send $monthly_amount (
  source = $monthly_reserved
  destination = $monthly_available
)`,
})

const PERIOD_SETTLEMENT_AUD_TEMPLATE = Object.freeze({
  description: 'Capture buyer sale and both original spending periods',
  runtime: 'machine' as const,
  script: `vars {
  account $call_reserved
  account $revenue
  account $tax
  account $legal_reserved
  account $legal_settled
  account $daily_reserved
  account $daily_spent
  account $monthly_reserved
  account $monthly_spent
  monetary $revenue_amount
  monetary $tax_amount
  monetary $exposure_amount
  monetary $daily_amount
  monetary $monthly_amount
}
send $revenue_amount (
  source = $call_reserved
  destination = $revenue
)
send $tax_amount (
  source = $call_reserved
  destination = $tax
)
send $exposure_amount (
  source = $legal_reserved
  destination = $legal_settled
)
send $daily_amount (
  source = $daily_reserved
  destination = $daily_spent
)
send $monthly_amount (
  source = $monthly_reserved
  destination = $monthly_spent
)`,
})

const SPENDING_PERIOD_INCREASE_TEMPLATE = Object.freeze({
  description: 'Apply an authorized spending-period limit increase',
  runtime: 'machine' as const,
  script: `vars {
  account $period_available
  monetary $amount
}
send $amount (
  source = @world
  destination = $period_available
)`,
})

const SPENDING_PERIOD_DECREASE_TEMPLATE = Object.freeze({
  description: 'Apply an authorized spending-period limit decrease',
  runtime: 'machine' as const,
  script: `vars {
  account $period_available
  account $retired
  monetary $amount
}
send $amount (
  source = $period_available allowing unbounded overdraft
  destination = $retired
)`,
})

/** v1.4 adds period accounts while retaining every v1.3 template verbatim. */
export const PERIOD_FORMANCE_SCHEMA: FormanceSchemaData = Object.freeze({
  ...PACKAGE4_FORMANCE_SCHEMA,
  chart: Object.freeze({
    ...PACKAGE4_FORMANCE_SCHEMA.chart,
    spending_periods: digestSegment({ available: leaf, reserved: leaf, spent: leaf }),
  }),
  transactions: Object.freeze({
    ...PACKAGE4_FORMANCE_SCHEMA.transactions,
    CALL_RESERVED_AUD: PERIOD_RESERVATION_AUD_TEMPLATE,
    CALL_RELEASED_AUD: PERIOD_RELEASE_AUD_TEMPLATE,
    BUYER_SALE_SETTLED: PERIOD_SETTLEMENT_AUD_TEMPLATE,
    SPENDING_PERIOD_INCREASED: SPENDING_PERIOD_INCREASE_TEMPLATE,
    SPENDING_PERIOD_DECREASED: SPENDING_PERIOD_DECREASE_TEMPLATE,
  }),
}) as FormanceSchemaData

export const LEGACY_FORMANCE_SCHEMA_DIGEST = canonicalDigest({
  format: 'ae.package4.formance-schema:v1',
  schema: PACKAGE4_FORMANCE_SCHEMA,
})

/** Historical digest export; keep it byte-identical for legacy recovery. */
export const PACKAGE4_FORMANCE_SCHEMA_DIGEST = LEGACY_FORMANCE_SCHEMA_DIGEST

export const PERIOD_FORMANCE_SCHEMA_DIGEST = canonicalDigest({
  format: 'ae.package4.formance-schema:v1',
  schema: PERIOD_FORMANCE_SCHEMA,
})

/** v1.5 retains the period schema and adds grant-specific promotional accounts. */
export const FORMANCE_SCHEMA: FormanceSchemaData = Object.freeze({
  ...PERIOD_FORMANCE_SCHEMA,
  chart: Object.freeze({
    ...PERIOD_FORMANCE_SCHEMA.chart,
    accounts: digestSegment({
      available: leaf,
      promo: digestSegment({ available: leaf }),
    }),
    calls: digestSegment({ buyer_reserved: leaf, buyer_promo_reserved: leaf }),
    platform: fixed({
      expense: fixed({ providers: leaf, marketing: leaf }),
      revenue: fixed({ sales: leaf }),
      tax: fixed({ gst: leaf }),
    }),
  }),
  transactions: Object.freeze({
    ...PERIOD_FORMANCE_SCHEMA.transactions,
    PROMO_GRANTED: Object.freeze({
      description: 'Issue promotional AUD credit to one grant without recognizing expense',
      runtime: 'machine' as const,
      script: `vars {
  account $destination
  monetary $amount
}
send $amount (
  source = @world
  destination = $destination
)`,
    }),
    PROMO_EXPIRED: Object.freeze({
      description: 'Expire unreserved promotional AUD credit without recognizing expense',
      runtime: 'machine' as const,
      script: `vars {
  account $source
  monetary $amount
}
send $amount (
  source = $source
  destination = @world
)`,
    }),
    CALL_PROMO_RESERVED: transferTemplate('Reserve AUD from one promotional grant'),
    CALL_PROMO_RELEASED: transferTemplate('Release AUD to its original promotional grant or expire it'),
    CALL_PROMO_SETTLED: transferTemplate('Recognize redeemed promotional AUD as marketing expense'),
  }),
}) as FormanceSchemaData

export const FORMANCE_SCHEMA_DIGEST = canonicalDigest({
  format: 'ae.package4.formance-schema:v1',
  schema: FORMANCE_SCHEMA,
})

export function normalizeSchemaReadback(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchemaReadback)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'dotSelf')
      .map(([key, item]) => [key, normalizeSchemaReadback(item)]),
  )
}

export function schemaReadbackDigest(schema: unknown): string {
  return canonicalDigest({
    format: 'ae.package4.formance-schema-readback:v1',
    schema: normalizeSchemaReadback(schema),
  })
}

export const LEGACY_FORMANCE_SCHEMA_READBACK_DIGEST = schemaReadbackDigest(PACKAGE4_FORMANCE_SCHEMA)
export const PERIOD_FORMANCE_SCHEMA_READBACK_DIGEST = schemaReadbackDigest(PERIOD_FORMANCE_SCHEMA)
export const FORMANCE_SCHEMA_READBACK_DIGEST = schemaReadbackDigest(FORMANCE_SCHEMA)
