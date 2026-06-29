import { describe, expect, it } from 'vitest'

import type {
  BusinessActionCard,
  BusinessActionOwnerAuthority,
  BuyerMandate,
} from '@/modules/business-action/public'
import {
  BusinessActionSlug,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordAuthorizationCheckpoint,
} from '@/modules/business-action/public'
import type {
  BusinessActionCardId,
  BusinessId,
  BuyerMandateId,
  CorrelationId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'

const businessId = 'business:plumbing-demo' as BusinessId
const otherBusinessId = 'business:other' as BusinessId
const ownerId = 'owner:plumbing-demo' as OwnerId
const otherOwnerId = 'owner:other' as OwnerId
const now = 1_000

describe('business action mandate request checkpoint', () => {
  it('creates a mandate-bound request and replays same idempotency key only for identical body', () => {
    const state = createEmptyBusinessActionSourceState({ cards: [card()], mandates: [mandate()] })
    const command = requestCommand()

    const created = createCapabilityRequest(state, command)
    expect(created.kind).toBe('ok')
    expect(created.code).toBe('business_action_request_created')
    if (created.kind !== 'ok') {
      throw new Error('expected request creation')
    }

    expect(created.request.actionSlug).toBe(BusinessActionSlug)
    expect(created.request.businessId).toBe(businessId)
    expect(created.request.mandateHash).toBe(mandate().mandateHash)
    expect(created.request.amountCents).toBe(4_500)

    const replay = createCapabilityRequest(created.state, command)
    expect(replay.kind).toBe('ok')
    expect(replay.code).toBe('business_action_request_replayed')

    const conflict = createCapabilityRequest(created.state, { ...command, amountCents: 4_600 })
    expect(conflict.kind).toBe('error')
    expect(conflict.code).toBe('business_action_idempotency_conflict')
  })

  it('rejects mandates and cards that do not match the selected action and business constraints', () => {
    const cases = [
      {
        name: 'expired mandate',
        state: createEmptyBusinessActionSourceState({ cards: [card()], mandates: [mandate({ expiresAt: now })] }),
        command: requestCommand({ idempotencyKey: 'operation:expired' as OperationKey }),
        code: 'business_action_mandate_invalid',
      },
      {
        name: 'revoked mandate',
        state: createEmptyBusinessActionSourceState({ cards: [card()], mandates: [mandate({ status: 'revoked', revokedAt: now - 1 })] }),
        command: requestCommand({ idempotencyKey: 'operation:revoked' as OperationKey }),
        code: 'business_action_mandate_invalid',
      },
      {
        name: 'wrong action',
        state: createEmptyBusinessActionSourceState({
          cards: [card()],
          mandates: [mandate({ allowedActionSlug: 'contact-follow-up' as never })],
        }),
        command: requestCommand({ idempotencyKey: 'operation:wrong-action' as OperationKey }),
        code: 'business_action_mandate_invalid',
      },
      {
        name: 'wrong business',
        state: createEmptyBusinessActionSourceState({ cards: [card()], mandates: [mandate({ allowedBusinessId: otherBusinessId })] }),
        command: requestCommand({ idempotencyKey: 'operation:wrong-business' as OperationKey }),
        code: 'business_action_mandate_invalid',
      },
      {
        name: 'amount over max',
        state: createEmptyBusinessActionSourceState({ cards: [card()], mandates: [mandate({ maxAmountCents: 4_000 })] }),
        command: requestCommand({ idempotencyKey: 'operation:amount-over-max' as OperationKey }),
        code: 'business_action_mandate_invalid',
      },
      {
        name: 'stale card',
        state: createEmptyBusinessActionSourceState({ cards: [card({ status: 'stale' })], mandates: [mandate()] }),
        command: requestCommand({ idempotencyKey: 'operation:stale-card' as OperationKey }),
        code: 'business_action_card_unavailable',
      },
      {
        name: 'disabled card',
        state: createEmptyBusinessActionSourceState({ cards: [card({ status: 'disabled' })], mandates: [mandate()] }),
        command: requestCommand({ idempotencyKey: 'operation:disabled-card' as OperationKey }),
        code: 'business_action_card_unavailable',
      },
    ] as const

    for (const entry of cases) {
      const result = createCapabilityRequest(entry.state, entry.command)
      expect(result.kind, entry.name).toBe('error')
      expect(result.code, entry.name).toBe(entry.code)
    }
  })

  it('requires source-owned active owner approval for accepted checkpoint decisions', () => {
    const state = createRequestState()
    const accepted = recordAuthorizationCheckpoint(state, checkpointCommand())
    expect(accepted.kind).toBe('ok')
    expect(accepted.code).toBe('business_action_checkpoint_recorded')
    if (accepted.kind !== 'ok') {
      throw new Error('expected accepted checkpoint')
    }

    expect(accepted.checkpoint.decision).toBe('accepted')
    expect(accepted.request.status).toBe('accepted')

    const wrongOwner = recordAuthorizationCheckpoint(state, checkpointCommand({ authority: authority({ ownerId: otherOwnerId }) }))
    expect(wrongOwner.kind).toBe('error')
    expect(wrongOwner.code).toBe('business_action_owner_denied')

    const staleOwner = recordAuthorizationCheckpoint(state, checkpointCommand({ authority: authority({ status: 'stale' }) }))
    expect(staleOwner.kind).toBe('error')
    expect(staleOwner.code).toBe('business_action_owner_denied')

    const revokedOwner = recordAuthorizationCheckpoint(state, checkpointCommand({ authority: authority({ status: 'revoked' }) }))
    expect(revokedOwner.kind).toBe('error')
    expect(revokedOwner.code).toBe('business_action_owner_denied')

    const missingOwner = recordAuthorizationCheckpoint(state, checkpointCommand({ authority: undefined }))
    expect(missingOwner.kind).toBe('error')
    expect(missingOwner.code).toBe('business_action_owner_denied')

    const missingDecision = recordAuthorizationCheckpoint(state, checkpointCommand({ ownerDecisionRef: '' }))
    expect(missingDecision.kind).toBe('error')
    expect(missingDecision.code).toBe('business_action_owner_decision_required')
  })

  it('records safe non-accepted checkpoint outcomes without admitting consequence', () => {
    for (const decision of ['refused', 'clarification_required', 'proof_gap', 'expired'] as const) {
      const state = createRequestState()
      const result = recordAuthorizationCheckpoint(
        state,
        checkpointCommand({
          decision,
          idempotencyKey: `operation:checkpoint:${decision}` as OperationKey,
          reasonCode: decision,
        })
      )

      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') {
        throw new Error(`expected ${decision} checkpoint`)
      }
      expect(result.checkpoint.decision).toBe(decision)
      expect(result.request.status).toBe(decision)
      expect(result.state.externalEvidenceEvents).toHaveLength(0)
    }
  })
})

