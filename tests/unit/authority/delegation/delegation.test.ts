import { describe, expect, it } from 'vitest'

import {
  DELEGATION_MAX_ANCESTRY_GRANTS,
  DELEGATION_MAX_RESOURCES,
  DELEGATION_MAX_SCOPES,
  DelegationError,
  DelegationService,
  delegationGrantRef,
  delegationSnapshotRef,
  generateDelegationGrantRef,
  generateDelegationSnapshotRef,
  parsePersistedDelegationGrant,
  reconstructPinnedDelegationSnapshotForReplay,
  type DelegationAuthoritySnapshot,
  type DelegationContextPort,
  type DelegationGrant,
} from '../../../../src/modules/authority/delegation/public'
import {
  type AccountActionContext,
  type ActiveAccountContext,
} from '../../../../src/modules/principal-account/account/public'
import {
  ACCOUNT,
  AGENT,
  MemoryDelegationStore,
  OTHER_ACCOUNT,
  OWNER,
  STRANGER,
  WORKLOAD,
  admit,
  admitRequest,
  child,
  delegateRequest,
  delegateTo,
  expectAdmitCode,
  expectCode,
  expectCorruptChildAdmit,
  expectDelegateCode,
  indexedList,
  issueRootRequest,
  mapAncestry,
  patchGrant,
  rejectSnapshotReplay,
  root,
  rootChild,
  setup,
  activeReplayContext,
  uuid,
} from './delegation.harness'

describe('delegation references and validation', () => {
  it('exports production persistence limits and accepts their exact scope/resource boundaries', async () => {
    expect(DELEGATION_MAX_SCOPES).toBe(64)
    expect(DELEGATION_MAX_RESOURCES).toBe(64)
    expect(DELEGATION_MAX_ANCESTRY_GRANTS).toBe(32)
    const fixture = setup()
    const scopes = indexedList('scope', 64)
    const resources = indexedList('resource', 64)
    const issued = await fixture.service.issueRoot({ ...issueRootRequest(fixture, 'limit-boundary'), scopes, resourceRefs: resources, budgetLimit: 1, expiresAt: 200 })
    expect(issued.scopes).toHaveLength(64)
    expect(issued.resourceRefs).toHaveLength(64)

    await expectCode(fixture.service.issueRoot({ ...issueRootRequest(fixture, 'scope-overflow'), scopes: [...scopes, 'scope:64'], resourceRefs: ['r'] }), 'delegation_limit_exceeded')
    await expectCode(fixture.service.issueRoot({ ...issueRootRequest(fixture, 'resource-overflow'), resourceRefs: [...resources, 'resource:64'] }), 'delegation_limit_exceeded')
  })

  it('parses and generates opaque authority references independently of credentials and providers', () => {
    expect(delegationGrantRef(`grt_${uuid(1).replaceAll('-', '')}`)).toBe(`grt_${uuid(1).replaceAll('-', '')}`)
    expect(delegationSnapshotRef(`das_${uuid(2).replaceAll('-', '')}`)).toBe(`das_${uuid(2).replaceAll('-', '')}`)
    expect(generateDelegationGrantRef(() => uuid(3))).toBe(`grt_${uuid(3).replaceAll('-', '')}`)
    expect(generateDelegationSnapshotRef(() => uuid(4))).toBe(`das_${uuid(4).replaceAll('-', '')}`)
    expect(generateDelegationGrantRef()).toMatch(/^grt_[0-9a-f]{32}$/u)
    expect(generateDelegationSnapshotRef()).toMatch(/^das_[0-9a-f]{32}$/u)
    expect(() => delegationGrantRef('credential:grant')).toThrowError(DelegationError)
    expect(() => delegationSnapshotRef('provider:snapshot')).toThrowError(/delegation_snapshot_ref_invalid/u)
    expect(() => generateDelegationGrantRef(() => 'invalid')).toThrowError(/delegation_grant_ref_invalid/u)
    expect(() => generateDelegationSnapshotRef(() => 'invalid')).toThrowError(/delegation_snapshot_ref_invalid/u)
  })

  it('rejects malformed authority sets, budgets, expiry, time and generations', async () => {
    const cases: Array<() => Promise<unknown>> = []
    for (const scopes of [[], ['bad value'], ['read', 'read']] as const) {
      const fixture = setup()
      cases.push(() => fixture.service.issueRoot({ ...issueRootRequest(fixture, 'bad-scope'), scopes }))
    }
    for (const resources of [[], ['bad value'], ['r', 'r']] as const) {
      const fixture = setup()
      cases.push(() => fixture.service.issueRoot({ ...issueRootRequest(fixture, 'bad-resource'), resourceRefs: resources }))
    }
    for (const limit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const fixture = setup()
      cases.push(() => fixture.service.issueRoot({ ...issueRootRequest(fixture, 'bad-budget'), budgetLimit: limit }))
    }
    for (const expiry of [100, 99, 1.5]) {
      const fixture = setup()
      cases.push(() => fixture.service.issueRoot({ ...issueRootRequest(fixture, 'bad-expiry'), expiresAt: expiry }))
    }
    for (const run of cases) await expect(run()).rejects.toBeInstanceOf(DelegationError)

    const invalidTime = setup()
    invalidTime.setNow(-1)
    await expectCode(invalidTime.service.issueRoot(issueRootRequest(invalidTime, 'time')), 'delegation_request_invalid')
    const fractionalTime = setup()
    fractionalTime.setNow(1.5)
    await expectCode(fractionalTime.service.issueRoot(issueRootRequest(fractionalTime, 'time')), 'delegation_request_invalid')

    const fixture = setup()
    const issued = await root(fixture)
    await expectDelegateCode(fixture, issued, 'generation', 'delegation_generation_stale', { parentGeneration: 0, budgetLimit: 1 })
    await expectAdmitCode(fixture, issued, 'generation-admit', 'delegation_generation_stale', { expectedGeneration: 1.5 })
  })
})

