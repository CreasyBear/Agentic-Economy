import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  BusinessActionCard,
  BusinessActionExternalEvidenceProvider,
  BusinessActionGuardrailDecision,
  BusinessActionGuardrailProvider,
  BusinessActionResultArtifactRequirement,
  ReceiptReconstructionStatus,
} from '@/modules/business-action/public'
import {
  BusinessActionCardDefaults,
  BusinessActionExternalEvidenceProviderValues,
  BusinessActionGuardrailDecisionValues,
  BusinessActionGuardrailProviderValues,
  BusinessActionResultArtifactRequirementValues,
  BusinessActionSlug,
  BusinessActionSlugValues,
  ReceiptReconstructionStatusValues,
} from '@/modules/business-action/public'

describe('business action type contracts', () => {
  it('keeps exported runtime values aligned with exact literal unions', () => {
    expectTypeOf<typeof BusinessActionSlug>().toEqualTypeOf<'provision-paid-intake-endpoint'>()
    expectTypeOf<(typeof BusinessActionSlugValues)[number]>().toEqualTypeOf<typeof BusinessActionSlug>()
    expectTypeOf<(typeof BusinessActionExternalEvidenceProviderValues)[number]>().toEqualTypeOf<BusinessActionExternalEvidenceProvider>()
    expectTypeOf<(typeof BusinessActionGuardrailProviderValues)[number]>().toEqualTypeOf<BusinessActionGuardrailProvider>()
    expectTypeOf<(typeof BusinessActionGuardrailDecisionValues)[number]>().toEqualTypeOf<BusinessActionGuardrailDecision>()
    expectTypeOf<(typeof BusinessActionResultArtifactRequirementValues)[number]>().toEqualTypeOf<BusinessActionResultArtifactRequirement>()
    expectTypeOf<(typeof ReceiptReconstructionStatusValues)[number]>().toEqualTypeOf<ReceiptReconstructionStatus>()
  })

  it('keeps the public card shape proposal-only, owner-approved, and receipt-required', () => {
    const card = {
      id: 'business_action_card:test',
      actionSlug: BusinessActionSlug,
      version: 1,
      sourceHash: 'sha256:test',
      status: 'active',
      publicLabel: 'Provision paid intake endpoint',
      posture: 'proposal_only',
      callable: false,
      paymentRequired: false,
      ownerApprovalRequired: true,
      receiptRequired: true,
      updatedAt: 1,
    } satisfies BusinessActionCard

    expect(card.actionSlug).toBe(BusinessActionSlug)
    expect(BusinessActionCardDefaults.callable).toBe(false)
    expect(BusinessActionCardDefaults.paymentRequired).toBe(false)
  })
})

// @ts-expect-error arbitrary action strings cannot replace the single Phase 6 slug
const invalidActionSlug: typeof BusinessActionSlug = 'executeAction'
void invalidActionSlug

// @ts-expect-error provider "other" is not a valid external evidence provider
const invalidProvider: BusinessActionExternalEvidenceProvider = 'other'
void invalidProvider

// @ts-expect-error cards are never publicly callable
const invalidCallable: Pick<BusinessActionCard, 'callable'> = { callable: true }
void invalidCallable

// @ts-expect-error cards do not advertise a public payment requirement in this source/local contract
const invalidPaymentRequired: Pick<BusinessActionCard, 'paymentRequired'> = { paymentRequired: true }
void invalidPaymentRequired
