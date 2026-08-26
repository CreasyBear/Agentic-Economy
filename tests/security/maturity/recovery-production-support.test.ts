import { describe, expect, it } from 'vitest'

import {
  ProductionRecoveryService,
  RecoveryError,
  createDurableRecoveryStore,
  type DurableRecoveryPersistence,
  type DurableRecoverySession,
  type RecoveryAccountFacts,
  type RecoveryAdmission,
  type RecoveryCommit,
  type VerifiedBreakGlassApproval,
} from '../../../src/modules/authority/recovery/public'
import { accountRef, ownershipRef, type AccountActionContext } from '../../../src/modules/principal-account/account/public'
import { principalRef, type PrincipalRef } from '../../../src/modules/principal-account/principal/public'
import {
  delegationGrantRef,
  delegationSnapshotRef,
  type AdmitConsequenceRequest,
  type DelegationAuthoritySnapshot,
} from '../../../src/modules/authority/delegation/public'

const ACCOUNT = accountRef('acc_00000000000040008000000000000031')
const OWNER = principalRef('prn_00000000000040008000000000000031')
const OP1 = principalRef('prn_00000000000040008000000000000032')
const OP2 = principalRef('prn_00000000000040008000000000000033')
const GRANT = delegationGrantRef('grt_00000000000040008000000000000031')
const OWNERSHIP = ownershipRef('own_00000000000040008000000000000031')

class DurableRepository implements DurableRecoveryPersistence {
  readonly approvals = new Map<string, VerifiedBreakGlassApproval>()
  readonly admissions = new Map<string, RecoveryAdmission>()
  readonly commits: RecoveryCommit[] = []

  async transact<Result>(operation: (session: DurableRecoverySession) => Promise<Result>): Promise<Result> {
    return await operation({
      getApproval: async (ref) => this.approvals.get(ref),
      getApprovalByVerification: async (ref) => [...this.approvals.values()]
        .find((approval) => approval.verificationRef === ref),
      getAdmissionByIdempotency: async (account, operator, idempotency) => [...this.admissions.values()]
        .find((admission) => admission.accountRef === account
          && admission.operatorPrincipalRef === operator
          && admission.context.idempotencyRef === idempotency),
      getAdmission: async (ref) => this.admissions.get(ref),
      insertVerifiedApproval: async (approval) => {
        if (this.approvals.has(approval.approvalRef)) throw new Error('approval_conflict')
        this.approvals.set(approval.approvalRef, structuredClone(approval))
      },
      commitRecoveryAtomically: async (change) => {
        if (this.admissions.has(change.admissionInsert.admissionRef)) throw new Error('admission_conflict')
        for (const replacement of change.approvalReplacements) {
          if (this.approvals.get(replacement.value.approvalRef)?.lifecycle !== replacement.expectedLifecycle) {
            throw new Error('approval_conflict')
          }
        }
        this.commits.push(structuredClone(change))
        this.admissions.set(change.admissionInsert.admissionRef, structuredClone(change.admissionInsert))
        for (const replacement of change.approvalReplacements) {
          this.approvals.set(replacement.value.approvalRef, structuredClone(replacement.value))
        }
      },
    })
  }
}

function approval(ref: string, operator: PrincipalRef, verification = `verification:${ref}`): VerifiedBreakGlassApproval {
  return Object.freeze({
    approvalRef: ref,
    accountRef: ACCOUNT,
    subjectPrincipalRef: OWNER,
    operatorPrincipalRef: operator,
    action: 'isolate',
    recoveryPolicyRevision: 7,
    frozenAccountRevision: 12,
    verificationRef: verification,
    lifecycle: 'verified',
    verifiedAt: 1_010,
    expiresAt: 2_000,
  })
}

function context(): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: OP1,
    activeAccountRef: ACCOUNT,
    correlationRef: 'correlation:production',
    idempotencyRef: 'idempotency:production',
  })
}

function facts(): RecoveryAccountFacts {
  return Object.freeze({
    account: Object.freeze({
      accountRef: ACCOUNT,
      lifecycle: 'suspended',
      recoveryPolicy: Object.freeze({
        kind: 'threshold', threshold: 2, participantCount: 3,
        delayMs: 100, freezeRequired: true, revision: 7,
      }),
      revision: 12,
      updatedAt: 1_000,
      currentOwnershipRef: OWNERSHIP,
    }),
    ownership: Object.freeze({
      ownershipRef: OWNERSHIP,
      accountRef: ACCOUNT,
      ownerPrincipalRef: OWNER,
      lifecycle: 'active',
      revision: 2,
    }),
  })
}

