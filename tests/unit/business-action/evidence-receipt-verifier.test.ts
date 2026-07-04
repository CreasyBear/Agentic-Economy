import { describe, expect, it } from 'vitest'

import {
  BusinessActionSlug,
  PublicActionReceiptPrivateFieldDenylistValues,
  PublicActionReceiptReadbackFieldValues,
  PublicActionReceiptReadbackHashFieldValues,
  PublicActionReceiptVerifierMatrix,
  PublicActionReceiptVerifierStatusValues,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordActionReceipt,
  recordAuthorizationCheckpoint,
  recordBusinessActionResultArtifact,
  recordHermesEvidenceEvent,
  ReceiptReconstructionStatusValues,
  verifyActionReceipt,
} from '@/modules/business-action/public'
import { stableHash } from '@/modules/common/stable-hash'
import type { ActionReceipt, BusinessActionCard, BusinessActionSlug as BusinessActionSlugType, BuyerMandate } from '@/modules/business-action/public'
import { brandNonEmpty } from '@/modules/common/ids'
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

const publishAgentIntakeEndpointActionSlug = 'publish-agent-intake-endpoint' satisfies BusinessActionSlugType

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
    expect(Object.keys(verification.publicReadback).sort()).toEqual([...PublicActionReceiptReadbackFieldValues].sort())
    expect(PublicActionReceiptReadbackHashFieldValues).toEqual(expect.arrayContaining(Object.keys(verification.publicReadback.hashes)))
    for (const privateField of PublicActionReceiptPrivateFieldDenylistValues) {
      expect(JSON.stringify(verification.publicReadback)).not.toContain(privateField)
    }
    expect(JSON.stringify(verification.publicReadback)).not.toContain('private_endpoint_provisioning_payment_gate_ref')
    const privateArtifact = verification.privateReadback?.resultArtifact
    expect(privateArtifact).toBeDefined()
    expect(privateArtifact?.privateEndpointProvisioningPaymentGateRefHash).toBe('hash:private-artifact' as SourceHash)
  })

  it('keeps the public verifier status matrix hash-only and private-denied', () => {
    expect(Object.keys(PublicActionReceiptVerifierMatrix).sort()).toEqual([...ReceiptReconstructionStatusValues].sort())

    for (const reconstructionStatus of ReceiptReconstructionStatusValues) {
      const row = PublicActionReceiptVerifierMatrix[reconstructionStatus]
      expect(PublicActionReceiptVerifierStatusValues).toContain(row.publicStatus)
      expect(row.publicReadbackAllowed).toBe(true)
      expect(row.privatePayloadAllowed).toBe(false)
    }

    expect(PublicActionReceiptVerifierMatrix.complete.publicStatus).toBe('matched')
    expect(PublicActionReceiptVerifierMatrix.refused_no_consequence.publicStatus).toBe('refused')
  })

  it('reconstructs publish-agent intake success with endpoint descriptor and schema but no payment gate', () => {
    const accepted = createAcceptedState(publishAgentIntakeEndpointActionSlug)
    expect(accepted.requests.at(-1)?.actionSlug).toBe(publishAgentIntakeEndpointActionSlug)
    expect(accepted.requests.at(-1)?.amountCents).toBeUndefined()
    expect(accepted.checkpoints.at(-1)?.actionSlug).toBe(publishAgentIntakeEndpointActionSlug)

    const artifact = recordBusinessActionResultArtifact(accepted, endpointSchemaArtifactCommand())
    expect(artifact.kind).toBe('ok')
    if (artifact.kind !== 'ok') {
      throw new Error('expected result artifact')
    }
    expect(artifact.artifact.actionSlug).toBe(publishAgentIntakeEndpointActionSlug)
    expect(artifact.artifact.status).toBe('complete')
    expect(artifact.artifact.endpointDescriptorHash).toBe('hash:endpoint-descriptor' as SourceHash)
    expect(artifact.artifact.jsonSchemaHash).toBe('hash:json-schema' as SourceHash)
    expect(artifact.artifact.privateEndpointProvisioningPaymentGateRefHash).toBeUndefined()

    const receiptResult = recordActionReceipt(artifact.state, receiptCommand())
    expect(receiptResult.kind).toBe('ok')
    if (receiptResult.kind !== 'ok') {
      throw new Error('expected receipt')
    }
    expect(receiptResult.receipt.actionSlug).toBe(publishAgentIntakeEndpointActionSlug)
    expect(receiptResult.receipt.outcome).toBe('success')

    const verification = verifyActionReceipt(receiptResult.state, receiptResult.receipt, { includePrivate: true })
    expect(verification.reconstructionStatus).toBe('complete')
    expect(verification.publicReadback.actionSlug).toBe(publishAgentIntakeEndpointActionSlug)
    expect(verification.publicReadback.hashes.resultArtifactHash).toBe(artifact.artifact.artifactHash)
    expect(verification.privateReadback?.resultArtifact?.privateEndpointProvisioningPaymentGateRefHash).toBeUndefined()
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

  it('reconstructs publish-agent refusal no consequence without a result artifact', () => {
    const refused = recordAuthorizationCheckpoint(createRequestState(publishAgentIntakeEndpointActionSlug), {
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
    expect(refused.request.actionSlug).toBe(publishAgentIntakeEndpointActionSlug)
    expect(refused.state.resultArtifacts).toHaveLength(0)

    const receiptResult = recordActionReceipt(refused.state, receiptCommand({ idempotencyKey: 'operation:receipt:refused' as OperationKey }))
    expect(receiptResult.kind).toBe('ok')
    if (receiptResult.kind !== 'ok') {
      throw new Error('expected refused receipt')
    }

    const verification = verifyActionReceipt(receiptResult.state, receiptResult.receipt)
    expect(receiptResult.receipt.actionSlug).toBe(publishAgentIntakeEndpointActionSlug)
    expect(receiptResult.receipt.outcome).toBe('refused')
    expect(receiptResult.receipt.resultArtifactHash).toBeUndefined()
    expect(verification.reconstructionStatus).toBe('refused_no_consequence')
    expect(receiptResult.state.externalEvidenceEvents).toHaveLength(0)
  })

  it('detects evidence mismatch tampering stale card expired mandate and unbound provider event for every closed slug', () => {
    for (const actionSlug of [BusinessActionSlug, publishAgentIntakeEndpointActionSlug] as const) {
      const success = createSuccessReceipt(actionSlug)

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
                actionSlug,
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
    }
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

  it('binds checked evidence refs into successful receipt reconstruction without exposing raw secrets publicly', () => {
    const evidence = recordHermesEvidenceEvent(createAcceptedState(), hermesCommand())
    if (evidence.kind !== 'ok') {
      throw new Error('expected Hermes evidence')
    }
    const artifact = recordBusinessActionResultArtifact(evidence.state, completeArtifactCommand())
    if (artifact.kind !== 'ok') {
      throw new Error('expected artifact')
    }

    const receiptResult = recordActionReceipt(
      artifact.state,
      receiptCommand({
        boundEvidenceRefHashes: ['hash:clearance-greenlight', 'hash:gateway-check'].map((hash) => brandNonEmpty(hash, 'SourceHash')),
      })
    )
    expect(receiptResult.kind).toBe('ok')
    if (receiptResult.kind !== 'ok') {
      throw new Error('expected receipt')
    }

    expect(receiptResult.receipt.boundEvidenceRefHashes).toEqual(['hash:clearance-greenlight', 'hash:gateway-check'])
    const verification = verifyActionReceipt(receiptResult.state, receiptResult.receipt)
    expect(verification.reconstructionStatus).toBe('complete')
    expect(verification.publicReadback).toMatchObject({
      checkedEvidenceCount: 2,
      checkedEvidenceStatus: 'complete',
    })

    const publicDto = JSON.stringify(verification.publicReadback)
    expect(publicDto).not.toContain('boundEvidenceRefHashes')
    expect(publicDto).not.toContain('raw-local-hmac')
    expect(publicDto).not.toContain('AE_CLEARANCE_SIGNING_SECRET')
    expect(publicDto).not.toContain('whsec_')
    expect(publicDto).not.toContain('sk_test_')
    expect(publicDto).not.toContain('private_endpoint_provisioning_payment_gate_ref')
  })

  it('detects changed bound evidence refs as receipt tampering rather than accepting a self-consistent rewrite', () => {
    const evidence = recordHermesEvidenceEvent(createAcceptedState(), hermesCommand())
    if (evidence.kind !== 'ok') {
      throw new Error('expected Hermes evidence')
    }
    const artifact = recordBusinessActionResultArtifact(evidence.state, completeArtifactCommand())
    if (artifact.kind !== 'ok') {
      throw new Error('expected artifact')
    }
    const receiptResult = recordActionReceipt(
      artifact.state,
      receiptCommand({
        boundEvidenceRefHashes: ['hash:clearance-greenlight'].map((hash) => brandNonEmpty(hash, 'SourceHash')),
      })
    )
    if (receiptResult.kind !== 'ok') {
      throw new Error('expected receipt')
    }

    const tamperedBoundEvidence = recomputeReceiptSelfHash({
      ...receiptResult.receipt,
      boundEvidenceRefHashes: ['hash:clearance-greenlight-tampered'].map((hash) => brandNonEmpty(hash, 'SourceHash')),
    })

    expect(verifyActionReceipt(receiptResult.state, tamperedBoundEvidence).reconstructionStatus).toBe('tampered')
  })

  it('detects changed checked evidence status as receipt tampering even with a recomputed payload hash', () => {
    const receiptResult = recordActionReceipt(
      createAcceptedState(),
      receiptCommand({
        boundEvidenceRefHashes: ['hash:clearance-greenlight'].map((hash) => brandNonEmpty(hash, 'SourceHash')),
      })
    )
    if (receiptResult.kind !== 'ok') {
      throw new Error('expected receipt')
    }

    const tamperedStatus = recomputeReceiptSelfHash({
      ...receiptResult.receipt,
      checkedEvidenceStatus: 'complete',
    })

    expect(verifyActionReceipt(receiptResult.state, tamperedStatus).reconstructionStatus).toBe('tampered')
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

function createSuccessReceipt(actionSlug: BusinessActionSlugType = BusinessActionSlug): { state: Parameters<typeof verifyActionReceipt>[0]; receipt: ActionReceipt } {
  const evidence = recordHermesEvidenceEvent(createAcceptedState(actionSlug), hermesCommand())
  if (evidence.kind !== 'ok') {
    throw new Error('expected Hermes evidence')
  }
  const artifact = recordBusinessActionResultArtifact(
    evidence.state,
    actionSlug === BusinessActionSlug ? completeArtifactCommand() : endpointSchemaArtifactCommand()
  )
  if (artifact.kind !== 'ok') {
    throw new Error('expected artifact')
  }
  const receipt = recordActionReceipt(artifact.state, receiptCommand())
  if (receipt.kind !== 'ok') {
    throw new Error('expected receipt')
  }

  return { state: receipt.state, receipt: receipt.receipt }
}

function createRequestState(actionSlug: BusinessActionSlugType = BusinessActionSlug) {
  const requestCard = card(actionSlug)
  const requestMandate = mandate(actionSlug)
  const result = createCapabilityRequest(
    createEmptyBusinessActionSourceState({ cards: [requestCard], mandates: [requestMandate] }),
    {
      actionSlug,
      cardId: requestCard.id as BusinessActionCardId,
      mandateId: requestMandate.id,
      businessId,
      ...(actionSlug === BusinessActionSlug ? { amountCents: 4_500, currency: 'aud' as const } : {}),
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

function createAcceptedState(actionSlug: BusinessActionSlugType = BusinessActionSlug) {
  const result = recordAuthorizationCheckpoint(createRequestState(actionSlug), {
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

function card(actionSlug: BusinessActionSlugType = BusinessActionSlug, overrides: Partial<BusinessActionCard> = {}): BusinessActionCard {
  const slugLabel = actionSlug === BusinessActionSlug ? 'paid-intake' : 'publish-agent-intake'

  return {
    id: `business_action_card:${slugLabel}` as BusinessActionCardId,
    actionSlug,
    version: 1,
    ownerId,
    sourceHash: `hash:card:${slugLabel}` as SourceHash,
    status: 'active',
    publicLabel: actionSlug === BusinessActionSlug ? 'Provision paid intake endpoint' : 'Publish agent intake endpoint',
    posture: 'proposal_only',
    callable: false,
    paymentRequired: false,
    ownerApprovalRequired: true,
    receiptRequired: true,
    updatedAt: now - 10,
    ...overrides,
  }
}

function mandate(actionSlug: BusinessActionSlugType = BusinessActionSlug, overrides: Partial<BuyerMandate> = {}): BuyerMandate {
  const slugLabel = actionSlug === BusinessActionSlug ? 'paid-intake' : 'publish-agent-intake'

  return {
    id: `buyer_mandate:${slugLabel}` as BuyerMandateId,
    buyerRef: 'buyer:hash',
    allowedBusinessId: businessId,
    allowedActionSlug: actionSlug,
    maxAmountCents: 5_000,
    currency: 'aud',
    status: 'active',
    mandateHash: `hash:mandate:${slugLabel}` as SourceHash,
    idempotencyKey: `operation:mandate:${slugLabel}` as OperationKey,
    correlationId: `correlation:mandate:${slugLabel}` as CorrelationId,
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

function endpointSchemaArtifactCommand(overrides: Partial<Parameters<typeof recordBusinessActionResultArtifact>[1]> = {}) {
  const { privateEndpointProvisioningPaymentGateRefHash: _omitted, ...command } = completeArtifactCommand(overrides)

  return command
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
      boundEvidenceRefHashes: [...(receipt.boundEvidenceRefHashes ?? [])].sort(),
      signatureRefHash: receipt.signatureRefHash,
      reconstructionStatus: receipt.reconstructionStatus,
      checkedEvidenceStatus: receipt.checkedEvidenceStatus,
      recordedAt: receipt.recordedAt,
    }),
  }
}
