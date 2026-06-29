import { describe, expect, it } from 'vitest'

import type { BusinessId, CorrelationId, OperationKey, OwnerId, ServiceId, SourceHash } from '@/modules/common/ids'
import {
  ContactFollowUpActionSlug,
  createContactFollowUpGatewayAdmission,
  createEmptyContactFollowUpSourceState,
  decideContactFollowUpProposal,
  evaluateContactFollowUpPolicy,
  markContactFollowUpNoRepair,
  proposeContactFollowUpRequest,
  recordContactFollowUpProviderAttempt,
  type ContactFollowUpAttemptReadback,
  type ContactFollowUpOwnerAuthority,
  type ContactFollowUpProposal,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'
import { readAdminProtectedActionDetailRouteReadback } from '@/routes/admin.protected-actions.$proposalId'
import { readAdminProtectedActionsRouteReadback } from '@/routes/admin.protected-actions'
import { readOwnerContactFollowUpDetailRouteReadback } from '@/routes/owner.actions.$proposalId'
import { readOwnerContactFollowUpReceiptRouteReadback } from '@/routes/owner.actions.$proposalId.receipt'
import { readOwnerContactFollowUpRouteReadback } from '@/routes/owner.actions'

const businessId = 'business:p4-route' as BusinessId
const serviceId = 'service:p4-route' as ServiceId
const ownerId = 'owner:p4-route' as OwnerId
const payloadHash = 'hash:p4-route-readback' as SourceHash

describe('selected protected-action route readbacks', () => {
  it('feeds owner queue, owner detail, receipt, and admin reconstruction from one source state', () => {
    const flow = receiptFlow('route')
    const queue = readOwnerContactFollowUpRouteReadback({ state: flow.state, ownerId, businessId })
    const detail = readOwnerContactFollowUpDetailRouteReadback({ state: flow.state, proposalId: flow.proposal.id })
    const receipt = readOwnerContactFollowUpReceiptRouteReadback({ state: flow.state, proposalId: flow.proposal.id })
    const adminList = readAdminProtectedActionsRouteReadback({ state: flow.state })
    const adminFiltered = readAdminProtectedActionsRouteReadback({ state: flow.state, proposalId: flow.proposal.id })
    const adminDetail = readAdminProtectedActionDetailRouteReadback({ state: flow.state, proposalId: flow.proposal.id })

    expect(queue.queue).toHaveLength(1)
    expect(queue.reconstructions[0]).toMatchObject({ readbackStatus: 'receipt_recorded' })
    expect(detail).toMatchObject({ readbackStatus: 'receipt_recorded', proposal: { selectedActionSlug: 'contact-follow-up' } })
    expect(receipt).toMatchObject({ gatewayAdmission: { status: 'consumed' }, receipt: { kind: 'receipt' } })
    expect(adminList.rows).toHaveLength(1)
    expect(adminFiltered.rows).toHaveLength(1)
    expect(adminDetail).toMatchObject({ repairAction: 'none', receipt: { providerBoundary: 'source_owned_follow_up_outbox' } })
  })

  it('does not invent data for empty or missing proposal route readbacks', () => {
    const emptyOwner = readOwnerContactFollowUpRouteReadback({ state: createEmptyContactFollowUpSourceState(), ownerId, businessId })
    const missing = readOwnerContactFollowUpDetailRouteReadback({
      state: createEmptyContactFollowUpSourceState(),
      proposalId: 'contact-follow-up:missing-route' as never,
    })

    expect(emptyOwner.queue).toEqual([])
    expect(emptyOwner.reconstructions).toEqual([])
    expect(missing).toMatchObject({
      readbackStatus: 'missing',
      repairAction: 'none',
      proposal: { selectedActionSlug: 'contact-follow-up', parameters: { contactName: 'Missing request' } },
    })
  })

  it('surfaces owner-pending, rejected, proof-gap, failed, and no-repair states without private payloads', () => {
    const pending = pendingFlow('pending')
    const rejected = rejectedFlow('rejected')
    const proofGap = attemptFlow('proof-gap', { kind: 'proof_gap', gapReason: 'timeout', payloadHash })
    const failed = attemptFlow('failed', { kind: 'failed', failureReason: 'provider_unavailable', payloadHash })
    const noRepair = noRepairFlow('no-repair')

    expect(readOwnerContactFollowUpDetailRouteReadback({ state: pending.state, proposalId: pending.proposal.id })).toMatchObject({
      readbackStatus: 'awaiting_owner_review',
      repairAction: 'owner_can_reject',
      proposal: { selectedActionSlug: 'contact-follow-up' },
    })
    expect(readOwnerContactFollowUpDetailRouteReadback({ state: rejected.state, proposalId: rejected.proposal.id })).toMatchObject({
      readbackStatus: 'owner_rejected',
      repairAction: 'none',
      ownerDecision: { decision: 'rejected' },
    })
    expect(readOwnerContactFollowUpReceiptRouteReadback({ state: proofGap.state, proposalId: proofGap.proposal.id })).toMatchObject({
      readbackStatus: 'proof_gap',
      repairAction: 'retry_available',
      receipt: { kind: 'proof_gap' },
    })
    expect(readAdminProtectedActionDetailRouteReadback({ state: failed.state, proposalId: failed.proposal.id })).toMatchObject({
      readbackStatus: 'failed',
      repairAction: 'retry_available',
      attempt: { outcome: 'failed' },
    })
    expect(readAdminProtectedActionsRouteReadback({ state: noRepair.state, proposalId: noRepair.proposal.id }).rows[0]).toMatchObject({
      readbackStatus: 'no_repair',
      repairAction: 'none',
      noRepair: { reason: 'Operator evidence is insufficient to repair this source-owned proof gap.' },
    })

    const serialized = JSON.stringify([proofGap.state, failed.state, noRepair.state])
    expect(serialized).not.toContain('customer@example.test')
    expect(serialized).not.toContain('raw provider')
  })
})

type ReceiptFlow = {
  state: ContactFollowUpSourceState
  proposal: ContactFollowUpProposal
}

function receiptFlow(suffix: string): ReceiptFlow {
  return attemptFlow(suffix, { kind: 'receipt', resultRef: `source-receipt:${suffix}`, payloadHash })
}

function pendingFlow(suffix: string): ReceiptFlow {
  const proposed = expectOk(
    proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), {
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
    })
  )
  const policy = expectOk(evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now: 20 }))
  return { state: policy.state, proposal: proposed.proposal }
}

