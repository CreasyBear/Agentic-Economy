import { describe, expect, it } from 'vitest'

import type { BusinessId, CorrelationId, OperationKey, OwnerId, ServiceId, SourceHash } from '@/modules/common/ids'
import { brandNonEmpty } from '@/modules/common/ids'
import { consumeContactFollowUpGatewayAdmission } from '@/modules/protected-action/internal/gateway'
import {
  ContactFollowUpActionSlug,
  createContactFollowUpGatewayAdmission,
  createEmptyContactFollowUpSourceState,
  decideContactFollowUpProposal,
  evaluateContactFollowUpPolicy,
  proposeContactFollowUpRequest,
  readContactFollowUpReconstruction,
  recordContactFollowUpProviderAttempt,
  type ContactFollowUpGatewayAdmission,
  type ContactFollowUpOwnerAuthority,
  type ContactFollowUpProposal,
  type ContactFollowUpSourceState,
  type ProposeContactFollowUpRequestCommand,
  type RecordContactFollowUpProviderAttemptCommand,
} from '@/modules/protected-action/public'

const businessId = 'business:p4-gateway' as BusinessId
const serviceId = 'service:p4-gateway' as ServiceId
const ownerId = 'owner:p4-gateway' as OwnerId
const payloadHash = 'hash:p4-gateway-readback' as SourceHash

describe('contact follow-up gateway admission', () => {
  it('requires owner approval before admitting the one selected action', () => {
    const proposed = expectOk(proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), proposalCommand('before-approval')))
    const policy = expectOk(evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now: 20 }))

    const admitted = createContactFollowUpGatewayAdmission(policy.state, {
      authority: authority(),
      proposalId: proposed.proposal.id,
      idempotencyKey: operationKey('gateway:before-approval'),
      correlationId: correlationId('gateway:before-approval'),
      expiresAt: 100,
      now: 30,
    })

    expect(admitted).toMatchObject({ kind: 'error', code: 'contact_follow_up_owner_decision_required' })
  })

  it('consumes a one-use selected-action gateway and rejects wrapper replay', () => {
    const flow = approvedFlow('wrapper-consume')
    const consumed = expectOk(
      consumeContactFollowUpGatewayAdmission(flow.state, {
        gatewayAdmissionId: flow.gateway.id,
        proposalId: flow.proposal.id,
        idempotencyKey: operationKey('gateway-consume:wrapper'),
        correlationId: correlationId('gateway-consume:wrapper'),
        now: 45,
      })
    )
    const replay = consumeContactFollowUpGatewayAdmission(consumed.state, {
      gatewayAdmissionId: flow.gateway.id,
      proposalId: flow.proposal.id,
      idempotencyKey: operationKey('gateway-consume:wrapper-replay'),
      correlationId: correlationId('gateway-consume:wrapper-replay'),
      now: 46,
    })

    expect(consumed.gatewayAdmission).toMatchObject({ status: 'consumed' })
    expect(consumed.auditEvent.eventType).toBe('protected_action.gateway_consumed')
    expect(replay).toMatchObject({ kind: 'error', code: 'contact_follow_up_gateway_replay_rejected' })
  })

  it('records attempts only through an unexpired gateway and preserves consumed readback', () => {
    const flow = approvedFlow('attempt-consume')
    const expired = recordContactFollowUpProviderAttempt(flow.state, {
      ...attemptCommand(flow.proposal, flow.gateway, 'expired'),
      now: 901,
    })
    const attempted = expectOk(recordContactFollowUpProviderAttempt(flow.state, attemptCommand(flow.proposal, flow.gateway, 'ok')))
    const reconstruction = readContactFollowUpReconstruction(attempted.state, flow.proposal.id)

    expect(expired).toMatchObject({ kind: 'error', code: 'contact_follow_up_gateway_expired' })
    expect(reconstruction.gatewayAdmission).toMatchObject({ id: flow.gateway.id, status: 'consumed' })
    expect(reconstruction.auditEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['protected_action.gateway_consumed', 'protected_action.receipt_recorded'])
    )
  })

  it('reconstructs reply, owner refusal, proof gap, expired gateway, and bound-evidence tamper as typed states', () => {
    const replyFlow = approvedFlow('typed-reply')
    const replied = expectOk(
      recordContactFollowUpProviderAttempt(replyFlow.state, {
        ...attemptCommand(replyFlow.proposal, replyFlow.gateway, 'typed-reply'),
        boundEvidenceRefHashes: ['hash:p4-greenlight', 'hash:p4-gateway-check'].map((hash) => brandNonEmpty(hash, 'SourceHash')),
      })
    )
    const replyReconstruction = readContactFollowUpReconstruction(replied.state, replyFlow.proposal.id)

    expect(replied.attempt).toMatchObject({
      outcome: 'receipt_recorded',
      boundEvidenceRefHashes: ['hash:p4-gateway-check', 'hash:p4-greenlight'],
    })
    expect(replied.receipt).toMatchObject({
      kind: 'receipt',
      boundEvidenceRefHashes: ['hash:p4-gateway-check', 'hash:p4-greenlight'],
    })
    expect(replyReconstruction.readbackStatus).toBe('receipt_recorded')

    const refused = rejectedFlow('typed-refusal')
    expect(readContactFollowUpReconstruction(refused.state, refused.proposal.id)).toMatchObject({
      readbackStatus: 'owner_rejected',
      ownerDecision: { decision: 'rejected' },
    })

    const proofGapFlow = approvedFlow('typed-proof-gap')
    const proofGap = expectOk(
      recordContactFollowUpProviderAttempt(proofGapFlow.state, {
        ...attemptCommand(proofGapFlow.proposal, proofGapFlow.gateway, 'typed-proof-gap'),
        boundEvidenceRefHashes: ['hash:p4-proof-gap'].map((hash) => brandNonEmpty(hash, 'SourceHash')),
        readback: { kind: 'proof_gap', gapReason: 'mismatch', payloadHash },
      })
    )
    expect(readContactFollowUpReconstruction(proofGap.state, proofGapFlow.proposal.id)).toMatchObject({
      readbackStatus: 'proof_gap',
      receipt: { kind: 'proof_gap' },
    })

    expect(
      recordContactFollowUpProviderAttempt(replyFlow.state, {
        ...attemptCommand(replyFlow.proposal, replyFlow.gateway, 'typed-expired'),
        boundEvidenceRefHashes: ['hash:p4-expired'].map((hash) => brandNonEmpty(hash, 'SourceHash')),
        now: 901,
      })
    ).toMatchObject({ kind: 'error', code: 'contact_follow_up_gateway_expired' })

    const tamperedState: ContactFollowUpSourceState = {
      ...replied.state,
      receipts: replied.state.receipts.map((receipt) =>
        receipt.id === replied.receipt?.id
          ? {
              ...receipt,
              boundEvidenceRefHashes: ['hash:p4-greenlight-tampered'].map((hash) => brandNonEmpty(hash, 'SourceHash')),
            }
          : receipt
      ),
    }
    const tampered = readContactFollowUpReconstruction(tamperedState, replyFlow.proposal.id)
    expect(tampered.readbackStatus).toBe('disputed')

    const serialized = JSON.stringify([replyReconstruction, tampered])
    expect(serialized).not.toContain('raw-local-hmac')
    expect(serialized).not.toContain('AE_CLEARANCE_SIGNING_SECRET')
    expect(serialized).not.toContain('whsec_')
    expect(serialized).not.toContain('sk_test_')
  })
})

