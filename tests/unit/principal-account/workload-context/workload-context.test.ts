import { describe, expect, it } from 'vitest'

import {
  WorkloadContextAdmission,
  WorkloadContextError,
  createWorkloadContext,
  type WorkloadContextStore,
} from '../../../../src/modules/principal-account/workload-context/public'
import {
  accountRef,
  membershipRef,
  ownershipRef,
  type Account,
  type AccountOwnership,
  type AccountRef,
  type Membership,
} from '../../../../src/modules/principal-account/account/public'
import { principalRef, type Principal, type PrincipalRef } from '../../../../src/modules/principal-account/principal/public'

const actor = principalRef('prn_00000000000000000000000000000001')
const other = principalRef('prn_00000000000000000000000000000002')
const activeAccount = accountRef('acc_00000000000000000000000000000001')
const counterpartyAccount = accountRef('acc_00000000000000000000000000000002')
const currentOwnership = ownershipRef('own_00000000000000000000000000000001')

const validContext = Object.freeze({
  workloadKind: 'job',
  actorPrincipalRef: actor,
  activeAccountRef: activeAccount,
  correlationRef: 'correlation:work-1',
  idempotencyRef: 'idempotency:work-1',
  purpose: 'Settle admitted orders',
  source: 'scheduler/work-queue',
})

function principal(overrides: Partial<Principal> = {}): Principal {
  return Object.freeze({
    principalRef: actor,
    kind: 'workload',
    displayName: 'Settlement worker',
    lifecycle: 'active',
    revision: 3,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  })
}

function account(ref: AccountRef = activeAccount, overrides: Partial<Account> = {}): Account {
  return Object.freeze({
    accountRef: ref,
    displayName: 'Workload account',
    lifecycle: 'active',
    recoveryPolicy: { kind: 'no_transfer' as const, revision: 1 },
    creationActorPrincipalRef: actor,
    creationIdempotencyRef: 'create:1',
    initialOwnershipRef: currentOwnership,
    currentOwnershipRef: currentOwnership,
    revision: ref === activeAccount ? 4 : 7,
    createdAt: 1,
    updatedAt: 2,
    lastAction: {
      actorPrincipalRef: actor,
      activeAccountRef: ref,
      correlationRef: 'correlation:create',
      idempotencyRef: 'idempotency:create',
    },
    ...overrides,
  })
}

function ownership(overrides: Partial<AccountOwnership> = {}): AccountOwnership {
  return Object.freeze({
    ownershipRef: currentOwnership,
    accountRef: activeAccount,
    ownerPrincipalRef: actor,
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: actor,
      activeAccountRef: activeAccount,
      correlationRef: 'correlation:create',
      idempotencyRef: 'idempotency:create',
    },
    ...overrides,
  })
}

function membership(overrides: Partial<Membership> = {}): Membership {
  return Object.freeze({
    membershipRef: membershipRef('mem_00000000000000000000000000000001'),
    accountRef: activeAccount,
    memberPrincipalRef: actor,
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: other,
      activeAccountRef: activeAccount,
      correlationRef: 'correlation:member',
      idempotencyRef: 'idempotency:member',
    },
    ...overrides,
  })
}

class MemoryStore implements WorkloadContextStore {
  principalResult: Principal | undefined = principal()
  readonly accounts = new Map<AccountRef, Account>([
    [activeAccount, account()],
    [counterpartyAccount, account(counterpartyAccount)],
  ])
  ownershipResult: AccountOwnership | undefined = ownership()
  membershipResult: Membership | undefined

  async getPrincipal(_ref: PrincipalRef): Promise<Principal | undefined> {
    return this.principalResult
  }

  async getAccount(ref: AccountRef): Promise<Account | undefined> {
    return this.accounts.get(ref)
  }

  async getOwnership(_account: Account): Promise<AccountOwnership | undefined> {
    return this.ownershipResult
  }

  async getActiveMembership(_account: AccountRef, _principal: PrincipalRef): Promise<Membership | undefined> {
    return this.membershipResult
  }
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'WorkloadContextError', code, message: code })
}

