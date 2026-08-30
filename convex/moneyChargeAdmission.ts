import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { parsePublishedOperationSnapshot } from '../src/modules/capability-supply/public'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  compareExactAmounts,
  computeProviderFeeBreakdown,
  normalizePricingConfig,
  pricingConfigDigest,
  readExactAmount,
  validateChargeAccounts,
  type ExactAmount,
  type MoneyAccount,
  type MoneyRefusal,
} from '../src/modules/money/public'
import { budgetRefusal, readBudgetGrant } from './moneyBudgetPersist'
import {
  accountFromRow,
  canonicalMoneyAccountPreview,
  prepareCanonicalMoneyAccount,
  type PreparedCanonicalMoneyAccount,
} from './moneyCanonicalAccounts'

export type AuthorizeInvocationChargeArgs = Readonly<{
  principalId: string
  amount: ExactAmount
  operatorAccountRef: string
  providerAccountRef: string
  rakeAccountRef: string
  transactionRef: string
  idempotencyKey: string
  inputDigest: string
  expectedAccountVersion: number
  rakeBps: number
  priceDigest: string
  priceSourceDigest: string
  authorityMaximumSpend: ExactAmount
  credentialId: string
  applicationRef?: string
  serviceRef: string
  offeringRef: string
  businessId: string
  invocationRef: string
  attemptRef: string
  operationKey: string
  sourceDigest: string
  evidenceRefs: string[]
  observedAt: number
  freeTier: boolean
  credentialBudgetGrantRef?: string
  credentialBudgetGeneration?: number
}>

export type AdmittedInvocationCharge = Readonly<{
  kind: 'admitted'
  amount: ExactAmount
  providerAmount?: ExactAmount
  platformFee?: ExactAmount
  currency: string
  priceDigest: string
  transactionRef: string
  operatorAccountRef: string
  providerAccountRef: string
  rakeAccountRef: string
  principalId: string
  accountId: string
  credentialId: string
  serviceRef: string
  offeringRef: string
  businessId: string
  invocationRef: string
  attemptRef: string
  operationKey: string
  inputDigest: string
  sourceDigest: string
  evidenceRefs: string[]
  operatorPrepared: PreparedCanonicalMoneyAccount
  providerPrepared: PreparedCanonicalMoneyAccount
  rakePrepared: PreparedCanonicalMoneyAccount
  operator: MoneyAccount
  provider: MoneyAccount
  rake: MoneyAccount
  grantRef: string
  generation: number
  prior: Doc<'moneyTransactions'> | null
  existingUsage: Doc<'moneyUsageEvents'> | null
  priorEntryRows: Doc<'moneyLedgerEntries'>[]
}>

export type InvocationChargeAdmission =
  | AdmittedInvocationCharge
  | MoneyRefusal
  | ReturnType<typeof budgetRefusal>

