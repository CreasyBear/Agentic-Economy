import { describe, expect, it } from 'vitest'

import {
  PRINCIPAL_KINDS,
  PRINCIPAL_LIFECYCLES,
  PrincipalRegistry,
  PrincipalRegistryError,
  generatePrincipalRef,
  principalKindValue,
  principalLifecycleValue,
  principalRef,
  principalTables,
  principalValue,
  type Principal,
  type PrincipalRef,
  type PrincipalRegistryStore,
  type PrincipalRegistryTransaction,
} from '../../../../src/modules/principal-account/principal/public'

class MemoryPrincipalStore implements PrincipalRegistryStore {
  readonly records = new Map<PrincipalRef, Principal>()
  readonly writes: string[] = []

  async transact<Result>(operation: (transaction: PrincipalRegistryTransaction) => Promise<Result>): Promise<Result> {
    const transaction: PrincipalRegistryTransaction = {
      get: async (ref) => this.records.get(ref),
      insert: async (principal) => {
        this.writes.push(`insert:${principal.principalRef}`)
        this.records.set(principal.principalRef, principal)
      },
      replace: async (principal, expectedRevision) => {
        this.assertExpected(principal.principalRef, expectedRevision)
        this.writes.push(`replace:${principal.principalRef}`)
        this.records.set(principal.principalRef, principal)
      },
      replaceMany: async (replacements) => {
        for (const replacement of replacements) {
          this.assertExpected(replacement.principal.principalRef, replacement.expectedRevision)
        }
        for (const replacement of replacements) {
          this.writes.push(`replace:${replacement.principal.principalRef}`)
          this.records.set(replacement.principal.principalRef, replacement.principal)
        }
      },
    }
    return await operation(transaction)
  }

  seed(principal: Principal): void {
    this.records.set(principal.principalRef, principal)
  }

  private assertExpected(ref: PrincipalRef, expectedRevision: number): void {
    if (this.records.get(ref)?.revision !== expectedRevision) throw new Error('test_store_revision_conflict')
  }
}

const uuids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
]

function registry(store = new MemoryPrincipalStore(), times: number[] = [100]): { registry: PrincipalRegistry; store: MemoryPrincipalStore } {
  let uuidIndex = 0
  let timeIndex = 0
  return {
    registry: new PrincipalRegistry(store, {
      now: () => times[Math.min(timeIndex++, times.length - 1)] ?? 0,
      randomUuid: () => uuids[Math.min(uuidIndex++, uuids.length - 1)] ?? '',
    }),
    store,
  }
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code, message: code, name: 'PrincipalRegistryError' })
}

