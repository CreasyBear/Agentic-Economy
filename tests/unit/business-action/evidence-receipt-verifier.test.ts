import { describe, expect, it } from 'vitest'

import {
  BusinessActionSlug,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordActionReceipt,
  recordAuthorizationCheckpoint,
  recordBusinessActionResultArtifact,
  recordHermesEvidenceEvent,
  verifyActionReceipt,
} from '@/modules/business-action/public'
import { stableHash } from '@/modules/common/stable-hash'
import type { ActionReceipt, BusinessActionCard, BuyerMandate } from '@/modules/business-action/public'
import type {
  AuthorizationCheckpointId,
  BusinessActionCardId,
  BusinessId,
  BuyerMandateId,
  CapabilityRequestId,
  CorrelationId,
  ExternalEvidenceEventId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'

const now = 3_000
const businessId = 'business:plumbing-demo' as BusinessId
const ownerId = 'owner:plumbing-demo' as OwnerId
const checkpoint = 'authorization_checkpoint:capability_request:operation:request:operation:checkpoint' as AuthorizationCheckpointId

describe('business action receipt verifier', () => {
  it('reconstructs success only with endpoint descriptor schema and private artifact ref', () => {
    const withEvidence = recordHermesEvidenceEvent(createAcceptedState(), hermesCommand())
    if (withEvidence.kind !== 'ok') {
      throw new Error('expected Hermes evidence')
    }

    const artifact = recordBusinessActionResultArtifact(withEvidence.state, completeArtifactCommand())
    expect(artifact.kind).toBe('ok')
    if (artifact.kind !== 'ok') {
      throw new Error('expected result artifact')
    }
    expect(artifact.artifact.status).toBe('complete')

    const receiptResult = recordActionReceipt(artifact.state, receiptCommand())
    expect(receiptResult.kind).toBe('ok')
    if (receiptResult.kind !== 'ok') {
      throw new Error('expected receipt')
    }
    expect(receiptResult.receipt.outcome).toBe('success')

    const verification = verifyActionReceipt(receiptResult.state, receiptResult.receipt, { includePrivate: true })
    expect(verification.reconstructionStatus).toBe('complete')
    expect(verification.publicReadback.hashes.resultArtifactHash).toBe(artifact.artifact.artifactHash)
    expect(JSON.stringify(verification.publicReadback)).not.toContain('private_endpoint_provisioning_payment_gate_ref')
    const privateArtifact = verification.privateReadback?.resultArtifact
    expect(privateArtifact).toBeDefined()
    expect(privateArtifact?.privateEndpointProvisioningPaymentGateRefHash).toBe('hash:private-artifact' as SourceHash)
  })

  it('records proof_gap when any required result artifact component is missing', () => {
    for (const command of [
      incompleteArtifactCommand('endpoint_descriptor'),
      incompleteArtifactCommand('json_schema'),
      incompleteArtifactCommand('private_endpoint_provisioning_payment_gate_ref'),
    ]) {
      const result = recordBusinessActionResultArtifact(createAcceptedState(), command)
      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') {
        throw new Error('expected artifact')
      }
      expect(result.artifact.status).toBe('proof_gap')
    }
  })

  it('reconstructs refusal no consequence without Hermes or external evidence', () => {
    const refused = recordAuthorizationCheckpoint(createRequestState(), {
      requestId: requestId(),
      decision: 'refused',
      authority: {
        ownerId,
        actorRef: 'clerk:user:owner',
        businessIds: [businessId],
        status: 'active',
      },
      ownerDecisionRef: 'owner-decision:refused',
      reasonCode: 'owner_refused',
      idempotencyKey: 'operation:checkpoint:refused' as OperationKey,
      correlationId: 'correlation:checkpoint:refused' as CorrelationId,
      now: 3_020,
      expiresAt: 3_300,
    })
    if (refused.kind !== 'ok') {
      throw new Error('expected refused checkpoint')
    }

    const receiptResult = recordActionReceipt(refused.state, receiptCommand({ idempotencyKey: 'operation:receipt:refused' as OperationKey }))
    expect(receiptResult.kind).toBe('ok')
    if (receiptResult.kind !== 'ok') {
      throw new Error('expected refused receipt')
    }

    const verification = verifyActionReceipt(receiptResult.state, receiptResult.receipt)
    expect(receiptResult.receipt.outcome).toBe('refused')
    expect(verification.reconstructionStatus).toBe('refused_no_consequence')
    expect(receiptResult.state.externalEvidenceEvents).toHaveLength(0)
  })

  it('detects evidence mismatch tampering stale card expired mandate and unbound provider event', () => {
    const success = createSuccessReceipt()

    expect(verifyActionReceipt(success.state, { ...success.receipt, externalEvidenceRefHashes: ['hash:missing' as SourceHash] }).reconstructionStatus).toBe(
      'evidence_mismatch'
    )
    expect(verifyActionReceipt(success.state, { ...success.receipt, payloadHash: 'hash:tampered' as SourceHash }).reconstructionStatus).toBe(
      'tampered'
    )
    expect(
      verifyActionReceipt(
        { ...success.state, cards: success.state.cards.map((entry) => ({ ...entry, status: 'stale' })) },
        success.receipt
      ).reconstructionStatus
    ).toBe('stale_source')
    expect(
      verifyActionReceipt(
        { ...success.state, cards: [] },
        success.receipt
      ).reconstructionStatus
    ).toBe('evidence_mismatch')
    expect(
      verifyActionReceipt(
        { ...success.state, mandates: success.state.mandates.map((entry) => ({ ...entry, expiresAt: 1 })) },
        success.receipt
      ).reconstructionStatus
    ).toBe('expired_mandate')
    expect(
      verifyActionReceipt(
        {
          ...success.state,
          externalEvidenceEvents: [
            ...success.state.externalEvidenceEvents,
            {
              id: 'external_evidence:rogue' as ExternalEvidenceEventId,
              requestId: requestId(),
              checkpointId: 'authorization_checkpoint:rogue' as AuthorizationCheckpointId,
              actionSlug: 'provision-paid-intake-endpoint',
              provider: 'hermes',
              status: 'accepted',
              providerRefHash: 'hash:rogue-ref' as SourceHash,
              payloadHash: 'hash:rogue-payload' as SourceHash,
              idempotencyKey: 'operation:rogue' as OperationKey,
              correlationId: 'correlation:rogue' as CorrelationId,
              receivedAt: 3_040,
            },
          ],
        },
        { ...success.receipt, externalEvidenceRefHashes: [...success.receipt.externalEvidenceRefHashes, 'hash:rogue-payload' as SourceHash] }
      ).reconstructionStatus
    ).toBe('unbound_provider_event')
  })

  it('detects self-consistent receipt field tampering against source state', () => {
    const success = createSuccessReceipt()

    for (const tampered of [
      recomputeReceiptSelfHash({ ...success.receipt, requestHash: 'hash:tampered-request' as SourceHash }),
      recomputeReceiptSelfHash({ ...success.receipt, resultArtifactHash: 'hash:tampered-artifact' as SourceHash }),
      recomputeReceiptSelfHash({ ...success.receipt, outcome: 'proof_gap', reconstructionStatus: 'proof_gap' }),
    ]) {
      expect(verifyActionReceipt(success.state, tampered).reconstructionStatus).toBe('tampered')
    }
  })

  it('does not accept owner inbox report screenshot model output payment event or status label alone as success', () => {
    for (const supportingLabel of ['owner_inbox_item', 'generated_report', 'screenshot', 'model_output', 'payment_event', 'status_label']) {
      const artifact = recordBusinessActionResultArtifact(createAcceptedState(), {
        ...supportOnlyArtifactCommand(),
        supportingEvidenceLabels: [supportingLabel],
      })
      expect(artifact.kind).toBe('ok')
      if (artifact.kind !== 'ok') {
        throw new Error('expected artifact')
      }
      expect(artifact.artifact.status).toBe('proof_gap')
    }
  })
})

