import { describe, expect, it } from 'vitest'

import {
  RecoveryCoordinator,
  generateIsolationMatrix,
  proveSecretCanaryIsolation,
  type RecoveryAdmission,
  type RecoveryCommit,
  type RecoveryTransaction,
  type VerifiedBreakGlassApproval,
} from '../../src/modules/authority/recovery/public'
import {
  accountRef,
  ownershipRef,
  type AccountActionContext,
} from '../../src/modules/principal-account/account/public'
import { principalRef } from '../../src/modules/principal-account/principal/public'
import {
  delegationGrantRef,
  delegationSnapshotRef,
  type DelegationAuthoritySnapshot,
} from '../../src/modules/authority/delegation/public'

const ACCOUNT = accountRef('acc_00000000000040008000000000000001')
const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000002')
const OWNER = principalRef('prn_00000000000040008000000000000001')
const OPERATOR_ONE = principalRef('prn_00000000000040008000000000000002')
const OPERATOR_TWO = principalRef('prn_00000000000040008000000000000003')
const MEMBER = principalRef('prn_00000000000040008000000000000004')
const STRANGER = principalRef('prn_00000000000040008000000000000005')
const WORKLOAD = principalRef('prn_00000000000040008000000000000006')
const GRANT = delegationGrantRef('grt_00000000000040008000000000000001')

function actionContext(): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: OPERATOR_ONE,
    activeAccountRef: ACCOUNT,
    correlationRef: 'correlation:break-glass',
    idempotencyRef: 'idempotency:break-glass',
  })
}

