import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createSellerOnboardingCanaryCommitment,
  projectSellerOnboardingCanaryStatus,
  sellerOnboardingCanaryExecutionEnvelope,
  type SellerOnboardingCanaryInvocationObservation,
} from '@/modules/capability-supply/public'

const NOW = 1_900_000_000_000
const digest = (value: string) => canonicalDigest(value)
const amount = { currency: 'USDC', units: '1000', exponent: 6 } as const

function commitment() {
  return createSellerOnboardingCanaryCommitment({
    ownerId: 'account:owner-1',
    businessId: 'business:seller-1',
    offeringRef: 'offering:seller-1',
    offeringRevision: 3,
    offeringSourceHash: digest('offering'),
    accessPathRef: 'access-path:seller-1',
    accessPathSourceHash: digest('access-path'),
    publicationRef: 'publication:seller-1',
    publicationRevision: 2,
    draftOperationRef: 'draft-operation:seller-1:lookup',
    toolMaterialDigest: digest('operation'),
    contractDigest: digest('contract'),
    bindingDigest: digest('binding'),
    priceDigest: digest('price'),
    sellerPayTo: `0x${'1'.repeat(40)}`,
    sellerClaimDigest: digest('seller-claim'),
    readinessDigest: digest('readiness'),
    readinessObservedAt: NOW - 1_000,
    readinessValidUntil: NOW + 60_000,
    expectedOutputSchemaDigest: digest('output-schema'),
    expectedOutputEvidenceDigest: digest('output-evidence'),
    inputDigest: digest('input'),
    idempotencyKey: 'seller-onboarding:lookup:v1',
    fundingBudgetRef: 'ae-canary-budget:base-usdc:2026-08',
    fundingPrincipalId: 'principal:ae-canary',
    fundingOwnerId: 'account:agentic-economy',
    fundingCredentialId: 'credential:ae-canary',
    fundingApplicationRef: 'agentic-economy:seller-onboarding-canary',
    fundingGrantRef: 'grant:ae-canary',
    fundingGrantGeneration: 1,
    fundingPolicyDigest: digest('funding-policy'),
    requestedSpend: amount,
    maximumSpend: { ...amount, units: '2500' },
    expiresAt: NOW + 60_000,
    now: NOW,
  })
}

function commitmentInput() {
  const base = commitment()
  return {
    ownerId: base.ownerId,
    businessId: base.businessId,
    offeringRef: base.offeringRef,
    offeringRevision: base.offeringRevision,
    offeringSourceHash: base.offeringSourceHash,
    accessPathRef: base.accessPathRef,
    accessPathSourceHash: base.accessPathSourceHash,
    publicationRef: base.publicationRef,
    publicationRevision: base.publicationRevision,
    draftOperationRef: base.draftOperationRef,
    toolMaterialDigest: base.toolMaterialDigest,
    contractDigest: base.contractDigest,
    bindingDigest: base.bindingDigest,
    priceDigest: base.priceDigest,
    sellerPayTo: base.sellerPayTo,
    sellerClaimDigest: base.sellerClaimDigest,
    readinessDigest: base.readinessDigest,
    readinessObservedAt: base.readinessObservedAt,
    readinessValidUntil: base.readinessValidUntil,
    expectedOutputSchemaDigest: base.expectedOutputSchemaDigest,
    expectedOutputEvidenceDigest: base.expectedOutputEvidenceDigest,
    inputDigest: base.inputDigest,
    idempotencyKey: base.idempotencyKey,
    fundingBudgetRef: base.funding.budgetRef,
    fundingPrincipalId: base.funding.principalId,
    fundingOwnerId: base.funding.ownerId,
    fundingCredentialId: base.funding.credentialId,
    fundingApplicationRef: base.funding.applicationRef,
    fundingGrantRef: base.funding.grantRef,
    fundingGrantGeneration: base.funding.grantGeneration,
    fundingPolicyDigest: base.funding.policyDigest,
    requestedSpend: base.funding.requestedSpend,
    maximumSpend: base.funding.maximumSpend,
    expiresAt: base.expiresAt,
    now: NOW,
  }
}

function current(candidate = commitment()) {
  return {
    draftOperationRef: candidate.draftOperationRef,
    toolMaterialDigest: candidate.toolMaterialDigest,
    contractDigest: candidate.contractDigest,
    bindingDigest: candidate.bindingDigest,
    priceDigest: candidate.priceDigest,
  }
}

function completedObservation(candidate = commitment()): SellerOnboardingCanaryInvocationObservation {
  const envelope = sellerOnboardingCanaryExecutionEnvelope(candidate)
  return {
    executionPurpose: 'seller_onboarding_canary',
    canaryRef: candidate.canaryRef,
    canaryCommitmentDigest: candidate.commitmentDigest,
    callRef: envelope.callRef,
    toolRef: candidate.draftOperationRef,
    inputDigest: candidate.inputDigest,
    state: 'completed',
    outputContractValid: true,
    outputUsable: true,
    evidenceHash: digest('output'),
    payment: {
      state: 'settled',
      amount,
      priceDigest: candidate.priceDigest,
      paymentIdentifier: 'payment:1',
      settlementTransactionHash: `0x${'1'.repeat(64)}`,
      externalSettlementRef: `0x${'1'.repeat(64)}`,
    },
  }
}