function rejectedFlow(suffix: string): ReceiptFlow {
  const proposed = pendingFlow(suffix)
  const decided = expectOk(
    decideContactFollowUpProposal(proposed.state, {
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

  return { state: decided.state, proposal: proposed.proposal }
}

function noRepairFlow(suffix: string): ReceiptFlow {
  const proofGap = attemptFlow(suffix, { kind: 'proof_gap', gapReason: 'timeout', payloadHash })
  const noRepair = expectOk(
    markContactFollowUpNoRepair(proofGap.state, {
      authority: authority(),
      proposalId: proofGap.proposal.id,
      ...(proofGap.state.attempts[0] === undefined ? {} : { attemptId: proofGap.state.attempts[0].id }),
      reason: 'Operator evidence is insufficient to repair this source-owned proof gap.',
      evidenceRefs: [`operator:${suffix}`],
      idempotencyKey: operationKey(`no-repair:${suffix}`),
      correlationId: correlationId(`no-repair:${suffix}`),
      now: 50,
    })
  )

  return { state: noRepair.state, proposal: proofGap.proposal }
}

function attemptFlow(suffix: string, readback: ContactFollowUpAttemptReadback): ReceiptFlow {
  const proposed = pendingFlow(suffix)
  const decided = expectOk(
    decideContactFollowUpProposal(proposed.state, {
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
  const attempted = expectOk(
    recordContactFollowUpProviderAttempt(gateway.state, {
      authority: authority(),
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalId: decided.proposal.id,
      gatewayAdmissionId: gateway.gatewayAdmission.id,
      idempotencyKey: operationKey(`attempt:${suffix}`),
      correlationId: correlationId(`attempt:${suffix}`),
      now: 40,
      readback,
    })
  )

  return { state: attempted.state, proposal: proposed.proposal }
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
