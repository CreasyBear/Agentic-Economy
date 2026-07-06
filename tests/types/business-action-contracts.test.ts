import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  BusinessActionCard,
  BusinessActionSlug as BusinessActionSlugType,
  BusinessActionExternalEvidenceProvider,
  BusinessActionGuardrailDecision,
  BusinessActionGuardrailProvider,
  BusinessActionResultArtifactRequirement,
  ReceiptReconstructionStatus,
} from '@/modules/business-action/public'
import {
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
    expectTypeOf<BusinessActionSlugType>().toEqualTypeOf<'provision-paid-intake-endpoint' | 'publish-agent-intake-endpoint' | 'reserve-booking'>()
    expectTypeOf<(typeof BusinessActionSlugValues)[number]>().toEqualTypeOf<BusinessActionSlugType>()
    expectTypeOf<(typeof BusinessActionExternalEvidenceProviderValues)[number]>().toEqualTypeOf<BusinessActionExternalEvidenceProvider>()
    expectTypeOf<(typeof BusinessActionGuardrailProviderValues)[number]>().toEqualTypeOf<BusinessActionGuardrailProvider>()
    expectTypeOf<(typeof BusinessActionGuardrailDecisionValues)[number]>().toEqualTypeOf<BusinessActionGuardrailDecision>()
    expectTypeOf<(typeof BusinessActionResultArtifactRequirementValues)[number]>().toEqualTypeOf<BusinessActionResultArtifactRequirement>()
    expectTypeOf<(typeof ReceiptReconstructionStatusValues)[number]>().toEqualTypeOf<ReceiptReconstructionStatus>()
  })

  it('accepts both closed action slugs in the public card shape', () => {
    const paidCard = {
      id: 'business_action_card:paid-intake',
      actionSlug: BusinessActionSlug,
      version: 1,
      sourceHash: 'sha256:paid-intake',
      status: 'active',
      publicLabel: 'Provision paid intake endpoint',
      posture: 'proposal_only',
      callable: false,
      paymentRequired: false,
      ownerApprovalRequired: true,
      receiptRequired: true,
      updatedAt: 1,
    } satisfies BusinessActionCard
    const publishCard = {
      id: 'business_action_card:publish-agent-intake',
      actionSlug: 'publish-agent-intake-endpoint',
      version: 1,
      sourceHash: 'sha256:publish-agent-intake',
      status: 'active',
      publicLabel: 'Publish agent intake endpoint',
      posture: 'proposal_only',
      callable: false,
      paymentRequired: false,
      ownerApprovalRequired: true,
      receiptRequired: true,
      updatedAt: 1,
    } satisfies BusinessActionCard

    expectTypeOf(paidCard).toMatchTypeOf<BusinessActionCard>()
    expectTypeOf(publishCard).toMatchTypeOf<BusinessActionCard>()
  })
})

// @ts-expect-error arbitrary action strings cannot replace the closed Issue 29 slug set
const invalidActionSlug: BusinessActionSlugType = 'executeAction'
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
