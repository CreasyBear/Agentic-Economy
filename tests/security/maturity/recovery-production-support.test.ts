import { describe, expect, it } from 'vitest'

import {
  ProductionRecoveryService,
  RecoveryError,
  createDurableRecoveryStore,
  type DurableRecoveryPersistence,
  type DurableRecoverySession,
  type RecoveryAccountFacts,
  type RecoveryAdmission,
  type RecoveryApprovalIntent,
  type RecoveryApprovalVerificationRequest,
  type RecoveryCommit,
  type TrustedRecoveryApprovalAttestation,
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

function approvalIntent(ref: string, action: RecoveryApprovalIntent['action'] = 'isolate'): RecoveryApprovalIntent {
  return Object.freeze({ approvalRef: ref, accountRef: ACCOUNT, action })
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

function service<Repository extends DurableRecoveryPersistence = DurableRepository>(
  repository: Repository = new DurableRepository() as unknown as Repository,
  verify = async (request: RecoveryApprovalVerificationRequest): Promise<TrustedRecoveryApprovalAttestation> =>
    Object.freeze({
      operatorPrincipalRef: request.approvalRef === 'approval:two' ? OP2 : OP1,
      verificationRef: `trusted:${request.approvalRef}`,
    }),
  overrides: Readonly<{
    resolveFacts?: () => Promise<RecoveryAccountFacts>
    now?: () => number
    approvalTtlMs?: number
    withoutVerifier?: boolean
  }> = {},
) {
  const authorityRequests: AdmitConsequenceRequest[] = []
  const verificationRequests: RecoveryApprovalVerificationRequest[] = []
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
    verificationRequests,
    repository,
    subject: new ProductionRecoveryService({
      persistence: repository,
      accountFacts: { resolve: overrides.resolveFacts ?? (async () => facts()) },
      authority,
      ...(overrides.withoutVerifier ? {} : {
        approvalVerifier: {
          verify: async (request: RecoveryApprovalVerificationRequest) => {
            verificationRequests.push(request)
            return await verify(request)
          },
        },
      }),
      approvalTtlMs: overrides.approvalTtlMs ?? 300,
      now: overrides.now ?? (() => 1_100),
      randomUuid: () => '00000000-0000-4000-8000-000000000031',
    }),
  }
}

describe('P2-05 durable recovery production support', () => {
  it('persists threshold, delay and freeze admission with dual attribution and one-time proof consumption', async () => {
    const fixture = service()
    await fixture.subject.recordApproval(approvalIntent('approval:one'))
    await fixture.subject.recordApproval(approvalIntent('approval:two'))

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
    const fixture = service(new DurableRepository(), async () => Object.freeze({
      operatorPrincipalRef: OP1,
      verificationRef: 'trusted:shared-verification',
    }))
    await fixture.subject.recordApproval(approvalIntent('approval:one'))
    await expect(fixture.subject.recordApproval(approvalIntent('approval:other')))
      .rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
    const impersonating = service(new DurableRepository(), async () => Object.freeze({
      operatorPrincipalRef: OWNER,
      verificationRef: 'trusted:owner',
    }))
    await expect(impersonating.subject.recordApproval(approvalIntent('approval:owner')))
      .rejects.toMatchObject({ code: 'recovery_operator_impersonation' })
    expect(fixture.repository.approvals).toHaveLength(1)
  })

  it('derives verification facts from trusted current state and makes exact intent replay idempotent', async () => {
    const fixture = service()
    const forged = {
      ...approvalIntent('approval:one'),
      subjectPrincipalRef: OP2,
      operatorPrincipalRef: OWNER,
      verificationRef: 'caller:proof',
      lifecycle: 'verified',
      verifiedAt: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
    } as unknown as RecoveryApprovalIntent
    const expected = approval('approval:one', OP1, 'trusted:approval:one')
    const derived = { ...expected, verifiedAt: 1_100, expiresAt: 1_400 }
    await expect(fixture.subject.recordApproval(forged)).resolves.toEqual(derived)
    await expect(fixture.subject.recordApproval(approvalIntent('approval:one'))).resolves.toEqual(derived)
    const verificationRequest = {
      approvalRef: 'approval:one',
      accountRef: ACCOUNT,
      subjectPrincipalRef: OWNER,
      action: 'isolate',
      recoveryPolicyRevision: 7,
      frozenAccountRevision: 12,
      verifiedAt: 1_100,
      expiresAt: 1_400,
    }
    expect(fixture.verificationRequests).toEqual([verificationRequest, verificationRequest])
    expect(fixture.repository.approvals).toHaveLength(1)
  })

  it('rejects an exact idempotency replay when the trusted verifier identity changes', async () => {
    let verificationCount = 0
    const fixture = service(new DurableRepository(), async () => {
      verificationCount += 1
      return Object.freeze({
        operatorPrincipalRef: verificationCount === 1 ? OP1 : OP2,
        verificationRef: verificationCount === 1 ? 'trusted:stable' : 'trusted:substituted',
      })
    })
    await fixture.subject.recordApproval(approvalIntent('approval:one'))
    await expect(fixture.subject.recordApproval(approvalIntent('approval:one')))
      .rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
    expect(fixture.repository.approvals.get('approval:one')).toMatchObject({
      operatorPrincipalRef: OP1,
      verificationRef: 'trusted:stable',
      lifecycle: 'verified',
    })
  })

  it('fails closed at the retired caller-verified intake without persisting any claimed proof', async () => {
    const fixture = service()
    await expect(fixture.subject.recordVerifiedApproval(approval('approval:forged', OWNER, 'caller:proof')))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    expect(fixture.repository.approvals).toHaveLength(0)
    expect(fixture.verificationRequests).toHaveLength(0)
  })

  it('rejects malformed intent and untrusted verifier output before persistence', async () => {
    const fixture = service()
    for (const malformed of [
      { ...approvalIntent('approval:one'), approvalRef: '' },
      { ...approvalIntent('approval:one'), accountRef: 'bad' },
      { ...approvalIntent('approval:one'), action: 'bad' },
    ]) {
      await expect(fixture.subject.recordApproval(malformed as RecoveryApprovalIntent))
        .rejects.toMatchObject({ code: 'recovery_approval_mismatch' })
    }
    for (const attestation of [
      { operatorPrincipalRef: 'bad', verificationRef: 'trusted:one' },
      { operatorPrincipalRef: OP1, verificationRef: '' },
    ]) {
      const malformedVerifier = service(new DurableRepository(), async () =>
        attestation as TrustedRecoveryApprovalAttestation)
      await expect(malformedVerifier.subject.recordApproval(approvalIntent('approval:one')))
        .rejects.toMatchObject({ code: 'recovery_approval_mismatch' })
      expect(malformedVerifier.repository.approvals).toHaveLength(0)
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
    await expect(insertionFailure.subject.recordApproval(approvalIntent('approval:one')))
      .rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
  })

  it('fails closed on missing verification, invalid server clocks and non-current account facts', async () => {
    await expect(service(new DurableRepository(), undefined, { withoutVerifier: true })
      .subject.recordApproval(approvalIntent('approval:one')))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(service(new DurableRepository(), undefined, { now: () => -1 })
      .subject.recordApproval(approvalIntent('approval:one')))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(service(new DurableRepository(), undefined, {
      now: () => Number.MAX_SAFE_INTEGER,
      approvalTtlMs: 1,
    }).subject.recordApproval(approvalIntent('approval:one')))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    expect(() => service(new DurableRepository(), undefined, { approvalTtlMs: 0 }))
      .toThrowError(RecoveryError)

    await expect(service(new DurableRepository(), undefined, {
      resolveFacts: async () => ({
        ...facts(),
        account: { ...facts().account, lifecycle: 'active' },
      }),
    }).subject.recordApproval(approvalIntent('approval:one')))
      .rejects.toMatchObject({ code: 'recovery_account_facts_invalid' })
    await expect(service(new DurableRepository(), undefined, {
      resolveFacts: async () => ({
        ...facts(),
        account: { ...facts().account, accountRef: 'bad' as typeof ACCOUNT },
      }),
    }).subject.recordApproval(approvalIntent('approval:one')))
      .rejects.toMatchObject({ code: 'recovery_account_facts_invalid' })
  })

  it('accepts freeze and no-transfer intent only from matching current account facts', async () => {
    const noTransferFacts = (): RecoveryAccountFacts => ({
      ...facts(),
      account: {
        ...facts().account,
        lifecycle: 'active',
        recoveryPolicy: { kind: 'no_transfer', revision: 9 },
      },
    })
    const fixture = service(new DurableRepository(), undefined, { resolveFacts: async () => noTransferFacts() })
    await expect(fixture.subject.recordApproval(approvalIntent('approval:freeze', 'freeze')))
      .resolves.toMatchObject({
        action: 'freeze',
        subjectPrincipalRef: OWNER,
        recoveryPolicyRevision: 9,
        frozenAccountRevision: 12,
        lifecycle: 'verified',
      })
  })

  it('rejects idempotency reuse against changed canonical facts or a malformed durable approval', async () => {
    const changed = new DurableRepository()
    changed.approvals.set('approval:one', approval('approval:one', OP1, 'trusted:approval:one'))
    await expect(service(changed).subject.recordApproval(approvalIntent('approval:one', 'freeze')))
      .rejects.toMatchObject({ code: 'recovery_account_facts_invalid' })

    const base = approval('approval:one', OP1, 'trusted:approval:one')
    for (const malformed of [
      { ...base, approvalRef: '' },
      { ...base, accountRef: 'bad' },
      { ...base, subjectPrincipalRef: 'bad' },
      { ...base, operatorPrincipalRef: 'bad' },
      { ...base, action: 'bad' },
      { ...base, lifecycle: 'bad' },
      { ...base, recoveryPolicyRevision: 0 },
      { ...base, frozenAccountRevision: 0 },
      { ...base, verifiedAt: -1 },
      { ...base, expiresAt: 0 },
      { ...base, expiresAt: base.verifiedAt },
      { ...base, lifecycle: 'consumed', consumedAt: undefined, consumedByAdmissionRef: undefined },
      { ...base, lifecycle: 'consumed', consumedAt: -1, consumedByAdmissionRef: 'rcv_00000000000040008000000000000031' },
      { ...base, lifecycle: 'consumed', consumedAt: 1_000, consumedByAdmissionRef: 'rcv_00000000000040008000000000000031' },
      { ...base, lifecycle: 'consumed', consumedAt: 2_000, consumedByAdmissionRef: 'rcv_00000000000040008000000000000031' },
      { ...base, lifecycle: 'consumed', consumedAt: 1_100, consumedByAdmissionRef: undefined },
      { ...base, consumedAt: 1_100 },
      { ...base, consumedByAdmissionRef: 'rcv_00000000000040008000000000000031' },
      { ...base, verificationRef: '' },
    ]) {
      const repository = new DurableRepository()
      repository.approvals.set('approval:one', malformed as VerifiedBreakGlassApproval)
      await expect(service(repository).subject.recordApproval(approvalIntent('approval:one')))
        .rejects.toMatchObject({ code: 'recovery_approval_mismatch' })
      expect(repository.approvals).toHaveLength(1)
    }
  })

  it('rejects idempotency reuse after canonical revision drift', async () => {
    const repository = new DurableRepository()
    repository.approvals.set('approval:one', {
      ...approval('approval:one', OP1, 'trusted:approval:one'),
      recoveryPolicyRevision: 8,
    })
    await expect(service(repository).subject.recordApproval(approvalIntent('approval:one')))
      .rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
  })

  it('handles exact insertion races and rejects every non-identical collision field', async () => {
    const expected = Object.freeze({
      ...approval('approval:one', OP1, 'trusted:approval:one'),
      verifiedAt: 1_100,
      expiresAt: 1_400,
    })
    const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000032')
    const variants: VerifiedBreakGlassApproval[] = [
      { ...expected, approvalRef: 'approval:other' },
      { ...expected, accountRef: OTHER_ACCOUNT },
      { ...expected, subjectPrincipalRef: OP2 },
      { ...expected, operatorPrincipalRef: OP2 },
      { ...expected, action: 'freeze' },
      { ...expected, recoveryPolicyRevision: 8 },
      { ...expected, frozenAccountRevision: 13 },
      { ...expected, verificationRef: 'trusted:other' },
      { ...expected, lifecycle: 'revoked' },
      { ...expected, verifiedAt: 1_099 },
      { ...expected, expiresAt: 1_401 },
    ]

    const racingPersistence = (raceValue: VerifiedBreakGlassApproval): DurableRecoveryPersistence => {
      let transactionCount = 0
      return {
        transact: async (operation) => {
          transactionCount += 1
          return await operation({
            getApproval: async () => transactionCount === 1 ? undefined : raceValue,
            getApprovalByVerification: async () => undefined,
            getAdmissionByIdempotency: async () => undefined,
            getAdmission: async () => undefined,
            insertVerifiedApproval: async () => { throw new Error('must_not_insert_after_race') },
            commitRecoveryAtomically: async () => undefined,
          })
        },
      }
    }

    await expect(service(racingPersistence(expected))
      .subject.recordApproval(approvalIntent('approval:one'))).resolves.toEqual(expected)
    for (const variant of variants) {
      await expect(service(racingPersistence(variant))
        .subject.recordApproval(approvalIntent('approval:one')))
        .rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
    }
  })

  it('uses server time by default when a trusted approval is recorded', async () => {
    const repository = new DurableRepository()
    const before = Date.now()
    const subject = new ProductionRecoveryService({
      persistence: repository,
      accountFacts: { resolve: async () => facts() },
      authority: { admitConsequence: async () => { throw new Error('unused') } },
      approvalVerifier: {
        verify: async () => ({ operatorPrincipalRef: OP1, verificationRef: 'trusted:default-clock' }),
      },
      approvalTtlMs: 1,
    })
    const recorded = await subject.recordApproval(approvalIntent('approval:default-clock'))
    expect(recorded.verifiedAt).toBeGreaterThanOrEqual(before)
    expect(recorded.expiresAt).toBe(recorded.verifiedAt + 1)
  })

  it('exposes a transaction-faithful store adapter and rejects malformed or ambiguous atomic commits', async () => {
    const completed = service()
    await completed.subject.recordApproval(approvalIntent('approval:one'))
    await completed.subject.recordApproval(approvalIntent('approval:two'))
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
    await expect(fixture.subject.recordApproval(approvalIntent('approval:one')))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    const store = createDurableRecoveryStore(unavailable)
    await expect(store.transact(async () => undefined))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
  })
})