describe('workload context validation and admission', () => {
  it('creates immutable attributed contexts for every workload kind without authority material', () => {
    for (const workloadKind of ['job', 'cron', 'callback', 'reconciliation'] as const) {
      const context = createWorkloadContext({ ...validContext, workloadKind, purpose: '  reconcile account  ' })
      expect(context).toMatchObject({ workloadKind, purpose: 'reconcile account', source: 'scheduler/work-queue' })
      expect(Object.isFrozen(context)).toBe(true)
      expect(JSON.stringify(context)).not.toMatch(/authority|superuser|operator|role|scope/iu)
    }
  })

  it('fails closed for non-object, incomplete, expanded and implicit-authority shapes', () => {
    for (const input of [null, [], 'job', {}, { ...validContext, superuser: true }, { ...validContext, authority: { bypass: true } }]) {
      expect(() => createWorkloadContext(input)).toThrowError(new WorkloadContextError('workload_context_shape_invalid'))
    }
  })

  it('validates every context field instead of coercing caller input', () => {
    const invalid: readonly [Record<string, unknown>, string][] = [
      [{ ...validContext, workloadKind: 1 }, 'workload_kind_invalid'],
      [{ ...validContext, workloadKind: 'timer' }, 'workload_kind_invalid'],
      [{ ...validContext, actorPrincipalRef: 1 }, 'workload_principal_ref_invalid'],
      [{ ...validContext, actorPrincipalRef: 'user_1' }, 'workload_principal_ref_invalid'],
      [{ ...validContext, activeAccountRef: 1 }, 'workload_account_ref_invalid'],
      [{ ...validContext, activeAccountRef: 'all-accounts' }, 'workload_account_ref_invalid'],
      [{ ...validContext, correlationRef: '' }, 'workload_correlation_ref_invalid'],
      [{ ...validContext, idempotencyRef: 'has space' }, 'workload_idempotency_ref_invalid'],
      [{ ...validContext, purpose: 1 }, 'workload_context_field_invalid'],
      [{ ...validContext, purpose: '   ' }, 'workload_context_field_invalid'],
      [{ ...validContext, source: 'x'.repeat(501) }, 'workload_context_field_invalid'],
      [{ ...validContext, source: 'bad\nsource' }, 'workload_context_field_invalid'],
    ]
    for (const [input, code] of invalid) {
      expect(() => createWorkloadContext(input)).toThrowError(expect.objectContaining({ code }))
    }
  })

  it('admits an active workload owner and pins canonical revisions', async () => {
    const store = new MemoryStore()
    const admitted = await new WorkloadContextAdmission(store).admit(validContext)
    expect(admitted).toEqual({
      ...validContext,
      principalRevision: 3,
      activeAccountRevision: 4,
      accessVia: 'ownership',
    })
    expect(Object.isFrozen(admitted)).toBe(true)
  })

  it('admits an active workload member of exactly the selected Account', async () => {
    const store = new MemoryStore()
    store.ownershipResult = ownership({ ownerPrincipalRef: other })
    store.membershipResult = membership()
    await expect(new WorkloadContextAdmission(store).admit(validContext)).resolves.toMatchObject({ accessVia: 'membership' })
  })

  it('rejects missing, aliased, non-workload and inactive Principals', async () => {
    const store = new MemoryStore()
    const admission = new WorkloadContextAdmission(store)
    store.principalResult = undefined
    await expectCode(admission.admit(validContext), 'workload_principal_missing')
    store.principalResult = principal({ principalRef: other })
    await expectCode(admission.admit(validContext), 'workload_record_integrity_invalid')
    store.principalResult = principal({ kind: 'agent' })
    await expectCode(admission.admit(validContext), 'workload_principal_kind_required')
    store.principalResult = principal({ lifecycle: 'suspended' })
    await expectCode(admission.admit(validContext), 'workload_principal_inactive')
  })

  it('rejects missing, aliased and inactive Accounts', async () => {
    const store = new MemoryStore()
    const admission = new WorkloadContextAdmission(store)
    store.accounts.delete(activeAccount)
    await expectCode(admission.admit(validContext), 'workload_account_missing')
    store.accounts.set(activeAccount, account(counterpartyAccount))
    await expectCode(admission.admit(validContext), 'workload_record_integrity_invalid')
    store.accounts.set(activeAccount, account(activeAccount, { lifecycle: 'suspended' }))
    await expectCode(admission.admit(validContext), 'workload_account_inactive')
  })

  it('fails closed for every inconsistent current-ownership fact', async () => {
    const store = new MemoryStore()
    const admission = new WorkloadContextAdmission(store)
    store.ownershipResult = undefined
    await expectCode(admission.admit(validContext), 'workload_record_integrity_invalid')
    store.ownershipResult = ownership({ ownershipRef: ownershipRef('own_00000000000000000000000000000002') })
    await expectCode(admission.admit(validContext), 'workload_record_integrity_invalid')
    store.ownershipResult = ownership({ accountRef: counterpartyAccount })
    await expectCode(admission.admit(validContext), 'workload_record_integrity_invalid')
    store.ownershipResult = ownership({ lifecycle: 'ended' })
    await expectCode(admission.admit(validContext), 'workload_record_integrity_invalid')
  })

  it('rejects wrong-Account access and inconsistent membership facts', async () => {
    const store = new MemoryStore()
    const admission = new WorkloadContextAdmission(store)
    store.ownershipResult = ownership({ ownerPrincipalRef: other })
    await expectCode(admission.admit(validContext), 'workload_account_access_forbidden')
    store.membershipResult = membership({ accountRef: counterpartyAccount })
    await expectCode(admission.admit(validContext), 'workload_record_integrity_invalid')
    store.membershipResult = membership({ memberPrincipalRef: other })
    await expectCode(admission.admit(validContext), 'workload_record_integrity_invalid')
    store.membershipResult = membership({ lifecycle: 'ended' })
    await expectCode(admission.admit(validContext), 'workload_record_integrity_invalid')
  })

  it('attributes explicit cross-Account work and rejects implicit, self and inactive targets', async () => {
    const store = new MemoryStore()
    const admission = new WorkloadContextAdmission(store)
    const attributed = await admission.attributeCrossAccount({ context: validContext, counterpartyAccountRef: counterpartyAccount })
    expect(attributed).toEqual({
      workloadKind: 'job',
      actorPrincipalRef: actor,
      activeAccountRef: activeAccount,
      counterpartyAccountRef: counterpartyAccount,
      activeAccountRevision: 4,
      counterpartyAccountRevision: 7,
      correlationRef: validContext.correlationRef,
      idempotencyRef: validContext.idempotencyRef,
      purpose: validContext.purpose,
      source: validContext.source,
    })
    expect(Object.isFrozen(attributed)).toBe(true)
    await expectCode(admission.attributeCrossAccount({ context: validContext, counterpartyAccountRef: counterpartyAccount, accounts: [activeAccount, counterpartyAccount] }), 'workload_context_shape_invalid')
    await expectCode(admission.attributeCrossAccount({ context: validContext, counterpartyAccountRef: activeAccount }), 'workload_cross_account_self_forbidden')
    store.accounts.set(counterpartyAccount, account(counterpartyAccount, { lifecycle: 'closed' }))
    await expectCode(admission.attributeCrossAccount({ context: validContext, counterpartyAccountRef: counterpartyAccount }), 'workload_account_inactive')
  })
})
