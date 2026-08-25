import { describe, expect, it } from 'vitest'

import {
  AccountRegistry,
  type Account,
  type AccountActionContext,
  type AccountOwnership,
  type AccountRef,
  type AccountRegistryCommit,
  type AccountRegistryStore,
  type AccountRegistryTransaction,
  type Membership,
  type MembershipRef,
  type OwnershipRef,
  type SuccessionAuthorization,
} from '../../src/modules/principal-account/account/public'
import {
  principalRef,
  type Principal,
  type PrincipalRef,
} from '../../src/modules/principal-account/principal/public'

class AcceptanceStore implements AccountRegistryStore {
  readonly principals = new Map<PrincipalRef, Principal>()
  readonly accounts = new Map<AccountRef, Account>()
  readonly ownerships = new Map<OwnershipRef, AccountOwnership>()
  readonly memberships = new Map<MembershipRef, Membership>()
  readonly successionAuthorizations = new Map<string, SuccessionAuthorization>()

  async transact<Result>(operation: (transaction: AccountRegistryTransaction) => Promise<Result>): Promise<Result> {
    return await operation({
      getPrincipal: async (ref) => this.principals.get(ref),
      getAccount: async (ref) => this.accounts.get(ref),
      getAccountByCreationIdempotency: async (actor, idempotency) => [...this.accounts.values()].find(
        (account) => account.creationActorPrincipalRef === actor
          && account.creationIdempotencyRef === idempotency,
      ),
      getOwnership: async (ref) => this.ownerships.get(ref),
      getMembership: async (ref) => this.memberships.get(ref),
      getActiveMembership: async (accountRef, memberPrincipalRef) => [...this.memberships.values()].find(
        (membership) => membership.accountRef === accountRef
          && membership.memberPrincipalRef === memberPrincipalRef
          && membership.lifecycle === 'active',
      ),
      getVerifiedRecoveryParticipantApproval: async () => undefined,
      getSuccessionAuthorization: async (ref) => this.successionAuthorizations.get(ref),
      commit: async (change) => this.apply(change),
    })
  }

  addPrincipal(suffix: number): PrincipalRef {
    const ref = principalRef(`prn_${String(suffix).padStart(32, '0')}`)
    this.principals.set(ref, Object.freeze({
      principalRef: ref,
      kind: 'agent',
      displayName: `agent-${suffix}`,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    }))
    return ref
  }

  private apply(change: AccountRegistryCommit): void {
    if (change.accountInsert !== undefined) {
      this.accounts.set(change.accountInsert.accountRef, change.accountInsert)
    }
    if (change.accountReplacement !== undefined) {
      this.accounts.set(change.accountReplacement.value.accountRef, change.accountReplacement.value)
    }
    for (const ownership of change.ownershipInserts ?? []) {
      this.ownerships.set(ownership.ownershipRef, ownership)
    }
    for (const replacement of change.ownershipReplacements ?? []) {
      this.ownerships.set(replacement.value.ownershipRef, replacement.value)
    }
    if (change.successionAuthorizationInsert !== undefined) {
      this.successionAuthorizations.set(change.successionAuthorizationInsert.authorizationRef, change.successionAuthorizationInsert)
    }
    if (change.successionAuthorizationReplacement !== undefined) {
      this.successionAuthorizations.set(
        change.successionAuthorizationReplacement.value.authorizationRef,
        change.successionAuthorizationReplacement.value,
      )
    }
  }
}

describe('Phase 1 acceptance — succession authorization provenance', () => {
  it('rejects Account takeover with a caller-constructed threshold authorization', async () => {
    const store = new AcceptanceStore()
    const incumbent = store.addPrincipal(1)
    const attacker = store.addPrincipal(2)
    let timestamp = 0
    let uuid = 0
    const registry = new AccountRegistry(store, {
      now: () => (timestamp += 1_000),
      randomUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    })
    const context = (accountRef: AccountRef, actorPrincipalRef: PrincipalRef, operation: string): AccountActionContext => ({
      actorPrincipalRef,
      activeAccountRef: accountRef,
      correlationRef: `correlation:${operation}`,
      idempotencyRef: `idempotency:${operation}`,
    })

    const created = await registry.create({
      ownerPrincipalRef: incumbent,
      displayName: 'Threshold recovery target',
      recoveryPolicy: {
        kind: 'threshold',
        threshold: 2,
        participantCount: 3,
        delayMs: 1_000,
        freezeRequired: true,
        revision: 1,
      },
      correlationRef: 'correlation:create',
      idempotencyRef: 'idempotency:create',
    })
    const active = await registry.activate({
      accountRef: created.account.accountRef,
      expectedRevision: 1,
      context: context(created.account.accountRef, incumbent, 'activate'),
    })
    const suspended = await registry.suspend({
      accountRef: active.accountRef,
      expectedRevision: active.revision,
      context: context(active.accountRef, incumbent, 'suspend'),
    })

    const accountBefore = store.accounts.get(suspended.accountRef)
    const ownershipBefore = store.ownerships.get(created.ownership.ownershipRef)

    const callerConstructedRequest = {
      accountRef: suspended.accountRef,
      successorOwnerPrincipalRef: attacker,
      expectedAccountRevision: suspended.revision,
      expectedOwnershipRevision: created.ownership.revision,
      authorizationRef: 'sau_ffffffffffffffffffffffffffffffff',
      authorization: {
        authorizationRef: 'attacker-invented-proof',
        accountRef: suspended.accountRef,
        incumbentOwnerPrincipalRef: incumbent,
        successorOwnerPrincipalRef: attacker,
        recoveryPolicyRevision: 1,
        verifiedAt: 4_000,
        expiresAt: 5_000,
      },
      context: context(suspended.accountRef, attacker, 'takeover'),
    } as Parameters<AccountRegistry['succeedOwnership']>[0]
    await expect(registry.succeedOwnership(callerConstructedRequest))
      .rejects.toMatchObject({ code: 'succession_authorization_not_found' })

    expect(store.accounts.get(suspended.accountRef)).toBe(accountBefore)
    expect(store.ownerships.get(created.ownership.ownershipRef)).toBe(ownershipBefore)
    expect([...store.ownerships.values()]).toHaveLength(1)
    expect([...store.memberships.values()]).toEqual([])
  })
})
