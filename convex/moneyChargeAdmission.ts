import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { isRecord } from '../src/modules/common/is-record'
import { isBoundedJsonValue } from '../src/modules/capability-contract/public'
import {
  createPublicOperationRef,
  materializeRuntimePublishedOperation,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '../src/modules/capability-supply/public'
import type { StableHashValue } from '../src/modules/common/stable-hash'
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

type ReservedOperationMaterial = Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
}>

function parseReservedOperation(
  operationJson: string,
): ReservedOperationMaterial | undefined {
  try {
    const parsed: unknown = JSON.parse(operationJson)
    if (
      !isRecord(parsed)
      || !isBoundedJsonValue(parsed)
      || parsed.kind !== 'published_operation'
      || parsed.environment !== 'SOURCE-OWNED DEVELOPMENT EVIDENCE'
      || (parsed.runtimeEnvironment !== 'sandbox' && parsed.runtimeEnvironment !== 'production')
      || typeof parsed.operationId !== 'string'
      || typeof parsed.materialDigest !== 'string'
      || !isRecord(parsed.identity)
      || parsed.identity.runtimeEnvironment !== parsed.runtimeEnvironment
      || !isRecord(parsed.contract)
      || !isRecord(parsed.offering)
      || !isRecord(parsed.binding)
      || !isRecord(parsed.transport)
      || !isRecord(parsed.readiness)
    ) return undefined
    const operation = parsed as PublishedOperation
    if (
      canonicalDigest(operation.identity as StableHashValue)
      !== operation.materialDigest
    ) return undefined
    const descriptor = materializeRuntimePublishedOperation(operation)
    return { operation, descriptor }
  } catch {
    return undefined
  }
}