export async function admitInvocationCharge(
  ctx: MutationCtx,
  args: AuthorizeInvocationChargeArgs,
): Promise<InvocationChargeAdmission> {
  const requestedAmount = readExactAmount(args.amount)
  const requestedMaximumSpend = readExactAmount(args.authorityMaximumSpend)
  if (requestedAmount === undefined || requestedMaximumSpend === undefined)
    return {
      kind: 'refused' as const,
      code: 'price_unavailable' as const,
      retryable: false,
    }
  const invocation = await ctx.db
    .query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) =>
      query.eq('invocationRef', args.invocationRef),
    )
    .unique()
  if (
    invocation === null
    || invocation.operationJson === undefined
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
      retryable: false,
    }
  const operation = parsePublishedOperationSnapshot(invocation.operationJson)
  if (
    operation === undefined
    || operation.identity.price.kind !== 'fixed'
    || operation.identity.offeringId.length === 0
    || operation.identity.businessId.length === 0
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  const normalizedPricing = normalizePricingConfig(operation.identity.pricingConfig)
  if (normalizedPricing.kind === 'invalid')
    return {
      kind: 'refused' as const,
      code: normalizedPricing.code,
      retryable: false,
    }
  const pricingConfig = normalizedPricing.config
  const operationAmount = readExactAmount(operation.identity.price.amount)
  const pricingAmount = readExactAmount(pricingConfig.paidAmount)
  if (
    operationAmount === undefined
    || pricingAmount === undefined
    || compareExactAmounts(operationAmount, pricingAmount) !== 0
    || compareExactAmounts(requestedAmount, operationAmount) !== 0
    || compareExactAmounts(requestedMaximumSpend, operationAmount) !== 0
  )
    return {
      kind: 'refused' as const,
      code: 'price_changed' as const,
      retryable: false,
    }
  const expectedPriceDigest = pricingConfigDigest(pricingConfig)
  if (
    operation.priceDigest !== expectedPriceDigest
    || operation.identity.priceDigest !== expectedPriceDigest
    || args.priceDigest !== expectedPriceDigest
    || args.priceSourceDigest !== expectedPriceDigest
    || args.freeTier
    || args.rakeBps !== 1_000
  )
    return {
      kind: 'refused' as const,
      code: 'price_changed' as const,
      retryable: false,
    }
  if (operationAmount.units !== '0') {
    const providerAmount = pricingConfig.providerAmount
    const platformFee = pricingConfig.platformFee
    const breakdown = providerAmount === undefined || platformFee === undefined
      ? undefined
      : computeProviderFeeBreakdown(providerAmount)
    if (
      providerAmount === undefined
      || platformFee === undefined
      || breakdown === undefined
      || 'kind' in breakdown
      || compareExactAmounts(breakdown.totalAmount, operationAmount) !== 0
      || compareExactAmounts(breakdown.platformFee, platformFee) !== 0
    )
      return {
        kind: 'refused' as const,
        code: 'rake_not_configured' as const,
        retryable: false,
      }
  }
  const offering = await ctx.db
    .query('capabilityOfferings')
    .withIndex('by_offeringId', (query) =>
      query.eq('offeringId', operation.identity.offeringId),
    )
    .unique()
  if (
    offering === null
    || offering.businessId.toString() !== operation.identity.businessId
    || offering.status !== 'active'
    || offering.presentation.price.kind !== 'fixed'
  )
    return {
      kind: 'refused' as const,
      code: 'price_unavailable' as const,
      retryable: false,
    }
  const publishedPrice = offering.presentation.price
  const publishedAmount = readExactAmount(publishedPrice.amount)
  if (
    publishedAmount === undefined
    || compareExactAmounts(publishedAmount, operationAmount) !== 0
  )
    return {
      kind: 'refused' as const,
      code: 'price_changed' as const,
      retryable: false,
    }
  const [principal, grant, canonicalControl] = await Promise.all([
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) =>
        query.eq('principalId', invocation.principalId),
      )
      .unique(),
    ctx.db
      .query('agentAccessGrants')
      .withIndex('by_grantRef', (query) =>
        query.eq('grantRef', invocation.grantRef),
      )
      .unique(),
    ctx.db
      .query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) =>
        query.eq('invocationRef', invocation.invocationRef),
      )
      .unique(),
  ])
  if (principal === null || grant === null || canonicalControl === null)
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  const durableAttemptRef = invocation.attemptRef
  const authority = invocation.authority
  const authorityExpiresAt =
    authority === undefined ? Number.NaN : Date.parse(authority.expiresAt)
  const authorityAmount =
    authority === undefined ? undefined : readExactAmount(authority.limits.amount)
  const canonicalState = canonicalControl.control.control
  if (
    durableAttemptRef === undefined
    || canonicalControl.currentAttemptRef !== durableAttemptRef
    || canonicalControl.preparedMaterialDigest === undefined
    || canonicalControl.preparedMaterialDigest !== invocation.inputDigest
    || authority === undefined
    || !Number.isFinite(authorityExpiresAt)
    || authorityExpiresAt <= args.observedAt
    || authority.grantGeneration !== grant.generation
    || invocation.grantGeneration !== grant.generation
    || grant.policy.budget.generation !== grant.generation
    || authorityAmount === undefined
    || compareExactAmounts(authorityAmount, operationAmount) !== 0
    || canonicalState.state !== 'leased'
    || canonicalState.attemptRef !== durableAttemptRef
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  if (
    args.credentialBudgetGrantRef === undefined
    || args.credentialBudgetGeneration === undefined
  )
    return {
      kind: 'refused' as const,
      code: 'budget_policy_missing' as const,
      retryable: false,
    }
  const budgetGrant = await readBudgetGrant(ctx, {
    principalId: invocation.principalId,
    credentialId: invocation.credentialId,
    grantRef: args.credentialBudgetGrantRef,
    generation: args.credentialBudgetGeneration,
    now: args.observedAt,
  })
  if (budgetGrant === undefined || budgetGrant.kind === 'refused')
    return budgetRefusal(
      budgetGrant === undefined ? 'budget_policy_missing' : budgetGrant.code,
    )
  const amount = requestedAmount
  const authorityMaximumSpend = requestedMaximumSpend
  const authorityComparison = compareExactAmounts(
    amount,
    authorityMaximumSpend,
  )
  if (authorityComparison === undefined)
    return {
      kind: 'refused' as const,
      code: 'price_changed' as const,
      retryable: false,
    }
  const durablePrincipalId = invocation.principalId
  const durableBusinessId = operation.identity.businessId
  const durableOfferingRef = operation.identity.offeringId
  const durableServiceRef = operation.operationId
  const durableSourceDigest = operation.materialDigest
  const durableEvidenceRefs = [...operation.readiness.evidenceRefs]
  const currency = amount.currency
  const ownerAccountId = principal.ownerId
  const expectedOperatorRef = accountRefForOwner(
    ownerAccountId,
    currency,
  )
  const expectedProviderRef = accountRefForProvider(durableBusinessId, currency)
  const expectedRakeRef = accountRefForRake(currency)
  if (
    args.operatorAccountRef !== expectedOperatorRef
    || args.providerAccountRef !== expectedProviderRef
    || args.rakeAccountRef !== expectedRakeRef
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  const [operatorPrepared, providerPrepared, rakePrepared] =
    await (async () => {
      const operator = await prepareCanonicalMoneyAccount(ctx, {
        accountKind: 'operator_credit',
        accountId: ownerAccountId,
        currency,
        exponent: amount.exponent,
        now: args.observedAt,
      })
      const operatorPreview =
        operator === undefined
          ? undefined
          : canonicalMoneyAccountPreview(operator)
      const provider = await prepareCanonicalMoneyAccount(ctx, {
        accountKind: 'provider_earnings',
        businessId: durableBusinessId,
        currency,
        exponent: operatorPreview?.exponent ?? amount.exponent,
        now: args.observedAt,
      })
      const rake = await prepareCanonicalMoneyAccount(ctx, {
        accountKind: 'ae_rake',
        currency,
        exponent: operatorPreview?.exponent ?? amount.exponent,
        now: args.observedAt,
      })
      return [operator, provider, rake] as const
    })()
  const operator =
    operatorPrepared === undefined
      ? undefined
      : canonicalMoneyAccountPreview(operatorPrepared)
  const provider =
    providerPrepared === undefined
      ? undefined
      : canonicalMoneyAccountPreview(providerPrepared)
  const rakeAccount =
    rakePrepared === undefined
      ? undefined
      : canonicalMoneyAccountPreview(rakePrepared)
  const operatorDomain =
    operator === undefined ? undefined : accountFromRow(operator)
  const providerDomain =
    provider === undefined ? undefined : accountFromRow(provider)
  const rakeDomain =
    rakeAccount === undefined ? undefined : accountFromRow(rakeAccount)
  const accountRefusal = validateChargeAccounts({
    operator: operatorDomain,
    provider: providerDomain,
    rake: rakeDomain,
    operatorAccountRef: expectedOperatorRef,
    providerAccountRef: expectedProviderRef,
    rakeAccountRef: expectedRakeRef,
    accountId: ownerAccountId,
    businessId: durableBusinessId,
    currency,
  })
  if (accountRefusal !== undefined) return accountRefusal
  if (
    operator === undefined ||
    provider === undefined ||
    rakeAccount === undefined ||
    operatorPrepared === undefined ||
    providerPrepared === undefined ||
    rakePrepared === undefined ||
    operatorDomain === undefined ||
    providerDomain === undefined ||
    rakeDomain === undefined
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
      retryable: false,
    }
  if (
    provider.exponent !== operator.exponent ||
    rakeAccount.exponent !== operator.exponent
  )
    return {
      kind: 'refused' as const,
      code: 'currency_mismatch' as const,
      retryable: false,
    }
  const expectedTransactionRef =
    `operation-money:${invocation.invocationRef}:${durableAttemptRef}:1`
  if (
    args.operationKey !== invocation.operationRef
    || args.inputDigest !== invocation.inputDigest
    || args.transactionRef !== expectedTransactionRef
    || args.idempotencyKey !== expectedTransactionRef
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  const [existingUsage, prior] = await Promise.all([
    ctx.db
      .query('moneyUsageEvents')
      .withIndex('by_usageRef', (q) => q.eq('usageRef', `${invocation.invocationRef}:${durableAttemptRef}:${invocation.operationRef}`))
      .unique(),
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_idempotencyKey', (q) =>
        q.eq('idempotencyKey', expectedTransactionRef),
      )
      .unique(),
  ])
  if (prior !== null) {
    if (
      prior.transactionRef !== expectedTransactionRef
      || prior.idempotencyKey !== expectedTransactionRef
      || prior.inputDigest !== invocation.inputDigest
      || prior.principalId !== invocation.principalId
      || prior.credentialId !== invocation.credentialId
      || prior.currency !== currency
      || prior.exponent !== operator.exponent
      || prior.expectedAccountVersion !== args.expectedAccountVersion
      || prior.budgetPolicyRef !== budgetGrant.budgetPolicyRef
      || prior.budgetGeneration !== budgetGrant.generation
      || prior.budgetEnvironment !== budgetGrant.environment
      || prior.kind !== 'charge'
      || prior.amountUnits !== amount.units
    )
      return {
        kind: 'refused' as const,
        code: 'ledger_idempotency_conflict' as const,
        retryable: false,
      }
  }
  const priorEntryRows =
    prior === null
      ? []
      : await ctx.db
          .query('moneyLedgerEntries')
          .withIndex('by_transactionRef', (q) =>
            q.eq('transactionRef', prior.transactionRef),
          )
          .take(5)
  const grantRef = args.credentialBudgetGrantRef
  const generation = args.credentialBudgetGeneration
  if (grantRef === undefined || generation === undefined)
    return {
      kind: 'refused' as const,
      code: 'budget_policy_missing' as const,
      retryable: false,
    }
  return {
    kind: 'admitted',
    amount,
    currency,
    priceDigest: expectedPriceDigest,
    transactionRef: expectedTransactionRef,
    operatorAccountRef: expectedOperatorRef,
    providerAccountRef: expectedProviderRef,
    rakeAccountRef: expectedRakeRef,
    principalId: durablePrincipalId,
    accountId: ownerAccountId,
    credentialId: invocation.credentialId,
    serviceRef: durableServiceRef,
    offeringRef: durableOfferingRef,
    businessId: durableBusinessId,
    invocationRef: invocation.invocationRef,
    attemptRef: durableAttemptRef,
    operationKey: invocation.operationRef,
    inputDigest: invocation.inputDigest,
    sourceDigest: durableSourceDigest,
    evidenceRefs: durableEvidenceRefs,
    operatorPrepared,
    providerPrepared,
    rakePrepared,
    operator: operatorDomain,
    provider: providerDomain,
    rake: rakeDomain,
    grantRef,
    generation,
    prior,
    existingUsage,
    priorEntryRows,
    ...(pricingConfig.providerAmount === undefined
      ? {}
      : { providerAmount: pricingConfig.providerAmount }),
    ...(pricingConfig.platformFee === undefined
      ? {}
      : { platformFee: pricingConfig.platformFee }),
  }
}