describe('root grant issuance', () => {
  it('uses the trusted root-membership port, canonicalizes values, freezes facts and replays idempotently', async () => {
    const fixture = setup()
    const first = await root(fixture)
    const replay = await root(fixture)
    expect(replay).toStrictEqual(first)
    expect(replay).not.toBe(first)
    expect(first.scopes).toEqual(['read', 'write'])
    expect(first.resourceRefs).toEqual(['resource:a', 'resource:b'])
    expect(first).toMatchObject({ actorPrincipalRef: OWNER, subjectPrincipalRef: OWNER, generation: 1, revision: 1, lifecycle: 'active' })
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.createdBy)).toBe(true)
    expect(Object.isFrozen(first.scopes)).toBe(true)
    expect(fixture.store.commits).toHaveLength(1)
    expect(JSON.stringify(first)).not.toMatch(/credential|provider|clerk/iu)
  })

  it('rejects a corrupted persisted root instead of blessing it through idempotent replay', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    patchGrant(fixture, issued.grantRef, (grant) => ({ ...grant, budgetUsed: -1 }))
    await expectCode(root(fixture), 'delegation_ancestry_invalid')
  })

  it('exports defensive persistence parsers that deep-copy and freeze canonical facts', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    const parsedGrant = parsePersistedDelegationGrant(issued)
    expect(parsedGrant).toStrictEqual(issued)
    expect(parsedGrant).not.toBe(issued)
    expect(Object.isFrozen(parsedGrant)).toBe(true)
    expect(Object.isFrozen(parsedGrant.createdBy)).toBe(true)
    expect(() => parsePersistedDelegationGrant({ ...issued, createdBy: undefined })).toThrowError(DelegationError)
    expect(() => parsePersistedDelegationGrant({ ...issued, grantRef: Symbol('bad') })).toThrowError(DelegationError)
    expect(() => parsePersistedDelegationGrant({ ...issued, parentGrantRef: Symbol('bad'), parentGeneration: 1 })).toThrowError(DelegationError)

    const delegated = await child(fixture, issued)
    const request = admitRequest(fixture, delegated, 'parser-admit')
    const snapshot = await fixture.service.admitConsequence(request)
    const replayContext = activeReplayContext(fixture, request)
    const parsedSnapshot = reconstructPinnedDelegationSnapshotForReplay(snapshot, replayContext)
    expect(parsedSnapshot).toStrictEqual(snapshot)
    expect(parsedSnapshot).not.toBe(snapshot)
    expect(Object.isFrozen(parsedSnapshot.ancestry[0]?.scopes)).toBe(true)
    expect(() => reconstructPinnedDelegationSnapshotForReplay(null, replayContext)).toThrowError(DelegationError)
    expect(() => reconstructPinnedDelegationSnapshotForReplay({ ...snapshot, ancestry: [null] } as unknown as DelegationAuthoritySnapshot, replayContext)).toThrowError(DelegationError)
    expect(() => reconstructPinnedDelegationSnapshotForReplay({ ...snapshot, snapshotRef: Symbol('bad') }, replayContext)).toThrowError(DelegationError)
  })

  it('rejects an active stranger, inactive subject, caller-shaped context and idempotency conflicts', async () => {
    const fixture = setup()
    await expect(fixture.service.issueRoot({ ...issueRootRequest(fixture, 'stranger-root', { actor: AGENT }), subjectPrincipalRef: AGENT })).rejects.toThrow('canonical_root_issuer_rejected')
    await expect(fixture.service.issueRoot({ ...issueRootRequest(fixture, 'inactive-subject'), subjectPrincipalRef: STRANGER })).rejects.toThrow('canonical_principal_rejected')
    const first = await root(fixture, 'same')
    await expectCode(fixture.service.issueRoot({
      ...issueRootRequest(fixture, 'same'),
      resourceRefs: first.resourceRefs,
      budgetLimit: first.budgetLimit,
      expiresAt: first.expiresAt,
    }), 'delegation_idempotency_conflict')

    const mutations: Array<(value: ActiveAccountContext) => ActiveAccountContext> = [
      (value) => ({ ...value, actorPrincipalRef: AGENT }),
      (value) => ({ ...value, accountRef: OTHER_ACCOUNT }),
      (value) => ({ ...value, correlationRef: 'forged' }),
      (value) => ({ ...value, idempotencyRef: 'forged' }),
    ]
    for (const resolvedMutation of mutations) {
      const shaped = setup({ resolvedMutation })
      await expectCode(shaped.service.issueRoot(issueRootRequest(shaped, 'shaped')), 'delegation_request_invalid')
    }
  })

  it('never persists caller-added credential, provider or proof-shaped context fields', async () => {
    const fixture = setup()
    const callerContext = {
      ...fixture.context(OWNER, 'caller-shape'),
      credentialRef: 'cred_attacker',
      providerOwnerId: 'provider_attacker',
      authorityProof: { generation: 99 },
    }
    const issued = await fixture.service.issueRoot({
      context: callerContext,
      subjectPrincipalRef: OWNER,
      scopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetLimit: 1,
      expiresAt: 200,
    })
    expect(issued.createdBy).toEqual(fixture.context(OWNER, 'caller-shape'))
    expect(JSON.stringify(issued)).not.toMatch(/credential|provider|authorityProof/iu)
  })

  it('rejects internally generated grant collisions', async () => {
    const fixture = setup({ uuids: [uuid(1)] })
    const colliding = delegationGrantRef(`grt_${uuid(1).replaceAll('-', '')}`)
    fixture.store.grants.set(colliding, Object.freeze({
      grantRef: colliding,
      accountRef: OTHER_ACCOUNT,
      actorPrincipalRef: OWNER,
      subjectPrincipalRef: OWNER,
      scopes: Object.freeze(['read']),
      resourceRefs: Object.freeze(['r']),
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: 200,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: 1,
      createdBy: Object.freeze(fixture.context(OWNER, 'unrelated')),
    }))
    await expectCode(fixture.service.issueRoot(issueRootRequest(fixture, 'new')), 'delegation_grant_ref_conflict')
  })

  it('supports secure runtime defaults without caller-provided clocks or identifiers', async () => {
    const store = new MemoryDelegationStore()
    const contexts: DelegationContextPort = {
      resolveActiveContext: async (candidate) => ({ accountRef: ACCOUNT, actorPrincipalRef: candidate.actorPrincipalRef, accountRevision: 1, correlationRef: candidate.correlationRef, idempotencyRef: candidate.idempotencyRef }),
      resolveRootIssuerContext: async (candidate) => ({ accountRef: ACCOUNT, actorPrincipalRef: candidate.actorPrincipalRef, accountRevision: 1, correlationRef: candidate.correlationRef, idempotencyRef: candidate.idempotencyRef }),
      requireActivePrincipal: async () => {},
    }
    const service = new DelegationService(store, contexts)
    const issued = await service.issueRoot({ context: { actorPrincipalRef: OWNER, activeAccountRef: ACCOUNT, correlationRef: 'default', idempotencyRef: 'default' }, subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: Date.now() + 10_000 })
    expect(issued.grantRef).toMatch(/^grt_[0-9a-f]{32}$/u)
  })
})