function createRequestState() {
  const created = createCapabilityRequest(createEmptyBusinessActionSourceState({ cards: [card()], mandates: [mandate()] }), requestCommand())
  if (created.kind !== 'ok') {
    throw new Error('fixture request creation failed')
  }

  return created.state
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

function requestCommand(overrides: Partial<Parameters<typeof createCapabilityRequest>[1]> = {}) {
  return {
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
    ...overrides,
  } as const
}

function checkpointCommand(overrides: Partial<Parameters<typeof recordAuthorizationCheckpoint>[1]> = {}) {
  return {
    requestId: 'capability_request:operation:request' as Parameters<typeof recordAuthorizationCheckpoint>[1]['requestId'],
    decision: 'accepted',
    authority: authority(),
    ownerDecisionRef: 'owner-decision:approval',
    reasonCode: 'owner_approved',
    idempotencyKey: 'operation:checkpoint' as OperationKey,
    correlationId: 'correlation:checkpoint' as CorrelationId,
    now: now + 10,
    expiresAt: now + 400,
    ...overrides,
  } as const
}

function authority(overrides: Partial<BusinessActionOwnerAuthority> = {}): BusinessActionOwnerAuthority {
  return {
    ownerId,
    actorRef: 'clerk:user:owner',
    businessIds: [businessId],
    status: 'active',
    ...overrides,
  }
}