function service(repository = new DurableRepository()) {
  const authorityRequests: AdmitConsequenceRequest[] = []
  const authority = {
    admitConsequence: async (request: AdmitConsequenceRequest): Promise<DelegationAuthoritySnapshot> => {
      authorityRequests.push(request)
      return Object.freeze({
        snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000031'),
        grantRef: request.grantRef,
        generation: request.expectedGeneration,
        accountRef: request.context.activeAccountRef,
        accountRevision: 12,
        actorPrincipalRef: request.context.actorPrincipalRef,
        subjectPrincipalRef: request.context.actorPrincipalRef,
        scopes: Object.freeze([...request.requiredScopes]),
        resourceRefs: Object.freeze([...request.resourceRefs]),
        budgetAmount: 0,
        admittedAt: 1_100,
        expiresAt: 1_900,
        correlationRef: request.context.correlationRef,
        idempotencyRef: request.context.idempotencyRef,
        ancestry: Object.freeze([]),
      })
    },
  }
  return {
    authorityRequests,
    repository,
    subject: new ProductionRecoveryService({
      persistence: repository,
      accountFacts: { resolve: async () => facts() },
      authority,
      now: () => 1_100,
      randomUuid: () => '00000000-0000-4000-8000-000000000031',
    }),
  }
}

