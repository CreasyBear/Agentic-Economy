import { describe, expect, it } from 'vitest'

import {
  WORKLOAD_KINDS,
  WorkloadContextAdmission,
  type WorkloadContextStore,
} from '../../src/modules/principal-account/workload-context/public'
import {
  accountRef,
  membershipRef,
  ownershipRef,
  type Account,
  type AccountOwnership,
  type AccountRef,
  type Membership,
} from '../../src/modules/principal-account/account/public'
import { principalRef, type Principal, type PrincipalRef } from '../../src/modules/principal-account/principal/public'
import {
  CANONICAL_IDENTITY_TABLES,
  LEGACY_IDENTITY_RESET_MANIFEST,
  executeLegacyIdentityReset,
  planLegacyIdentityReset,
  type CanonicalIdentityTable,
  type LegacyIdentityResetApplyReceipt,
  type LegacyIdentityResetExecutionPort,
  type LegacyIdentityResetPlan,
  type LegacyIdentityTable,
} from '../../tools/maturity-reset/public'

const workloadRef = principalRef('prn_00000000000000000000000000000001')
const ownerRef = principalRef('prn_00000000000000000000000000000002')
const selectedAccountRef = accountRef('acc_00000000000000000000000000000001')
const counterpartyRef = accountRef('acc_00000000000000000000000000000002')
const ownershipOneRef = ownershipRef('own_00000000000000000000000000000001')
const ownershipTwoRef = ownershipRef('own_00000000000000000000000000000002')

function actionContext(account: AccountRef) {
  return { actorPrincipalRef: ownerRef, activeAccountRef: account, correlationRef: 'correlation:create', idempotencyRef: 'idempotency:create' }
}

function account(ref: AccountRef, currentOwnershipRef: ReturnType<typeof ownershipRef>, revision: number): Account {
  return Object.freeze({
    accountRef: ref,
    displayName: 'Canonical Account',
    lifecycle: 'active',
    recoveryPolicy: { kind: 'no_transfer' as const, revision: 1 },
    creationActorPrincipalRef: ownerRef,
    creationIdempotencyRef: `create:${revision}`,
    initialOwnershipRef: currentOwnershipRef,
    currentOwnershipRef,
    revision,
    createdAt: 1,
    updatedAt: 2,
    lastAction: actionContext(ref),
  })
}

class ContractStore implements WorkloadContextStore {
  principal: Principal = Object.freeze({ principalRef: workloadRef, kind: 'workload', displayName: 'Internal runner', lifecycle: 'active', revision: 5, createdAt: 1, updatedAt: 2 })
  readonly accounts = new Map<AccountRef, Account>([
    [selectedAccountRef, account(selectedAccountRef, ownershipOneRef, 8)],
    [counterpartyRef, account(counterpartyRef, ownershipTwoRef, 13)],
  ])
  readonly ownerships = new Map<AccountRef, AccountOwnership>([
    [selectedAccountRef, Object.freeze({ ownershipRef: ownershipOneRef, accountRef: selectedAccountRef, ownerPrincipalRef: ownerRef, lifecycle: 'active', changeKind: 'creation', revision: 1, createdAt: 1, createdBy: actionContext(selectedAccountRef) })],
    [counterpartyRef, Object.freeze({ ownershipRef: ownershipTwoRef, accountRef: counterpartyRef, ownerPrincipalRef: ownerRef, lifecycle: 'active', changeKind: 'creation', revision: 1, createdAt: 1, createdBy: actionContext(counterpartyRef) })],
  ])
  membership: Membership | undefined = Object.freeze({ membershipRef: membershipRef('mem_00000000000000000000000000000001'), accountRef: selectedAccountRef, memberPrincipalRef: workloadRef, lifecycle: 'active', revision: 1, createdAt: 1, createdBy: actionContext(selectedAccountRef) })

  async getPrincipal(_ref: PrincipalRef): Promise<Principal | undefined> { return this.principal }
  async getAccount(ref: AccountRef): Promise<Account | undefined> { return this.accounts.get(ref) }
  async getOwnership(value: Account): Promise<AccountOwnership | undefined> { return this.ownerships.get(value.accountRef) }
  async getActiveMembership(_account: AccountRef, _principal: PrincipalRef): Promise<Membership | undefined> { return this.membership }
}

function context(workloadKind: typeof WORKLOAD_KINDS[number]) {
  return {
    workloadKind,
    actorPrincipalRef: workloadRef,
    activeAccountRef: selectedAccountRef,
    correlationRef: `correlation:${workloadKind}`,
    idempotencyRef: `idempotency:${workloadKind}`,
    purpose: `Run ${workloadKind} work`,
    source: `internal/${workloadKind}`,
  }
}

class ResetPort implements LegacyIdentityResetExecutionPort {
  readonly receipts = new Map<string, LegacyIdentityResetApplyReceipt>()
  applies = 0

  async findReceipt(digest: string): Promise<LegacyIdentityResetApplyReceipt | undefined> { return this.receipts.get(digest) }
  async applyExact(plan: LegacyIdentityResetPlan): Promise<LegacyIdentityResetApplyReceipt> {
    this.applies += 1
    const receipt = { planDigest: plan.planDigest, removed: plan.targets.map(({ table, measuredFacts }) => ({ table, facts: measuredFacts })) }
    this.receipts.set(plan.planDigest, receipt)
    return receipt
  }
}

