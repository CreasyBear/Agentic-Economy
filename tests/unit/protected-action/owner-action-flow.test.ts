import { describe, expect, it } from 'vitest'

import type { BusinessId, CorrelationId, OperationKey, OwnerId, ServiceId, SourceHash } from '@/modules/common/ids'
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

const businessId = 'business:contact-flow' as BusinessId
const serviceId = 'service:contact-flow' as ServiceId
const ownerId = 'owner:contact-flow' as OwnerId
const otherOwnerId = 'owner:other' as OwnerId
const payloadHash = 'hash:provider-readback' as SourceHash

describe('owner-pending contact follow-up flow', () => {
  it('does not record a provider attempt before an owner decision', () => {
    const proposed = expectOkResult(proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), proposalCommand('pre-approval')))
    const policy = expectOkResult(
      evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now: 20 })
    )

    const attempted = recordContactFollowUpProviderAttempt(policy.state, attemptCommand(proposed.proposal, undefined, 'pre-approval'))

    expect(attempted).toMatchObject({ kind: 'error', code: 'contact_follow_up_owner_decision_required' })
    expect(policy.state.attempts).toHaveLength(0)
    expect(policy.state.receipts).toHaveLength(0)
  })

  it('records receipt and proof-gap readbacks only after the owner approves', () => {
    const receiptFlow = approvedFlow('receipt')
    const receiptAttempt = expectOkResult(
      recordContactFollowUpProviderAttempt(receiptFlow.state, attemptCommand(receiptFlow.proposal, receiptFlow.gateway, 'receipt'))
    )
    const receiptReadback = readContactFollowUpReconstruction(receiptAttempt.state, receiptFlow.proposal.id)

    expect(receiptAttempt.receipt).toMatchObject({ kind: 'receipt', providerBoundary: 'source_owned_follow_up_outbox' })
    expect(receiptReadback.readbackStatus).toBe('receipt_recorded')
    expect(receiptReadback.auditEvents.map((event) => event.eventType)).toContain('protected_action.receipt_recorded')

    const gapFlow = approvedFlow('gap')
    const gapAttempt = expectOkResult(
      recordContactFollowUpProviderAttempt(gapFlow.state, {
        ...attemptCommand(gapFlow.proposal, gapFlow.gateway, 'gap'),
        readback: { kind: 'proof_gap', gapReason: 'timeout', payloadHash },
      })
    )
    const gapReadback = readContactFollowUpReconstruction(gapAttempt.state, gapFlow.proposal.id)

    expect(gapAttempt.receipt).toMatchObject({ kind: 'proof_gap' })
    expect(gapReadback.readbackStatus).toBe('proof_gap')
    expect(gapReadback.repairAction).toBe('retry_available')
  })

  it('keeps idempotent replay deterministic and rejects same-key body drift', () => {
    const state = createEmptyContactFollowUpSourceState()
    const command = proposalCommand('replay')
    const proposed = expectOkResult(proposeContactFollowUpRequest(state, command))
    const replayed = expectOkResult(proposeContactFollowUpRequest(proposed.state, command))
    const conflict = proposeContactFollowUpRequest(proposed.state, {
      ...command,
      parameters: { ...command.parameters, messageSummary: 'Changed body' },
    })

    expect(replayed.code).toBe('contact_follow_up_proposal_replayed')
    expect(replayed.proposal.id).toBe(proposed.proposal.id)
    expect(conflict).toMatchObject({ kind: 'error', code: 'contact_follow_up_idempotency_conflict' })

    const flow = approvedFlow('attempt-replay')
    const attemptCommandValue = attemptCommand(flow.proposal, flow.gateway, 'attempt-replay')
    const attempted = expectOkResult(recordContactFollowUpProviderAttempt(flow.state, attemptCommandValue))
    const attemptReplay = expectOkResult(recordContactFollowUpProviderAttempt(attempted.state, attemptCommandValue))
    const attemptConflict = recordContactFollowUpProviderAttempt(attempted.state, {
      ...attemptCommandValue,
      readback: { kind: 'proof_gap', gapReason: 'mismatch', payloadHash },
    })

    expect(attemptReplay.code).toBe('contact_follow_up_attempt_replayed')
    expect(attemptReplay.attempt.id).toBe(attempted.attempt.id)
    expect(attemptConflict).toMatchObject({ kind: 'error', code: 'contact_follow_up_idempotency_conflict' })
  })

  it('rejects concurrent owner decisions after one source-owned decision wins', () => {
    const proposed = expectOkResult(proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), proposalCommand('decision-race')))
    const policy = expectOkResult(evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now: 20 }))
    const approved = expectOkResult(
      decideContactFollowUpProposal(policy.state, {
        authority: authority(),
        proposalId: proposed.proposal.id,
        decision: 'approved',
        reason: 'First owner decision wins.',
        evidenceRefs: ['owner-review:decision-race'],
        consequenceAccepted: true,
        idempotencyKey: operationKey('decision:race:approve'),
        correlationId: correlationId('decision:race:approve'),
        now: 30,
      })
    )
    const concurrentReject = decideContactFollowUpProposal(approved.state, {
      authority: authority(),
      proposalId: proposed.proposal.id,
      decision: 'rejected',
      reason: 'Concurrent rejection should not replace approval.',
      evidenceRefs: ['owner-review:decision-race-reject'],
      consequenceAccepted: false,
      idempotencyKey: operationKey('decision:race:reject'),
      correlationId: correlationId('decision:race:reject'),
      now: 31,
    })

    expect(concurrentReject).toMatchObject({
      kind: 'error',
      code: 'contact_follow_up_idempotency_conflict',
      reason: 'proposal_already_decided',
    })
    expect(approved.state.ownerDecisions).toHaveLength(1)
  })

  it('rejects unknown slug, direct modes, suppressed targets, untrusted keys, blocked value fields, and wrong owner', () => {
    const state = createEmptyContactFollowUpSourceState()

    expect(proposeContactFollowUpRequest(state, proposalCommand('bad-slug', { selectedActionSlug: 'other' }))).toMatchObject({
      kind: 'error',
      code: 'contact_follow_up_unknown_slug',
    })
    expect(proposeContactFollowUpRequest(state, proposalCommand('direct', { executionMode: 'direct' }))).toMatchObject({
      kind: 'error',
      code: 'contact_follow_up_direct_mode_rejected',
    })
    expect(
      proposeContactFollowUpRequest(state, proposalCommand('suppressed', { target: target({ suppressed: true }) }))
    ).toMatchObject({ kind: 'error', code: 'contact_follow_up_target_suppressed' })
    expect(
      proposeContactFollowUpRequest(state, proposalCommand('untrusted', { parameters: { ...parameters(), notes: 'extra' } }))
    ).toMatchObject({ kind: 'error', code: 'contact_follow_up_untrusted_parameter' })
    expect(
      proposeContactFollowUpRequest(state, proposalCommand('blocked-field', { parameters: { ...parameters(), paymentRequired: true } }))
    ).toMatchObject({ kind: 'error', code: 'contact_follow_up_money_field_rejected' })
    expect(
      proposeContactFollowUpRequest(
        state,
        proposalCommand('blocked-nested-field', { unsafeClientFields: { nested: { wallet: 'not accepted' } } })
      )
    ).toMatchObject({ kind: 'error', code: 'contact_follow_up_money_field_rejected' })
    expect(proposeContactFollowUpRequest(state, proposalCommand('wrong-owner', { authority: authority(otherOwnerId) }))).toMatchObject({
      kind: 'error',
      code: 'contact_follow_up_owner_denied',
    })

    const flow = approvedFlow('direct-attempt')
    expect(
      recordContactFollowUpProviderAttempt(flow.state, { ...attemptCommand(flow.proposal, flow.gateway, 'direct-attempt'), executionMode: 'direct' })
    ).toMatchObject({ kind: 'error', code: 'contact_follow_up_direct_mode_rejected' })
    expect(
      recordContactFollowUpProviderAttempt(flow.state, { ...attemptCommand(flow.proposal, flow.gateway, 'bad-attempt-slug'), selectedActionSlug: 'other' })
    ).toMatchObject({ kind: 'error', code: 'contact_follow_up_unknown_slug' })
    expect(
      recordContactFollowUpProviderAttempt(flow.state, { ...attemptCommand(flow.proposal, flow.gateway, 'wrong-owner-attempt'), authority: authority(otherOwnerId) })
    ).toMatchObject({ kind: 'error', code: 'contact_follow_up_owner_denied' })
  })
})