function parseReservedInput(
  inputJson: string,
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(inputJson)
    return isRecord(parsed) && isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

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
    || invocation.inputJson === undefined
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
      retryable: false,
    }
  const reserved = parseReservedOperation(invocation.operationJson)
  const persistedInput = parseReservedInput(invocation.inputJson)
  if (
    reserved === undefined
    || persistedInput === undefined
    || canonicalDigest(persistedInput as StableHashValue) !== invocation.inputDigest
    || canonicalDigest({
      operationRef: invocation.operationRef,
      input: persistedInput,
    } as StableHashValue) !== invocation.requestDigest
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  const { operation, descriptor } = reserved
  if (
    createPublicOperationRef({
      operationId: operation.operationId,
      publicationRef: operation.identity.publicationRef,
      publicationRevision: operation.identity.publicationRevision,
      contractRef: operation.contract.ref,
    }) !== invocation.operationRef
    || operation.runtimeEnvironment !== invocation.environment
    || operation.identity.businessId.length === 0
    || operation.identity.offeringId.length === 0
    || operation.identity.price.kind !== 'fixed'
    || descriptor.price.kind !== 'fixed'
    || operation.identity.priceDigest !== operation.priceDigest
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
  const descriptorAmount = readExactAmount(descriptor.price.amount)
  const pricingAmount = readExactAmount(pricingConfig.paidAmount)
  if (
    operationAmount === undefined
    || descriptorAmount === undefined
    || pricingAmount === undefined
    || compareExactAmounts(operationAmount, descriptorAmount) !== 0
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
    || args.offeringRef !== operation.identity.offeringId
    || args.businessId !== operation.identity.businessId
    || args.serviceRef !== operation.operationId
    || args.sourceDigest !== operation.materialDigest
    || canonicalDigest(args.evidenceRefs as StableHashValue)
      !== canonicalDigest(operation.readiness.evidenceRefs as StableHashValue)
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
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
  if (
    durableAttemptRef === undefined
    || canonicalControl.currentAttemptRef !== durableAttemptRef
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  const canonicalAttempt = await ctx.db
    .query('actionInvocationAttempts')
    .withIndex('by_invocationRef_and_attemptRef', (query) =>
      query
        .eq('invocationRef', invocation.invocationRef)
        .eq('attemptRef', durableAttemptRef),
    )
    .unique()
  const authority = invocation.authority
  const authorityBinding = canonicalControl.authorityBinding
  const acceptedAuthority = canonicalControl.control.acceptedAuthority
  if (
    authority === undefined
    || authorityBinding === undefined
    || acceptedAuthority === undefined
    || canonicalAttempt === null
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  let authorityDigestMatches = false
  try {
    const authorityExpiresAt = Date.parse(authority.expiresAt)
    const authorityAmount = readExactAmount(authority.limits.amount)
    const expectedDecisionDigest = canonicalDigest({
      format: 'operation-invoke-authority:v1',
      invocationRef: authority.invocationRef,
      operationRef: authority.operationRef,
      inputDigest: authority.inputDigest,
      grantRef: authority.grantRef,
      grantGeneration: authority.grantGeneration,
      grantDigest: authority.grantDigest,
      reference: authority.reference,
      targetDigest: authority.targetDigest,
      consequence: authority.consequence,
      limits: authority.limits,
      expiresAt: authority.expiresAt,
      acceptedBasis: authority.acceptedBasis,
    } as StableHashValue)
    const authorityBasis = authority.acceptedBasis
    const basisMatches = authorityBasis.kind === 'approve_each'
      ? authority.reference === authorityBasis.authorityRef
      : authorityBasis.kind === 'standing_mandate_use'
        && authorityBasis.mandateRef.length > 0
        && authorityBasis.authorityUseRef.length > 0
        && authorityBasis.grantEvidenceRef.length > 0
        && authorityBasis.mandateGeneration === grant.generation
        && authority.reference === `operation-authority:${invocation.invocationRef}`
        && (principal.authorityMode !== 'full_yolo'
          || (
            authorityBasis.mandateRef === `agent-access-grant:${grant.grantRef}`
            && authorityBasis.mandateVersion === 1
            && authorityBasis.authorityUseRef === `operation-authority-use:${invocation.invocationRef}`
            && authorityBasis.grantEvidenceRef === `agent-access-grant-evidence:${grant.policyDigest}`
          ))
    authorityDigestMatches =
      authorityExpiresAt > args.observedAt
      && authorityExpiresAt <= operation.readiness.validUntil
      && authorityExpiresAt <= grant.expiresAt
      && authority.invocationRef === invocation.invocationRef
      && authority.operationRef === invocation.operationRef
      && authority.inputDigest === invocation.inputDigest
      && authority.grantRef === grant.grantRef
      && authority.grantGeneration === invocation.grantGeneration
      && authority.grantGeneration === grant.generation
      && authority.grantDigest === grant.policyDigest
      && authority.consequence === descriptor.consequenceClass
      && authority.targetDigest === canonicalDigest(operation.identity as StableHashValue)
      && authorityAmount !== undefined
      && compareExactAmounts(authorityAmount, operationAmount) === 0
      && canonicalDigest(authority.limits as StableHashValue)
        === canonicalDigest({ amount: operationAmount } as StableHashValue)
      && authority.decisionDigest === expectedDecisionDigest
      && basisMatches
  } catch {
    authorityDigestMatches = false
  }
  if (!authorityDigestMatches)
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  const canonicalState = canonicalControl.control.control
  if (
    invocation.invocationRef !== args.invocationRef
    || invocation.principalId !== args.principalId
    || invocation.credentialId !== args.credentialId
    || invocation.applicationRef !== args.applicationRef
    || invocation.ownerId !== principal.ownerId
    || invocation.environment !== principal.environment
    || invocation.ownerId !== grant.ownerId
    || invocation.principalId !== grant.principalId
    || invocation.credentialId !== grant.credentialId
    || invocation.applicationRef !== grant.applicationRef
    || invocation.environment !== grant.environment
    || invocation.grantRef !== grant.grantRef
    || invocation.grantGeneration !== grant.generation
    || invocation.policyDigest !== grant.policyDigest
    || invocation.grantExpiresAt !== grant.expiresAt
    || invocation.attemptRef !== durableAttemptRef
    || canonicalControl.invocationRef !== invocation.invocationRef
    || canonicalControl.sourceRef !== `operation-invocation-source:${invocation.invocationRef}`
    || canonicalControl.preparedMaterialDigest !== invocation.inputDigest
    || canonicalControl.preparedTargetDigest !== authority.targetDigest
    || canonicalControl.consequence !== authority.consequence
    || canonicalControl.currentAttemptRef !== durableAttemptRef
    || grant.policy.budget.generation !== grant.generation
    || canonicalControl.currentEffectGeneration !== canonicalAttempt.effectGeneration
    || canonicalControl.control.invocationRef !== invocation.invocationRef
    || canonicalControl.control.owner.principalRef !== invocation.principalId
    || canonicalControl.control.owner.callerRef !== invocation.credentialId
    || canonicalControl.control.origin.kind !== 'standalone'
    || canonicalControl.control.origin.principalRef !== invocation.principalId
    || canonicalControl.control.origin.callerRef !== invocation.credentialId
    || canonicalControl.control.action.id !== operation.operationId
    || canonicalControl.control.action.contractVersion !== descriptor.version
    || canonicalControl.control.desired.state !== 'invoke'
    || canonicalControl.control.freshness.state !== 'current'
    || canonicalControl.control.authority?.reference !== authority.reference
    || canonicalControl.control.authority?.expiresAt !== authority.expiresAt
    || authorityBinding.invocationRef !== invocation.invocationRef
    || authorityBinding.actor.principalRef !== invocation.principalId
    || authorityBinding.actor.callerRef !== invocation.credentialId
    || authorityBinding.origin.kind !== 'standalone'
    || authorityBinding.origin.principalRef !== invocation.principalId
    || authorityBinding.origin.callerRef !== invocation.credentialId
    || authorityBinding.invocationVersion !== canonicalControl.invocationVersion
    || authorityBinding.actionId !== operation.operationId
    || authorityBinding.contractVersion !== descriptor.version
    || authorityBinding.digest !== authority.decisionDigest
    || authorityBinding.targetDigest !== authority.targetDigest
    || authorityBinding.consequence !== authority.consequence
    || canonicalDigest(authorityBinding.limits as StableHashValue)
      !== canonicalDigest(authority.limits as StableHashValue)
    || authorityBinding.expiresAt !== authority.expiresAt
    || authorityBinding.acceptedBasis === undefined
    || canonicalDigest(authorityBinding.acceptedBasis as StableHashValue)
      !== canonicalDigest(authority.acceptedBasis as StableHashValue)
    || canonicalControl.control.acceptedAuthority === undefined
    || canonicalDigest(canonicalControl.control.acceptedAuthority as StableHashValue)
      !== canonicalDigest(authority.acceptedBasis as StableHashValue)
    || canonicalState.state !== 'leased'
    || canonicalState.attemptRef !== durableAttemptRef
    || canonicalState.release !== 'not_started'
    || canonicalState.effectGeneration !== canonicalAttempt.effectGeneration
    || canonicalAttempt.invocationRef !== invocation.invocationRef
    || canonicalAttempt.attemptRef !== durableAttemptRef
    || canonicalAttempt.actor.principalRef !== invocation.principalId
    || canonicalAttempt.actor.callerRef !== invocation.credentialId
    || canonicalAttempt.effectGeneration !== canonicalControl.currentEffectGeneration
    || canonicalAttempt.idempotency.operationKey !== invocation.operationRef
    || canonicalAttempt.idempotency.materialInputDigest !== invocation.inputDigest
    || canonicalAttempt.idempotency.effectIdentity !== canonicalDigest({
      actionId: operation.operationId,
      operationKey: invocation.operationRef,
      materialInputDigest: invocation.inputDigest,
    } as StableHashValue)
    || canonicalAttempt.lease.owner !== `operation-worker:${invocation.invocationRef}`
    || canonicalAttempt.lease.expiresAt !== authority.expiresAt
    || canonicalAttempt.release.state !== 'not_released'
    || canonicalAttempt.outcome.state !== 'running'
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
  const existingUsage = await ctx.db
    .query('moneyUsageEvents')
    .withIndex('by_usageRef', (q) => q.eq('usageRef', `${invocation.invocationRef}:${durableAttemptRef}:${invocation.operationRef}`))
    .unique()
  const prior = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_idempotencyKey', (q) =>
      q.eq('idempotencyKey', expectedTransactionRef),
    )
    .unique()
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
    attemptRef: canonicalAttempt.attemptRef,
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