type ApprovedFlow = {
  state: ContactFollowUpSourceState
  proposal: ContactFollowUpProposal
  gateway: ContactFollowUpGatewayAdmission
}

function approvedFlow(suffix: string): ApprovedFlow {
  const proposed = expectOk(proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), proposalCommand(suffix)))
  const policy = expectOk(evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now: 20 }))
  const decided = expectOk(
    decideContactFollowUpProposal(policy.state, {
      authority: authority(),
      proposalId: proposed.proposal.id,
      decision: 'approved',
      reason: `approved:${suffix}`,
      evidenceRefs: [`owner-review:${suffix}`],
      consequenceAccepted: true,
      idempotencyKey: operationKey(`decision:${suffix}`),
      correlationId: correlationId(`decision:${suffix}`),
      now: 30,
    })
  )
  const gateway = expectOk(
    createContactFollowUpGatewayAdmission(decided.state, {
      authority: authority(),
      proposalId: decided.proposal.id,
      idempotencyKey: operationKey(`gateway:${suffix}`),
      correlationId: correlationId(`gateway:${suffix}`),
      expiresAt: 900,
      now: 35,
    })
  )

  return { state: gateway.state, proposal: decided.proposal, gateway: gateway.gatewayAdmission }
}

function rejectedFlow(suffix: string): Pick<ApprovedFlow, 'state' | 'proposal'> {
  const proposed = expectOk(proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), proposalCommand(suffix)))
  const policy = expectOk(evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now: 20 }))
  const decided = expectOk(
    decideContactFollowUpProposal(policy.state, {
      authority: authority(),
      proposalId: proposed.proposal.id,
      decision: 'rejected',
      reason: `rejected:${suffix}`,
      evidenceRefs: [`owner-review:${suffix}`],
      consequenceAccepted: false,
      idempotencyKey: operationKey(`decision:${suffix}`),
      correlationId: correlationId(`decision:${suffix}`),
      now: 30,
    })
  )

  return { state: decided.state, proposal: decided.proposal }
}

function proposalCommand(suffix: string): ProposeContactFollowUpRequestCommand {
  return {
    authority: authority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    target: {
      businessId,
      ownerId,
      serviceId,
      sourceEvidenceRef: `source-message:${suffix}`,
    },
    parameters: {
      contactName: 'Pat Customer',
      contactChannel: 'email',
      messageSummary: `Follow up about source message ${suffix}.`,
      sourceMessageRef: `source-message:${suffix}`,
    },
    idempotencyKey: operationKey(`proposal:${suffix}`),
    correlationId: correlationId(`proposal:${suffix}`),
    deadlineAt: 1_000,
    now: 10,
  }
}

function attemptCommand(
  proposal: ContactFollowUpProposal,
  gateway: ContactFollowUpGatewayAdmission,
  suffix: string
): RecordContactFollowUpProviderAttemptCommand {
  return {
    authority: authority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    proposalId: proposal.id,
    gatewayAdmissionId: gateway.id,
    idempotencyKey: operationKey(`attempt:${suffix}`),
    correlationId: correlationId(`attempt:${suffix}`),
    now: 40,
    readback: { kind: 'receipt', resultRef: `source-receipt:${suffix}`, payloadHash },
  }
}

function authority(): ContactFollowUpOwnerAuthority {
  return { ownerId, actorRef: ownerId, businessIds: [businessId] }
}

function operationKey(value: string): OperationKey {
  return value as OperationKey
}

function correlationId(value: string): CorrelationId {
  return value as CorrelationId
}

function expectOk<Result extends { kind: 'ok'; code: string } | { kind: 'error'; code: string }>(
  result: Result
): Extract<Result, { kind: 'ok' }> {
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok result, received ${result.code}`)
  }

  return result as Extract<Result, { kind: 'ok' }>
}
