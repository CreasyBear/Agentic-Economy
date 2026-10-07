import { v, type Infer } from 'convex/values'

import type { JsonValue } from '@/modules/capability-contract/public'
import type { LiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import { jsonObject } from '@/modules/capability-execution/convex'
import type { ReferenceRate } from '@/modules/money/public'
import {
  spendingPeriodAdjustmentValue,
  spendingPeriodsValue,
} from '@/modules/money/public'
import { principalValue } from '../callLifecycle/contracts'
import { sourceWriteArgs, sourceWriteAdmissionArg, sourceWriteRequestArg } from '../../security/sourceWrite/contracts'

export const quoteRefusalCode = v.union(
  v.literal('tool_not_found'),
  v.literal('tool_not_current'),
  v.literal('tool_not_ready'),
  v.literal('tool_unsupported'),
  v.literal('input_invalid'),
  v.literal('grant_not_found'),
  v.literal('budget_exceeded'),
  v.literal('insufficient_balance'),
  v.literal('treasury_capacity_unavailable'),
  v.literal('payments_paused'),
  v.literal('payments_admins_only'),
  v.literal('payments_not_ready'),
  v.literal('pricing_setup_required'),
  v.literal('commercial_policy_unavailable'),
  v.literal('inspection_unavailable'),
)

export const exactAud = v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) })
export const exactUsdc = v.object({ currency: v.literal('USDC'), units: v.string(), exponent: v.literal(6) })

const quoteContinuation = v.union(
  v.object({
    action: v.literal('registry.tools.list'), args: v.object({ limit: v.literal(10) }),
  }),
  v.object({
    action: v.literal('registry.tools.search'), args: v.object({ query: v.string(), limit: v.literal(10) }),
  }),
  v.object({
    action: v.literal('registry.tools.describe'), args: v.object({ toolRef: v.string() }),
  }),
  v.object({
    action: v.literal('tool.quote'), args: v.object({ toolRef: v.string(), input: jsonObject }),
    retryAfterMs: v.union(v.literal(5000), v.literal(30000)),
  }),
  v.object({
    action: v.literal('funding.handoff.create'),
    args: v.object({ principalAmount: exactAud, idempotencyKey: v.string() }),
  }),
  v.object({
    action: v.literal('funding.handoff.config'), args: v.object({}),
  }),
)

const ownerHandoff = v.object({
  actor: v.union(v.literal('account_owner'), v.literal('ae_support')),
  reason: v.string(),
  destination: v.optional(v.union(v.literal('/agent-access'), v.literal('/support'))),
})

export const quoteResult = v.union(
  v.object({
    kind: v.literal('committed'),
    quoteRef: v.string(),
    toolRef: v.string(),
    toolVersion: v.number(),
    expiresAt: v.number(),
    price: exactAud,
    sourceRequirement: v.optional(exactUsdc),
    account: v.object({ accountRef: v.string(), available: exactAud }),
    budget: v.object({ principalRef: v.string(), maximumPerCall: exactAud }),
    policyRefs: v.array(v.string()),
    evidenceDigest: v.string(),
    parties: v.object({
      seller: v.string(),
      provider: v.string(),
      paymentRecipient: v.string(),
    }),
    continuation: v.object({
      action: v.literal('tool.call'),
      args: v.object({ quoteRef: v.string(), idempotencyKey: v.string() }),
    }),
  }),
  v.object({
    kind: v.literal('refused'),
    toolRef: v.string(),
    code: quoteRefusalCode,
    reason: v.optional(v.string()),
    retryable: v.boolean(),
    correlationRef: v.string(),
    continuation: v.optional(quoteContinuation),
    ownerHandoff: v.optional(ownerHandoff),
  }),
)

export type QuoteResult = Infer<typeof quoteResult>

export const quoteActionArgsShape = {
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
  principal: principalValue,
  toolRef: v.string(),
  input: jsonObject,
} as const

export type QuoteArgs = Readonly<{
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
  principal: Infer<typeof principalValue>
  toolRef: string
  input: Record<string, JsonValue>
  liveX402Requirement?: LiveX402Requirement
  referenceRate?: ReferenceRate
}>