describe('P2-05 durable recovery production support', () => {
  it('persists threshold, delay and freeze admission with dual attribution and one-time proof consumption', async () => {
    const fixture = service()
    await fixture.subject.recordVerifiedApproval(approval('approval:one', OP1))
    await fixture.subject.recordVerifiedApproval(approval('approval:two', OP2))

    const admitted = await fixture.subject.authorize({
      action: 'isolate', accountRef: ACCOUNT, subjectPrincipalRef: OWNER,
      grantRef: GRANT, expectedGrantGeneration: 4,
      approvalRefs: ['approval:one', 'approval:two'], context: context(),
    })

    expect(admitted).toMatchObject({
      subjectPrincipalRef: OWNER,
      operatorPrincipalRef: OP1,
      lifecycle: 'consumed',
      recoveryPolicyKind: 'threshold',
    })
    expect(admitted.subjectPrincipalRef).not.toBe(admitted.operatorPrincipalRef)
    expect([...fixture.repository.approvals.values()].map((value) => value.lifecycle))
      .toEqual(['consumed', 'consumed'])
    expect(fixture.repository.commits).toHaveLength(1)
    expect(JSON.stringify(fixture.repository.commits)).not.toMatch(/ownerPrincipalRef|ownershipRef/)
  })

  it('rejects replay-shaped approval collisions and subject impersonation before persistence', async () => {
    const fixture = service()
    await fixture.subject.recordVerifiedApproval(approval('approval:one', OP1))
    await expect(fixture.subject.recordVerifiedApproval(approval('approval:other', OP2, 'verification:approval:one')))
      .rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
    await expect(fixture.subject.recordVerifiedApproval(approval('approval:owner', OWNER)))
      .rejects.toMatchObject({ code: 'recovery_operator_impersonation' })
    expect(fixture.repository.approvals).toHaveLength(1)
  })

  it('canonicalizes exact approval replay and rejects malformed durable approval rows', async () => {
    const fixture = service()
    const base = approval('approval:one', OP1)
    await expect(fixture.subject.recordVerifiedApproval(base)).resolves.toEqual(base)
    await expect(fixture.subject.recordVerifiedApproval(base)).resolves.toEqual(base)
    await expect(fixture.subject.recordVerifiedApproval({ ...base, lifecycle: 'revoked' }))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    for (const malformed of [
      { ...base, approvalRef: '' },
      { ...base, operatorPrincipalRef: 'bad' as PrincipalRef },
      { ...base, action: 'bad' as 'isolate' },
      { ...base, recoveryPolicyRevision: 0 },
      { ...base, frozenAccountRevision: 0 },
      { ...base, verifiedAt: -1 },
      { ...base, expiresAt: 0 },
      { ...base, expiresAt: base.verifiedAt },
      { ...base, consumedAt: 1_100 },
      { ...base, verificationRef: '' },
    ]) {
      await expect(fixture.subject.recordVerifiedApproval(malformed))
        .rejects.toMatchObject({ code: 'recovery_approval_mismatch' })
    }
    const insertionFailure = service({
      ...new DurableRepository(),
      transact: async (operation) => await operation({
        getApproval: async () => undefined,
        getApprovalByVerification: async () => undefined,
        getAdmissionByIdempotency: async () => undefined,
        getAdmission: async () => undefined,
        insertVerifiedApproval: async () => { throw new Error('write_conflict') },
        commitRecoveryAtomically: async () => undefined,
      }),
    })
    await expect(insertionFailure.subject.recordVerifiedApproval(base))
      .rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
  })

  it('exposes a transaction-faithful store adapter and rejects malformed or ambiguous atomic commits', async () => {
    const completed = service()
    await completed.subject.recordVerifiedApproval(approval('approval:one', OP1))
    await completed.subject.recordVerifiedApproval(approval('approval:two', OP2))
    const admission = await completed.subject.authorize({
      action: 'isolate', accountRef: ACCOUNT, subjectPrincipalRef: OWNER,
      grantRef: GRANT, expectedGrantGeneration: 4,
      approvalRefs: ['approval:one', 'approval:two'], context: context(),
    })
    await expect(completed.subject.authorize({
      action: 'isolate', accountRef: ACCOUNT, subjectPrincipalRef: OWNER,
      grantRef: GRANT, expectedGrantGeneration: 4,
      approvalRefs: ['approval:one', 'approval:two'], context: context(),
    })).resolves.toEqual(admission)

    const change = completed.repository.commits[0]!
    const repository = new DurableRepository()
    repository.approvals.set('approval:one', approval('approval:one', OP1))
    repository.approvals.set('approval:two', approval('approval:two', OP2))
    const store = createDurableRecoveryStore(repository)
    await store.transact(async (transaction) => {
      expect(await transaction.getApproval('missing')).toBeUndefined()
      expect(await transaction.getAdmission(admission.admissionRef)).toBeUndefined()
      await transaction.commit(change)
    })
    await store.transact(async (transaction) => {
      expect(await transaction.getAdmission(admission.admissionRef)).toEqual(admission)
    })

    for (const corrupt of [
      { ...change, approvalReplacements: [{ ...change.approvalReplacements[0]!, expectedLifecycle: 'revoked' as 'verified' }] },
      { ...change, approvalReplacements: [{ ...change.approvalReplacements[0]!, value: { ...change.approvalReplacements[0]!.value, lifecycle: 'verified' as const, consumedAt: undefined, consumedByAdmissionRef: undefined } }] },
      { ...change, approvalReplacements: [{ ...change.approvalReplacements[0]!, value: { ...change.approvalReplacements[0]!.value, consumedByAdmissionRef: admission.admissionRef.replace('31', '32') as typeof admission.admissionRef } }] },
    ]) {
      await expect(store.transact(async (transaction) => await transaction.commit(corrupt as unknown as RecoveryCommit)))
        .rejects.toBeInstanceOf(RecoveryError)
    }

    for (const thrown of [new RecoveryError('recovery_approval_unavailable'), new Error('db_failure')]) {
      const failing = createDurableRecoveryStore({
        transact: async (operation) => await operation({
          getApproval: async () => undefined,
          getApprovalByVerification: async () => undefined,
          getAdmissionByIdempotency: async () => undefined,
          getAdmission: async () => undefined,
          insertVerifiedApproval: async () => undefined,
          commitRecoveryAtomically: async () => { throw thrown },
        }),
      })
      await expect(failing.transact(async (transaction) => await transaction.commit(change)))
        .rejects.toBeInstanceOf(RecoveryError)
    }
  })

  it('supports coordinator defaults without weakening persistence validation', () => {
    const repository = new DurableRepository()
    expect(() => new ProductionRecoveryService({
      persistence: repository,
      accountFacts: { resolve: async () => facts() },
      authority: { admitConsequence: async () => { throw new Error('unused') } },
    })).not.toThrow()
  })

  it('sanitizes repository transaction outages at both production seams', async () => {
    const unavailable: DurableRecoveryPersistence = {
      transact: async () => { throw new Error('database_connection_detail') },
    }
    const fixture = service(unavailable as DurableRepository)
    await expect(fixture.subject.recordVerifiedApproval(approval('approval:one', OP1)))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    const store = createDurableRecoveryStore(unavailable)
    await expect(store.transact(async () => undefined))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
  })
})