describe('seller onboarding canary seam', () => {
  it('derives one stable canary and invocation across client retry keys and temporal refreshes', () => {
    const first = commitment()
    const retry = createSellerOnboardingCanaryCommitment({
      ...commitmentInput(),
      idempotencyKey: 'seller-onboarding:lookup:random-retry-key',
      toolMaterialDigest: digest('readiness-refreshed-operation-material'),
      readinessDigest: digest('refreshed-readiness-observation'),
      readinessObservedAt: NOW + 1_000,
      readinessValidUntil: NOW + 120_000,
      expiresAt: NOW + 90_000,
      now: NOW + 1_000,
    })

    expect(retry.canaryRef).toBe(first.canaryRef)
    expect(retry.commitmentDigest).not.toBe(first.commitmentDigest)
    expect(sellerOnboardingCanaryExecutionEnvelope(retry).callRef)
      .toBe(sellerOnboardingCanaryExecutionEnvelope(first).callRef)
  })

  it.each([
    ['publication', { publicationRevision: 3 }],
    ['contract material', { contractDigest: digest('different-contract') }],
    ['price', { priceDigest: digest('different-price') }],
    ['payee', { sellerPayTo: `0x${'2'.repeat(40)}` }],
  ])('derives a new canary when charge %s identity changes', (_label, patch) => {
    const first = commitment()
    const changed = createSellerOnboardingCanaryCommitment({
      ...commitmentInput(),
      ...patch,
    })
    expect(changed.canaryRef).not.toBe(first.canaryRef)
  })

  it('does not let caller input or platform funding rotation define a second charge identity', () => {
    const first = commitment()
    const changed = createSellerOnboardingCanaryCommitment({
      ...commitmentInput(),
      inputDigest: digest('different-input'),
      fundingPrincipalId: 'principal:ae-canary:rotated',
      fundingCredentialId: 'credential:ae-canary:rotated',
      fundingGrantGeneration: 2,
      fundingPolicyDigest: digest('rotated-funding-policy'),
    })

    expect(changed.canaryRef).toBe(first.canaryRef)
    expect(changed.commitmentDigest).not.toBe(first.commitmentDigest)
  })

  it('seals the exact draft, input, price, idempotency, and AE-only funding policy', () => {
    const first = commitment()
    const replay = commitment()
    const envelope = sellerOnboardingCanaryExecutionEnvelope(first)

    expect(replay).toEqual(first)
    expect(envelope).toMatchObject({
      executionPurpose: 'seller_onboarding_canary',
      canaryRef: first.canaryRef,
      canaryCommitmentDigest: first.commitmentDigest,
      toolRef: first.draftOperationRef,
      inputDigest: first.inputDigest,
      idempotencyKey: first.idempotencyKey,
      funding: {
        kind: 'ae_owned',
        ledgerEffects: 'external_spend_only',
      },
      accountingPolicy: {
        recordBuyerUsage: false,
        accrueProviderEarnings: false,
        accruePlatformRake: false,
        recordQualifiedUse: false,
      },
    })
  })

  it('rejects zero, over-budget, and cross-currency funding before an invocation exists', () => {
    const base = commitment()
    const input = {
      ownerId: base.ownerId,
      businessId: base.businessId,
      offeringRef: base.offeringRef,
      offeringRevision: base.offeringRevision,
      offeringSourceHash: base.offeringSourceHash,
      accessPathRef: base.accessPathRef,
      accessPathSourceHash: base.accessPathSourceHash,
      publicationRef: base.publicationRef,
      publicationRevision: base.publicationRevision,
      draftOperationRef: base.draftOperationRef,
      toolMaterialDigest: base.toolMaterialDigest,
      contractDigest: base.contractDigest,
      bindingDigest: base.bindingDigest,
      priceDigest: base.priceDigest,
      sellerPayTo: base.sellerPayTo,
      sellerClaimDigest: base.sellerClaimDigest,
      readinessDigest: base.readinessDigest,
      readinessObservedAt: base.readinessObservedAt,
      readinessValidUntil: base.readinessValidUntil,
      expectedOutputSchemaDigest: base.expectedOutputSchemaDigest,
      expectedOutputEvidenceDigest: base.expectedOutputEvidenceDigest,
      inputDigest: base.inputDigest,
      idempotencyKey: base.idempotencyKey,
      fundingBudgetRef: base.funding.budgetRef,
      fundingPrincipalId: base.funding.principalId,
      fundingOwnerId: base.funding.ownerId,
      fundingCredentialId: base.funding.credentialId,
      fundingApplicationRef: base.funding.applicationRef,
      fundingGrantRef: base.funding.grantRef,
      fundingGrantGeneration: base.funding.grantGeneration,
      fundingPolicyDigest: base.funding.policyDigest,
      expiresAt: base.expiresAt,
      now: NOW,
    }
    expect(() => createSellerOnboardingCanaryCommitment({
      ...input,
      requestedSpend: { ...amount, units: '0' },
      maximumSpend: amount,
    })).toThrow('seller_onboarding_canary_spend_invalid')
    expect(() => createSellerOnboardingCanaryCommitment({
      ...input,
      requestedSpend: { ...amount, units: '2501' },
      maximumSpend: { ...amount, units: '2500' },
    })).toThrow('seller_onboarding_canary_spend_invalid')
    expect(() => createSellerOnboardingCanaryCommitment({
      ...input,
      requestedSpend: amount,
      maximumSpend: { currency: 'USD', units: '2500', exponent: 6 },
    })).toThrow('seller_onboarding_canary_spend_invalid')
    expect(() => createSellerOnboardingCanaryCommitment({
      ...input,
      fundingOwnerId: input.ownerId,
      requestedSpend: amount,
      maximumSpend: amount,
    })).toThrow('seller_onboarding_canary_funding_owner_invalid')
  })

  it('emits promotion evidence only after paid settlement, current contract, and usable output', () => {
    const candidate = commitment()
    const result = projectSellerOnboardingCanaryStatus({
      commitment: candidate,
      observation: completedObservation(candidate),
      currentTool: current(candidate),
      now: NOW + 1_000,
    })

    expect(result.kind).toBe('passed')
    if (result.kind !== 'passed') throw new Error('expected passed canary')
    expect(result.promotionEvidence).toMatchObject({
      canaryRef: candidate.canaryRef,
      canaryCommitmentDigest: candidate.commitmentDigest,
      draftOperationRef: candidate.draftOperationRef,
      toolMaterialDigest: candidate.toolMaterialDigest,
      contractDigest: candidate.contractDigest,
      bindingDigest: candidate.bindingDigest,
      priceDigest: candidate.priceDigest,
      inputDigest: candidate.inputDigest,
      paymentIdentifier: 'payment:1',
    })
    expect(result.promotionEvidence.promotionEvidenceDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it.each([
    ['market purpose', { executionPurpose: 'market_call' as const }, 'canary_identity_mismatch'],
    ['wrong commitment', { canaryCommitmentDigest: digest('attacker') }, 'canary_identity_mismatch'],
    ['unsettled payment', { payment: { ...completedObservation().payment!, state: 'reconciliation_required' as const } }, 'payment_not_settled'],
    ['over budget', { payment: { ...completedObservation().payment!, amount: { ...amount, units: '2501' } } }, 'spend_commitment_mismatch'],
    ['invalid output', { outputContractValid: false }, 'output_contract_invalid'],
    ['unusable output', { outputUsable: false }, 'output_unusable'],
  ])('fails closed for %s', (_label, patch, expectedCode) => {
    const candidate = commitment()
    const result = projectSellerOnboardingCanaryStatus({
      commitment: candidate,
      observation: { ...completedObservation(candidate), ...patch },
      currentTool: current(candidate),
      now: NOW + 1_000,
    })
    expect(result).toMatchObject({ kind: 'failed', code: expectedCode })
  })

  it('cannot promote after any sealed operation commitment changes', () => {
    const candidate = commitment()
    const result = projectSellerOnboardingCanaryStatus({
      commitment: candidate,
      observation: completedObservation(candidate),
      currentTool: { ...current(candidate), contractDigest: digest('changed-contract') },
      now: NOW + 1_000,
    })
    expect(result).toMatchObject({ kind: 'failed', code: 'operation_commitment_stale' })
  })

  it('keeps uncertain settlement out of both pass and failure terminals', () => {
    const candidate = commitment()
    const result = projectSellerOnboardingCanaryStatus({
      commitment: candidate,
      observation: {
        ...completedObservation(candidate),
        state: 'reconciliation_required',
      },
      currentTool: current(candidate),
      now: NOW + 1_000,
    })
    expect(result).toEqual({
      kind: 'reconciliation_required',
      canaryRef: candidate.canaryRef,
      callRef: sellerOnboardingCanaryExecutionEnvelope(candidate).callRef,
    })
  })

  it('retains settled evidence after execution expiry while pending, refused, and cancelled transitions fail safely', () => {
    const candidate = commitment()
    const expiredAt = candidate.expiresAt + 1
    expect(projectSellerOnboardingCanaryStatus({
      commitment: candidate,
      observation: completedObservation(candidate),
      currentTool: current(candidate),
      now: expiredAt,
    })).toMatchObject({ kind: 'passed' })

    for (const state of ['pending', 'refused', 'cancelled'] as const) {
      const observation = { ...completedObservation(candidate), state }
      expect(projectSellerOnboardingCanaryStatus({
        commitment: candidate,
        observation,
        currentTool: current(candidate),
        now: expiredAt,
      })).toMatchObject({
        kind: 'failed',
        code: state === 'pending' ? 'canary_expired' : 'invocation_refused',
      })
    }

    expect(projectSellerOnboardingCanaryStatus({
      commitment: candidate,
      observation: { ...completedObservation(candidate), state: 'reconciliation_required' },
      currentTool: { ...current(candidate), contractDigest: digest('stale') },
      now: expiredAt,
    })).toMatchObject({ kind: 'reconciliation_required' })
  })
})
