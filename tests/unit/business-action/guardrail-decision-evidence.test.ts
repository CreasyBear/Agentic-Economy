import { describe, expect, it } from 'vitest'

import {
  BusinessActionSlug,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordGuardrailDecisionEvidence,
} from '@/modules/business-action/public'
import type {
  BusinessActionCard,
  BuyerMandate,
} from '@/modules/business-action/public'
import type {
  BusinessActionCardId,
  BusinessId,
  BuyerMandateId,
  CorrelationId,
  OperationKey,
  SourceHash,
} from '@/modules/common/ids'

const now = 2_000
const businessId = 'business:plumbing-demo' as BusinessId

describe('business action guardrail decision evidence', () => {
  it('records allow evidence without creating downstream external evidence', () => {
    const state = createRequestState()
    const result = recordGuardrailDecisionEvidence(state, guardrailCommand({ decision: 'allow' }))

    expect(result.kind).toBe('ok')
    expect(result.code).toBe('business_action_guardrail_recorded')
    if (result.kind !== 'ok') {
      throw new Error('expected guardrail evidence')
    }

    expect(result.evidence.provider).toBe('nemo_guardrails')
    expect(result.evidence.decision).toBe('allow')
    expect(result.evidence.actionSlug).toBe(BusinessActionSlug)
    expect(result.state.guardrailDecisions).toHaveLength(1)
    expect(result.state.externalEvidenceEvents).toHaveLength(0)
  })

  it('records block and refusal evidence as policy evidence only', () => {
    for (const decision of ['block', 'refusal'] as const) {
      const state = createRequestState()
      const result = recordGuardrailDecisionEvidence(
        state,
        guardrailCommand({
          decision,
          idempotencyKey: `operation:guardrail:${decision}` as OperationKey,
          payloadHash: `hash:guardrail:${decision}` as SourceHash,
        })
      )

      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') {
        throw new Error(`expected ${decision} guardrail evidence`)
      }

      expect(result.evidence.decision).toBe(decision)
      expect(result.state.guardrailDecisions).toHaveLength(1)
      expect(result.state.externalEvidenceEvents).toHaveLength(0)
    }
  })

  it('replays identical guardrail evidence and rejects same-key conflicts', () => {
    const recorded = recordGuardrailDecisionEvidence(createRequestState(), guardrailCommand({ decision: 'allow' }))
    if (recorded.kind !== 'ok') {
      throw new Error('expected guardrail evidence')
    }

    const replay = recordGuardrailDecisionEvidence(recorded.state, guardrailCommand({ decision: 'allow' }))
    expect(replay.kind).toBe('ok')
    expect(replay.code).toBe('business_action_guardrail_replayed')

    const conflict = recordGuardrailDecisionEvidence(recorded.state, guardrailCommand({ decision: 'block' }))
    expect(conflict.kind).toBe('error')
    expect(conflict.code).toBe('business_action_idempotency_conflict')
  })
})

function createRequestState() {
  const result = createCapabilityRequest(
    createEmptyBusinessActionSourceState({
      cards: [card()],
      mandates: [mandate()],
    }),
    {
      actionSlug: BusinessActionSlug,
      cardId: card().id as BusinessActionCardId,
      mandateId: mandate().id,
      businessId,
      amountCents: 4_500,
      currency: 'aud',
      requestedBy: 'hermes',
      idempotencyKey: 'operation:request' as OperationKey,
      correlationId: 'correlation:request' as CorrelationId,
      now,
      expiresAt: now + 500,
    }
  )
  if (result.kind !== 'ok') {
    throw new Error('fixture request creation failed')
  }

  return result.state
}

function guardrailCommand(overrides: Partial<Parameters<typeof recordGuardrailDecisionEvidence>[1]> = {}) {
  return {
    requestId: 'capability_request:operation:request' as Parameters<typeof recordGuardrailDecisionEvidence>[1]['requestId'],
    provider: 'nemo_guardrails',
    modelName: 'nemotron',
    modelVersion: 'local-test',
    decision: 'allow',
    policyHash: 'hash:policy' as SourceHash,
    privateTraceRefHash: 'hash:trace' as SourceHash,
    payloadHash: 'hash:guardrail' as SourceHash,
    idempotencyKey: 'operation:guardrail' as OperationKey,
    correlationId: 'correlation:guardrail' as CorrelationId,
    recordedAt: now + 5,
    ...overrides,
  } as const
}

function card(overrides: Partial<BusinessActionCard> = {}): BusinessActionCard {
  return {
    id: 'business_action_card:paid-intake' as BusinessActionCardId,
    actionSlug: BusinessActionSlug,
    version: 1,
    sourceHash: 'hash:card' as SourceHash,
    status: 'active',
    publicLabel: 'Provision paid intake endpoint',
    posture: 'proposal_only',
    callable: false,
    paymentRequired: false,
    ownerApprovalRequired: true,
    receiptRequired: true,
    updatedAt: now - 10,
    ...overrides,
  }
}

function mandate(overrides: Partial<BuyerMandate> = {}): BuyerMandate {
  return {
    id: 'buyer_mandate:paid-intake' as BuyerMandateId,
    buyerRef: 'buyer:hash',
    allowedBusinessId: businessId,
    allowedActionSlug: BusinessActionSlug,
    maxAmountCents: 5_000,
    currency: 'aud',
    status: 'active',
    mandateHash: 'hash:mandate' as SourceHash,
    idempotencyKey: 'operation:mandate' as OperationKey,
    correlationId: 'correlation:mandate' as CorrelationId,
    createdAt: now - 100,
    expiresAt: now + 1_000,
    ...overrides,
  }
}
