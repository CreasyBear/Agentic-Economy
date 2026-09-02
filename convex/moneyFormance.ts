"use node"

import { v } from 'convex/values'

import {
  createFormanceContext,
  installPackage4FormanceSchema,
  readFormanceAccount,
  readFormanceConfiguration,
  readFormanceHealth,
  readFormancePeriodSpend,
  readFormanceTransactionByReference,
  type FormanceMoneyResult,
} from '../src/modules/money/formance'
import {
  bookFormanceFundingReversal,
  bookFormanceFundingSettlement,
  canRebindFormanceLegalCustomer,
  formanceAccountMetadataDigest,
  readFormanceDisplayBalance,
  releaseFormanceManagedCall,
  reserveFormanceManagedCall,
  settleFormanceManagedCall,
  syncFormanceCapacity,
} from '../src/modules/money/formance-workflows'
import { internalAction } from './_generated/server'

export type MoneyFormanceResult = FormanceMoneyResult
export type MoneyFormanceManagedCallBooking = import('../src/modules/money/formance-workflows').FormanceManagedCallBooking

const setupRequired = v.object({ kind: v.literal('setup_required'), code: v.string() })
const unavailable = v.object({ kind: v.literal('unavailable'), code: v.string() })
const moneyResult = v.union(
  v.object({
    kind: v.literal('completed'),
    transactionRefs: v.array(v.string()),
    replayed: v.boolean(),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.literal(false) }),
  v.object({
    kind: v.literal('unavailable'),
    code: v.string(),
    submissionProvenAbsent: v.literal(true),
  }),
  v.object({ kind: v.literal('outcome_unknown'), reference: v.string(), statusRef: v.string() }),
)
const fundingBookingArgs = {
  commandRef: v.string(),
  idempotencyKey: v.string(),
  accountRef: v.string(),
  processorRef: v.string(),
  principalUnits: v.string(),
  serviceFeeUnits: v.string(),
  taxUnits: v.string(),
  totalUnits: v.string(),
  policyDigest: v.string(),
  externalEvidenceDigest: v.string(),
}
const capacityKind = v.union(
  v.literal('agent_budget'),
  v.literal('legal_customer_exposure'),
  v.literal('treasury_usdc'),
)
const balanceKind = v.union(v.literal('account_aud'), capacityKind)
const managedCallBookingArgs = {
  invocationRef: v.string(),
  commitmentRef: v.string(),
  idempotencyKey: v.string(),
  accountRef: v.string(),
  principalRef: v.string(),
  agentBudgetGeneration: v.number(),
  legalCustomerRef: v.string(),
  legalCustomerGeneration: v.number(),
  treasuryRef: v.string(),
  treasuryGeneration: v.number(),
  operationRef: v.string(),
  providerRef: v.string(),
  authorityGeneration: v.number(),
  policyGeneration: v.number(),
  buyerAmountUnits: v.string(),
  buyerRevenueUnits: v.string(),
  buyerTaxUnits: v.string(),
  providerAmountUnits: v.string(),
  commitmentDigest: v.string(),
  inputDigest: v.string(),
  policyDigest: v.string(),
  rateEvidenceDigest: v.string(),
  treasuryEvidenceDigest: v.string(),
  x402RequirementDigest: v.string(),
}

const healthResult = v.union(
  v.object({
    kind: v.literal('ready'),
    gatewayVersion: v.string(),
    ledgerVersion: v.string(),
    schemaVersion: v.string(),
    schemaDigest: v.string(),
  }),
  setupRequired,
  unavailable,
)

const installationResult = v.union(
  v.object({
    kind: v.literal('completed'),
    ledger: v.string(),
    schemaVersion: v.string(),
    schemaDigest: v.string(),
    replayed: v.boolean(),
  }),
  setupRequired,
  unavailable,
)

const accountResult = v.union(
  v.object({
    kind: v.literal('completed'),
    address: v.string(),
    volumes: v.record(v.string(), v.object({
      inputUnits: v.string(),
      outputUnits: v.string(),
      balanceUnits: v.string(),
    })),
  }),
  v.object({ kind: v.literal('not_found') }),
  setupRequired,
  unavailable,
)

const referenceResult = v.union(
  v.object({
    kind: v.literal('found'),
    reference: v.string(),
    transactionId: v.string(),
    template: v.optional(v.string()),
    metadata: v.record(v.string(), v.string()),
    postings: v.array(v.object({
      source: v.string(),
      destination: v.string(),
      asset: v.string(),
      amountUnits: v.string(),
    })),
  }),
  v.object({ kind: v.literal('absent'), reference: v.string() }),
  setupRequired,
  unavailable,
)

const periodSpendResult = v.union(
  v.object({
    kind: v.literal('available'),
    currency: v.literal('AUD'),
    exponent: v.literal(6),
    spendUnits: v.string(),
    transactionCountUnits: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
    observedAt: v.number(),
    source: v.literal('formance_transaction_cursor'),
    authoritativeForConsequences: v.literal(false),
  }),
  v.object({ kind: v.literal('empty') }),
  setupRequired,
  unavailable,
)

export const health = internalAction({
  args: {},
  returns: healthResult,
  handler: async () => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? context
      : await readFormanceHealth(context.context)
  },
})

