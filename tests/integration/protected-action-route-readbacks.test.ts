import { describe, expect, it } from 'vitest'

import type { BusinessId, CorrelationId, OperationKey, OwnerId, ServiceId, SourceHash } from '@/modules/common/ids'
import {
  ContactFollowUpActionSlug,
  createContactFollowUpGatewayAdmission,
  createEmptyContactFollowUpSourceState,
  decideContactFollowUpProposal,
  evaluateContactFollowUpPolicy,
  proposeContactFollowUpRequest,
  recordContactFollowUpProviderAttempt,
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
})

type ReceiptFlow = {
  state: ContactFollowUpSourceState
  proposal: ContactFollowUpProposal
}

function receiptFlow(suffix: string): ReceiptFlow {
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
  const attempted = expectOk(
    recordContactFollowUpProviderAttempt(gateway.state, {
      authority: authority(),
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalId: decided.proposal.id,
      gatewayAdmissionId: gateway.gatewayAdmission.id,
      idempotencyKey: operationKey(`attempt:${suffix}`),
      correlationId: correlationId(`attempt:${suffix}`),
      now: 40,
      readback: { kind: 'receipt', resultRef: `source-receipt:${suffix}`, payloadHash },
    })
  )

  return { state: attempted.state, proposal: decided.proposal }
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
