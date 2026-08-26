import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  qualifiedUseMaterialDigest,
  qualifiedUseRef,
} from '@/modules/money/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  materializeRuntimePublishedOperation,
  type PublishedOperation,
} from '@/modules/capability-supply/public'

import {
  MemoryDb,
  type FreeTierFixture,
  type Row,
  attemptRef,
  authorizationAmount,
  authorizationArgs,
  authorizationAuthority,
  authorizationAuthorityMaterial,
  authorizationBasis,
  authorizationDescriptor,
  authorizationExpiresAt,
  authorizationMaximumSpend,
  authorizationOperation,
  authorizationOperationRef,
  credentialId,
  input,
  inputDigest,
  invocationRef,
  now,
  ownerId,
  principalId,
  sourceDigest,
  transactionRef,
} from './money-ledger-test-harness'

export const canonicalQualifiedUseAccountRef =
  'acc_11111111111111111111111111111111'
export const canonicalQualifiedUseGrantRef =
  'grt_22222222222222222222222222222222'

export function seedCanonicalQualifiedUseAuthority(
  db: MemoryDb,
  nextInvocationRef = invocationRef,
  overrides: Readonly<{
    accountRef?: string
    grantRef?: string
    generation?: number
    lifecycle?: 'active' | 'revoked'
    expiresAt?: number
    principalRef?: string
    operationRef?: string
  }> = {},
): void {
  const accountRef = overrides.accountRef ?? canonicalQualifiedUseAccountRef
  const grantRef = overrides.grantRef ?? canonicalQualifiedUseGrantRef
  const generation = overrides.generation ?? 1
  const expiresAt = overrides.expiresAt ?? 8_000_000_000_000_000
  const principalRef = overrides.principalRef ?? principalId
  const operationRef = overrides.operationRef ?? 'operation:money'
  if (!db.rows('accounts').some((row) => row.accountRef === accountRef)) {
    db.seed('accounts', {
      _id: `account:${accountRef}`,
      accountRef,
      displayName: 'Qualified Use authority account',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: principalRef,
      creationIdempotencyRef: `create:${accountRef}`,
      initialOwnershipRef: `ownership:${accountRef}`,
      currentOwnershipRef: `ownership:${accountRef}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastAction: {
        actorPrincipalRef: principalRef,
        activeAccountRef: accountRef,
        correlationRef: `correlation:${accountRef}`,
        idempotencyRef: `create:${accountRef}`,
      },
    })
  }
  if (!db.rows('principals').some((row) => row.principalRef === principalRef)) {
    db.seed('principals', {
      _id: `principal:${principalRef}`,
      principalRef,
      kind: 'agent',
      displayName: 'Qualified Use authority principal',
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
  }
  if (!db.rows('memberships').some((row) =>
    row.accountRef === accountRef && row.memberPrincipalRef === principalRef)) {
    db.seed('memberships', {
      _id: `membership:${accountRef}:${principalRef}`,
      membershipRef: `membership:${accountRef}:${principalRef}`,
      accountRef,
      memberPrincipalRef: principalRef,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      createdBy: {
        actorPrincipalRef: principalRef,
        activeAccountRef: accountRef,
        correlationRef: `correlation:${grantRef}`,
        idempotencyRef: `membership:${grantRef}`,
      },
    })
  }
  if (!db.rows('authorityDelegationGrants').some((row) =>
    row.grantRef === grantRef && row.generation === generation)) {
    db.seed('authorityDelegationGrants', {
      _id: `authority-grant:${grantRef}:${generation}`,
      grantRef,
      accountRef,
      actorPrincipalRef: principalRef,
      subjectPrincipalRef: principalRef,
      scopes: ['market_operations:invoke'],
      resourceRefs: [operationRef],
      budgetLimit: 1_000,
      budgetUsed: 1,
      expiresAt,
      generation,
      revision: 1,
      lifecycle: overrides.lifecycle ?? 'active',
      createdAt: now,
      createdBy: {
        actorPrincipalRef: principalRef,
        activeAccountRef: accountRef,
        correlationRef: `correlation:${grantRef}`,
        idempotencyRef: `create:${grantRef}`,
      },
    })
  }
  if (!db.rows('capabilityOperationInvocations').some((row) =>
    row.invocationRef === nextInvocationRef)) {
    db.seed('capabilityOperationInvocations', {
      _id: `authority-invocation:${nextInvocationRef}`,
      invocationRef: nextInvocationRef,
      principalId: principalRef,
      ownerId,
      credentialId,
      applicationRef: 'application:test-money',
      operationRef,
      idempotencyKey: `idempotency:${nextInvocationRef}`,
      environment: 'production',
      grantRef,
      grantGeneration: generation,
      policyDigest: 'sha256:policy-money',
      grantExpiresAt: expiresAt,
      inputDigest,
      requestDigest: `sha256:request:${nextInvocationRef}`,
      state: 'completed',
      createdAt: now,
      updatedAt: now,
    })
  }
}

export function seedInvocation(db: MemoryDb): void {
  db.seed('capabilityOperationInvocations', {
    _id: 'invocation:money',
    invocationRef,
    principalId,
    ownerId: 'owner:test-money',
    credentialId,
    applicationRef: 'application:test-money',
    environment: 'sandbox',
    state: 'pending',
    operationRef: 'operation:money',
    idempotencyKey: 'idempotency:money',
    inputDigest,
    requestDigest: 'sha256:request-money',
    grantRef: 'grant:money',
    grantGeneration: 1,
    policyDigest: 'sha256:policy-money',
    grantExpiresAt: now + 60_000,
    createdAt: now,
    updatedAt: now,
  })
}

export function seedCurrentMoneyInvocationAuthority(
  db: MemoryDb,
  lifecycle: 'active' | 'revoked' = 'active',
): void {
  seedInvocation(db)
  const invocation = db.rows('capabilityOperationInvocations')[0]
  if (invocation === undefined) throw new Error('invocation_fixture_missing')
  invocation.attemptRef = attemptRef
  invocation.grantExpiresAt = 8_000_000_000_000
  db.seed('agentAccessPrincipals', {
    _id: 'authority:agent-principal',
    principalId,
    ownerId,
    credentialId,
    applicationRef: 'application:test-money',
    environment: 'sandbox',
    scopes: ['market_operations:invoke'],
    authorityMode: 'bounded_mandate',
    grantGeneration: 1,
    policyDigest: 'sha256:policy-money',
    lifecycle: 'active',
    expiresAt: 8_000_000_000_000,
    recordedAt: now,
    lastSeenAt: now,
  })
  db.seed('principals', {
    _id: 'authority:principal',
    principalRef: principalId,
    kind: 'agent',
    displayName: 'Money authority agent',
    lifecycle: 'active',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  db.seed('accounts', {
    _id: 'authority:account',
    accountRef: ownerId,
    displayName: 'Money authority account',
    lifecycle: 'active',
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: principalId,
    creationIdempotencyRef: 'create:money-authority',
    initialOwnershipRef: 'ownership:money-authority',
    currentOwnershipRef: 'ownership:money-authority',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    lastAction: {
      actorPrincipalRef: principalId,
      activeAccountRef: ownerId,
      correlationRef: 'create:money-authority',
      idempotencyRef: 'create:money-authority',
    },
  })
  db.seed('agentAccessGrants', {
    _id: 'authority:grant',
    format: 'ae.agent-access-grant:v1',
    grantRef: 'grant:money',
    principalId,
    ownerId,
    applicationRef: 'application:test-money',
    credentialId,
    environment: 'sandbox',
    operationAccess: 'all_admitted',
    authorityMode: 'bounded_mandate',
    policy: {},
    budgetPolicyRef: 'budget:test-money',
    ratePolicyRef: 'rate:test-money',
    lifecycle,
    generation: 1,
    policyDigest: 'sha256:policy-money',
    createdAt: now,
    updatedAt: now,
    expiresAt: 8_000_000_000_000,
  })
  db.seed('externalIdentityBindings', {
    _id: 'authority:identity-binding',
    bindingRef: 'binding:money',
    principalRef: principalId,
    providerNamespace: 'clerk/api-key',
    providerIdentifier: credentialId,
    providerState: { kind: 'known', value: 'active' },
    lifecycle: 'active',
    credentialGeneration: 1,
    bindIdempotencyRef: 'bind:money',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  db.seed('credentials', {
    _id: 'authority:credential',
    credentialRef: 'credential-ref:money',
    bindingRef: 'binding:money',
    principalRef: principalId,
    type: 'api_key',
    lifecycle: 'active',
    generation: 1,
    issueIdempotencyRef: 'issue:money',
    revision: 1,
    issuedAt: now,
    expiresAt: 8_000_000_000_000,
    updatedAt: now,
  })
  db.seed('memberships', {
    _id: 'authority:membership',
    membershipRef: 'membership:money',
    accountRef: ownerId,
    memberPrincipalRef: principalId,
    lifecycle: 'active',
    revision: 1,
    createdAt: now,
    createdBy: {
      actorPrincipalRef: principalId,
      activeAccountRef: ownerId,
      correlationRef: 'membership:money',
      idempotencyRef: 'membership:money',
    },
  })
  db.seed('authorityDelegationGrants', {
    _id: 'authority:delegation-grant',
    grantRef: 'grant:money',
    accountRef: ownerId,
    actorPrincipalRef: principalId,
    subjectPrincipalRef: principalId,
    scopes: ['market_operations:invoke'],
    resourceRefs: ['operation:money'],
    budgetLimit: 1_000,
    budgetUsed: 0,
    expiresAt: 8_000_000_000_000,
    generation: 1,
    revision: 1,
    lifecycle,
    createdAt: now,
    createdBy: {
      actorPrincipalRef: principalId,
      activeAccountRef: ownerId,
      correlationRef: 'grant:money',
      idempotencyRef: 'grant:money',
    },
  })
}

export function seedBudget(db: MemoryDb): void {
  const base = {
    principalId,
    credentialId,
    budgetPolicyRef: 'budget:test-money',
    environment: 'sandbox',
    generation: 1,
    currency: 'USD',
    exponent: 2,
    settledUnits: '0',
    reservedUnits: '100',
    reservedCount: 0,
    version: 1,
    updatedAt: now,
  }
  db.seed('moneyCredentialBudgetStates', {
    ...base,
    _id: 'budget:day',
    windowKind: 'day',
    windowStart: '1970-01-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...base,
    _id: 'budget:month',
    windowKind: 'month',
    windowStart: '1970-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...base,
    _id: 'budget:concurrency',
    windowKind: 'concurrency',
    windowStart: 'all',
    reservedUnits: '0',
    reservedCount: 1,
  })
}

export function seedAuthorizationFixture(db: MemoryDb): void {
  db.seed('capabilityOperationInvocations', {
    _id: 'authorization:invocation',
    invocationRef,
    principalId,
    ownerId: 'owner:test-money',
    credentialId,
    applicationRef: 'application:test-money',
    environment: 'sandbox',
    state: 'pending',
    operationRef: authorizationOperationRef,
    idempotencyKey: 'idempotency:money',
    inputDigest,
    requestDigest: canonicalDigest({
      operationRef: authorizationOperationRef,
      input,
    } as never),
    grantRef: 'grant:money',
    grantGeneration: 1,
    policyDigest: 'sha256:policy-money',
    grantExpiresAt: now + 60_000,
    operationJson: JSON.stringify(authorizationOperation),
    inputJson: JSON.stringify(input),
    authority: authorizationAuthority,
    attemptRef,
    createdAt: now,
    updatedAt: now,
  })
  db.seed('agentAccessPrincipals', {
    _id: 'authorization:principal',
    principalId,
    ownerId: 'owner:test-money',
    credentialId,
    applicationRef: 'application:test-money',
    environment: 'sandbox',
    scopes: ['market_operations:invoke'],
    authorityMode: 'approve_each',
    grantGeneration: 1,
    policyDigest: 'sha256:policy-money',
    lifecycle: 'active',
    expiresAt: now + 60_000,
    recordedAt: now,
    lastSeenAt: now,
  })
  db.seed('capabilityOfferings', {
    _id: 'offering:money',
    offeringId: 'offering:money',
    businessId: 'business:money',
    status: 'active',
    presentation: { price: { kind: 'fixed', amount: authorizationAmount } },
  })
  db.seed('agentAccessGrants', {
    _id: 'grant:money',
    grantRef: 'grant:money',
    principalId,
    ownerId: 'owner:test-money',
    applicationRef: 'application:test-money',
    credentialId,
    lifecycle: 'active',
    environment: 'sandbox',
    authorityMode: 'approve_each',
    generation: 1,
    policyDigest: 'sha256:policy-money',
    budgetPolicyRef: 'budget:test-money',
    expiresAt: now + 60_000,
    policy: {
      format: 'ae.agent-access-policy:v1',
      operationAccess: 'all_admitted',
      rate: {
        ratePolicyRef: 'rate:test-money',
        generation: 1,
        maximumCallsPerMinute: 10,
        maximumCallsPerHour: 100,
      },
      budget: {
        budgetPolicyRef: 'budget:test-money',
        currency: 'USD',
        exponent: 2,
        generation: 1,
        maximumSpendPerInvocation: authorizationMaximumSpend,
        maximumDailySpend: { currency: 'USD', units: '1000', exponent: 2 },
        maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
        maximumConcurrentInvocations: 2,
      },
    },
  })
  const leaseOwner = `operation-worker:${invocationRef}`
  const canonicalAuthorityBinding = {
    reference: authorizationAuthority.reference,
    invocationRef,
    actor: { callerRef: credentialId, principalRef: principalId },
    origin: { kind: 'standalone' as const, callerRef: credentialId, principalRef: principalId },
    invocationVersion: 1,
    actionId: authorizationOperation.operationId,
    contractVersion: authorizationDescriptor.version,
    digest: authorizationAuthority.decisionDigest,
    targetDigest: authorizationAuthority.targetDigest,
    consequence: authorizationAuthority.consequence,
    limits: authorizationAuthority.limits,
    expiresAt: authorizationAuthority.expiresAt,
    acceptedBasis: authorizationBasis,
  }
  db.seed('actionInvocationControls', {
    _id: 'authorization:control',
    invocationRef,
    invocationVersion: 1,
    sourceRef: `operation-invocation-source:${invocationRef}`,
    preparedMaterialDigest: inputDigest,
    preparedTargetDigest: authorizationAuthority.targetDigest,
    consequence: authorizationAuthority.consequence,
    dataLimitSummary: authorizationAuthority.limits,
    authorityReference: authorizationAuthority.reference,
    authorityBinding: canonicalAuthorityBinding,
    authorityDecisionAt: authorizationExpiresAt,
    currentAttemptRef: attemptRef,
    currentEffectGeneration: 1,
    currentLeaseOwner: leaseOwner,
    currentLeaseExpiresAt: authorizationExpiresAt,
    updatedAt: authorizationExpiresAt,
    control: {
      invocationRef,
      invocationVersion: 1,
      origin: { kind: 'standalone' as const, callerRef: credentialId, principalRef: principalId },
      owner: { callerRef: credentialId, principalRef: principalId },
      action: {
        id: authorizationOperation.operationId,
        contractVersion: authorizationDescriptor.version,
      },
      desired: { state: 'invoke' as const },
      authority: {
        reference: authorizationAuthority.reference,
        expiresAt: authorizationAuthority.expiresAt,
      },
      acceptedAuthority: authorizationBasis,
      freshness: { state: 'current' as const, observedAt: authorizationExpiresAt },
      control: {
        state: 'leased' as const,
        attemptRef,
        leaseOwner,
        effectGeneration: 1,
        leaseExpiresAt: authorizationExpiresAt,
        release: 'not_started' as const,
      },
    },
  })
  db.seed('actionInvocationAttempts', {
    _id: 'authorization:attempt',
    invocationRef,
    attemptRef,
    attemptNumber: 1,
    effectGeneration: 1,
    actor: { callerRef: credentialId, principalRef: principalId },
    idempotency: {
      operationKey: authorizationOperationRef,
      materialInputDigest: inputDigest,
      effectIdentity: canonicalDigest({
        actionId: authorizationOperation.operationId,
        operationKey: authorizationOperationRef,
        materialInputDigest: inputDigest,
      } as never),
    },
    lease: { owner: leaseOwner, expiresAt: authorizationExpiresAt },
    release: { state: 'not_released' as const },
    outcome: { state: 'running' as const },
    recordedAt: authorizationExpiresAt,
  })
  const account = (row: Record<string, unknown> & { _id: string }): void =>
    db.seed('moneyAccounts', {
      state: 'active',
      currency: 'USD',
      exponent: 2,
      version: 1,
      heldUnits: '0',
      createdAt: now,
      recoveryDueUnits: '0',
      updatedAt: now,
      ...row,
    })
  account({
    _id: 'authorization:operator',
    accountRef: accountRefForOwner(ownerId, 'USD'),
    accountKind: 'operator_credit',
    accountId: ownerId,
    balanceUnits: '1000',
  })
  account({
    _id: 'authorization:provider',
    accountRef: accountRefForProvider('business:money', 'USD'),
    accountKind: 'provider_earnings',
    businessId: 'business:money',
    balanceUnits: '0',
  })
  account({
    _id: 'authorization:rake',
    accountRef: accountRefForRake('USD'),
    accountKind: 'ae_rake',
    balanceUnits: '0',
  })
  const state = {
    principalId,
    credentialId,
    budgetPolicyRef: 'budget:test-money',
    environment: 'sandbox',
    generation: 1,
    currency: 'USD',
    exponent: 2,
    settledUnits: '0',
    reservedUnits: '0',
    reservedCount: 0,
    version: 1,
    updatedAt: now,
  }
  db.seed('moneyCredentialBudgetStates', {
    ...state,
    _id: 'authorization:day',
    windowKind: 'day',
    windowStart: '1970-01-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...state,
    _id: 'authorization:month',
    windowKind: 'month',
    windowStart: '1970-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...state,
    _id: 'authorization:concurrency',
    windowKind: 'concurrency',
    windowStart: 'all',
  })
}

export function seedPaidAuthorizationFixture(db: MemoryDb): Record<string, unknown> {
  seedAuthorizationFixture(db)
  const amount = { currency: 'USD', units: '100', exponent: 2 }
  const priceDigest = canonicalDigest({
    version: 'pricing:v2',
    unit: 'call',
    paidAmount: amount,
  })
  const pricingConfig = {
    version: 'pricing:v2' as const,
    unit: 'call' as const,
    paidAmount: amount,
  }
  const identity = {
    ...authorizationOperation.identity,
    price: { kind: 'fixed' as const, amount },
    priceDigest,
    pricingConfig,
  }
  const operation = {
    ...authorizationOperation,
    materialDigest: canonicalDigest(identity as never),
    identity,
    priceDigest,
    pricingConfig,
    offering: {
      ...authorizationOperation.offering,
      presentation: {
        ...authorizationOperation.offering.presentation,
        price: { kind: 'fixed' as const, amount },
      },
    },
  } as PublishedOperation
  const descriptor = materializeRuntimePublishedOperation(operation)
  const authorityMaterial = {
    ...authorizationAuthorityMaterial,
    targetDigest: canonicalDigest(operation.identity as never),
    consequence: descriptor.consequenceClass,
    limits: { amount },
  }
  const authority = {
    ...authorityMaterial,
    decisionDigest: canonicalDigest(authorityMaterial as never),
  }
  const invocation = db.rows('capabilityOperationInvocations').find(
    (row) => row._id === 'authorization:invocation',
  )
  const offering = db.rows('capabilityOfferings').find(
    (row) => row._id === 'offering:money',
  )
  const grant = db.rows('agentAccessGrants').find(
    (row) => row._id === 'grant:money',
  )
  const control = db.rows('actionInvocationControls').find(
    (row) => row._id === 'authorization:control',
  )
  if (invocation === undefined || offering === undefined || grant === undefined || control === undefined)
    throw new Error('paid_authorization_fixture_missing')
  invocation.operationJson = JSON.stringify(operation)
  invocation.authority = authority
  const offeringPresentation = offering.presentation as Record<string, unknown>
  offeringPresentation.price = { kind: 'fixed', amount }
  const policy = grant.policy as Record<string, unknown>
  const budget = policy.budget as Record<string, unknown>
  budget.maximumSpendPerInvocation = amount
  const authorityBinding = control.authorityBinding as Record<string, unknown>
  Object.assign(authorityBinding, {
    contractVersion: descriptor.version,
    digest: authority.decisionDigest,
    targetDigest: authority.targetDigest,
    consequence: authority.consequence,
    limits: authority.limits,
  })
  const controlValue = control.control as Record<string, unknown>
  controlValue.action = {
    id: authorizationOperation.operationId,
    contractVersion: descriptor.version,
  }
  controlValue.acceptedAuthority = authority.acceptedBasis
  controlValue.authority = {
    reference: authority.reference,
    expiresAt: authority.expiresAt,
  }
  control.preparedTargetDigest = authority.targetDigest
  return {
    ...authorizationArgs(),
    amount,
    authorityMaximumSpend: amount,
    priceDigest,
    priceSourceDigest: priceDigest,
    sourceDigest: operation.materialDigest,
    expectedAccountVersion: 1,
  }
}


export function seedPaidCharge(
  db: MemoryDb,
  state: 'applied' | 'outcome_unknown' = 'applied',
): void {
  db.seed('moneyUsageEvents', {
    _id: 'usage:money',
    usageRef: `${invocationRef}:usage`,
    principalId,
    accountId: ownerId,
    credentialId,
    currency: 'USD',
    exponent: 2,
    serviceRef: 'service:money',
    offeringRef: 'offering:money',
    businessId: 'business:money',
    invocationRef,
    attemptRef,
    operationKey: 'operation:money',
    priceDigest: sourceDigest,
    chargeState: 'paid',
    amountUnits: '100',
    transactionRef,
    observedAt: now,
  })
  db.seed('moneyTransactions', {
    _id: 'transaction:charge',
    transactionRef,
    kind: 'charge',
    idempotencyKey: transactionRef,
    inputDigest,
    principalId,
    accountId: ownerId,
    currency: 'USD',
    credentialId,
    budgetPolicyRef: 'budget:test-money',
    budgetGeneration: 1,
    budgetEnvironment: 'sandbox',
    budgetDayStart: '1970-01-01',
    budgetMonthStart: '1970-01',
    budgetState: 'reserved',
    amountUnits: '100',
    exponent: 2,
    state,
    expectedAccountVersion: 1,
    createdAt: now,
    updatedAt: now,
  })
  const account = (row: Record<string, unknown> & { _id: string }): void =>
    db.seed('moneyAccounts', {
      state: 'active',
      currency: 'USD',
      exponent: 2,
      version: 1,
      heldUnits: '0',
      createdAt: now,
      recoveryDueUnits: '0',
      updatedAt: now,
      ...row,
    })
  account({
    _id: 'account:operator',
    accountRef: accountRefForOwner(ownerId, 'USD'),
    accountKind: 'operator_credit',
    accountId: ownerId,
    balanceUnits: '0',
  })
  account({
    _id: 'account:provider',
    accountRef: accountRefForProvider('business:money', 'USD'),
    accountKind: 'provider_earnings',
    businessId: 'business:money',
    balanceUnits: '99',
  })
  account({
    _id: 'account:rake',
    accountRef: accountRefForRake('USD'),
    accountKind: 'ae_rake',
    balanceUnits: '1',
  })
  const entry = (row: Record<string, unknown> & { _id: string }): void =>
    db.seed('moneyLedgerEntries', {
      transactionRef,
      idempotencyKey: transactionRef,
      sourceDigest,
      evidenceRefs: ['evidence:money'],
      createdAt: now,
      ...row,
    })
  entry({
    _id: 'entry:charge',
    entryRef: `${transactionRef}:charge`,
    accountRef: accountRefForOwner(ownerId, 'USD'),
    entryType: 'charge',
    direction: 'debit',
    amountUnits: '100',
    currency: 'USD',
    exponent: 2,
    principalId,
    invocationRef,
    attemptRef,
  })
  entry({
    _id: 'entry:provider',
    entryRef: `${transactionRef}:provider`,
    accountRef: accountRefForProvider('business:money', 'USD'),
    entryType: 'payout_accrual',
    direction: 'credit',
    amountUnits: '99',
    currency: 'USD',
    exponent: 2,
    businessId: 'business:money',
    invocationRef,
    attemptRef,
  })
  entry({
    _id: 'entry:rake',
    entryRef: `${transactionRef}:rake`,
    accountRef: accountRefForRake('USD'),
    entryType: 'rake',
    direction: 'credit',
    amountUnits: '1',
    currency: 'USD',
    exponent: 2,
    businessId: 'business:money',
  })
}
export function settleSeededChargeBudget(
  db: MemoryDb,
  originalCredentialId = credentialId,
  usageCredentialId = originalCredentialId,
  withSettledAt = false,
): void {
  seedCanonicalQualifiedUseAuthority(db)
  const transaction = db
    .rows('moneyTransactions')
    .find((row) => row._id === 'transaction:charge')
  if (transaction === undefined) throw new Error('charge_fixture_missing')
  transaction.credentialId = originalCredentialId
  transaction.budgetState = 'settled'
  transaction.budgetEnvironment = 'production'
  if (withSettledAt) transaction.settledAt = now
  transaction.state = 'applied'
  for (const row of db.rows('moneyCredentialBudgetStates')) {
    row.environment = 'production'
    row.credentialId = originalCredentialId
    row.settledUnits = row.windowKind === 'concurrency' ? '0' : '100'
    row.reservedUnits = '0'
    row.reservedCount = 0
  }
  const usage = db.rows('moneyUsageEvents').find((row) => row._id === 'usage:money')
  if (usage === undefined) throw new Error('usage_fixture_missing')
  usage.credentialId = usageCredentialId
}

export function seedCanonicalFreeTierCharge(db: MemoryDb): FreeTierFixture {
  const fixture = {
    invocationRef: 'operation-invocation:free-tier',
    attemptRef: 'operation-attempt:free-tier:1',
    transactionRef: 'operation-money:free-tier:1',
    usageRef: 'operation-invocation:free-tier:usage',
    principalId: 'prn_44444444444444444444444444444444',
    businessId: 'business:free-tier',
    operationRef: 'operation:free-tier',
  }
  seedCanonicalQualifiedUseAuthority(db, fixture.invocationRef, {
    principalRef: fixture.principalId,
    operationRef: fixture.operationRef,
  })
  db.seed('moneyTransactions', {
    _id: 'transaction:free-tier',
    transactionRef: fixture.transactionRef,
    kind: 'charge',
    idempotencyKey: fixture.transactionRef,
    inputDigest: 'sha256:free-tier-input',
    principalId: fixture.principalId,
    accountId: 'owner:free-tier',
    currency: 'USD',
    credentialId: 'credential:free-tier',
    budgetPolicyRef: 'budget:free-tier',
    budgetGeneration: 1,
    budgetEnvironment: 'production',
    budgetDayStart: '1970-01-01',
    budgetMonthStart: '1970-01',
    budgetState: 'settled',
    amountUnits: '0',
    exponent: 2,
    state: 'applied',
    expectedAccountVersion: 1,
    createdAt: now,
    updatedAt: now,
  })
  db.seed('moneyUsageEvents', {
    _id: 'usage:free-tier',
    usageRef: fixture.usageRef,
    principalId: fixture.principalId,
    accountId: 'owner:free-tier',
    credentialId: 'credential:free-tier',
    currency: 'USD',
    exponent: 2,
    serviceRef: 'service:free-tier',
    offeringRef: 'offering:free-tier',
    businessId: fixture.businessId,
    invocationRef: fixture.invocationRef,
    attemptRef: fixture.attemptRef,
    operationKey: fixture.operationRef,
    priceDigest: 'sha256:free-tier-price',
    chargeState: 'free_tier',
    amountUnits: '0',
    transactionRef: fixture.transactionRef,
    observedAt: now,
  })
  return fixture
}


export function seedDailyAllocationComposition(
  db: MemoryDb,
  count = 1_000,
): string {
  const periodStart = '1970-01-01T00:00:00.000Z'
  const periodEnd = '1970-01-02T00:00:00.000Z'
  const payoutRef = canonicalDigest({
    format: 'money-daily-payout:v1',
    businessId: 'business:money',
    currency: 'USD',
    periodStart,
    periodEnd,
  })
  db.seed('moneyPayouts', {
    _id: 'payout:allocation-limit',
    payoutRef,
    businessId: 'business:money',
    owningAccountRef: canonicalQualifiedUseAccountRef,
    authorityPrincipalRef: principalId,
    authorityGrantRef: canonicalQualifiedUseGrantRef,
    authorityGrantGeneration: 1,
    authorityResourceRefs: ['operation:money'],
    currency: 'USD',
    exponent: 2,
    grossAccrualUnits: String(count * 100),
    rakeUnits: String(count),
    providerNetUnits: String(count * 99),
    minimumPayoutUnits: '0',
    cadence: 'daily',
    state: 'held_threshold',
    periodStart,
    periodEnd,
    providerAccountRef: accountRefForProvider('business:money', 'USD'),
    idempotencyKey: payoutRef,
    createdAt: now,
    updatedAt: now,
  })
  for (let index = 0; index < count; index += 1) {
    const qualifiedUseRef = `qualified-use:allocation-limit:${index}`
    const materialDigest = `sha256:allocation-limit-material:${index}`
    db.seed('moneyPayoutAllocations', {
      _id: `allocation:limit:${index}`,
      allocationRef: canonicalDigest({
        format: 'money-qualified-use-allocation:v1',
        qualifiedUseRef,
        materialDigest,
      }),
      payoutRef,
      qualifiedUseRef,
      transactionRef: `transaction:allocation-limit:${index}`,
      usageRef: `usage:allocation-limit:${index}`,
      businessId: 'business:money',
      owningAccountRef: canonicalQualifiedUseAccountRef,
      authorityPrincipalRef: principalId,
      authorityGrantRef: canonicalQualifiedUseGrantRef,
      authorityGrantGeneration: 1,
      authorityResourceRef: 'operation:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      qualifiedAt: now,
      sourceDigest: 'sha256:allocation-limit-source',
      materialDigest,
      createdAt: now,
    })
  }
  return payoutRef
}

export function seedSecondPaidCharge(
  db: MemoryDb,
  nextInvocationRef: string,
  nextAttemptRef: string,
  nextTransactionRef: string,
  observedAt: number,
): void {
  seedCanonicalQualifiedUseAuthority(db, nextInvocationRef)
  const usage = db.rows('moneyUsageEvents').find((row) => row._id === 'usage:money')
  const transaction = db.rows('moneyTransactions').find(
    (row) => row._id === 'transaction:charge',
  )
  if (usage === undefined || transaction === undefined)
    throw new Error('charge_fixture_missing')
  const currentTransactionRef = String(transaction.transactionRef)
  const currentInvocationRef = String(usage.invocationRef)
  const currentAttemptRef = String(usage.attemptRef)
  const entries = db.rows('moneyLedgerEntries').filter(
    (row) => row.transactionRef === currentTransactionRef,
  )
  db.seed('moneyTransactions', {
    ...transaction,
    _id: 'transaction:charge-second',
    transactionRef: nextTransactionRef,
    idempotencyKey: nextTransactionRef,
    state: 'applied',
    budgetState: 'settled',
    settledAt: observedAt,
    createdAt: observedAt,
    updatedAt: observedAt,
  })
  db.seed('moneyUsageEvents', {
    ...usage,
    _id: 'usage:money-second',
    usageRef: `${nextInvocationRef}:usage`,
    invocationRef: nextInvocationRef,
    attemptRef: nextAttemptRef,
    transactionRef: nextTransactionRef,
    observedAt,
  })
  for (const entry of entries) {
    db.seed('moneyLedgerEntries', {
      ...entry,
      _id: `${String(entry._id)}:second`,
      entryRef: String(entry.entryRef).replace(
        currentTransactionRef,
        nextTransactionRef,
      ),
      transactionRef: nextTransactionRef,
      idempotencyKey: nextTransactionRef,
      invocationRef:
        entry.invocationRef === currentInvocationRef
          ? nextInvocationRef
          : entry.invocationRef,
      attemptRef:
        entry.attemptRef === currentAttemptRef
          ? nextAttemptRef
          : entry.attemptRef,
      createdAt: observedAt,
    })
  }
}
export function seedProviderRefundCorrection(
  db: MemoryDb,
  allocation: Row,
  overrides: Record<string, unknown> = {},
  linked = true,
  suffix = 'one',
): void {
  db.seed('moneyLedgerEntries', {
    _id: `entry:provider-refund-correction:${suffix}`,
    entryRef: `transaction:provider-refund-correction:${suffix}:provider`,
    accountRef: accountRefForProvider('business:money', 'USD'),
    entryType: 'refund',
    direction: 'debit',
    amountUnits: allocation.providerNetUnits,
    currency: 'USD',
    exponent: 2,
    transactionRef: `transaction:provider-refund-correction:${suffix}`,
    idempotencyKey: `transaction:provider-refund-correction:${suffix}`,
    businessId: 'business:money',
    sourceDigest: 'sha256:provider-refund-correction',
    evidenceRefs: ['evidence:provider-refund-correction'],
    reversalOf: allocation.transactionRef,
    createdAt: now + 1,
    ...(linked
      ? {
          payoutRef: allocation.payoutRef,
          allocationRef: allocation.allocationRef,
          allocationCorrectionUnits: allocation.providerNetUnits,
        }
      : {}),
    ...overrides,
  })
}
export function rebindSeededCharge(
  db: MemoryDb,
  nextInvocationRef: string,
  nextAttemptRef: string,
  nextTransactionRef: string,
  observedAt: number,
): void {
  seedSecondPaidCharge(
    db,
    nextInvocationRef,
    nextAttemptRef,
    nextTransactionRef,
    observedAt,
  )
}

export function seedDisputeFixture(
  db: MemoryDb,
  originalCredentialId: string,
  usageCredentialId: string,
): void {
  seedBudget(db)
  seedPaidCharge(db)
  settleSeededChargeBudget(db, originalCredentialId, usageCredentialId, true)
  const qualifiedIdentity = {
    invocationRef,
    attemptRef,
    effectGeneration: 1,
  }
  const qualifiedMaterial = {
    ...qualifiedIdentity,
    businessId: 'business:money',
    operationRef: 'operation:money',
    publicationRef: 'publication:money',
    publicationRevision: 1,
    contractDigest: 'sha256:contract',
    bindingDigest: 'sha256:binding',
    principalClass: 'agent_key',
    requestDigest: 'sha256:request',
    responseDigest: 'sha256:response',
    evidenceRefs: ['evidence:qualified'],
  } as const
  const qualifiedRef = qualifiedUseRef(qualifiedIdentity)
  db.seed('qualifiedUseReceipts', {
    _id: 'receipt:money',
    qualifiedUseRef: qualifiedRef,
    materialDigest: qualifiedUseMaterialDigest(qualifiedMaterial),
    ...qualifiedMaterial,
    environment: 'production',
    qualifiedAt: now,
    usageRef: `${invocationRef}:usage`,
    transactionRef,
  })
  const payoutRef = canonicalDigest({
    format: 'money-payout-period:v1',
    businessId: 'business:money',
    currency: 'USD',
    periodStart: '1970-01-01',
    periodEnd: '1970-01-31',
  })
  db.seed('moneyPayouts', {
    _id: 'payout:dispute',
    payoutRef,
    businessId: 'business:money',
    currency: 'USD',
    exponent: 2,
    grossAccrualUnits: '100',
    rakeUnits: '1',
    providerNetUnits: '99',
    minimumPayoutUnits: '0',
    state: 'held_threshold',
    periodStart: '1970-01-01',
    periodEnd: '1970-01-31',
    providerAccountRef: accountRefForProvider('business:money', 'USD'),
    idempotencyKey: payoutRef,
    createdAt: now,
    updatedAt: now,
  })
}