describe('canonical Principal registry', () => {
  it('exports Convex validators and table fragments with fully named indexes', () => {
    expect(PRINCIPAL_KINDS).toEqual(['human', 'organization', 'agent', 'workload'])
    expect(PRINCIPAL_LIFECYCLES).toEqual(['active', 'suspended', 'merged', 'retired'])
    expect(principalKindValue).toBeDefined()
    expect(principalLifecycleValue).toBeDefined()
    expect(principalValue).toBeDefined()
    expect(principalTables.principals).toBeDefined()
  })

  it('creates all Principal kinds in one model with opaque provider-independent references', async () => {
    const { registry: subject } = registry(undefined, [100, 101, 102, 103])
    const created = []
    for (const [index, kind] of PRINCIPAL_KINDS.entries()) {
      created.push(await subject.register({ kind, displayName: `  Principal ${index}  ` }))
    }
    expect(created.map((principal) => principal.kind)).toEqual(PRINCIPAL_KINDS)
    expect(created.map((principal) => principal.displayName)).toEqual([
      'Principal 0', 'Principal 1', 'Principal 2', 'Principal 3',
    ])
    expect(created.every((principal) => /^prn_[0-9a-f]{32}$/u.test(principal.principalRef))).toBe(true)
    expect(created.every((principal) => principal.lifecycle === 'active' && principal.revision === 1)).toBe(true)
    expect(Object.isFrozen(created[0])).toBe(true)
    await expect(subject.get(created[0]!.principalRef)).resolves.toBe(created[0])
  })

  it('rejects invalid identifiers, UUID entropy, display names, timestamps and collisions deterministically', async () => {
    expect(() => principalRef('clerk:user_1')).toThrowError(PrincipalRegistryError)
    expect(() => generatePrincipalRef(() => 'NOT-A-UUID')).toThrowError(/invalid_principal_ref/u)
    expect(generatePrincipalRef()).toMatch(/^prn_[0-9a-f]{32}$/u)
    await expectCode(registry(undefined, [-1]).registry.register({ kind: 'human', displayName: 'Alice' }), 'invalid_principal_timestamp')
    await expectCode(registry(undefined, [Number.NaN]).registry.register({ kind: 'human', displayName: 'Alice' }), 'invalid_principal_timestamp')
    await expectCode(registry().registry.register({ kind: 'service' as never, displayName: 'Alice' }), 'principal_kind_mismatch')
    await expectCode(registry().registry.register({ kind: 'human', displayName: '   ' }), 'invalid_principal_display_name')
    await expectCode(registry().registry.register({ kind: 'human', displayName: 'a'.repeat(201) }), 'invalid_principal_display_name')
    await expectCode(registry().registry.register({ kind: 'human', displayName: 'Alice\nRoot' }), 'invalid_principal_display_name')

    const setup = registry()
    const collidingRef = principalRef('prn_00000000000040008000000000000001')
    setup.store.seed(Object.freeze({
      principalRef: collidingRef,
      kind: 'human',
      displayName: 'Existing',
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    }))
    await expectCode(setup.registry.register({ kind: 'human', displayName: 'New' }), 'principal_ref_conflict')
    await expectCode(setup.registry.get('credential:user_1' as PrincipalRef), 'invalid_principal_ref')
  })

  it('renames active and suspended Principals without changing their stable reference', async () => {
    const setup = registry(undefined, [10, 20, 30, 40, 50])
    const created = await setup.registry.register({ kind: 'human', displayName: 'Original' })
    const unchanged = await setup.registry.rename({ principalRef: created.principalRef, expectedRevision: 1, displayName: ' Original ' })
    expect(unchanged).toBe(created)
    const renamed = await setup.registry.rename({ principalRef: created.principalRef, expectedRevision: 1, displayName: 'Updated' })
    expect(renamed).toMatchObject({ principalRef: created.principalRef, displayName: 'Updated', revision: 2 })
    const suspended = await setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: 2, lifecycle: 'suspended' })
    const renamedWhileSuspended = await setup.registry.rename({ principalRef: created.principalRef, expectedRevision: 3, displayName: 'Paused worker' })
    expect(renamedWhileSuspended.principalRef).toBe(suspended.principalRef)
    const retired = await setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: 4, lifecycle: 'retired' })
    await expectCode(setup.registry.rename({ principalRef: retired.principalRef, expectedRevision: 5, displayName: 'Forbidden' }), 'principal_lifecycle_transition_forbidden')

    const backwards = registry(undefined, [20, 10])
    const backwardsPrincipal = await backwards.registry.register({ kind: 'human', displayName: 'Clock' })
    await expectCode(backwards.registry.rename({ principalRef: backwardsPrincipal.principalRef, expectedRevision: 1, displayName: 'Clock revised' }), 'invalid_principal_timestamp')
  })

  it('enforces optimistic revisions and the complete lifecycle transition graph', async () => {
    const setup = registry(undefined, [10, 20, 30, 40, 50])
    const created = await setup.registry.register({ kind: 'agent', displayName: 'Planner' })
    const unchanged = await setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: 1, lifecycle: 'active' })
    expect(unchanged).toBe(created)
    const suspended = await setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: 1, lifecycle: 'suspended' })
    const active = await setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: 2, lifecycle: 'active' })
    const retired = await setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: 3, lifecycle: 'retired' })
    expect([suspended.lifecycle, active.lifecycle, retired.lifecycle]).toEqual(['suspended', 'active', 'retired'])
    await expectCode(setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: 3, lifecycle: 'active' }), 'principal_revision_conflict')
    await expectCode(setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: 4, lifecycle: 'suspended' }), 'principal_lifecycle_transition_forbidden')
  })

  it('supports retirement from suspension and refuses non-monotonic server time', async () => {
    const setup = registry(undefined, [10, 20, 30])
    const created = await setup.registry.register({ kind: 'workload', displayName: 'Runner' })
    const suspended = await setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: 1, lifecycle: 'suspended' })
    const retired = await setup.registry.setLifecycle({ principalRef: created.principalRef, expectedRevision: suspended.revision, lifecycle: 'retired' })
    expect(retired.lifecycle).toBe('retired')

    const backwards = registry(undefined, [20, 10])
    const principal = await backwards.registry.register({ kind: 'human', displayName: 'Clock' })
    await expectCode(backwards.registry.setLifecycle({ principalRef: principal.principalRef, expectedRevision: 1, lifecycle: 'suspended' }), 'invalid_principal_timestamp')
  })

  it('merges duplicate same-kind identities atomically without reassigning either stable reference', async () => {
    const setup = registry(undefined, [10, 11, 20, 30])
    const source = await setup.registry.register({ kind: 'organization', displayName: 'Duplicate' })
    const target = await setup.registry.register({ kind: 'organization', displayName: 'Canonical' })
    const suspendedSource = await setup.registry.setLifecycle({ principalRef: source.principalRef, expectedRevision: 1, lifecycle: 'suspended' })
    const merged = await setup.registry.merge({
      sourcePrincipalRef: source.principalRef,
      targetPrincipalRef: target.principalRef,
      expectedSourceRevision: suspendedSource.revision,
      expectedTargetRevision: target.revision,
    })
    expect(merged.source).toMatchObject({
      principalRef: source.principalRef,
      lifecycle: 'merged',
      mergedIntoPrincipalRef: target.principalRef,
    })
    expect(merged.target.principalRef).toBe(target.principalRef)
    await expect(setup.registry.resolveCanonical(source.principalRef)).resolves.toBe(merged.target)
  })

  it('refuses a merge whose server timestamp predates either Principal update', async () => {
    const setup = registry(undefined, [20, 21, 10])
    const source = await setup.registry.register({ kind: 'human', displayName: 'Source' })
    const target = await setup.registry.register({ kind: 'human', displayName: 'Target' })
    await expectCode(setup.registry.merge({
      sourcePrincipalRef: source.principalRef,
      targetPrincipalRef: target.principalRef,
      expectedSourceRevision: 1,
      expectedTargetRevision: 1,
    }), 'invalid_principal_timestamp')
  })

  it('rejects unsafe merges and reports missing identities', async () => {
    const setup = registry(undefined, [10, 11, 12, 13, 14, 20, 30])
    const human = await setup.registry.register({ kind: 'human', displayName: 'Human' })
    const agent = await setup.registry.register({ kind: 'agent', displayName: 'Agent' })
    const otherHuman = await setup.registry.register({ kind: 'human', displayName: 'Other' })
    const missing = principalRef('prn_ffffffffffffffffffffffffffffffff')
    await expectCode(setup.registry.merge({ sourcePrincipalRef: human.principalRef, targetPrincipalRef: human.principalRef, expectedSourceRevision: 1, expectedTargetRevision: 1 }), 'principal_merge_self_forbidden')
    await expectCode(setup.registry.merge({ sourcePrincipalRef: human.principalRef, targetPrincipalRef: agent.principalRef, expectedSourceRevision: 1, expectedTargetRevision: 1 }), 'principal_kind_mismatch')
    await expectCode(setup.registry.merge({ sourcePrincipalRef: missing, targetPrincipalRef: human.principalRef, expectedSourceRevision: 1, expectedTargetRevision: 1 }), 'principal_not_found')
    await setup.registry.setLifecycle({ principalRef: otherHuman.principalRef, expectedRevision: 1, lifecycle: 'suspended' })
    await expectCode(setup.registry.merge({ sourcePrincipalRef: human.principalRef, targetPrincipalRef: otherHuman.principalRef, expectedSourceRevision: 1, expectedTargetRevision: 2 }), 'principal_merge_target_inactive')
    await setup.registry.setLifecycle({ principalRef: human.principalRef, expectedRevision: 1, lifecycle: 'retired' })
    await setup.registry.setLifecycle({ principalRef: otherHuman.principalRef, expectedRevision: 2, lifecycle: 'active' })
    await expectCode(setup.registry.merge({ sourcePrincipalRef: human.principalRef, targetPrincipalRef: otherHuman.principalRef, expectedSourceRevision: 2, expectedTargetRevision: 3 }), 'principal_lifecycle_transition_forbidden')
  })

  it('detects corrupt merge targets and cycles during canonical resolution', async () => {
    const setup = registry()
    const first = principalRef('prn_00000000000040008000000000000001')
    const second = principalRef('prn_00000000000040008000000000000002')
    setup.store.seed(Object.freeze({ principalRef: first, kind: 'human', displayName: 'First', lifecycle: 'merged', mergedIntoPrincipalRef: second, revision: 2, createdAt: 1, updatedAt: 2 }))
    await expectCode(setup.registry.resolveCanonical(first), 'principal_not_found')
    setup.store.seed(Object.freeze({ principalRef: second, kind: 'human', displayName: 'Second', lifecycle: 'merged', mergedIntoPrincipalRef: first, revision: 2, createdAt: 1, updatedAt: 2 }))
    await expectCode(setup.registry.resolveCanonical(first), 'principal_merge_cycle')
    setup.store.seed(Object.freeze({ principalRef: first, kind: 'human', displayName: 'First', lifecycle: 'merged', revision: 2, createdAt: 1, updatedAt: 2 }))
    await expectCode(setup.registry.resolveCanonical(first), 'principal_merge_target_missing')
    setup.store.seed(Object.freeze({ principalRef: first, kind: 'human', displayName: 'First', lifecycle: 'merged', mergedIntoPrincipalRef: 'credential:user_1' as PrincipalRef, revision: 2, createdAt: 1, updatedAt: 2 }))
    await expectCode(setup.registry.resolveCanonical(first), 'invalid_principal_ref')
  })

  it('proves credential rotation is read-only and can neither create nor transfer a Principal', async () => {
    const setup = registry(undefined, [10, 20])
    const current = await setup.registry.register({ kind: 'workload', displayName: 'Worker' })
    const replacement = principalRef('prn_ffffffffffffffffffffffffffffffff')
    const writesBeforeRotation = [...setup.store.writes]
    await expectCode(setup.registry.proveCredentialRotationContinuity({ currentPrincipalRef: current.principalRef, replacementPrincipalRef: replacement, expectedRevision: 1 }), 'credential_rotation_principal_transfer_forbidden')
    await expectCode(setup.registry.proveCredentialRotationContinuity({ currentPrincipalRef: replacement, replacementPrincipalRef: replacement, expectedRevision: 1 }), 'principal_not_found')
    expect(setup.store.records.has(replacement)).toBe(false)
    const continuity = await setup.registry.proveCredentialRotationContinuity({ currentPrincipalRef: current.principalRef, replacementPrincipalRef: current.principalRef, expectedRevision: 1 })
    expect(continuity).toEqual({ principalRef: current.principalRef, kind: 'workload', revision: 1 })
    expect(setup.store.writes).toEqual(writesBeforeRotation)
  })

  it('rejects rotation of stale or terminal Principals', async () => {
    const setup = registry(undefined, [10, 20])
    const current = await setup.registry.register({ kind: 'agent', displayName: 'Agent' })
    await expectCode(setup.registry.proveCredentialRotationContinuity({ currentPrincipalRef: current.principalRef, replacementPrincipalRef: current.principalRef, expectedRevision: 2 }), 'principal_revision_conflict')
    const retired = await setup.registry.setLifecycle({ principalRef: current.principalRef, expectedRevision: 1, lifecycle: 'retired' })
    await expectCode(setup.registry.proveCredentialRotationContinuity({ currentPrincipalRef: retired.principalRef, replacementPrincipalRef: retired.principalRef, expectedRevision: 2 }), 'principal_lifecycle_transition_forbidden')
  })

  it('rejects rotation from a merged source Principal', async () => {
    const setup = registry(undefined, [10, 11, 20])
    const source = await setup.registry.register({ kind: 'agent', displayName: 'Source' })
    const target = await setup.registry.register({ kind: 'agent', displayName: 'Target' })
    const { source: merged } = await setup.registry.merge({
      sourcePrincipalRef: source.principalRef,
      targetPrincipalRef: target.principalRef,
      expectedSourceRevision: 1,
      expectedTargetRevision: 1,
    })
    await expectCode(setup.registry.proveCredentialRotationContinuity({ currentPrincipalRef: merged.principalRef, replacementPrincipalRef: merged.principalRef, expectedRevision: 2 }), 'principal_lifecycle_transition_forbidden')
    await expectCode(setup.registry.rename({ principalRef: merged.principalRef, expectedRevision: 2, displayName: 'Merged rename' }), 'principal_lifecycle_transition_forbidden')
  })

  it('uses secure platform defaults when optional registry factories are omitted', async () => {
    const setup = new MemoryPrincipalStore()
    const subject = new PrincipalRegistry(setup)
    const created = await subject.register({ kind: 'human', displayName: 'Default factories' })
    expect(created.principalRef).toMatch(/^prn_[0-9a-f]{32}$/u)
    expect(created.createdAt).toBeGreaterThan(0)
  })
})
