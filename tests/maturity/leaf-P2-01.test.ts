import { describe, expect, it } from 'vitest'

import {
  DelegationService,
  type DelegationContextPort,
  type DelegationAuthoritySnapshot,
  type DelegationCommit,
  type DelegationGrant,
  type DelegationGrantRef,
  type DelegationStore,
  type DelegationTransaction,
} from '../../src/modules/authority/delegation/public'
import {
  accountRef,
  type AccountActionContext,
  type ActiveAccountContext,
} from '../../src/modules/principal-account/account/public'
import {
  principalRef,
  type PrincipalRef,
} from '../../src/modules/principal-account/principal/public'

class ContractStore implements DelegationStore {
  readonly grants = new Map<DelegationGrantRef, DelegationGrant>()
  readonly snapshots = new Map<string, DelegationAuthoritySnapshot>()

  async transact<Result>(operation: (transaction: DelegationTransaction) => Promise<Result>): Promise<Result> {
    return await operation({
      getGrant: async (ref) => this.grants.get(ref),
      getGrantByCreationIdempotency: async (account, actor, idempotency) => [...this.grants.values()].find(
        (grant) => grant.accountRef === account
          && grant.actorPrincipalRef === actor
          && grant.createdBy.idempotencyRef === idempotency,
      ),
      getSnapshotByAdmissionIdempotency: async (account, actor, idempotency) => [...this.snapshots.values()].find(
        (snapshot) => snapshot.accountRef === account
          && snapshot.actorPrincipalRef === actor
          && snapshot.idempotencyRef === idempotency,
      ),
      getSnapshot: async (ref) => this.snapshots.get(ref),
      commit: async (change) => this.apply(change),
    })
  }

  private apply(change: DelegationCommit): void {
    if (change.grantInsert !== undefined) {
      if (this.grants.has(change.grantInsert.grantRef)) throw new Error('test_grant_conflict')
      this.grants.set(change.grantInsert.grantRef, change.grantInsert)
    }
    for (const replacement of change.grantReplacements ?? []) {
      const current = this.grants.get(replacement.value.grantRef)
      if (current?.revision !== replacement.expectedRevision) throw new Error('test_revision_conflict')
      this.grants.set(replacement.value.grantRef, replacement.value)
    }
    if (change.snapshotInsert !== undefined) {
      if (this.snapshots.has(change.snapshotInsert.snapshotRef)) throw new Error('test_snapshot_conflict')
      this.snapshots.set(change.snapshotInsert.snapshotRef, change.snapshotInsert)
    }
  }
}

const ACCOUNT = accountRef('acc_00000000000040008000000000000001')
const OWNER = principalRef('prn_00000000000040008000000000000001')
const AGENT = principalRef('prn_00000000000040008000000000000002')

function context(actorPrincipalRef: PrincipalRef, suffix: string): AccountActionContext {
  return {
    actorPrincipalRef,
    activeAccountRef: ACCOUNT,
    correlationRef: `correlation:${suffix}`,
    idempotencyRef: `idempotency:${suffix}`,
  }
}

function harness(): Readonly<{
  store: ContractStore
  service: DelegationService
  setNow(value: number): void
}> {
  const store = new ContractStore()
  let now = 100
  let sequence = 0
  const active = new Set<PrincipalRef>([OWNER, AGENT])
  const contexts: DelegationContextPort = {
    resolveActiveContext: async (candidate) => {
      if (candidate.activeAccountRef !== ACCOUNT || !active.has(candidate.actorPrincipalRef)) {
        throw new Error('trusted_context_rejected')
      }
      return Object.freeze({
        accountRef: ACCOUNT,
        actorPrincipalRef: candidate.actorPrincipalRef,
        accountRevision: 7,
        correlationRef: candidate.correlationRef,
        idempotencyRef: candidate.idempotencyRef,
      } satisfies ActiveAccountContext)
    },
    resolveRootIssuerContext: async (candidate) => {
      if (candidate.activeAccountRef !== ACCOUNT || candidate.actorPrincipalRef !== OWNER) {
        throw new Error('trusted_root_issuer_rejected')
      }
      return Object.freeze({
        accountRef: ACCOUNT,
        actorPrincipalRef: candidate.actorPrincipalRef,
        accountRevision: 7,
        correlationRef: candidate.correlationRef,
        idempotencyRef: candidate.idempotencyRef,
      } satisfies ActiveAccountContext)
    },
    requireActivePrincipal: async (candidate) => {
      if (!active.has(candidate)) throw new Error('trusted_principal_rejected')
    },
  }
  return {
    store,
    service: new DelegationService(store, contexts, {
      now: () => now,
      randomUuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    }),
    setNow: (value) => { now = value },
  }
}

describe('P2-01 Membership and delegation contract', () => {
  it('admits a narrow multi-hop descendant and returns a pinned immutable snapshot', async () => {
    const setup = harness()
    const root = await setup.service.issueRoot({
      context: context(OWNER, 'root'),
      subjectPrincipalRef: OWNER,
      scopes: ['operation:invoke', 'connection:read'],
      resourceRefs: ['operation:alpha', 'operation:beta'],
      budgetLimit: 1_000,
      expiresAt: 1_000,
    })
    const child = await setup.service.delegate({
      parentGrantRef: root.grantRef,
      parentGeneration: root.generation,
      context: context(OWNER, 'child'),
      subjectPrincipalRef: AGENT,
      scopes: ['operation:invoke'],
      resourceRefs: ['operation:alpha'],
      budgetLimit: 600,
      expiresAt: 900,
    })
    const grandchild = await setup.service.delegate({
      parentGrantRef: child.grantRef,
      parentGeneration: child.generation,
      context: context(AGENT, 'grandchild'),
      subjectPrincipalRef: AGENT,
      scopes: ['operation:invoke'],
      resourceRefs: ['operation:alpha'],
      budgetLimit: 300,
      expiresAt: 800,
    })

    setup.setNow(799)
    const snapshot = await setup.service.admitConsequence({
      grantRef: grandchild.grantRef,
      expectedGeneration: grandchild.generation,
      context: context(AGENT, 'admit'),
      requiredScopes: ['operation:invoke'],
      resourceRefs: ['operation:alpha'],
      budgetAmount: 125,
    })

    expect(snapshot).toMatchObject({
      accountRef: ACCOUNT,
      actorPrincipalRef: AGENT,
      subjectPrincipalRef: AGENT,
      grantRef: grandchild.grantRef,
      generation: 1,
      scopes: ['operation:invoke'],
      resourceRefs: ['operation:alpha'],
      budgetAmount: 125,
      admittedAt: 799,
      expiresAt: 800,
    })
    expect(snapshot.ancestry).toHaveLength(3)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.ancestry)).toBe(true)
    expect(() => (snapshot.scopes as string[]).push('connection:read')).toThrow()
  })
})