describe('P1-04 workload context and clean reset contract', () => {
  it('admits jobs, crons, callbacks and reconciliation only with one explicit workload Principal and active Account', async () => {
    const admission = new WorkloadContextAdmission(new ContractStore())
    for (const workloadKind of WORKLOAD_KINDS) {
      const admitted = await admission.admit(context(workloadKind))
      expect(admitted).toMatchObject({ workloadKind, actorPrincipalRef: workloadRef, activeAccountRef: selectedAccountRef, principalRevision: 5, activeAccountRevision: 8, accessVia: 'membership' })
    }
  })

  it('proves no internal workload obtains implicit superuser authority or implicit Account selection', async () => {
    const store = new ContractStore()
    const admission = new WorkloadContextAdmission(store)
    await expect(admission.admit({ ...context('job'), superuser: true })).rejects.toMatchObject({ code: 'workload_context_shape_invalid' })
    await expect(admission.admit({ ...context('job'), accountRefs: [selectedAccountRef, counterpartyRef] })).rejects.toMatchObject({ code: 'workload_context_shape_invalid' })
    store.principal = Object.freeze({ ...store.principal, kind: 'agent' })
    await expect(admission.admit(context('job'))).rejects.toMatchObject({ code: 'workload_principal_kind_required' })
    store.principal = Object.freeze({ ...store.principal, kind: 'workload' })
    store.membership = undefined
    await expect(admission.admit(context('job'))).rejects.toMatchObject({ code: 'workload_account_access_forbidden' })
  })

  it('attributes cross-Account work explicitly and refuses an implicit or self counterparty', async () => {
    const admission = new WorkloadContextAdmission(new ContractStore())
    await expect(admission.attributeCrossAccount({ context: context('reconciliation'), counterpartyAccountRef: counterpartyRef })).resolves.toMatchObject({ actorPrincipalRef: workloadRef, activeAccountRef: selectedAccountRef, counterpartyAccountRef: counterpartyRef, activeAccountRevision: 8, counterpartyAccountRevision: 13, purpose: 'Run reconciliation work', source: 'internal/reconciliation' })
    await expect(admission.attributeCrossAccount({ context: context('reconciliation') })).rejects.toMatchObject({ code: 'workload_context_shape_invalid' })
    await expect(admission.attributeCrossAccount({ context: context('reconciliation'), counterpartyAccountRef: selectedAccountRef })).rejects.toMatchObject({ code: 'workload_cross_account_self_forbidden' })
  })

  it('builds a deterministic dry-run reset plan that protects every canonical identity table', async () => {
    const measured: Readonly<Record<LegacyIdentityTable | CanonicalIdentityTable, number>> = {
      owners: 2, agentAccessPrincipals: 3,
      principals: 7, accounts: 11, accountOwnerships: 13, memberships: 17, externalIdentityBindings: 19, credentials: 23,
    }
    const plan = await planLegacyIdentityReset({ inventory: { countFacts: async (table) => measured[table] }, snapshotRef: 'snapshot:p1-04', targets: LEGACY_IDENTITY_RESET_MANIFEST.map(({ table }) => table) })
    const port = new ResetPort()
    const preview = await executeLegacyIdentityReset(plan, port)
    expect(preview).toMatchObject({ mode: 'dry-run', factsPlannedForRemoval: 5, factsRemoved: 0, canonicalFactsRetained: 90 })
    expect(plan.retainedCanonical.map(({ table }) => table)).toEqual(CANONICAL_IDENTITY_TABLES)
    expect(port.applies).toBe(0)
    await expect(planLegacyIdentityReset({ inventory: { countFacts: async () => 0 }, snapshotRef: 'snapshot:p1-04', targets: ['principals'] })).rejects.toMatchObject({ code: 'reset_protected_target' })
    await expect(planLegacyIdentityReset({ inventory: { countFacts: async () => 0 }, snapshotRef: 'snapshot:p1-04', targets: ['surpriseIdentityRows'] })).rejects.toMatchObject({ code: 'reset_unknown_target' })
  })

  it('requires the exact measured digest and applies an identical plan only once', async () => {
    const plan = await planLegacyIdentityReset({ inventory: { countFacts: async () => 1 }, snapshotRef: 'snapshot:p1-04:apply', targets: ['owners'] })
    const port = new ResetPort()
    await expect(executeLegacyIdentityReset(plan, port, { apply: true, confirmedPlanDigest: 'wrong' })).rejects.toMatchObject({ code: 'reset_plan_digest_invalid' })
    await expect(executeLegacyIdentityReset(plan, port, { apply: true, confirmedPlanDigest: plan.planDigest })).resolves.toMatchObject({ mode: 'applied', factsRemoved: 1, canonicalFactsRetained: 6 })
    await expect(executeLegacyIdentityReset(plan, port, { apply: true, confirmedPlanDigest: plan.planDigest })).resolves.toMatchObject({ mode: 'already-applied', factsRemoved: 1 })
    expect(port.applies).toBe(1)
  })
})
