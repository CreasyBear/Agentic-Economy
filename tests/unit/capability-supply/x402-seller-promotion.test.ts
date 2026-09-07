import { describe, expect, it } from 'vitest'

import {
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
  type SellerOnboardingCanaryInvocationObservation,
} from '@/modules/capability-execution'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  evaluateX402SellerPromotion,
  sellerCanaryCompletionEvidenceMatches,
  type X402SellerPromotionAnchor,
} from '@/modules/capability-supply/public'

const digest = (value: string) => canonicalDigest({ value })
const amount = { currency: 'USDC', units: '1000', exponent: 6 } as const

const anchor: X402SellerPromotionAnchor = {
  ownerId: 'account:owner',
  businessId: 'business:weather',
  offeringRef: 'offering:weather',
  offeringRevision: 2,
  offeringSourceHash: digest('offering-source'),
  accessPathRef: 'access:weather:x402',
  accessPathSourceHash: digest('access-source'),
  publicationRef: 'publication:weather',
  publicationRevision: 4,
  draftOperationRef: 'operation:weather',
  toolMaterialDigest: digest('operation-material'),
  contractDigest: digest('contract'),
  bindingDigest: digest('binding'),
  priceDigest: digest('price'),
  sellerPayTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
  sellerClaimDigest: digest('seller-claim'),
  readinessDigest: digest('readiness'),
  readinessObservedAt: 100,
  readinessValidUntil: 1_000,
}

function commitment(overrides: Readonly<{ sellerPayTo?: string }> = {}) {
  return createSellerOnboardingCanaryCommitment({
    ownerId: anchor.ownerId,
    businessId: anchor.businessId,
    offeringRef: anchor.offeringRef,
    offeringRevision: anchor.offeringRevision,
    offeringSourceHash: anchor.offeringSourceHash,
    accessPathRef: anchor.accessPathRef,
    accessPathSourceHash: anchor.accessPathSourceHash,
    publicationRef: anchor.publicationRef,
    publicationRevision: anchor.publicationRevision,
    draftOperationRef: anchor.draftOperationRef,
    toolMaterialDigest: anchor.toolMaterialDigest,
    contractDigest: anchor.contractDigest,
    bindingDigest: anchor.bindingDigest,
    priceDigest: anchor.priceDigest,
    sellerPayTo: overrides.sellerPayTo ?? anchor.sellerPayTo,
    sellerClaimDigest: anchor.sellerClaimDigest,
    readinessDigest: anchor.readinessDigest,
    readinessObservedAt: anchor.readinessObservedAt,
    readinessValidUntil: anchor.readinessValidUntil,
    expectedOutputSchemaDigest: digest('output-schema'),
    expectedOutputEvidenceDigest: digest('output-evidence'),
    inputDigest: digest('input'),
    idempotencyKey: 'canary:weather:one',
    fundingBudgetRef: 'budget:canary',
    fundingPrincipalId: 'principal:ae-canary',
    fundingOwnerId: 'account:agentic-economy',
    fundingCredentialId: 'credential:ae-canary',
    fundingApplicationRef: 'agentic-economy:seller-onboarding-canary',
    fundingGrantRef: 'agent-access-grant:platform:seller-onboarding-canary:sandbox:v1',
    fundingGrantGeneration: 1,
    fundingPolicyDigest: digest('funding-policy'),
    requestedSpend: amount,
    maximumSpend: amount,
    expiresAt: 900,
    now: 100,
  })
}

function observation(): SellerOnboardingCanaryInvocationObservation {
  const candidate = commitment()
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
      paymentIdentifier: 'payment:one',
      settlementTransactionHash: '0xsettled',
      externalSettlementRef: 'external:settlement:one',
    },
  }
}

function input(overrides: Partial<Parameters<typeof evaluateX402SellerPromotion>[0]> = {}) {
  return {
    actingOwnerId: anchor.ownerId,
    sealed: anchor,
    current: anchor,
    sellerClaimCurrent: true,
    platformFundingAuthorized: true,
    readinessCurrent: true,
    outputDeterministic: true,
    outputAssertionMatched: true,
    expectedOutputEvidenceDigest: commitment().expectedOutputEvidenceDigest,
    outputDigest: digest('canonical-output'),
    commitment: commitment(),
    observation: observation(),
    now: 500,
    ...overrides,
  }
}