type ApprovedFlowFixture = {
  state: ContactFollowUpSourceState
  proposal: ContactFollowUpProposal
  gateway: ContactFollowUpGatewayAdmission
}

function approvedFlow(suffix: string): ApprovedFlowFixture {
  const proposed = expectOkResult(proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), proposalCommand(suffix)))
  const policy = expectOkResult(evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now: 20 }))
  const decided = expectOkResult(
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

  const gateway = expectOkResult(
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

function proposalCommand(
  suffix: string,
  overrides: Partial<ProposeContactFollowUpRequestCommand> = {}
): ProposeContactFollowUpRequestCommand {
  return {
    authority: authority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    target: target(),
    parameters: parameters(),
    idempotencyKey: operationKey(`proposal:${suffix}`),
    correlationId: correlationId(`proposal:${suffix}`),
    deadlineAt: 1_000,
    now: 10,
    ...overrides,
  }
}

function attemptCommand(
  proposal: ContactFollowUpProposal,
  gateway: ContactFollowUpGatewayAdmission | undefined,
  suffix: string
): RecordContactFollowUpProviderAttemptCommand {
  return {
    authority: authority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    proposalId: proposal.id,
    gatewayAdmissionId:
      gateway?.id ??
      (`contact-follow-up-gateway:${proposal.id}:missing-${suffix}` as RecordContactFollowUpProviderAttemptCommand['gatewayAdmissionId']),
    idempotencyKey: operationKey(`attempt:${suffix}`),
    correlationId: correlationId(`attempt:${suffix}`),
    now: 40,
    readback: { kind: 'receipt', resultRef: `source-receipt:${suffix}`, payloadHash },
  }
}

function target(overrides: Partial<ProposeContactFollowUpRequestCommand['target']> = {}): ProposeContactFollowUpRequestCommand['target'] {
  return {
    businessId,
    ownerId,
    serviceId,
    sourceEvidenceRef: 'source-message:contact-flow',
    ...overrides,
  }
}

function parameters(): Record<string, unknown> {
  return {
    contactName: 'Pat Customer',
    contactChannel: 'email',
    messageSummary: 'Follow up with the source message sender about available appointment windows.',
    sourceMessageRef: 'source-message:contact-flow',
  }
}

function authority(id: OwnerId = ownerId): ContactFollowUpOwnerAuthority {
  return { ownerId: id, actorRef: id, businessIds: [businessId] }
}

function operationKey(value: string): OperationKey {
  return value as OperationKey
}

function correlationId(value: string): CorrelationId {
  return value as CorrelationId
}

function expectOkResult<Result extends { kind: 'ok'; code: string } | { kind: 'error'; code: string }>(
  result: Result
): Extract<Result, { kind: 'ok' }> {
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok result, received ${result.code}`)
  }

  return result as Extract<Result, { kind: 'ok' }>
}
