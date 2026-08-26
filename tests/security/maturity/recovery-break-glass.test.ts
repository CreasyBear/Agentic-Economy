import { describe, expect, it, vi } from 'vitest'

import {
  RecoveryCoordinator,
  RecoveryError,
  generateRecoveryAdmissionRef,
  parsePersistedRecoveryAdmission,
  recoveryAdmissionRef,
  type RecoveryAccountFacts,
  type RecoveryAdmission,
  type RecoveryCommit,
  type RecoveryStore,
  type RecoveryTransaction,
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

const ACCOUNT = accountRef('acc_00000000000040008000000000000011')
const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000012')
const OWNER = principalRef('prn_00000000000040008000000000000011')
const OP1 = principalRef('prn_00000000000040008000000000000012')
const OP2 = principalRef('prn_00000000000040008000000000000013')
const OP3 = principalRef('prn_00000000000040008000000000000014')
const GRANT = delegationGrantRef('grt_00000000000040008000000000000011')
const OWNERSHIP = ownershipRef('own_00000000000040008000000000000011')

function context(operator = OP1, account = ACCOUNT, suffix = 'one'): AccountActionContext {
  return Object.freeze({ actorPrincipalRef: operator, activeAccountRef: account, correlationRef: `correlation:${suffix}`, idempotencyRef: `idempotency:${suffix}` })
}

function facts(overrides: Partial<RecoveryAccountFacts['account']> = {}): RecoveryAccountFacts {
  return Object.freeze({
    account: Object.freeze({
      accountRef: ACCOUNT, lifecycle: 'suspended',
      recoveryPolicy: Object.freeze({ kind: 'threshold', threshold: 2, participantCount: 3, delayMs: 100, freezeRequired: true, revision: 7 }),
      revision: 12, updatedAt: 1_000, currentOwnershipRef: OWNERSHIP, ...overrides,
    }),
    ownership: Object.freeze({ ownershipRef: OWNERSHIP, accountRef: ACCOUNT, ownerPrincipalRef: OWNER, lifecycle: 'active', revision: 2 }),
  })
}

function approval(ref: string, operator: PrincipalRef, overrides: Partial<VerifiedBreakGlassApproval> = {}): VerifiedBreakGlassApproval {
  return Object.freeze({
    approvalRef: ref, accountRef: ACCOUNT, subjectPrincipalRef: OWNER, operatorPrincipalRef: operator,
    action: 'isolate', recoveryPolicyRevision: 7, frozenAccountRevision: 12,
    verificationRef: `verification:${ref}`, lifecycle: 'verified', verifiedAt: 1_010, expiresAt: 2_000,
    ...overrides,
  })
}

function setup(options: Readonly<{
  now?: number
  accountFacts?: RecoveryAccountFacts
  approvals?: readonly VerifiedBreakGlassApproval[]
  snapshot?: Partial<DelegationAuthoritySnapshot>
}> = {}) {
  const approvals = new Map((options.approvals ?? [approval('approval:one', OP1), approval('approval:two', OP2)]).map((item) => [item.approvalRef, item]))
  const admissions = new Map<string, RecoveryAdmission>()
  const commits: RecoveryCommit[] = []
  const authorityRequests: AdmitConsequenceRequest[] = []
  const transaction: RecoveryTransaction = {
    getApproval: async (ref) => approvals.get(ref),
    getAdmissionByIdempotency: async (account, operator, idempotency) => [...admissions.values()].find((item) => item.accountRef === account && item.operatorPrincipalRef === operator && item.context.idempotencyRef === idempotency),
    getAdmission: async (ref) => admissions.get(ref),
    commit: async (change) => {
      commits.push(change)
      if (admissions.has(change.admissionInsert.admissionRef)) throw new Error('test_admission_conflict')
      admissions.set(change.admissionInsert.admissionRef, change.admissionInsert)
      for (const replacement of change.approvalReplacements) {
        const current = approvals.get(replacement.value.approvalRef)
        if (current?.lifecycle !== replacement.expectedLifecycle) throw new Error('test_approval_conflict')
        approvals.set(replacement.value.approvalRef, replacement.value)
      }
    },
  }
  const now = options.now ?? 1_100
  const baseSnapshot: DelegationAuthoritySnapshot = Object.freeze({
    snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000011'), grantRef: GRANT, generation: 4,
    accountRef: ACCOUNT, accountRevision: 12, actorPrincipalRef: OP1, subjectPrincipalRef: OP1,
    scopes: Object.freeze(['recovery:isolate']), resourceRefs: Object.freeze([`account:${ACCOUNT}`]),
    budgetAmount: 0, admittedAt: now, expiresAt: 1_900,
    correlationRef: 'correlation:one', idempotencyRef: 'idempotency:one', ancestry: Object.freeze([]),
    ...options.snapshot,
  })
  const coordinator = new RecoveryCoordinator(
    { transact: async (operation) => await operation(transaction) },
    { resolve: async () => options.accountFacts ?? facts() },
    { admitConsequence: async (request) => { authorityRequests.push(request); return baseSnapshot } },
    { now: () => now, randomUuid: () => '00000000-0000-4000-8000-000000000011' },
  )
  return { coordinator, approvals, admissions, commits, authorityRequests }
}

class TransactionalRecoveryStore implements RecoveryStore {
  readonly approvals = new Map<string, VerifiedBreakGlassApproval>()
  readonly admissions = new Map<string, RecoveryAdmission>()
  #tail: Promise<void> = Promise.resolve()

  async transact<Result>(operation: (transaction: RecoveryTransaction) => Promise<Result>): Promise<Result> {
    const predecessor = this.#tail
    let release: () => void = () => undefined
    this.#tail = new Promise<void>((resolve) => { release = resolve })
    await predecessor
    try {
      return await operation({
        getApproval: async (ref) => this.approvals.get(ref),
        getAdmissionByIdempotency: async (account, operator, idempotency) => [...this.admissions.values()].find(
          (item) => item.accountRef === account
            && item.operatorPrincipalRef === operator
            && item.context.idempotencyRef === idempotency,
        ),
        getAdmission: async (ref) => this.admissions.get(ref),
        commit: async (change) => {
          if (this.admissions.has(change.admissionInsert.admissionRef)) throw new Error('test_admission_conflict')
          for (const replacement of change.approvalReplacements) {
            if (this.approvals.get(replacement.value.approvalRef)?.lifecycle !== replacement.expectedLifecycle) {
              throw new Error('test_approval_conflict')
            }
          }
          this.admissions.set(change.admissionInsert.admissionRef, change.admissionInsert)
          for (const replacement of change.approvalReplacements) {
            this.approvals.set(replacement.value.approvalRef, replacement.value)
          }
        },
      })
    } finally {
      release()
    }
  }
}

function request(overrides: Partial<Parameters<RecoveryCoordinator['authorize']>[0]> = {}) {
  return Object.freeze({
    action: 'isolate' as const, accountRef: ACCOUNT, subjectPrincipalRef: OWNER,
    grantRef: GRANT, expectedGrantGeneration: 4,
    approvalRefs: Object.freeze(['approval:one', 'approval:two']), context: context(), ...overrides,
  })
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'RecoveryError', code, message: code })
}