describe('multi-hop monotonic delegation', () => {
  it('accepts 32 ancestry grants and rejects a 33rd grant', async () => {
    const fixture = setup({ uuids: Array.from({ length: 40 }, (_, index) => uuid(index + 1)) })
    const rootGrant = await fixture.service.issueRoot({ ...issueRootRequest(fixture, 'depth-root'), resourceRefs: ['r'], budgetLimit: 100, expiresAt: 10_000 })
    let current = rootGrant
    for (let depth = 2; depth <= 32; depth += 1) {
      const subject = depth % 2 === 0 ? AGENT : WORKLOAD
      current = await delegateTo(fixture, current, `depth-${depth}`, { subjectPrincipalRef: subject, resourceRefs: ['r'], budgetLimit: 100, expiresAt: 10_001 - depth })
    }
    const snapshot = await admit(fixture, current, 'depth-admit', { resourceRefs: ['r'] })
    expect(snapshot.ancestry).toHaveLength(32)
    await expectDelegateCode(fixture, current, 'depth-overflow', 'delegation_limit_exceeded', { subjectPrincipalRef: OWNER, resourceRefs: ['r'], budgetLimit: 100, expiresAt: 9_968 })

    const storedRoot = fixture.store.grants.get(rootGrant.grantRef)!
    patchGrant(fixture, rootGrant.grantRef, () => Object.freeze({
      ...storedRoot,
      parentGrantRef: delegationGrantRef(`grt_${uuid(40).replaceAll('-', '')}`),
      parentGeneration: 1,
    }))
    await expectAdmitCode(fixture, current, 'persisted-depth-overflow', 'delegation_limit_exceeded', { resourceRefs: ['r'] })
  })

  it('permits arbitrary depth while every child strictly narrows every ancestor', async () => {
    const fixture = setup()
    const issued = await fixture.service.issueRoot({ context: fixture.context(OWNER, 'wild-root'), subjectPrincipalRef: OWNER, scopes: ['*'], resourceRefs: ['*'], budgetLimit: 1_000, expiresAt: 1_000 })
    const first = await delegateTo(fixture, issued, 'first', { scopes: ['read', 'write'], resourceRefs: ['resource:a', 'resource:b'], budgetLimit: 700 })
    const second = await delegateTo(fixture, first, 'second', { actor: AGENT, subjectPrincipalRef: WORKLOAD, scopes: ['read'], budgetLimit: 300, expiresAt: 800 })
    expect(second).toMatchObject({ actorPrincipalRef: AGENT, subjectPrincipalRef: WORKLOAD, parentGrantRef: first.grantRef, parentGeneration: 1 })
    expect(second.scopes).toEqual(['read'])
  })

  it('property: generated chain depths preserve the ancestor intersection', async () => {
    for (let depth = 1; depth <= 8; depth += 1) {
      const fixture = setup()
      let current = await fixture.service.issueRoot({
        context: fixture.context(OWNER, `property-root-${depth}`),
        subjectPrincipalRef: OWNER,
        scopes: ['*'],
        resourceRefs: ['*'],
        budgetLimit: 10_000,
        expiresAt: 10_000,
      })
      for (let hop = 1; hop <= depth; hop += 1) {
        const nextSubject = hop % 2 === 1 ? AGENT : WORKLOAD
        current = await delegateTo(fixture, current, `property-${depth}-${hop}`, {
          subjectPrincipalRef: nextSubject,
          budgetLimit: 10_000 - hop,
          expiresAt: 10_000 - hop,
        })
      }
      const admitted = await admit(fixture, current, `property-admit-${depth}`, { budgetAmount: depth })
      expect(admitted.ancestry).toHaveLength(depth + 1)
      expect(admitted.ancestry.every((ancestor) => ancestor.budgetLimit >= current.budgetLimit)).toBe(true)
      expect(admitted.expiresAt).toBe(10_000 - depth)
    }
  })

  it.each([
    ['delegation_scope_widened', { scopes: ['read', 'admin'] }],
    ['delegation_resource_widened', { resourceRefs: ['resource:a', 'resource:x'] }],
    ['delegation_budget_widened', { budgetLimit: 1_001 }],
    ['delegation_expiry_not_strictly_narrower', { expiresAt: 1_000 }],
    ['delegation_expiry_not_strictly_narrower', { expiresAt: 1_001 }],
  ] as const)('rejects hostile child widening: %s', async (code, override) => {
    const fixture = setup()
    const issued = await root(fixture)
    await expectDelegateCode(fixture, issued, code, code, { budgetLimit: 500, ...override })
  })

  it('rejects stale generation, wrong actor/account, expired and revoked parents', async () => {
    const stale = setup()
    const staleRoot = await root(stale)
    await expectDelegateCode(stale, staleRoot, 'stale', 'delegation_generation_stale', { parentGeneration: 2, budgetLimit: 1 })
    await expectDelegateCode(stale, staleRoot, 'actor', 'delegation_actor_mismatch', { actor: AGENT, budgetLimit: 1 })
    await expect(stale.service.delegate(delegateRequest(stale, staleRoot, 'account', { account: OTHER_ACCOUNT, budgetLimit: 1 }))).rejects.toThrow('canonical_context_rejected')

    const expired = setup()
    const expiredRoot = await root(expired)
    expired.setNow(1_000)
    await expectDelegateCode(expired, expiredRoot, 'expired', 'delegation_expired', { expiresAt: 1_100, budgetLimit: 1 })

    const revoked = setup()
    const revokedRoot = await root(revoked)
    await revoked.service.revoke({ grantRef: revokedRoot.grantRef, expectedGeneration: 1, context: revoked.context(OWNER, 'revoke') })
    await expectDelegateCode(revoked, revokedRoot, 'revoked', 'delegation_revoked', { parentGeneration: 2, budgetLimit: 1 })
  })

  it('rejects missing ancestry, cycles, cross-account ancestry and stale ancestor pins', async () => {
    const missing = setup()
    await expectCode(missing.service.delegate({
      parentGrantRef: delegationGrantRef(`grt_${uuid(9).replaceAll('-', '')}`),
      parentGeneration: 1,
      context: missing.context(OWNER, 'missing'),
      subjectPrincipalRef: AGENT,
      scopes: ['read'],
      resourceRefs: ['r'],
      budgetLimit: 1,
      expiresAt: 200,
    }), 'delegation_grant_not_found')

    const cycle = setup()
    const cycleRoot = await root(cycle)
    const cycleChild = await child(cycle, cycleRoot)
    patchGrant(cycle, cycleRoot.grantRef, () => ({ ...cycleRoot, parentGrantRef: cycleChild.grantRef, parentGeneration: cycleChild.generation }))
    await expectDelegateCode(cycle, cycleChild, 'cycle', 'delegation_ancestry_cycle', { actor: AGENT, subjectPrincipalRef: WORKLOAD, budgetLimit: 1, expiresAt: 800 })

    const cross = setup()
    const crossRoot = await root(cross)
    const crossChild = await child(cross, crossRoot)
    patchGrant(cross, crossChild.grantRef, (grant) => ({
      ...grant,
      accountRef: OTHER_ACCOUNT,
      createdBy: Object.freeze({ ...grant.createdBy, activeAccountRef: OTHER_ACCOUNT }),
    }))
    await expectDelegateCode(cross, crossChild, 'cross', 'delegation_ancestry_account_mismatch', { actor: AGENT, subjectPrincipalRef: WORKLOAD, budgetLimit: 1, expiresAt: 800 })

    const pinned = setup()
    const pinnedRoot = await root(pinned)
    const pinnedChild = await child(pinned, pinnedRoot)
    patchGrant(pinned, pinnedRoot.grantRef, (grant) => ({ ...grant, generation: 2, revision: 2 }))
    await expectDelegateCode(pinned, pinnedChild, 'pin', 'delegation_ancestry_generation_stale', { actor: AGENT, subjectPrincipalRef: WORKLOAD, budgetLimit: 1, expiresAt: 800 })
  })

  it('rejects a persisted child whose claimed actor is not its parent subject', async () => {
    const fixture = setup()
    const { delegated } = await rootChild(fixture)
    patchGrant(fixture, delegated.grantRef, (grant) => ({
      ...grant,
      actorPrincipalRef: STRANGER,
      createdBy: Object.freeze(fixture.context(STRANGER, 'forged-edge')),
    }))

    await expectAdmitCode(fixture, delegated, 'forged-edge-admit', 'delegation_ancestry_invalid', { actor: AGENT, budgetAmount: 1 })
    expect(fixture.store.snapshots).toHaveLength(0)
  })

  it.each([
    ['creation time', (grant: DelegationGrant) => ({ ...grant, createdAt: 99 })],
    ['scope', (grant: DelegationGrant) => ({ ...grant, scopes: Object.freeze(['admin']) })],
    ['resources', (grant: DelegationGrant) => ({ ...grant, resourceRefs: Object.freeze(['resource:x']) })],
    ['budget', (grant: DelegationGrant) => ({ ...grant, budgetLimit: 1_001 })],
    ['strict expiry', (grant: DelegationGrant) => ({ ...grant, expiresAt: 1_000 })],
  ] as const)('rejects a persisted child with a wider or impossible %s edge', async (name, mutate) => {
    await expectCorruptChildAdmit(setup(), `corrupt-${name}`, mutate)
  })

  it('rejects intrinsically malformed persisted grant attribution before snapshotting', async () => {
    const malformedRootCases: ReadonlyArray<{
      suffix: string
      code: string
      mutate: (issued: DelegationGrant, fixture: ReturnType<typeof setup>) => DelegationGrant
    }> = [
      {
        suffix: 'malformed-root',
        code: 'delegation_ancestry_invalid',
        mutate: (issued) => ({
          ...issued,
          budgetUsed: -1,
          createdBy: Object.freeze({ ...issued.createdBy, actorPrincipalRef: STRANGER }),
        }),
      },
      {
        suffix: 'malformed-account',
        code: 'delegation_ancestry_account_mismatch',
        mutate: (issued) => ({
          ...issued,
          createdBy: Object.freeze({ ...issued.createdBy, activeAccountRef: OTHER_ACCOUNT }),
        }),
      },
      {
        suffix: 'missing-created-by',
        code: 'delegation_ancestry_invalid',
        mutate: (issued) => ({ ...issued, createdBy: undefined as unknown as AccountActionContext }),
      },
      {
        suffix: 'malformed-created-by',
        code: 'delegation_ancestry_invalid',
        mutate: (issued) => ({ ...issued, createdBy: {} as AccountActionContext }),
      },
      {
        suffix: 'active-with-revocation',
        code: 'delegation_ancestry_invalid',
        mutate: (issued, fixture) => ({
          ...issued,
          revokedAt: 101,
          revokedBy: Object.freeze(fixture.context(OWNER, 'false-revocation')),
        }),
      },
    ]

    for (const { suffix, code, mutate } of malformedRootCases) {
      const fixture = setup()
      const issued = await root(fixture)
      patchGrant(fixture, issued.grantRef, (grant) => mutate(grant, fixture))
      await expectAdmitCode(fixture, issued, suffix, code)
    }

    const nullGrant = setup()
    const nullRoot = await root(nullGrant)
    nullGrant.store.grants.set(nullRoot.grantRef, null as unknown as DelegationGrant)
    await expectAdmitCode(nullGrant, nullRoot, 'null-grant', 'delegation_ancestry_invalid')

    const malformedRevocation = setup()
    const revocableRoot = await root(malformedRevocation)
    const revokedRoot = await malformedRevocation.service.revoke({
      grantRef: revocableRoot.grantRef,
      expectedGeneration: 1,
      context: malformedRevocation.context(OWNER, 'revoke-for-malformation'),
    })
    patchGrant(malformedRevocation, revokedRoot.grantRef, (grant) => ({
      ...grant,
      revokedBy: Object.freeze(malformedRevocation.context(WORKLOAD, 'forged-revoker')),
    }))
    await expectAdmitCode(malformedRevocation, revokedRoot, 'malformed-revoker', 'delegation_ancestry_invalid', { expectedGeneration: 2 })

    const { revokedAt: removedRevokedAt, ...withoutRevokedAt } = revokedRoot
    expect(removedRevokedAt).toBe(100)
    patchGrant(malformedRevocation, revokedRoot.grantRef, () => withoutRevokedAt as DelegationGrant)
    await expectAdmitCode(malformedRevocation, revokedRoot, 'missing-revoked-at', 'delegation_ancestry_invalid', { expectedGeneration: 2 })

    const overLimit = setup()
    const overLimitRoot = await root(overLimit)
    patchGrant(overLimit, overLimitRoot.grantRef, (grant) => ({ ...grant, scopes: indexedList('scope', 65) }))
    await expectAdmitCode(overLimit, overLimitRoot, 'persisted-scope-overflow', 'delegation_limit_exceeded')
    patchGrant(overLimit, overLimitRoot.grantRef, (grant) => ({ ...grant, resourceRefs: indexedList('resource', 65) }))
    await expectAdmitCode(overLimit, overLimitRoot, 'persisted-resource-overflow', 'delegation_limit_exceeded')
  })

  it('replays matching delegation and rejects conflicting or colliding creation', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    const first = await child(fixture, issued, 'same-child')
    const replay = await child(fixture, issued, 'same-child')
    expect(replay).toStrictEqual(first)
    expect(replay).not.toBe(first)
    await expectDelegateCode(fixture, issued, 'same-child', 'delegation_idempotency_conflict', { subjectPrincipalRef: WORKLOAD })

    const collision = setup({ uuids: [uuid(1), uuid(1)] })
    const collisionRoot = await root(collision)
    await expectCode(child(collision, collisionRoot), 'delegation_grant_ref_conflict')

    const corruptReplay = setup()
    const corruptRoot = await root(corruptReplay)
    const corruptChild = await child(corruptReplay, corruptRoot, 'corrupt-replay')
    patchGrant(corruptReplay, corruptChild.grantRef, (grant) => ({ ...grant, scopes: Object.freeze(['admin']) }))
    await expectCode(child(corruptReplay, corruptRoot, 'corrupt-replay'), 'delegation_ancestry_invalid')
  })
})