function createSuccessReceipt(): { state: Parameters<typeof verifyActionReceipt>[0]; receipt: ActionReceipt } {
  const evidence = recordHermesEvidenceEvent(createAcceptedState(), hermesCommand())
  if (evidence.kind !== 'ok') {
    throw new Error('expected Hermes evidence')
  }
  const artifact = recordBusinessActionResultArtifact(evidence.state, completeArtifactCommand())
  if (artifact.kind !== 'ok') {
    throw new Error('expected artifact')
  }
  const receipt = recordActionReceipt(artifact.state, receiptCommand())
  if (receipt.kind !== 'ok') {
    throw new Error('expected receipt')
  }

  return { state: receipt.state, receipt: receipt.receipt }
}

function createRequestState() {
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

function createAcceptedState() {
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

function hermesCommand(overrides: Partial<Parameters<typeof recordHermesEvidenceEvent>[1]> = {}) {
  return {
    requestId: requestId(),
    checkpointId: checkpoint,
    evidenceKind: 'scope',
    providerRefHash: 'hash:hermes-ref' as SourceHash,
    payloadHash: 'hash:hermes' as SourceHash,
    idempotencyKey: 'operation:hermes' as OperationKey,
    correlationId: 'correlation:hermes' as CorrelationId,
    receivedAt: now + 20,
    ...overrides,
  } as const
}

function requestId(): CapabilityRequestId {
  return 'capability_request:operation:request' as CapabilityRequestId
}

function card(overrides: Partial<BusinessActionCard> = {}): BusinessActionCard {
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

function completeArtifactCommand(overrides: Partial<Parameters<typeof recordBusinessActionResultArtifact>[1]> = {}) {
  return {
    requestId: requestId(),
    checkpointId: checkpoint,
    endpointDescriptorHash: 'hash:endpoint-descriptor' as SourceHash,
    jsonSchemaHash: 'hash:json-schema' as SourceHash,
    privateEndpointProvisioningPaymentGateRefHash: 'hash:private-artifact' as SourceHash,
    idempotencyKey: 'operation:artifact' as OperationKey,
    correlationId: 'correlation:artifact' as CorrelationId,
    recordedAt: 3_030,
    supportingEvidenceLabels: [],
    ...overrides,
  } as const
}

function incompleteArtifactCommand(
  missing: 'endpoint_descriptor' | 'json_schema' | 'private_endpoint_provisioning_payment_gate_ref'
) {
  const base = completeArtifactCommand()

  if (missing === 'endpoint_descriptor') {
    const { endpointDescriptorHash: _omitted, ...command } = base
    return command
  }

  if (missing === 'json_schema') {
    const { jsonSchemaHash: _omitted, ...command } = base
    return command
  }

  const { privateEndpointProvisioningPaymentGateRefHash: _omitted, ...command } = base
  return command
}

function supportOnlyArtifactCommand() {
  const {
    endpointDescriptorHash: _endpointDescriptorHash,
    jsonSchemaHash: _jsonSchemaHash,
    privateEndpointProvisioningPaymentGateRefHash: _privateEndpointProvisioningPaymentGateRefHash,
    ...command
  } = completeArtifactCommand()

  return command
}

function receiptCommand(overrides: Partial<Parameters<typeof recordActionReceipt>[1]> = {}) {
  return {
    requestId: requestId(),
    idempotencyKey: 'operation:receipt' as OperationKey,
    correlationId: 'correlation:receipt' as CorrelationId,
    recordedAt: 3_050,
    ...overrides,
  } as const
}

function recomputeReceiptSelfHash(receipt: ActionReceipt): ActionReceipt {
  return {
    ...receipt,
    payloadHash: stableHash({
      requestId: receipt.requestId,
      actionSlug: receipt.actionSlug,
      outcome: receipt.outcome,
      cardHash: receipt.cardHash,
      cardVersion: receipt.cardVersion,
      mandateHash: receipt.mandateHash,
      requestHash: receipt.requestHash,
      checkpointHash: receipt.checkpointHash ?? null,
      resultArtifactHash: receipt.resultArtifactHash ?? null,
      externalEvidenceRefHashes: [...receipt.externalEvidenceRefHashes].sort(),
      guardrailEvidenceRefHashes: [...receipt.guardrailEvidenceRefHashes].sort(),
      signatureRefHash: receipt.signatureRefHash,
      reconstructionStatus: receipt.reconstructionStatus,
      recordedAt: receipt.recordedAt,
    }),
  }
}
