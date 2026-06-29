import { describe, expect, it } from 'vitest'

import type {
  BusinessId,
  CorrelationId,
  OperationKey,
  OwnerId,
  ServiceId,
  SourceHash,
} from '@/modules/common/ids'
import {
  applyContactFollowUpRetentionDelete,
  contactFollowUpRetentionPolicy,
  registerContactFollowUpPrivateEvidenceRef,
} from '@/modules/protected-action/internal/retention'
import {
  defaultContactFollowUpSupportRecord,
  evaluateContactFollowUpClaimGate,
  readContactFollowUpSupportLoad,
} from '@/modules/protected-action/internal/support'
import {
  ContactFollowUpActionSlug,
  createContactFollowUpGatewayAdmission,
  createEmptyContactFollowUpSourceState,
  decideContactFollowUpProposal,
  evaluateContactFollowUpPolicy,
  markContactFollowUpNoRepair,
  proposeContactFollowUpRequest,
  recordContactFollowUpProviderAttempt,
  type ContactFollowUpAttempt,
  type ContactFollowUpOwnerAuthority,
  type ContactFollowUpProposal,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'

const businessId = 'business:p4-retention' as BusinessId
const serviceId = 'service:p4-retention' as ServiceId
const ownerId = 'owner:p4-retention' as OwnerId
const payloadHash = 'hash:p4-private-readback' as SourceHash

describe('contact follow-up retention and support controls', () => {
  it('redacts private evidence refs while preserving hashes and tombstone timing', () => {
    const flow = proofGapFlow('retention')
    const withPrivateRef = registerContactFollowUpPrivateEvidenceRef(flow.state, {
      id: 'contact-follow-up-private-evidence:test-retention' as never,
      proposalId: flow.proposal.id,
      attemptId: flow.attempt.id,
      payloadHash,
      privatePayloadRef: 'private:evidence/raw-follow-up-payload',
      now: 60,
    })
    const redacted = applyContactFollowUpRetentionDelete(withPrivateRef, { proposalId: flow.proposal.id, now: 90 })

    expect(contactFollowUpRetentionPolicy).toMatchObject({
      rawEvidenceDefault: 'discard_after_hash_and_normalization',
      exportBehavior: 'redacted_refs_with_hashes',
      deleteBehavior: 'redact_private_refs_preserve_tombstone_hashes',
    })
    expect(redacted.privateEvidenceRefs[0]).toMatchObject({
      proposalId: flow.proposal.id,
      attemptId: flow.attempt.id,
      payloadHash,
      redactedAt: 90,
    })
    expect(redacted.privateEvidenceRefs[0]).not.toHaveProperty('privatePayloadRef')
  })

  it('keeps public claim gating behind support load, operator controls, and copy scans', () => {
    const cleanState = createEmptyContactFollowUpSourceState()
    const supportRecord = defaultContactFollowUpSupportRecord(100)

    expect(
      evaluateContactFollowUpClaimGate({
        state: cleanState,
        controls: { protectedActionsEnabled: true, protectedActionAttemptsEnabled: true },
        supportRecord,
        copyScanPassed: true,
        now: 100,
      })
    ).toEqual({ allowed: true, claimId: 'p4_contact_follow_up_owner_approved' })

    expect(
      evaluateContactFollowUpClaimGate({
        state: cleanState,
        controls: { protectedActionsEnabled: false, protectedActionAttemptsEnabled: true },
        supportRecord,
        copyScanPassed: true,
        now: 100,
      })
    ).toEqual({ allowed: false, reason: 'protected_actions_disabled' })

    expect(
      evaluateContactFollowUpClaimGate({
        state: cleanState,
        controls: { protectedActionsEnabled: true, protectedActionAttemptsEnabled: true },
        supportRecord,
        copyScanPassed: false,
        now: 100,
      })
    ).toEqual({ allowed: false, reason: 'copy_scan_failed' })
  })

  it('blocks public claim posture when proof gaps or no-repair records need support review', () => {
    const flow = proofGapFlow('support')
    const noRepair = expectOk(
      markContactFollowUpNoRepair(flow.state, {
        authority: authority(),
        proposalId: flow.proposal.id,
        attemptId: flow.attempt.id,
        reason: 'provider outbox did not return source receipt',
        evidenceRefs: ['support-review:proof-gap'],
        idempotencyKey: operationKey('no-repair:support'),
        correlationId: correlationId('no-repair:support'),
        now: 120,
      })
    )
    const supportRecord = defaultContactFollowUpSupportRecord(100)

    expect(readContactFollowUpSupportLoad(noRepair.state, 130)).toMatchObject({ proofGaps: 1, noRepair: 1 })
    expect(
      evaluateContactFollowUpClaimGate({
        state: noRepair.state,
        controls: { protectedActionsEnabled: true, protectedActionAttemptsEnabled: true },
        supportRecord,
        copyScanPassed: true,
        now: 130,
      })
    ).toEqual({ allowed: false, reason: 'unresolved_proof_gaps_exceeded' })
  })
})

type ProofGapFlow = {
  state: ContactFollowUpSourceState
  proposal: ContactFollowUpProposal
  attempt: ContactFollowUpAttempt
}

function proofGapFlow(suffix: string): ProofGapFlow {
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
      readback: { kind: 'proof_gap', gapReason: 'timeout', payloadHash },
    })
  )

  return { state: attempted.state, proposal: decided.proposal, attempt: attempted.attempt }
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