describe('consequence admission and revocation', () => {
  it('uses current server time, consumes every ancestor budget atomically and idempotently pins attribution', async () => {
    const fixture = setup()
    const { issued, delegated } = await rootChild(fixture)
    fixture.setNow(899)
    const request = admitRequest(fixture, delegated, 'admit', { actor: AGENT, budgetAmount: 125 })
    const snapshot = await fixture.service.admitConsequence(request)
    const replay = await fixture.service.admitConsequence(request)
    expect(replay).toStrictEqual(snapshot)
    expect(replay).not.toBe(snapshot)
    expect(Object.isFrozen(replay.scopes)).toBe(true)
    expect(Object.isFrozen(replay.resourceRefs)).toBe(true)
    expect(Object.isFrozen(replay.ancestry[0])).toBe(true)
    expect(snapshot).toMatchObject({ actorPrincipalRef: AGENT, subjectPrincipalRef: AGENT, admittedAt: 899, expiresAt: 900, budgetAmount: 125, accountRevision: 9 })
    expect(snapshot.ancestry.map((item) => item.budgetUsedBefore)).toEqual([0, 0])
    expect(fixture.store.grants.get(issued.grantRef)?.budgetUsed).toBe(125)
    expect(fixture.store.grants.get(delegated.grantRef)?.budgetUsed).toBe(125)
    expect(fixture.store.commits).toHaveLength(3)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.ancestry[0])).toBe(true)

    await fixture.service.revoke({ grantRef: issued.grantRef, expectedGeneration: 1, context: fixture.context(OWNER, 'revoke-after-admit') })
    await expect(fixture.service.admitConsequence(request)).rejects.toBeInstanceOf(DelegationError)
  })

  it('rejects a forged persisted snapshot instead of blessing it through admission replay', async () => {
    const fixture = setup()
    const { delegated } = await rootChild(fixture)
    const snapshotRef = delegationSnapshotRef(`das_${uuid(20).replaceAll('-', '')}`)
    fixture.store.snapshots.set(snapshotRef, Object.freeze({
      snapshotRef,
      grantRef: delegated.grantRef,
      generation: delegated.generation,
      accountRef: ACCOUNT,
      accountRevision: 9,
      actorPrincipalRef: AGENT,
      subjectPrincipalRef: STRANGER,
      scopes: Object.freeze(['read']),
      resourceRefs: Object.freeze(['resource:a']),
      budgetAmount: 1,
      admittedAt: 900,
      expiresAt: 100,
      correlationRef: 'forged-correlation',
      idempotencyRef: 'idempotency:forged-replay',
      ancestry: Object.freeze([]),
    }))

    await expectAdmitCode(fixture, delegated, 'forged-replay', 'delegation_snapshot_invalid', { actor: AGENT, budgetAmount: 1 })
    expect(fixture.store.commits).toHaveLength(2)
  })

  it('rejects corrupted snapshot headers, ancestry continuity and leaf agreement independently', async () => {
    const fixture = setup()
    const { delegated } = await rootChild(fixture)
    const request = admitRequest(fixture, delegated, 'snapshot-integrity', { actor: AGENT, budgetAmount: 1 })
    const snapshot = await fixture.service.admitConsequence(request)
    const last = snapshot.ancestry.length - 1

    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, snapshotRef: 'das_invalid' as typeof snapshot.snapshotRef })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, scopes: indexedList('scope', 65) }, 'delegation_limit_exceeded')
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, resourceRefs: indexedList('resource', 65) }, 'delegation_limit_exceeded')
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, ancestry: Object.freeze(Array.from({ length: 33 }, (_, index) => snapshot.ancestry[index % snapshot.ancestry.length]!)) }, 'delegation_limit_exceeded')
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, scopes: Object.freeze(['bad value']) })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, ancestry: Object.freeze([]) })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, ancestry: mapAncestry(snapshot, (index, ancestor) => (index === 0 ? { ...ancestor, budgetUsedBefore: -1 } : ancestor)) })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, ancestry: mapAncestry(snapshot, (index, ancestor) => (index === last ? { ...ancestor, actorPrincipalRef: STRANGER } : ancestor)) })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, ancestry: mapAncestry(snapshot, (index, ancestor) => (index === 0 ? { ...ancestor, accountRef: OTHER_ACCOUNT } : ancestor)) })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, ancestry: mapAncestry(snapshot, (index, ancestor) => (index === 0 ? { ...ancestor, scopes: Object.freeze(['write']) } : ancestor)) })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, ancestry: mapAncestry(snapshot, (index, ancestor) => (index === 0 ? { ...ancestor, resourceRefs: Object.freeze(['resource:b']) } : ancestor)) })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, ancestry: mapAncestry(snapshot, (index, ancestor) => (index === last ? { ...ancestor, scopes: Object.freeze(['admin', 'read']) } : ancestor)) })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, ancestry: mapAncestry(snapshot, (index, ancestor) => (index === last ? { ...ancestor, resourceRefs: Object.freeze(['resource:a', 'resource:x']) } : ancestor)) })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, subjectPrincipalRef: STRANGER })
    await rejectSnapshotReplay(fixture, snapshot, request, { ...snapshot, expiresAt: snapshot.expiresAt - 1 })
  })

  it('serializes sibling admissions against their shared ancestor budget', async () => {
    const fixture = setup()
    const issued = await fixture.service.issueRoot({ ...issueRootRequest(fixture, 'root'), resourceRefs: ['r'], budgetLimit: 100, expiresAt: 1_000 })
    const one = await delegateTo(fixture, issued, 'one', { resourceRefs: ['r'], budgetLimit: 100 })
    const two = await delegateTo(fixture, issued, 'two', { subjectPrincipalRef: WORKLOAD, resourceRefs: ['r'], budgetLimit: 100 })
    const outcomes = await Promise.allSettled([
      admit(fixture, one, 'a', { actor: AGENT, resourceRefs: ['r'], budgetAmount: 60 }),
      admit(fixture, two, 'b', { actor: WORKLOAD, resourceRefs: ['r'], budgetAmount: 60 }),
    ])
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(fixture.store.grants.get(issued.grantRef)?.budgetUsed).toBe(60)
  })

  it.each([
    ['delegation_scope_denied', { requiredScopes: ['write'] }],
    ['delegation_resource_denied', { resourceRefs: ['resource:b'] }],
    ['delegation_budget_denied', { budgetAmount: 501 }],
  ] as const)('rejects consequence authority outside the ancestor intersection: %s', async (code, override) => {
    const fixture = setup()
    const { delegated } = await rootChild(fixture)
    await expectAdmitCode(fixture, delegated, code, code, { actor: AGENT, budgetAmount: 1, ...override })
  })

  it('defensively rejects a corrupted wider leaf, caller conflict, stale generation, active stranger and expiry race', async () => {
    const corrupt = setup()
    const { delegated: corruptChild } = await rootChild(corrupt)
    patchGrant(corrupt, corruptChild.grantRef, (grant) => ({ ...grant, scopes: Object.freeze(['admin']) }))
    await expectAdmitCode(corrupt, corruptChild, 'corrupt', 'delegation_ancestry_invalid', { actor: AGENT, requiredScopes: ['admin'], budgetAmount: 1 })

    const accountMismatch = setup()
    const mismatchedRoot = await root(accountMismatch)
    patchGrant(accountMismatch, mismatchedRoot.grantRef, (grant) => ({
      ...grant,
      accountRef: OTHER_ACCOUNT,
      createdBy: Object.freeze({ ...grant.createdBy, activeAccountRef: OTHER_ACCOUNT }),
    }))
    await expectDelegateCode(accountMismatch, mismatchedRoot, 'delegate-account', 'delegation_ancestry_account_mismatch', { budgetLimit: 1 })
    await expectAdmitCode(accountMismatch, mismatchedRoot, 'admit-account', 'delegation_ancestry_account_mismatch', { budgetAmount: 1 })

    const fixture = setup()
    const { delegated } = await rootChild(fixture)
    await admit(fixture, delegated, 'same-admit', { actor: AGENT, budgetAmount: 1 })
    await expectAdmitCode(fixture, delegated, 'same-admit', 'delegation_idempotency_conflict', { actor: AGENT, budgetAmount: 2 })
    await expectAdmitCode(fixture, delegated, 'stale', 'delegation_generation_stale', { actor: AGENT, expectedGeneration: 2, budgetAmount: 1 })
    await expectAdmitCode(fixture, delegated, 'actor', 'delegation_actor_mismatch', { actor: OWNER, budgetAmount: 1 })
    await expect(fixture.service.admitConsequence(admitRequest(fixture, delegated, 'stranger', { actor: STRANGER, budgetAmount: 1 }))).rejects.toThrow('canonical_context_rejected')
    fixture.setNow(900)
    await expectAdmitCode(fixture, delegated, 'race', 'delegation_expired', { actor: AGENT, budgetAmount: 1 })
  })

  it('rejects snapshot-ref collisions and malformed admission authority', async () => {
    const fixture = setup({ uuids: [uuid(1), uuid(2), uuid(3)] })
    const { issued, delegated } = await rootChild(fixture)
    const collisionRef = delegationSnapshotRef(`das_${uuid(3).replaceAll('-', '')}`)
    fixture.store.snapshots.set(collisionRef, Object.freeze({
      snapshotRef: collisionRef,
      grantRef: issued.grantRef,
      generation: 1,
      accountRef: OTHER_ACCOUNT,
      accountRevision: 1,
      actorPrincipalRef: OWNER,
      subjectPrincipalRef: OWNER,
      scopes: Object.freeze(['read']),
      resourceRefs: Object.freeze(['r']),
      budgetAmount: 0,
      admittedAt: 1,
      expiresAt: 2,
      correlationRef: 'other',
      idempotencyRef: 'other',
      ancestry: Object.freeze([]),
    }))
    await expectAdmitCode(fixture, delegated, 'collision', 'delegation_snapshot_ref_conflict', { actor: AGENT })
    await expectAdmitCode(fixture, delegated, 'budget', 'delegation_budget_invalid', { actor: AGENT, budgetAmount: -1 })
  })

  it('monotonically advances revocation generation and invalidates all descendants', async () => {
    const fixture = setup()
    const { issued, delegated } = await rootChild(fixture)
    const revoked = await fixture.service.revoke({ grantRef: issued.grantRef, expectedGeneration: 1, context: fixture.context(OWNER, 'revoke-root') })
    expect(revoked).toMatchObject({ lifecycle: 'revoked', generation: 2, revision: 2, revokedAt: 100 })
    expect(Object.isFrozen(revoked.revokedBy)).toBe(true)
    await expectAdmitCode(fixture, delegated, 'descendant', 'delegation_ancestry_generation_stale', { actor: AGENT, budgetAmount: 1 })
    await expectCode(fixture.service.revoke({ grantRef: issued.grantRef, expectedGeneration: 1, context: fixture.context(OWNER, 'stale-revoke') }), 'delegation_generation_stale')
    await expectCode(fixture.service.revoke({ grantRef: issued.grantRef, expectedGeneration: 2, context: fixture.context(OWNER, 'again') }), 'delegation_revoked')
  })

  it('allows the issuer to revoke a child and rejects wrong actor, account and missing grant', async () => {
    const fixture = setup()
    const { delegated } = await rootChild(fixture)
    expect((await fixture.service.revoke({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(OWNER, 'issuer-revoke') })).lifecycle).toBe('revoked')

    const wrong = setup()
    const wrongChild = await child(wrong, await root(wrong))
    await expectCode(wrong.service.revoke({ grantRef: wrongChild.grantRef, expectedGeneration: 1, context: wrong.context(WORKLOAD, 'wrong') }), 'delegation_actor_mismatch')
    patchGrant(wrong, wrongChild.grantRef, (grant) => ({
      ...grant,
      accountRef: OTHER_ACCOUNT,
      createdBy: Object.freeze({ ...grant.createdBy, activeAccountRef: OTHER_ACCOUNT }),
    }))
    await expectCode(wrong.service.revoke({ grantRef: wrongChild.grantRef, expectedGeneration: 1, context: wrong.context(AGENT, 'mismatch') }), 'delegation_ancestry_account_mismatch')
    await expect(wrong.service.revoke({ grantRef: wrongChild.grantRef, expectedGeneration: 1, context: wrong.context(AGENT, 'account', OTHER_ACCOUNT) })).rejects.toThrow('canonical_context_rejected')
    await expectCode(wrong.service.revoke({ grantRef: delegationGrantRef(`grt_${uuid(30).replaceAll('-', '')}`), expectedGeneration: 1, context: wrong.context(OWNER, 'missing') }), 'delegation_grant_not_found')
  })
})