export const formanceFinancialSnapshot = v.object({
  policyDigest: v.string(),
  accountRef: v.string(),
  accountAvailableUnits: v.string(),
  principalRef: v.string(),
  budgetGeneration: v.number(),
  budgetAvailableUnits: v.string(),
  legalCustomerRef: v.string(),
  legalCustomerGeneration: v.number(),
  legalExposureAvailableUnits: v.string(),
  policyGeneration: v.number(),
  formanceSchemaVersion: v.string(),
  buyerTaxBps: v.number(),
  observedAt: v.number(),
  spendingPeriods: v.optional(spendingPeriodsValue),
  dailyPeriodAvailableUnits: v.optional(v.string()),
  monthlyPeriodAvailableUnits: v.optional(v.string()),
  dailyPeriodObservedAt: v.optional(v.number()),
  monthlyPeriodObservedAt: v.optional(v.number()),
  treasury: v.optional(v.object({
    custodyRef: v.string(),
    custodyGeneration: v.number(),
    network: v.string(),
    availableUnits: v.string(),
    evidenceRef: v.string(),
    evidenceDigest: v.string(),
  })),
  organizationMonthlySpend: v.optional(v.object({
    enabled: v.boolean(),
    ceilingUnits: v.optional(v.string()),
    monthSpendUnits: v.optional(v.string()),
    heldPlanExposure: v.union(
      v.object({ kind: v.literal('known'), units: v.string() }),
      v.object({ kind: v.literal('unavailable') }),
    ),
  })),
})

export const financialSubjectsResult = v.union(
  v.object({
    kind: v.literal('prepared'),
    expectedEnvironment: v.union(v.literal('sandbox'), v.literal('production')),
    accountRef: v.string(),
    principalRef: v.string(),
    budgetGeneration: v.number(),
    budgetUnits: v.string(),
    legalCustomerRef: v.string(),
    legalCustomerGeneration: v.number(),
    legalExposureUnits: v.string(),
    policyDigest: v.string(),
    policyGeneration: v.number(),
    buyerTaxBps: v.number(),
    financialMode: v.union(v.literal('none'), v.literal('formance')),
    authorityDigest: v.string(),
    dailyLimitUnits: v.string(),
    monthlyLimitUnits: v.string(),
    spendingPeriods: v.optional(spendingPeriodsValue),
    spendingPeriodCommands: v.array(spendingPeriodAdjustmentValue),
    treasury: v.optional(v.object({
      custodyRef: v.string(),
      custodyGeneration: v.number(),
      network: v.string(),
      targetUnits: v.string(),
      evidenceRef: v.string(),
      evidenceDigest: v.string(),
    })),
    organizationMonthlySpendBudget: v.optional(v.object({
      enabled: v.literal(true),
      ceilingUnits: v.string(),
    })),
    x402QuoteSource: v.optional(v.literal('persisted')),
  }),
  v.object({ kind: v.literal('refused'), code: quoteRefusalCode, reason: v.optional(v.string()) }),
)

export type FinancialSubjectsResult = Infer<typeof financialSubjectsResult>

export type PreparedFinancialSubjects = Extract<FinancialSubjectsResult, { kind: 'prepared' }>

export const spendingPeriodPreparationResult = v.union(
  v.object({
    kind: v.literal('prepared'),
    spendingPeriods: spendingPeriodsValue,
    commands: v.array(spendingPeriodAdjustmentValue),
  }),
  v.object({ kind: v.literal('refused'), reason: v.string() }),
)

export const invocationMaterial = v.union(v.object({
  consumedCallRef: v.string(),
  toolRef: v.string(),
  quoteRef: v.string(),
}), v.object({
  toolRef: v.string(),
  input: jsonObject,
  decisionPrice: exactAud,
  quoteRef: v.string(),
  evidenceDigest: v.string(),
  x402RequirementDigest: v.optional(v.string()),
}), v.null())

export const liveX402RequirementValue = v.object({
  requirementDigest: v.string(),
  requirementJson: v.string(),
  paymentRequiredJson: v.string(),
  observedAt: v.number(),
})
