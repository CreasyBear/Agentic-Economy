import { describe, expect, it } from 'vitest'

import type { BusinessId, CorrelationId, OperationKey, OwnerId, ServiceId } from '@/modules/common/ids'
import {
  ContactFollowUpActionSlug,
  createContactFollowUpGatewayAdmission,
  createEmptyContactFollowUpSourceState,
  decideContactFollowUpProposal,
  evaluateContactFollowUpPolicy,
  proposeContactFollowUpRequest,
  recordContactFollowUpProviderAttempt,
  type ContactFollowUpOwnerAuthority,
  type ContactFollowUpPolicyKind,
  type ProposeContactFollowUpRequestCommand,
} from '@/modules/protected-action/public'

const businessId = 'business:p4-policy' as BusinessId
const serviceId = 'service:p4-policy' as ServiceId
const ownerId = 'owner:p4-policy' as OwnerId

describe('selected contact follow-up policy matrix', () => {
  it.each([
    ['review_required', {}, 20],
    ['time_bound', { deadlineAt: 1_000 }, 955],
    ['expired', { deadlineAt: 1_000 }, 1_001],
    ['missing_proof', { policyHints: { sourceProof: 'missing' as const } }, 20],
    ['proof_gap', { policyHints: { sourceProof: 'gap' as const } }, 20],
    ['external_authority', { policyHints: { requiresExternalAuthority: true } }, 20],
  ] satisfies ReadonlyArray<[ContactFollowUpPolicyKind, Partial<ProposeContactFollowUpRequestCommand>, number]>)(
    'classifies %s without gateway or attempt side effects',
    (kind, overrides, now) => {
      const proposed = expectOk(proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), proposalCommand(kind, overrides)))
      const policy = expectOk(evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now }))

      expect(policy.policy.kind).toBe(kind)
      expect(policy.state.gatewayAdmissions).toHaveLength(0)
      expect(policy.state.attempts).toHaveLength(0)
      expect(policy.state.receipts).toHaveLength(0)
      expect(policy.state.privateEvidenceRefs).toHaveLength(0)
    }
  )

  it('refuses decisions and attempts for denied policy states', () => {
    const proposed = expectOk(
      proposeContactFollowUpRequest(
        createEmptyContactFollowUpSourceState(),
        proposalCommand('denied-policy', { policyHints: { requiresExternalAuthority: true } })
      )
    )
    const policy = expectOk(evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now: 20 }))
    const decided = decideContactFollowUpProposal(policy.state, {
      authority: authority(),
      proposalId: proposed.proposal.id,
      decision: 'approved',
      reason: 'should not pass',
      evidenceRefs: ['owner-review:denied'],
      consequenceAccepted: true,
      idempotencyKey: operationKey('decision:denied-policy'),
      correlationId: correlationId('decision:denied-policy'),
      now: 30,
    })

    expect(decided).toMatchObject({ kind: 'error', code: 'contact_follow_up_policy_refused' })
    expect(policy.state.ownerDecisions).toHaveLength(0)
    expect(policy.state.gatewayAdmissions).toHaveLength(0)
    expect(policy.state.attempts).toHaveLength(0)
  })

  it('bounds retries after proof-gap or failed attempts and records no-repair state', () => {
    const flow = approvedFlow('retry')
    const proofGap = expectOk(
      recordContactFollowUpProviderAttempt(flow.state, {
        authority: authority(),
        selectedActionSlug: ContactFollowUpActionSlug,
        proposalId: flow.proposalId,
        gatewayAdmissionId: flow.gatewayId,
        idempotencyKey: operationKey('attempt:retry:first'),
        correlationId: correlationId('attempt:retry:first'),
        now: 40,
        readback: { kind: 'proof_gap', gapReason: 'timeout', payloadHash: 'hash:proof-gap' as never },
      })
    )
    const retryGateway = expectOk(
      createContactFollowUpGatewayAdmission(proofGap.state, {
        authority: authority(),
        proposalId: flow.proposalId,
        idempotencyKey: operationKey('gateway:retry:second'),
        correlationId: correlationId('gateway:retry:second'),
        expiresAt: 900,
        now: 50,
      })
    )
    const retried = expectOk(
      recordContactFollowUpProviderAttempt(retryGateway.state, {
        authority: authority(),
        selectedActionSlug: ContactFollowUpActionSlug,
        proposalId: flow.proposalId,
        gatewayAdmissionId: retryGateway.gatewayAdmission.id,
        idempotencyKey: operationKey('attempt:retry:second'),
        correlationId: correlationId('attempt:retry:second'),
        now: 60,
        readback: { kind: 'failed', failureReason: 'provider_unavailable', payloadHash: 'hash:failed' as never },
      })
    )
    const thirdGateway = expectOk(
      createContactFollowUpGatewayAdmission(retried.state, {
        authority: authority(),
        proposalId: flow.proposalId,
        idempotencyKey: operationKey('gateway:retry:third'),
        correlationId: correlationId('gateway:retry:third'),
        expiresAt: 900,
        now: 70,
      })
    )
    const exhausted = recordContactFollowUpProviderAttempt(thirdGateway.state, {
      authority: authority(),
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalId: flow.proposalId,
      gatewayAdmissionId: thirdGateway.gatewayAdmission.id,
      idempotencyKey: operationKey('attempt:retry:third'),
      correlationId: correlationId('attempt:retry:third'),
      now: 80,
      readback: { kind: 'receipt', resultRef: 'source-receipt:third', payloadHash: 'hash:receipt' as never },
    })

    expect(retried.state.attempts).toHaveLength(2)
    expect(retried.state.privateEvidenceRefs).toHaveLength(2)
    expect(exhausted).toMatchObject({ kind: 'error', code: 'contact_follow_up_retry_exhausted' })
  })
})

function approvedFlow(suffix: string) {
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

  return { state: gateway.state, proposalId: decided.proposal.id, gatewayId: gateway.gatewayAdmission.id }
}

function proposalCommand(
  suffix: string,
  overrides: Partial<ProposeContactFollowUpRequestCommand> = {}
): ProposeContactFollowUpRequestCommand {
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
      messageSummary: `Follow up about policy edge ${suffix}.`,
      sourceMessageRef: `source-message:${suffix}`,
    },
    idempotencyKey: operationKey(`proposal:${suffix}`),
    correlationId: correlationId(`proposal:${suffix}`),
    deadlineAt: 120_000,
    now: 10,
    ...overrides,
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