describe('P2-05 operational recovery admission', () => {
  it('records exact dual attribution, consumes approvals, and sends the narrow consequence request', async () => {
    const fixture = setup()
    const result = await fixture.coordinator.authorize(request())
    expect(result).toMatchObject({ subjectPrincipalRef: OWNER, operatorPrincipalRef: OP1, action: 'isolate', lifecycle: 'consumed' })
    expect(result.subjectPrincipalRef).not.toBe(result.operatorPrincipalRef)
    expect(fixture.authorityRequests).toEqual([{
      grantRef: GRANT, expectedGeneration: 4, context: context(),
      requiredScopes: ['recovery:isolate'], resourceRefs: [`account:${ACCOUNT}`], budgetAmount: 0,
    }])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.approvalRefs)).toBe(true)
    expect([...fixture.approvals.values()].map((item) => item.lifecycle)).toEqual(['consumed', 'consumed'])
  })

  it('returns only an exact pinned replay and rejects conflicting idempotency without a second consequence', async () => {
    const fixture = setup()
    const first = await fixture.coordinator.authorize(request())
    expect(await fixture.coordinator.authorize(request())).toEqual(first)
    await expectCode(fixture.coordinator.authorize(request({ action: 'inspect_secret_canary' })), 'recovery_idempotency_conflict')
    expect(fixture.authorityRequests).toHaveLength(1)
    expect(fixture.commits).toHaveLength(1)
  })

  it('atomically consumes one-time approvals when two distinct admissions race', async () => {
    const store = new TransactionalRecoveryStore()
    store.approvals.set('approval:one', approval('approval:one', OP1))
    store.approvals.set('approval:two', approval('approval:two', OP2))
    const authority = {
      admitConsequence: async (candidate: AdmitConsequenceRequest): Promise<DelegationAuthoritySnapshot> => Object.freeze({
        snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000013'),
        grantRef: candidate.grantRef,
        generation: candidate.expectedGeneration,
        accountRef: candidate.context.activeAccountRef,
        accountRevision: 12,
        actorPrincipalRef: candidate.context.actorPrincipalRef,
        subjectPrincipalRef: candidate.context.actorPrincipalRef,
        scopes: Object.freeze([...candidate.requiredScopes]),
        resourceRefs: Object.freeze([...candidate.resourceRefs]),
        budgetAmount: candidate.budgetAmount,
        admittedAt: 1_100,
        expiresAt: 1_900,
        correlationRef: candidate.context.correlationRef,
        idempotencyRef: candidate.context.idempotencyRef,
        ancestry: Object.freeze([]),
      }),
    }
    const accounts = { resolve: async () => facts() }
    const options = { now: () => 1_100, randomUuid: () => '00000000-0000-4000-8000-000000000013' }
    const first = new RecoveryCoordinator(store, accounts, authority, options)
    const second = new RecoveryCoordinator(store, accounts, authority, options)
    const results = await Promise.allSettled([
      first.authorize(request()),
      second.authorize(request({ context: context(OP2, ACCOUNT, 'two') })),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'recovery_approval_unavailable' } })
    expect(store.admissions).toHaveLength(1)
    expect([...store.approvals.values()].every((item) => item.lifecycle === 'consumed')).toBe(true)
  })

  it('reconstructs only valid immutable persisted admissions and rejects forged replay state', async () => {
    const fixture = setup()
    const admission = await fixture.coordinator.authorize(request())
    const parsed = parsePersistedRecoveryAdmission(structuredClone(admission) as RecoveryAdmission)
    expect(parsed).toEqual(admission)
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.approvalRefs)).toBe(true)
    const corrupt: readonly Partial<RecoveryAdmission>[] = [
      { admissionRef: 'bad' as RecoveryAdmission['admissionRef'] },
      { action: 'bad' as RecoveryAdmission['action'] },
      { recoveryPolicyKind: 'bad' as RecoveryAdmission['recoveryPolicyKind'] },
      { recoveryPolicyRevision: 0 },
      { frozenAccountRevision: 0 },
      { grantGeneration: 0 },
      { approvalRefs: ['approval:one'] },
      { verificationRefs: ['verification:one'] },
      { approvalRefs: ['approval:one', 'approval:one'] },
      { verificationRefs: ['verification:one', 'verification:one'] },
      { approvalRefs: ['approval:one', ''] },
      { verificationRefs: ['verification:one', ''] },
      { availableAt: -1 },
      { admittedAt: 1_099 },
      { expiresAt: 1_100 },
      { lifecycle: 'active' as 'consumed' },
      { operatorPrincipalRef: OWNER },
      { context: { ...admission.context, actorPrincipalRef: OP2 } },
      { context: { ...admission.context, activeAccountRef: OTHER_ACCOUNT } },
      { context: { ...admission.context, correlationRef: '' } },
      { context: { ...admission.context, idempotencyRef: '' } },
    ]
    for (const delta of corrupt) {
      expect(() => parsePersistedRecoveryAdmission({ ...admission, ...delta })).toThrowError('recovery_persisted_admission_invalid')
    }
    fixture.admissions.set(admission.admissionRef, { ...admission, lifecycle: 'active' as 'consumed' })
    await expectCode(fixture.coordinator.authorize(request()), 'recovery_persisted_admission_invalid')
  })

  it.each([
    ['caller-selected operator impersonation', request({ context: context(OP2) }), 'recovery_authority_invalid'],
    ['wrong Account context', request({ context: context(OP1, OTHER_ACCOUNT) }), 'recovery_account_mismatch'],
    ['operator equals protected subject', request({ subjectPrincipalRef: OP1 }), 'recovery_operator_impersonation'],
    ['invalid generation', request({ expectedGrantGeneration: 0 }), 'recovery_generation_invalid'],
    ['duplicate approval selector', request({ approvalRefs: ['approval:one', 'approval:one'] }), 'recovery_approval_duplicate'],
  ])('rejects %s', async (_name, candidate, code) => {
    await expectCode(setup().coordinator.authorize(candidate), code)
  })

  it('requires two distinct, live, exactly-bound trusted operators and prevents proof replay', async () => {
    await expectCode(setup().coordinator.authorize(request({ approvalRefs: ['approval:one'] })), 'recovery_threshold_unmet')
    await expectCode(setup().coordinator.authorize(request({ approvalRefs: Array.from({ length: 33 }, (_, index) => `approval:${index}`) })), 'recovery_threshold_unmet')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP1)] }).coordinator.authorize(request()), 'recovery_approval_duplicate')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OWNER)] }).coordinator.authorize(request()), 'recovery_operator_impersonation')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { verificationRef: 'verification:approval:one' })] }).coordinator.authorize(request()), 'recovery_approval_duplicate')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { lifecycle: 'revoked' })] }).coordinator.authorize(request()), 'recovery_approval_unavailable')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { expiresAt: 1_100 })] }).coordinator.authorize(request()), 'recovery_approval_expired')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { expiresAt: Number.NaN })] }).coordinator.authorize(request()), 'recovery_approval_mismatch')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { verifiedAt: 0 })] }).coordinator.authorize(request()), 'recovery_approval_mismatch')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { operatorPrincipalRef: 'not-a-principal' as PrincipalRef })] }).coordinator.authorize(request()), 'recovery_approval_mismatch')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { accountRef: OTHER_ACCOUNT })] }).coordinator.authorize(request()), 'recovery_approval_mismatch')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { subjectPrincipalRef: OP3 })] }).coordinator.authorize(request()), 'recovery_approval_mismatch')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { action: 'freeze' })] }).coordinator.authorize(request()), 'recovery_approval_mismatch')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { recoveryPolicyRevision: 8 })] }).coordinator.authorize(request()), 'recovery_approval_mismatch')
    await expectCode(setup({ approvals: [approval('approval:one', OP1), approval('approval:two', OP2, { frozenAccountRevision: 11 })] }).coordinator.authorize(request()), 'recovery_approval_mismatch')
    await expectCode(setup({ approvals: [approval('approval:one', OP1)] }).coordinator.authorize(request()), 'recovery_approval_not_found')
    await expectCode(setup({ approvals: [approval('approval:one', OP2), approval('approval:two', OP3)] }).coordinator.authorize(request()), 'recovery_operator_unapproved')
  })

  it('enforces Phase 1 lifecycle, ownership, threshold, freeze, delay, and no-transfer facts', async () => {
    await expectCode(setup({ accountFacts: facts({ lifecycle: 'active' }) }).coordinator.authorize(request()), 'recovery_freeze_required')
    await expectCode(setup({ now: 1_099 }).coordinator.authorize(request()), 'recovery_delay_active')
    await expectCode(setup({ accountFacts: facts({ recoveryPolicy: Object.freeze({ kind: 'threshold', threshold: 3, participantCount: 3, delayMs: 100, freezeRequired: true, revision: 7 }) }) }).coordinator.authorize(request()), 'recovery_threshold_unmet')
    const noTransfer = facts({ recoveryPolicy: Object.freeze({ kind: 'no_transfer', revision: 7 }) })
    await expect(setup({ accountFacts: noTransfer }).coordinator.authorize(request())).resolves.toMatchObject({ recoveryPolicyKind: 'no_transfer' })
    const frozen = setup({ accountFacts: facts({ lifecycle: 'active' }), approvals: [approval('approval:one', OP1, { action: 'freeze' }), approval('approval:two', OP2, { action: 'freeze' })], snapshot: { scopes: Object.freeze(['recovery:freeze']) } })
    await expect(frozen.coordinator.authorize(request({ action: 'freeze' }))).resolves.toMatchObject({ action: 'freeze' })
  })

  it('rejects corrupt canonical Account/ownership facts instead of transferring or guessing ownership', async () => {
    const base = facts()
    const cases: readonly RecoveryAccountFacts[] = [
      Object.freeze({ ...base, account: Object.freeze({ ...base.account, accountRef: OTHER_ACCOUNT }) }),
      Object.freeze({ ...base, ownership: Object.freeze({ ...base.ownership, accountRef: OTHER_ACCOUNT }) }),
      Object.freeze({ ...base, ownership: Object.freeze({ ...base.ownership, ownershipRef: ownershipRef('own_00000000000040008000000000000012') }) }),
      Object.freeze({ ...base, ownership: Object.freeze({ ...base.ownership, lifecycle: 'ended' }) }),
      Object.freeze({ ...base, ownership: Object.freeze({ ...base.ownership, ownerPrincipalRef: OP3 }) }),
    ]
    for (const item of cases) await expectCode(setup({ accountFacts: item }).coordinator.authorize(request()), 'recovery_account_facts_invalid')
  })

  it('rejects stale, misattributed, widened, or expired P2-01 snapshots at the consequence point', async () => {
    const cases: readonly [Partial<DelegationAuthoritySnapshot>, string][] = [
      [{ grantRef: delegationGrantRef('grt_00000000000040008000000000000012') }, 'recovery_authority_invalid'],
      [{ generation: 5 }, 'recovery_authority_invalid'],
      [{ accountRef: OTHER_ACCOUNT }, 'recovery_authority_invalid'],
      [{ actorPrincipalRef: OP2 }, 'recovery_authority_invalid'],
      [{ subjectPrincipalRef: OP2 }, 'recovery_authority_invalid'],
      [{ scopes: Object.freeze(['recovery:freeze']) }, 'recovery_authority_invalid'],
      [{ resourceRefs: Object.freeze([`account:${OTHER_ACCOUNT}`]) }, 'recovery_authority_invalid'],
      [{ budgetAmount: 1 }, 'recovery_authority_invalid'],
      [{ admittedAt: 1_099 }, 'recovery_authority_invalid'],
      [{ expiresAt: 1_100 }, 'recovery_authority_invalid'],
      [{ correlationRef: 'correlation:other' }, 'recovery_authority_invalid'],
      [{ idempotencyRef: 'idempotency:other' }, 'recovery_authority_invalid'],
    ]
    for (const [snapshot, code] of cases) await expectCode(setup({ snapshot }).coordinator.authorize(request()), code)
  })

  it('rejects generated admission collisions and exposes stable non-sensitive errors', async () => {
    const fixture = setup()
    fixture.admissions.set('rcv_00000000000040008000000000000011', Object.freeze({} as RecoveryAdmission))
    await expectCode(fixture.coordinator.authorize(request()), 'recovery_admission_ref_conflict')
    const error = new RecoveryError('recovery_authority_invalid')
    expect(JSON.stringify(error)).not.toContain(ACCOUNT)
  })

  it('validates recovery references, runtime requests, server time, and delay arithmetic', async () => {
    expect(recoveryAdmissionRef('rcv_00000000000040008000000000000011')).toBe('rcv_00000000000040008000000000000011')
    expect(() => recoveryAdmissionRef('bad')).toThrowError('recovery_admission_ref_invalid')
    expect(() => generateRecoveryAdmissionRef(() => 'bad')).toThrowError('recovery_admission_ref_invalid')
    const random = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000099')
    expect(generateRecoveryAdmissionRef()).toBe('rcv_00000000000040008000000000000099')
    random.mockRestore()

    await expectCode(setup().coordinator.authorize(request({ action: 'invalid' as 'isolate' })), 'recovery_action_invalid')
    await expectCode(setup().coordinator.authorize(request({ context: { ...context(), correlationRef: '' } })), 'recovery_request_invalid')
    await expectCode(setup({ now: -1 }).coordinator.authorize(request()), 'recovery_request_invalid')
    await expectCode(setup({
      now: Number.MAX_SAFE_INTEGER,
      accountFacts: facts({ updatedAt: Number.MAX_SAFE_INTEGER, recoveryPolicy: Object.freeze({ kind: 'threshold', threshold: 2, participantCount: 3, delayMs: 1, freezeRequired: true, revision: 7 }) }),
      approvals: [
        approval('approval:one', OP1, { expiresAt: Number.MAX_SAFE_INTEGER }),
        approval('approval:two', OP2, { expiresAt: Number.MAX_SAFE_INTEGER }),
      ],
    }).coordinator.authorize(request()), 'recovery_account_facts_invalid')
  })

  it('has deterministic safe defaults when no coordinator options are supplied', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_100)
    const random = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000088')
    const fixture = setup()
    const coordinator = new RecoveryCoordinator(
      { transact: async (operation) => await operation({
        getApproval: async (ref) => fixture.approvals.get(ref),
        getAdmissionByIdempotency: async () => undefined,
        getAdmission: async () => undefined,
        commit: async () => undefined,
      }) },
      { resolve: async () => facts() },
      { admitConsequence: async () => Object.freeze({
        snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000088'),
        grantRef: GRANT,
        generation: 4,
        accountRef: ACCOUNT,
        accountRevision: 12,
        actorPrincipalRef: OP1,
        subjectPrincipalRef: OP1,
        scopes: Object.freeze(['recovery:isolate']),
        resourceRefs: Object.freeze([`account:${ACCOUNT}`]),
        budgetAmount: 0,
        admittedAt: 1_100,
        expiresAt: 1_900,
        correlationRef: 'correlation:one',
        idempotencyRef: 'idempotency:one',
        ancestry: Object.freeze([]),
      }) },
    )
    await expect(coordinator.authorize(request())).resolves.toMatchObject({
      admissionRef: 'rcv_00000000000040008000000000000088',
      admittedAt: 1_100,
    })
    clock.mockRestore()
    random.mockRestore()
  })
})
