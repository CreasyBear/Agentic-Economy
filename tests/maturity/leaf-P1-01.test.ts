import { describe, expect, it } from 'vitest'

import {
  PRINCIPAL_KINDS,
  PrincipalRegistry,
  type Principal,
  type PrincipalRef,
  type PrincipalRegistryStore,
  type PrincipalRegistryTransaction,
} from '../../src/modules/principal-account/principal/public'

class ContractStore implements PrincipalRegistryStore {
  readonly principals = new Map<PrincipalRef, Principal>()
  writes = 0

  async transact<Result>(operation: (transaction: PrincipalRegistryTransaction) => Promise<Result>): Promise<Result> {
    return await operation({
      get: async (ref) => this.principals.get(ref),
      insert: async (principal) => {
        this.writes += 1
        this.principals.set(principal.principalRef, principal)
      },
      replace: async (principal) => {
        this.writes += 1
        this.principals.set(principal.principalRef, principal)
      },
      replaceMany: async (replacements) => {
        this.writes += replacements.length
        for (const { principal } of replacements) this.principals.set(principal.principalRef, principal)
      },
    })
  }
}

describe('P1-01 canonical Principal registry contract', () => {
  it('gives human, organization, agent and workload Principals one credential-independent identity model', async () => {
    const store = new ContractStore()
    let sequence = 0
    const registry = new PrincipalRegistry(store, {
      now: () => 1_000 + sequence,
      randomUuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    })

    const principals = await Promise.all(PRINCIPAL_KINDS.map(async (kind) => await registry.register({
      kind,
      displayName: `${kind} principal`,
    })))

    expect(principals.map(({ kind }) => kind)).toEqual(PRINCIPAL_KINDS)
    expect(new Set(principals.map(({ principalRef }) => principalRef)).size).toBe(4)
    expect(principals.every(({ principalRef }) => principalRef.startsWith('prn_'))).toBe(true)
    expect(JSON.stringify(principals)).not.toMatch(/credential|provider|clerk|subject/iu)
  })

  it('makes merge explicit while retaining both stable references', async () => {
    const store = new ContractStore()
    const uuids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
    const registry = new PrincipalRegistry(store, { now: () => 100, randomUuid: () => uuids.shift() ?? '' })
    const duplicate = await registry.register({ kind: 'human', displayName: 'Duplicate' })
    const canonical = await registry.register({ kind: 'human', displayName: 'Canonical' })

    const result = await registry.merge({
      sourcePrincipalRef: duplicate.principalRef,
      targetPrincipalRef: canonical.principalRef,
      expectedSourceRevision: 1,
      expectedTargetRevision: 1,
    })

    expect(result.source.principalRef).toBe(duplicate.principalRef)
    expect(result.source.mergedIntoPrincipalRef).toBe(canonical.principalRef)
    expect(result.target.principalRef).toBe(canonical.principalRef)
    await expect(registry.resolveCanonical(duplicate.principalRef)).resolves.toBe(result.target)
  })

  it('proves credential rotation cannot create or transfer a Principal', async () => {
    const store = new ContractStore()
    const registry = new PrincipalRegistry(store, {
      now: () => 100,
      randomUuid: () => '00000000-0000-4000-8000-000000000001',
    })
    const principal = await registry.register({ kind: 'agent', displayName: 'Stable agent' })
    const unknownRef = 'prn_ffffffffffffffffffffffffffffffff' as PrincipalRef
    const writesBefore = store.writes

    await expect(registry.proveCredentialRotationContinuity({
      currentPrincipalRef: principal.principalRef,
      replacementPrincipalRef: unknownRef,
      expectedRevision: 1,
    })).rejects.toMatchObject({ code: 'credential_rotation_principal_transfer_forbidden' })
    await expect(registry.proveCredentialRotationContinuity({
      currentPrincipalRef: unknownRef,
      replacementPrincipalRef: unknownRef,
      expectedRevision: 1,
    })).rejects.toMatchObject({ code: 'principal_not_found' })
    await expect(registry.proveCredentialRotationContinuity({
      currentPrincipalRef: principal.principalRef,
      replacementPrincipalRef: principal.principalRef,
      expectedRevision: 1,
    })).resolves.toEqual({ principalRef: principal.principalRef, kind: 'agent', revision: 1 })

    expect(store.writes).toBe(writesBefore)
    expect(store.principals.has(unknownRef)).toBe(false)
    expect(store.principals.get(principal.principalRef)).toBe(principal)
  })
})