describe('P2-05 recovery, isolation, and secret-canary contract', () => {
  it('admits delayed threshold break-glass once with exact subject/operator attribution and pinned authority', async () => {
    const approvals = new Map<string, VerifiedBreakGlassApproval>([
      ['approval:one', Object.freeze({
        approvalRef: 'approval:one', accountRef: ACCOUNT, subjectPrincipalRef: OWNER,
        operatorPrincipalRef: OPERATOR_ONE, action: 'isolate', recoveryPolicyRevision: 7,
        frozenAccountRevision: 12, verificationRef: 'verification:one', lifecycle: 'verified',
        verifiedAt: 1_050, expiresAt: 2_000,
      })],
      ['approval:two', Object.freeze({
        approvalRef: 'approval:two', accountRef: ACCOUNT, subjectPrincipalRef: OWNER,
        operatorPrincipalRef: OPERATOR_TWO, action: 'isolate', recoveryPolicyRevision: 7,
        frozenAccountRevision: 12, verificationRef: 'verification:two', lifecycle: 'verified',
        verifiedAt: 1_060, expiresAt: 2_000,
      })],
    ])
    const admissions = new Map<string, RecoveryAdmission>()
    const transaction: RecoveryTransaction = {
      getApproval: async (ref) => approvals.get(ref),
      getAdmissionByIdempotency: async (_account, operator, idempotency) => [...admissions.values()].find(
        (item) => item.operatorPrincipalRef === operator && item.context.idempotencyRef === idempotency,
      ),
      getAdmission: async (ref) => admissions.get(ref),
      commit: async (commit: RecoveryCommit) => {
        admissions.set(commit.admissionInsert.admissionRef, commit.admissionInsert)
        for (const replacement of commit.approvalReplacements) approvals.set(replacement.value.approvalRef, replacement.value)
      },
    }
    const snapshot: DelegationAuthoritySnapshot = Object.freeze({
      snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000001'),
      grantRef: GRANT, generation: 4, accountRef: ACCOUNT, accountRevision: 12,
      actorPrincipalRef: OPERATOR_ONE, subjectPrincipalRef: OPERATOR_ONE,
      scopes: Object.freeze(['recovery:isolate']), resourceRefs: Object.freeze([`account:${ACCOUNT}`]),
      budgetAmount: 0, admittedAt: 1_100, expiresAt: 1_500,
      correlationRef: 'correlation:break-glass', idempotencyRef: 'idempotency:break-glass',
      ancestry: Object.freeze([]),
    })
    const coordinator = new RecoveryCoordinator(
      { transact: async (operation) => await operation(transaction) },
      { resolve: async () => Object.freeze({
        account: Object.freeze({ accountRef: ACCOUNT, lifecycle: 'suspended', recoveryPolicy: Object.freeze({ kind: 'threshold', threshold: 2, participantCount: 3, delayMs: 100, freezeRequired: true, revision: 7 }), revision: 12, updatedAt: 1_000, currentOwnershipRef: ownershipRef('own_00000000000040008000000000000001') }),
        ownership: Object.freeze({ ownershipRef: ownershipRef('own_00000000000040008000000000000001'), accountRef: ACCOUNT, ownerPrincipalRef: OWNER, lifecycle: 'active', revision: 3 }),
      }) },
      { admitConsequence: async () => snapshot },
      { now: () => 1_100, randomUuid: () => '00000000-0000-4000-8000-000000000001' },
    )

    const request = Object.freeze({
      action: 'isolate' as const, accountRef: ACCOUNT, subjectPrincipalRef: OWNER,
      grantRef: GRANT, expectedGrantGeneration: 4,
      approvalRefs: Object.freeze(['approval:one', 'approval:two']), context: actionContext(),
    })
    const admitted = await coordinator.authorize(request)
    expect(admitted).toMatchObject({
      accountRef: ACCOUNT, subjectPrincipalRef: OWNER, operatorPrincipalRef: OPERATOR_ONE,
      action: 'isolate', recoveryPolicyRevision: 7, frozenAccountRevision: 12,
      authoritySnapshotRef: snapshot.snapshotRef, grantRef: GRANT, grantGeneration: 4,
      approvalRefs: ['approval:one', 'approval:two'], lifecycle: 'consumed',
    })
    expect(admitted.subjectPrincipalRef).not.toBe(admitted.operatorPrincipalRef)
    await expect(coordinator.authorize(request)).resolves.toEqual(admitted)
    expect([...approvals.values()].every((approval) => approval.lifecycle === 'consumed')).toBe(true)
  })

  it('generates denial-complete isolation rows and proves the canary is absent from every forbidden sink', async () => {
    const matrix = await generateIsolationMatrix({
      surfaces: Object.freeze([{ surfaceRef: 'http:recover', owningAccountRef: ACCOUNT, resourceRef: `account:${ACCOUNT}` }]),
      actors: Object.freeze({ owner: OWNER, member: MEMBER, stranger: STRANGER, workload: WORKLOAD }),
      wrongAccountRef: OTHER_ACCOUNT,
      currentGeneration: 9,
      evaluate: async (probe) => probe.caseKind === 'owner' || probe.caseKind === 'member' || probe.caseKind === 'workload'
        ? Object.freeze({ kind: 'allowed' as const })
        : Object.freeze({ kind: 'denied' as const, reason: 'authority_denied' }),
    })
    expect(matrix.rows).toHaveLength(6)
    expect(matrix.rows.filter((row) => row.decision.kind === 'denied')).toHaveLength(3)
    expect(matrix.rows.find((row) => row.caseKind === 'wrong_account')?.activeAccountRef).toBe(OTHER_ACCOUNT)
    expect(matrix.rows.find((row) => row.caseKind === 'stale_generation')?.presentedGeneration).toBe(8)

    const proof = proveSecretCanaryIsolation(new TextEncoder().encode('phase-two-canary'), [
      { sink: 'convex_row', textFragments: ['secretRef=sec_1'] },
      { sink: 'log', textFragments: ['rotation complete'] },
      { sink: 'error', textFragments: ['vault unavailable'] },
      { sink: 'audit', textFragments: ['operator=prn_2'] },
      { sink: 'environment', textFragments: ['INFISICAL_PROJECT_ID=project'] },
      { sink: 'snapshot', byteFragments: [new TextEncoder().encode('redacted')] },
    ])
    expect(proof).toEqual({
      checkedSinks: ['convex_row', 'log', 'error', 'audit', 'environment', 'snapshot'],
      artifactCount: 6,
    })
    expect(JSON.stringify({ matrix, proof })).not.toContain('phase-two-canary')
  })
})
