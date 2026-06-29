import { describe, expect, it } from 'vitest'

import type {
  ActionReceipt,
  AuthorizationCheckpointDecision,
  BusinessActionCard,
  BusinessActionNoRepairRecord,
  BusinessActionPrivateEvidenceRef,
  BusinessActionSupportRecord,
  BuyerMandate,
} from '@/modules/business-action/public'
import {
  BusinessActionSlug,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordActionReceipt,
  recordAuthorizationCheckpoint,
  recordBusinessActionResultArtifact,
  recordGuardrailDecisionEvidence,
  recordHermesEvidenceEvent,
  type BusinessActionOwnerAuthority,
  type BusinessActionSourceState,
} from '@/modules/business-action/public'
import type {
  BusinessId,
  AuthorizationCheckpointId,
  BusinessActionCardId,
  BusinessActionNoRepairId,
  BusinessActionPrivateEvidenceRefId,
  BusinessActionSupportRecordId,
  BuyerMandateId,
  CapabilityRequestId,
  CorrelationId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'
import { readOwnerBusinessActionDetailRouteReadback } from '@/routes/owner.business-actions.$requestId'
import { readOwnerBusinessActionReceiptRouteReadback } from '@/routes/owner.business-actions.$requestId.receipt'
import { readOwnerBusinessActionRouteReadback } from '@/routes/owner.business-actions'
import { readAdminBusinessActionDetailRouteReadback } from '@/routes/admin.business-actions.$requestId'
import { readAdminBusinessActionsRouteReadback } from '@/routes/admin.business-actions'

const businessId = 'business:p6-route' as BusinessId
const ownerId = 'owner:p6-route' as OwnerId
const wrongOwnerId = 'owner:p6-wrong-route' as OwnerId
const now = 8_000

describe('business-action owner route readbacks', () => {
  it('feeds owner queue, detail, and receipt readbacks from source-owned state', () => {
    const flow = completeFlow('owner-success')

    const queue = readOwnerBusinessActionRouteReadback({ state: flow.state, ownerId, businessId })
    const detail = readOwnerBusinessActionDetailRouteReadback({ state: flow.state, requestId: flow.requestId, ownerId })
    const receipt = readOwnerBusinessActionReceiptRouteReadback({ state: flow.state, requestId: flow.requestId, ownerId })

    expect(queue.queue).toHaveLength(1)
    expect(queue.queue[0]).toMatchObject({
      requestId: flow.requestId,
      checkpointDecision: 'accepted',
      receiptOutcome: 'success',
      reconstructionStatus: 'complete',
    })
    expect(detail).toMatchObject({
      kind: 'ok',
      reconstruction: {
        request: { id: flow.requestId, actionSlug: BusinessActionSlug, status: 'accepted' },
        checkpoint: { decision: 'accepted' },
        resultArtifactState: {
          endpointDescriptor: 'present',
          jsonSchema: 'present',
          privateEndpointRef: 'redacted_present',
          status: 'complete',
        },
      },
    })
    expect(receipt).toMatchObject({
      kind: 'ok',
      reconstruction: {
        receipt: { outcome: 'success', reconstructionStatus: 'complete' },
        publicReadback: {
          labels: ['source/local proof only', 'production proof not claimed'],
        },
      },
    })
  })

  it('renders accepted, refused, clarification_required, proof_gap, and expired checkpoint outcomes', () => {
    const decisions: readonly AuthorizationCheckpointDecision[] = [
      'accepted',
      'refused',
      'clarification_required',
      'proof_gap',
      'expired',
    ]

    for (const decision of decisions) {
      const flow = checkpointOnlyFlow(`checkpoint-${decision}`, decision)
      const detail = readOwnerBusinessActionDetailRouteReadback({ state: flow.state, requestId: flow.requestId, ownerId })
      const receipt = readOwnerBusinessActionReceiptRouteReadback({ state: flow.state, requestId: flow.requestId, ownerId })

      expect(detail).toMatchObject({
        kind: 'ok',
        reconstruction: {
          checkpoint: { decision },
          request: { status: decision },
        },
      })
      expect(receipt).toMatchObject({
        kind: 'ok',
        reconstruction: {
          checkpoint: { decision },
        },
      })
    }
  })

  it('fails closed for wrong-owner reads and redacts private endpoint evidence', () => {
    const flow = completeFlow('wrong-owner')

    const emptyQueue = readOwnerBusinessActionRouteReadback({ state: flow.state, ownerId: wrongOwnerId, businessId })
    const wrongDetail = readOwnerBusinessActionDetailRouteReadback({
      state: flow.state,
      requestId: flow.requestId,
      ownerId: wrongOwnerId,
    })
    const rightReceipt = readOwnerBusinessActionReceiptRouteReadback({ state: flow.state, requestId: flow.requestId, ownerId })

    expect(emptyQueue.queue).toEqual([])
    expect(wrongDetail).toMatchObject({
      kind: 'not_found',
      reason: 'business_action_owner_readback_not_found',
    })
    expect(rightReceipt).toMatchObject({
      kind: 'ok',
      reconstruction: {
        privateEvidenceRefCount: 1,
      },
    })

    const serialized = JSON.stringify([emptyQueue, wrongDetail, rightReceipt])
    expect(serialized).not.toContain('private-endpoint://')
    expect(serialized).not.toContain('privatePayloadRef')
    expect(serialized).not.toContain('raw provider payload')
  })

  it('renders result artifact proof gaps without route-local fixtures', () => {
    const proofGap = acceptedFlow('artifact-proof-gap', 'proof_gap')
    const detail = readOwnerBusinessActionDetailRouteReadback({ state: proofGap.state, requestId: proofGap.requestId, ownerId })
    const receipt = readOwnerBusinessActionReceiptRouteReadback({ state: proofGap.state, requestId: proofGap.requestId, ownerId })

    expect(detail).toMatchObject({
      kind: 'ok',
      reconstruction: {
        resultArtifactState: {
          endpointDescriptor: 'missing',
          jsonSchema: 'missing',
          privateEndpointRef: 'missing',
          status: 'proof_gap',
        },
      },
    })
    expect(receipt).toMatchObject({
      kind: 'ok',
      reconstruction: {
        receipt: { outcome: 'proof_gap', reconstructionStatus: 'proof_gap' },
      },
    })
  })
})

describe('business-action admin route readbacks', () => {
  it('reconstructs success, refusal, and proof-gap states from source-owned rows', () => {
    const success = completeFlow('admin-success')
    const refused = checkpointOnlyFlow('admin-refused', 'refused')
    const proofGap = acceptedFlow('admin-proof-gap', 'proof_gap')

    expect(readAdminBusinessActionDetailRouteReadback({ state: success.state, requestId: success.requestId })).toMatchObject({
      kind: 'ok',
      reconstruction: {
        request: { id: success.requestId, status: 'accepted' },
        checkpoint: { decision: 'accepted' },
        receipt: { outcome: 'success', reconstructionStatus: 'complete' },
        resultArtifactState: { status: 'complete' },
      },
    })
    expect(readAdminBusinessActionDetailRouteReadback({ state: refused.state, requestId: refused.requestId })).toMatchObject({
      kind: 'ok',
      reconstruction: {
        request: { status: 'refused' },
        checkpoint: { decision: 'refused' },
        receipt: { outcome: 'refused', reconstructionStatus: 'refused_no_consequence' },
      },
    })
    expect(readAdminBusinessActionDetailRouteReadback({ state: proofGap.state, requestId: proofGap.requestId })).toMatchObject({
      kind: 'ok',
      reconstruction: {
        request: { status: 'accepted' },
        checkpoint: { decision: 'accepted' },
        receipt: { outcome: 'proof_gap', reconstructionStatus: 'proof_gap' },
        resultArtifactState: { status: 'proof_gap' },
      },
    })
    expect(readAdminBusinessActionsRouteReadback({ state: success.state }).rows).toHaveLength(1)
  })

  it('keeps guardrail decision evidence separate from post-checkpoint external evidence', () => {
    const flow = completeFlow('admin-evidence-separation')
    const readback = readAdminBusinessActionDetailRouteReadback({ state: flow.state, requestId: flow.requestId })

    expect(readback).toMatchObject({
      kind: 'ok',
      reconstruction: {
        guardrailDecisions: [
          {
            provider: 'nemo_guardrails',
            decision: 'allow',
            modelName: 'nemotron',
          },
        ],
        externalEvidenceEvents: [
          {
            provider: 'hermes',
            status: 'accepted',
            evidenceKind: 'execute',
          },
        ],
      },
    })

    const reconstruction = readback.kind === 'ok' ? readback.reconstruction : undefined
    expect(reconstruction?.guardrailDecisions[0]?.provider).not.toBe(reconstruction?.externalEvidenceEvents[0]?.provider)
    expect(JSON.stringify(reconstruction?.guardrailDecisions)).not.toContain('hermes')
    expect(JSON.stringify(reconstruction?.externalEvidenceEvents)).not.toContain('nemo_guardrails')
  })

  it('redacts private evidence families while preserving operator metadata', () => {
    const flow = completeFlow('admin-redaction')
    const readback = readAdminBusinessActionDetailRouteReadback({ state: flow.state, requestId: flow.requestId })

    expect(readback).toMatchObject({
      kind: 'ok',
      reconstruction: {
        privateEvidenceMetadata: {
          count: 1,
          refs: [
            {
              payloadHash: 'hash:private-payload',
              retentionClass: 'business_action_private_evidence',
              accessPolicy: 'owner_admin_operator_only',
            },
          ],
        },
        supportRecords: [{ status: 'open', claimDisablePath: 'business_actions_enabled' }],
        noRepair: { reason: 'No private endpoint artifact can be reconstructed.' },
      },
    })

    const serialized = JSON.stringify(readback)
    expect(serialized).not.toContain('private-endpoint://')
    expect(serialized).not.toContain('privatePayloadRef')
    expect(serialized).not.toContain('raw provider payload')
    expect(serialized).not.toContain('rawPrompt')
    expect(serialized).not.toContain('rawTrace')
    expect(serialized).not.toContain('sk_test_')
    expect(serialized).not.toContain('whsec_')
  })
})

type Flow = {
  state: BusinessActionSourceState
  requestId: CapabilityRequestId
  checkpointId: AuthorizationCheckpointId
  receipt?: ActionReceipt
}

function completeFlow(suffix: string): Flow {
  return acceptedFlow(suffix, 'complete')
}

function acceptedFlow(suffix: string, artifactMode: 'complete' | 'proof_gap'): Flow {
  const checkpointed = checkpointFlow(suffix, 'accepted', { receipt: false })
  const hermes = expectOk(recordHermesEvidenceEvent(checkpointed.state, hermesCommand(checkpointed.requestId, checkpointed.checkpointId, suffix)))
  const artifact = expectOk(
    recordBusinessActionResultArtifact(hermes.state, {
      requestId: checkpointed.requestId,
      checkpointId: checkpointed.checkpointId,
      ...(artifactMode === 'complete'
        ? {
            endpointDescriptorHash: sourceHash(`endpoint-descriptor:${suffix}`),
            jsonSchemaHash: sourceHash(`json-schema:${suffix}`),
            privateEndpointProvisioningPaymentGateRefHash: sourceHash(`private-endpoint:${suffix}`),
            supportingEvidenceLabels: ['hermes_execute'],
          }
        : {}),
      idempotencyKey: operationKey(`artifact:${suffix}`),
      correlationId: correlationId(`artifact:${suffix}`),
      recordedAt: now + 30,
    })
  )
  const receipted = expectOk(
    recordActionReceipt(artifact.state, {
      requestId: checkpointed.requestId,
      idempotencyKey: operationKey(`receipt:${suffix}`),
      correlationId: correlationId(`receipt:${suffix}`),
      recordedAt: now + 40,
    })
  )

  return {
    state: addPrivateRouteEvidence(receipted.state, checkpointed.requestId),
    requestId: checkpointed.requestId,
    checkpointId: checkpointed.checkpointId,
    receipt: receipted.receipt,
  }
}

function checkpointOnlyFlow(suffix: string, decision: AuthorizationCheckpointDecision): Flow {
  return checkpointFlow(suffix, decision, { receipt: true })
}

function checkpointFlow(
  suffix: string,
  decision: AuthorizationCheckpointDecision,
  options: { receipt: boolean }
): Flow {
  const created = expectOk(
    createCapabilityRequest(createEmptyBusinessActionSourceState({ cards: [card(suffix)], mandates: [mandate(suffix)] }), {
      actionSlug: BusinessActionSlug,
      cardId: cardId(suffix),
      mandateId: mandateId(suffix),
      businessId,
      amountCents: 4_500,
      currency: 'aud',
      requestedBy: 'hermes',
      idempotencyKey: operationKey(`request:${suffix}`),
      correlationId: correlationId(`request:${suffix}`),
      now,
      expiresAt: now + 1_000,
    })
  )
  const guarded = expectOk(recordGuardrailDecisionEvidence(created.state, guardrailCommand(created.request.id, suffix)))
  const checkpointed = expectOk(
    recordAuthorizationCheckpoint(guarded.state, {
      requestId: created.request.id,
      decision,
      authority: authority(),
      ownerDecisionRef: `owner-decision:${suffix}`,
      reasonCode: `owner_${decision}`,
      idempotencyKey: operationKey(`checkpoint:${suffix}`),
      correlationId: correlationId(`checkpoint:${suffix}`),
      now: now + 10,
      expiresAt: now + 900,
    })
  )
  const receipted = options.receipt
    ? expectOk(
        recordActionReceipt(checkpointed.state, {
          requestId: created.request.id,
          idempotencyKey: operationKey(`receipt:${suffix}`),
          correlationId: correlationId(`receipt:${suffix}`),
          recordedAt: now + 40,
        })
      )
    : undefined

  return {
    state: addPrivateRouteEvidence(receipted?.state ?? checkpointed.state, created.request.id),
    requestId: created.request.id,
    checkpointId: checkpointed.checkpoint.id,
    ...(receipted === undefined ? {} : { receipt: receipted.receipt }),
  }
}

function addPrivateRouteEvidence(state: BusinessActionSourceState, requestId: CapabilityRequestId): BusinessActionSourceState {
  return {
    ...state,
    privateEvidenceRefs: [privateEvidenceRef(requestId)],
    supportRecords: [supportRecord()],
    noRepairRecords: [noRepairRecord(requestId)],
  }
}

function card(suffix: string): BusinessActionCard {
  return {
    id: cardId(suffix),
    actionSlug: BusinessActionSlug,
    version: 1,
    ownerId,
    sourceHash: sourceHash(`card:${suffix}`),
    status: 'active',
    publicLabel: 'Provision paid intake endpoint',
    posture: 'proposal_only',
    callable: false,
    paymentRequired: false,
    ownerApprovalRequired: true,
    receiptRequired: true,
    updatedAt: now - 10,
  }
}

function mandate(suffix: string): BuyerMandate {
  return {
    id: mandateId(suffix),
    buyerRef: `buyer:${suffix}`,
    allowedBusinessId: businessId,
    allowedActionSlug: BusinessActionSlug,
    maxAmountCents: 5_000,
    currency: 'aud',
    status: 'active',
    mandateHash: sourceHash(`mandate:${suffix}`),
    idempotencyKey: operationKey(`mandate:${suffix}`),
    correlationId: correlationId(`mandate:${suffix}`),
    createdAt: now - 100,
    expiresAt: now + 2_000,
  }
}

function guardrailCommand(requestId: CapabilityRequestId, suffix: string) {
  return {
    requestId,
    provider: 'nemo_guardrails',
    modelName: 'nemotron',
    modelVersion: 'local-test',
    decision: 'allow',
    policyHash: sourceHash(`policy:${suffix}`),
    privateTraceRefHash: sourceHash(`trace:${suffix}`),
    payloadHash: sourceHash(`guardrail:${suffix}`),
    idempotencyKey: operationKey(`guardrail:${suffix}`),
    correlationId: correlationId(`guardrail:${suffix}`),
    recordedAt: now + 5,
  } as const
}

function hermesCommand(requestId: CapabilityRequestId, checkpointId: AuthorizationCheckpointId, suffix: string) {
  return {
    requestId,
    checkpointId,
    evidenceKind: 'execute',
    providerRefHash: sourceHash(`hermes-ref:${suffix}`),
    payloadHash: sourceHash(`hermes:${suffix}`),
    idempotencyKey: operationKey(`hermes:${suffix}`),
    correlationId: correlationId(`hermes:${suffix}`),
    receivedAt: now + 20,
  } as const
}

function privateEvidenceRef(requestId: CapabilityRequestId): BusinessActionPrivateEvidenceRef {
  return {
    id: 'business_action_private_evidence:route' as BusinessActionPrivateEvidenceRefId,
    requestId,
    retentionClass: 'business_action_private_evidence',
    accessPolicy: 'owner_admin_operator_only',
    payloadHash: sourceHash('private-payload'),
    privatePayloadRef: 'private-endpoint://raw provider payload',
    ttlExpiresAt: now + 86_400_000,
  }
}

function supportRecord(): BusinessActionSupportRecord {
  return {
    id: 'business_action_support:route' as BusinessActionSupportRecordId,
    actionSlug: BusinessActionSlug,
    businessId,
    status: 'open',
    reason: 'source-local route support record',
    evidenceRefs: ['support:route'],
    claimDisablePath: 'business_actions_enabled',
    operatorNextAction: 'operator_review_required',
    sourceHash: sourceHash('support'),
    correlationId: correlationId('support'),
    createdAt: now,
    updatedAt: now,
  }
}

function noRepairRecord(requestId: CapabilityRequestId): BusinessActionNoRepairRecord {
  return {
    id: 'business_action_no_repair:route' as BusinessActionNoRepairId,
    requestId,
    reason: 'No private endpoint artifact can be reconstructed.',
    evidenceRefs: ['private-evidence:route'],
    noRepairHash: sourceHash('no-repair'),
    idempotencyKey: operationKey('no-repair'),
    correlationId: correlationId('no-repair'),
    markedBy: 'operator:route',
    markedAt: now + 50,
  }
}

function authority(): BusinessActionOwnerAuthority {
  return {
    ownerId,
    actorRef: 'owner:p6-route',
    businessIds: [businessId],
    status: 'active',
  }
}

function cardId(suffix: string): BusinessActionCardId {
  return `business_action_card:${suffix}` as BusinessActionCardId
}

function mandateId(suffix: string): BuyerMandateId {
  return `buyer_mandate:${suffix}` as BuyerMandateId
}

function operationKey(value: string): OperationKey {
  return `operation:${value}` as OperationKey
}

function correlationId(value: string): CorrelationId {
  return `correlation:${value}` as CorrelationId
}

function sourceHash(value: string): SourceHash {
  return `hash:${value}` as SourceHash
}

function expectOk<Result extends { kind: 'ok'; code: string } | { kind: 'error'; code: string }>(
  result: Result
): Extract<Result, { kind: 'ok' }> {
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok result, received ${JSON.stringify(result)}`)
  }

  return result as Extract<Result, { kind: 'ok' }>
}