describe('x402 seller Publish promotion policy', () => {
  it.each([
    '0xnot-an-address',
    '0x0000000000000000000000000000000000000000',
  ])('refuses to seal a canary with an unusable EVM seller payee: %s', (sellerPayTo) => {
    expect(() => commitment({ sellerPayTo }))
      .toThrow('seller_onboarding_canary_payee_invalid')
  })

  it('requires every declared completion-evidence pointer to contain a meaningful value', () => {
    const evidence = [
      { outputPointer: '/result/text', purpose: 'completion' as const },
      { outputPointer: '/receipt/ok', purpose: 'completion' as const },
      { outputPointer: '/comparison', purpose: 'comparison' as const },
    ]
    expect(sellerCanaryCompletionEvidenceMatches({
      result: { text: 'usable answer' },
      receipt: { ok: true },
      comparison: '',
    }, evidence)).toBe(true)
    expect(sellerCanaryCompletionEvidenceMatches({
      result: { text: '   ' },
      receipt: { ok: true },
    }, evidence)).toBe(false)
    expect(sellerCanaryCompletionEvidenceMatches({
      result: { text: 'usable answer' },
      receipt: { ok: false },
    }, evidence)).toBe(false)
    expect(sellerCanaryCompletionEvidenceMatches({ result: { text: 'usable answer' } }, [
      { outputPointer: '/result/text', purpose: 'comparison' },
    ])).toBe(false)
  })

  it('resolves canonical escaped object keys and bounded array indexes', () => {
    expect(sellerCanaryCompletionEvidenceMatches({
      'a/b': [{ '~done': 'yes' }],
    }, [{
      outputPointer: '/a~1b/0/~0done',
      purpose: 'completion',
    }])).toBe(true)
    expect(sellerCanaryCompletionEvidenceMatches({
      'a/b': [],
    }, [{
      outputPointer: '/a~1b/0/~0done',
      purpose: 'completion',
    }])).toBe(false)
  })

  it('approves only the exact still-current target of a passed paid canary', () => {
    const result = evaluateX402SellerPromotion(input())

    expect(result).toMatchObject({
      kind: 'approved',
      target: anchor,
      promotionEvidence: {
        canaryRef: commitment().canaryRef,
        draftOperationRef: anchor.draftOperationRef,
        toolMaterialDigest: anchor.toolMaterialDigest,
      },
      consumptionDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
  })

  it('keeps settled evidence promotable after execution expiry when current readiness is fresh and material is unchanged', () => {
    const refreshed = {
      ...anchor,
      toolMaterialDigest: digest('operation-material-with-refreshed-readiness'),
      readinessDigest: digest('refreshed-readiness'),
      readinessObservedAt: 1_100,
      readinessValidUntil: 2_000,
    }

    expect(evaluateX402SellerPromotion(input({
      current: refreshed,
      now: 1_200,
    }))).toMatchObject({
      kind: 'approved',
      target: refreshed,
      promotionEvidence: { canaryRef: commitment().canaryRef },
    })
  })

  it.each([
    ['owner_mismatch', { actingOwnerId: 'account:attacker' }],
    ['seller_claim_stale', { sellerClaimCurrent: false }],
    ['funding_authority_invalid', { platformFundingAuthorized: false }],
    ['readiness_stale', { readinessCurrent: false }],
    ['readiness_stale', { now: anchor.readinessValidUntil }],
    ['output_nondeterministic', { outputDeterministic: false }],
    ['output_nondeterministic', { outputAssertionMatched: false }],
    ['target_drift', { current: { ...anchor, offeringRevision: 3 } }],
    ['target_drift', { current: { ...anchor, accessPathSourceHash: digest('swapped-path') } }],
    ['target_drift', { current: { ...anchor, publicationRevision: 5 } }],
    ['target_drift', { current: { ...anchor, priceDigest: digest('new-price') } }],
  ] as const)('refuses %s without producing consumable promotion evidence', (code, overrides) => {
    expect(evaluateX402SellerPromotion(input(overrides)))
      .toEqual({ kind: 'refused', code })
  })

  it('refuses refunds, uncertain payments, and invalid output through the canonical canary projection', () => {
    const refunded = observation()
    expect(evaluateX402SellerPromotion(input({
      observation: { ...refunded, payment: { ...refunded.payment!, state: 'refunded' } },
    }))).toEqual({ kind: 'refused', code: 'payment_not_settled' })

    expect(evaluateX402SellerPromotion(input({
      observation: { ...observation(), state: 'reconciliation_required' },
    }))).toEqual({ kind: 'refused', code: 'reconciliation_required' })

    expect(evaluateX402SellerPromotion(input({
      observation: { ...observation(), outputContractValid: false },
    }))).toEqual({ kind: 'refused', code: 'output_contract_invalid' })
  })
})