export const installSchema = internalAction({
  args: {},
  returns: installationResult,
  handler: async () => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? context
      : await installPackage4FormanceSchema(context.context)
  },
})

export const readAccount = internalAction({
  args: { address: v.string() },
  returns: accountResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? context
      : await readFormanceAccount(context.context, args.address)
  },
})

export const readTransactionByReference = internalAction({
  args: { reference: v.string() },
  returns: referenceResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    const result = context.kind === 'setup_required'
      ? context
      : await readFormanceTransactionByReference(context.context, args.reference)
    return result.kind !== 'found'
      ? result
      : {
          ...result,
          metadata: { ...result.metadata },
          postings: result.postings.map((posting) => ({ ...posting })),
        }
  },
})

export const readPeriodSpend = internalAction({
  args: {
    accountRef: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
  },
  returns: periodSpendResult,
  handler: async (_ctx, args) => {
    const accountDigest = formanceAccountMetadataDigest(args.accountRef)
    if (accountDigest === undefined) {
      return { kind: 'setup_required' as const, code: 'formance_spend_query_invalid' }
    }
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? context
      : await readFormancePeriodSpend(context.context, {
          accountDigest,
          periodStartAt: args.periodStartAt,
          periodEndAt: args.periodEndAt,
        })
  },
})

/** Inert until the Package 4 no-user cutover switches the existing funding caller. */
export const bookFundingSettlement = internalAction({
  args: fundingBookingArgs,
  returns: moneyResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? { kind: 'refused' as const, code: context.code, retryable: false as const }
      : convexMoneyResult(await bookFormanceFundingSettlement(context.context, args))
  },
})

/** Inert until processor reversals are switched at the Package 4 cutover. */
export const bookFundingReversal = internalAction({
  args: fundingBookingArgs,
  returns: moneyResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? { kind: 'refused' as const, code: context.code, retryable: false as const }
      : convexMoneyResult(await bookFormanceFundingReversal(context.context, args))
  },
})

/** Inert capacity replacement. It is not called by a product route before cutover. */
export const syncCapacity = internalAction({
  args: {
    commandRef: v.string(),
    idempotencyKey: v.string(),
    kind: capacityKind,
    subjectRef: v.string(),
    generation: v.number(),
    targetUnits: v.string(),
    policyDigest: v.string(),
    externalEvidenceDigest: v.string(),
  },
  returns: moneyResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? { kind: 'refused' as const, code: context.code, retryable: false as const }
      : convexMoneyResult(await syncFormanceCapacity(context.context, args))
  },
})

export const readDisplayBalance = internalAction({
  args: { balanceKind, subjectRef: v.string(), generation: v.optional(v.number()) },
  returns: v.union(
    v.object({
      kind: v.literal('available'),
      balanceKind,
      subjectRef: v.string(),
      generation: v.optional(v.number()),
      currency: v.union(v.literal('AUD'), v.literal('USDC')),
      exponent: v.literal(6),
      units: v.string(),
      observedAt: v.number(),
      source: v.literal('formance_live_read'),
      authoritativeForConsequences: v.literal(false),
    }),
    setupRequired,
    unavailable,
  ),
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? context
      : await readFormanceDisplayBalance(context.context, args)
  },
})

export const canRebindLegalCustomer = internalAction({
  args: { legalCustomerRef: v.string(), generation: v.number(), pendingCallCount: v.number() },
  returns: v.union(
    v.object({ kind: v.literal('allowed') }),
    v.object({
      kind: v.literal('refused'),
      code: v.union(
        v.literal('legal_customer_capacity_reserved'),
        v.literal('legal_customer_calls_pending'),
      ),
    }),
    setupRequired,
    unavailable,
  ),
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? context
      : await canRebindFormanceLegalCustomer(context.context, args)
  },
})

/** Inert until the Package 4 cutover switches the managed-call worker. */
export const reserveManagedCall = internalAction({
  args: managedCallBookingArgs,
  returns: moneyResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? { kind: 'refused' as const, code: context.code, retryable: false as const }
      : convexMoneyResult(await reserveFormanceManagedCall(context.context, args))
  },
})

/** Proven pre-submission release only. Possible submission must not call this action. */
export const releaseManagedCall = internalAction({
  args: {
    booking: v.object(managedCallBookingArgs),
    externalEvidenceDigest: v.string(),
    submissionProvenAbsent: v.literal(true),
  },
  returns: moneyResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? { kind: 'refused' as const, code: context.code, retryable: false as const }
      : convexMoneyResult(await releaseFormanceManagedCall(context.context, args))
  },
})

/** Inert settlement finalizer; x402 evidence is still owned by the existing worker. */
export const settleManagedCall = internalAction({
  args: { booking: v.object(managedCallBookingArgs), externalEvidenceDigest: v.string() },
  returns: moneyResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? { kind: 'refused' as const, code: context.code, retryable: false as const }
      : convexMoneyResult(await settleFormanceManagedCall(context.context, args))
  },
})

function configuredContext() {
  const result = readFormanceConfiguration()
  return result.kind === 'setup_required'
    ? result
    : Object.freeze({ kind: 'configured' as const, context: createFormanceContext(result.configuration) })
}

function convexMoneyResult(result: FormanceMoneyResult) {
  return result.kind === 'completed'
    ? { ...result, transactionRefs: [...result.transactionRefs] }
    : result
}
