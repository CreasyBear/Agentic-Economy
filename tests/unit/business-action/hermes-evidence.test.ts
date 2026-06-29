import { describe, expect, it } from 'vitest'

import type { BusinessActionCard, BusinessActionSourceState, BuyerMandate } from '@/modules/business-action/public'
import {
  BusinessActionSlug,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordAuthorizationCheckpoint,
  recordHermesEvidenceEvent,
} from '@/modules/business-action/public'
import type {
  AuthorizationCheckpointId,
  BusinessActionCardId,
  BusinessId,
  BuyerMandateId,
  CapabilityRequestId,
  CorrelationId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'

const now = 3_000
const businessId = 'business:plumbing-demo' as BusinessId
const ownerId = 'owner:plumbing-demo' as OwnerId

describe('business action Hermes evidence', () => {
  it('admits scope/select/request/execute/report evidence only after accepted checkpoint', () => {
    let state = createAcceptedState()

    for (const evidenceKind of ['scope', 'select', 'request', 'execute', 'report'] as const) {
      const result = recordHermesEvidenceEvent(
        state,
        hermesCommand({
          evidenceKind,
          idempotencyKey: `operation:hermes:${evidenceKind}` as OperationKey,
          payloadHash: `hash:hermes:${evidenceKind}` as SourceHash,
          providerRefHash: `hash:hermes-ref:${evidenceKind}` as SourceHash,
        })
      )

      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') {
        throw new Error(`expected ${evidenceKind} evidence`)
      }
      expect(result.evidence.provider).toBe('hermes')
      expect(result.evidence.evidenceKind).toBe(evidenceKind)
      expect(result.evidence.requestId).toBe(requestId())
      expect(result.evidence.checkpointId).toBe(checkpointId())
      state = result.state
    }

    expect(state.hermesEvidenceEvents.map((event) => event.evidenceKind)).toEqual([
      'scope',
      'select',
      'request',
      'execute',
      'report',
    ])
    expect(state.externalEvidenceEvents).toHaveLength(5)
  })

  it('rejects Hermes evidence before accepted owner checkpoint', () => {
    const result = recordHermesEvidenceEvent(createRequestState(), hermesCommand())

    expect(result.kind).toBe('error')
    expect(result.code).toBe('business_action_checkpoint_not_accepted')
  })

  it('rejects Hermes evidence bound to the wrong checkpoint or request', () => {
    const wrongCheckpoint = recordHermesEvidenceEvent(
      createAcceptedState(),
      hermesCommand({ checkpointId: 'authorization_checkpoint:other' as AuthorizationCheckpointId })
    )
    expect(wrongCheckpoint.kind).toBe('error')
    expect(wrongCheckpoint.code).toBe('business_action_evidence_unbound')

    const wrongRequest = recordHermesEvidenceEvent(
      createAcceptedState(),
      hermesCommand({ requestId: 'capability_request:other' as CapabilityRequestId })
    )
    expect(wrongRequest.kind).toBe('error')
    expect(wrongRequest.code).toBe('business_action_not_found')
  })

  it('replays identical Hermes evidence and rejects same-key drift', () => {
    const recorded = recordHermesEvidenceEvent(createAcceptedState(), hermesCommand())
    expect(recorded.kind).toBe('ok')
    if (recorded.kind !== 'ok') {
      throw new Error('expected Hermes evidence')
    }

    const replay = recordHermesEvidenceEvent(recorded.state, hermesCommand())
    expect(replay.kind).toBe('ok')
    expect(replay.code).toBe('business_action_hermes_evidence_replayed')
    if (replay.kind !== 'ok') {
      throw new Error('expected Hermes replay')
    }
    expect(replay.evidence).toEqual(recorded.evidence)
    expect(replay.state.hermesEvidenceEvents).toHaveLength(1)

    const drift = recordHermesEvidenceEvent(
      recorded.state,
      hermesCommand({ payloadHash: 'hash:hermes:changed' as SourceHash })
    )
    expect(drift.kind).toBe('error')
    expect(drift.code).toBe('business_action_idempotency_conflict')
  })
})

export function createRequestState() {
  const result = createCapabilityRequest(
    createEmptyBusinessActionSourceState({ cards: [card()], mandates: [mandate()] }),
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

export function createAcceptedState() {
  const result = recordAuthorizationCheckpoint(createRequestState(), {
    requestId: requestId(),
    decision: 'accepted',
    authority: {
      ownerId,
      actorRef: 'clerk:user:owner',
      businessIds: [businessId],
      status: 'active',
    },
    ownerDecisionRef: 'owner-decision:approval',
    reasonCode: 'owner_approved',
    idempotencyKey: 'operation:checkpoint' as OperationKey,
    correlationId: 'correlation:checkpoint' as CorrelationId,
    now: now + 10,
    expiresAt: now + 400,
  })
  if (result.kind !== 'ok') {
    throw new Error('fixture checkpoint failed')
  }

  return result.state
}

export function hermesCommand(overrides: Partial<Parameters<typeof recordHermesEvidenceEvent>[1]> = {}) {
  return {
    requestId: requestId(),
    checkpointId: checkpointId(),
    evidenceKind: 'scope',
    providerRefHash: 'hash:hermes-ref' as SourceHash,
    payloadHash: 'hash:hermes' as SourceHash,
    idempotencyKey: 'operation:hermes' as OperationKey,
    correlationId: 'correlation:hermes' as CorrelationId,
    receivedAt: now + 20,
    ...overrides,
  } as const
}

export function requestId(): CapabilityRequestId {
  return 'capability_request:operation:request' as CapabilityRequestId
}

export function checkpointId(): AuthorizationCheckpointId {
  return 'authorization_checkpoint:capability_request:operation:request:operation:checkpoint' as AuthorizationCheckpointId
}

export function card(overrides: Partial<BusinessActionCard> = {}): BusinessActionCard {
  return {
    id: 'business_action_card:paid-intake' as BusinessActionCardId,
    actionSlug: BusinessActionSlug,
    version: 1,
    ownerId,
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

export function mandate(overrides: Partial<BuyerMandate> = {}): BuyerMandate {
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

export function withState(overrides: Partial<BusinessActionSourceState>): BusinessActionSourceState {
  return createEmptyBusinessActionSourceState({ ...createAcceptedState(), ...overrides })
}
