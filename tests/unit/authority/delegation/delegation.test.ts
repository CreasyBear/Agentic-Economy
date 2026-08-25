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
  type DelegationCommit,
  type DelegationContextPort,
  type DelegationGrant,
  type DelegationGrantRef,
  type DelegationSnapshotRef,
  type DelegationStore,
  type DelegationTransaction,
} from '../../../../src/modules/authority/delegation/public'
import {
  accountRef,
  type AccountActionContext,
  type AccountRef,
  type ActiveAccountContext,
} from '../../../../src/modules/principal-account/account/public'
import {
  principalRef,
  type PrincipalRef,
} from '../../../../src/modules/principal-account/principal/public'

const ACCOUNT = accountRef('acc_00000000000040008000000000000001')
const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000002')
const OWNER = principalRef('prn_00000000000040008000000000000001')
const AGENT = principalRef('prn_00000000000040008000000000000002')
const WORKLOAD = principalRef('prn_00000000000040008000000000000003')
const STRANGER = principalRef('prn_00000000000040008000000000000004')

const uuid = (suffix: number): string => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

class MemoryDelegationStore implements DelegationStore {
  readonly grants = new Map<DelegationGrantRef, DelegationGrant>()
  readonly snapshots = new Map<DelegationSnapshotRef, DelegationAuthoritySnapshot>()
  readonly commits: DelegationCommit[] = []
  #tail: Promise<void> = Promise.resolve()

  async transact<Result>(operation: (transaction: DelegationTransaction) => Promise<Result>): Promise<Result> {
    const previous = this.#tail
    let release: (() => void) | undefined
    this.#tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
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
    } finally {
      release?.()
    }
  }

  private apply(change: DelegationCommit): void {
    this.commits.push(change)
    if (change.grantInsert !== undefined) {
      if (this.grants.has(change.grantInsert.grantRef)) throw new Error('store_grant_conflict')
      this.grants.set(change.grantInsert.grantRef, change.grantInsert)
    }
    for (const replacement of change.grantReplacements ?? []) {
      const current = this.grants.get(replacement.value.grantRef)
      if (current?.revision !== replacement.expectedRevision) throw new Error('store_revision_conflict')
      this.grants.set(replacement.value.grantRef, replacement.value)
    }
    if (change.snapshotInsert !== undefined) {
      if (this.snapshots.has(change.snapshotInsert.snapshotRef)) throw new Error('store_snapshot_conflict')
      this.snapshots.set(change.snapshotInsert.snapshotRef, change.snapshotInsert)
    }
  }
}

type Setup = Readonly<{
  service: DelegationService
  store: MemoryDelegationStore
  setNow(value: number): void
  context(actor: PrincipalRef, suffix: string, account?: AccountRef): AccountActionContext
  active: Set<PrincipalRef>
}>

function setup(options: Readonly<{
  uuids?: readonly string[]
  resolvedMutation?: (resolved: ActiveAccountContext) => ActiveAccountContext
}> = {}): Setup {
  const store = new MemoryDelegationStore()
  const active = new Set<PrincipalRef>([OWNER, AGENT, WORKLOAD])
  let now = 100
  let uuidIndex = 0
  const uuids = [...(options.uuids ?? Array.from({ length: 30 }, (_, index) => uuid(index + 1)))]
  const resolve = async (candidate: AccountActionContext): Promise<ActiveAccountContext> => {
    if (candidate.activeAccountRef !== ACCOUNT || !active.has(candidate.actorPrincipalRef)) {
      throw new Error('canonical_context_rejected')
    }
    const resolved: ActiveAccountContext = Object.freeze({
      accountRef: ACCOUNT,
      actorPrincipalRef: candidate.actorPrincipalRef,
      accountRevision: 9,
      correlationRef: candidate.correlationRef,
      idempotencyRef: candidate.idempotencyRef,
    })
    return options.resolvedMutation?.(resolved) ?? resolved
  }
  const contexts: DelegationContextPort = {
    resolveActiveContext: resolve,
    resolveRootIssuerContext: async (candidate) => {
      if (candidate.actorPrincipalRef !== OWNER) throw new Error('canonical_root_issuer_rejected')
      return await resolve(candidate)
    },
    requireActivePrincipal: async (candidate) => {
      if (!active.has(candidate)) throw new Error('canonical_principal_rejected')
    },
  }
  return {
    service: new DelegationService(store, contexts, {
      now: () => now,
      randomUuid: () => uuids[Math.min(uuidIndex++, uuids.length - 1)] ?? '',
    }),
    store,
    setNow: (value) => { now = value },
    context: (actor, suffix, account = ACCOUNT) => ({
      actorPrincipalRef: actor,
      activeAccountRef: account,
      correlationRef: `correlation:${suffix}`,
      idempotencyRef: `idempotency:${suffix}`,
    }),
    active,
  }
}

async function root(fixture: Setup, suffix = 'root'): Promise<DelegationGrant> {
  return await fixture.service.issueRoot({
    context: fixture.context(OWNER, suffix),
    subjectPrincipalRef: OWNER,
    scopes: ['write', 'read'],
    resourceRefs: ['resource:b', 'resource:a'],
    budgetLimit: 1_000,
    expiresAt: 1_000,
  })
}

async function child(fixture: Setup, parent: DelegationGrant, suffix = 'child'): Promise<DelegationGrant> {
  return await fixture.service.delegate({
    parentGrantRef: parent.grantRef,
    parentGeneration: parent.generation,
    context: fixture.context(parent.subjectPrincipalRef, suffix),
    subjectPrincipalRef: AGENT,
    scopes: ['read'],
    resourceRefs: ['resource:a'],
    budgetLimit: 500,
    expiresAt: 900,
  })
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'DelegationError', code, message: code })
}

describe('delegation references and validation', () => {
  it('exports production persistence limits and accepts their exact scope/resource boundaries', async () => {
    expect(DELEGATION_MAX_SCOPES).toBe(64)
    expect(DELEGATION_MAX_RESOURCES).toBe(64)
    expect(DELEGATION_MAX_ANCESTRY_GRANTS).toBe(32)
    const fixture = setup()
    const scopes = Array.from({ length: 64 }, (_, index) => `scope:${String(index).padStart(2, '0')}`)
    const resources = Array.from({ length: 64 }, (_, index) => `resource:${String(index).padStart(2, '0')}`)
    const issued = await fixture.service.issueRoot({ context: fixture.context(OWNER, 'limit-boundary'), subjectPrincipalRef: OWNER, scopes, resourceRefs: resources, budgetLimit: 1, expiresAt: 200 })
    expect(issued.scopes).toHaveLength(64)
    expect(issued.resourceRefs).toHaveLength(64)

    await expectCode(fixture.service.issueRoot({ context: fixture.context(OWNER, 'scope-overflow'), subjectPrincipalRef: OWNER, scopes: [...scopes, 'scope:64'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: 200 }), 'delegation_limit_exceeded')
    await expectCode(fixture.service.issueRoot({ context: fixture.context(OWNER, 'resource-overflow'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: [...resources, 'resource:64'], budgetLimit: 1, expiresAt: 200 }), 'delegation_limit_exceeded')
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
      cases.push(() => fixture.service.issueRoot({ context: fixture.context(OWNER, 'bad-scope'), subjectPrincipalRef: OWNER, scopes, resourceRefs: ['r'], budgetLimit: 1, expiresAt: 200 }))
    }
    for (const resources of [[], ['bad value'], ['r', 'r']] as const) {
      const fixture = setup()
      cases.push(() => fixture.service.issueRoot({ context: fixture.context(OWNER, 'bad-resource'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: resources, budgetLimit: 1, expiresAt: 200 }))
    }
    for (const limit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const fixture = setup()
      cases.push(() => fixture.service.issueRoot({ context: fixture.context(OWNER, 'bad-budget'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: limit, expiresAt: 200 }))
    }
    for (const expiry of [100, 99, 1.5]) {
      const fixture = setup()
      cases.push(() => fixture.service.issueRoot({ context: fixture.context(OWNER, 'bad-expiry'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: expiry }))
    }
    for (const run of cases) await expect(run()).rejects.toBeInstanceOf(DelegationError)

    const invalidTime = setup()
    invalidTime.setNow(-1)
    await expectCode(invalidTime.service.issueRoot({ context: invalidTime.context(OWNER, 'time'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: 200 }), 'delegation_request_invalid')
    const fractionalTime = setup()
    fractionalTime.setNow(1.5)
    await expectCode(fractionalTime.service.issueRoot({ context: fractionalTime.context(OWNER, 'time'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: 200 }), 'delegation_request_invalid')

    const fixture = setup()
    const issued = await root(fixture)
    await expectCode(fixture.service.delegate({ parentGrantRef: issued.grantRef, parentGeneration: 0, context: fixture.context(OWNER, 'generation'), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 900 }), 'delegation_generation_stale')
    await expectCode(fixture.service.admitConsequence({ grantRef: issued.grantRef, expectedGeneration: 1.5, context: fixture.context(OWNER, 'generation-admit'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 0 }), 'delegation_generation_stale')
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
    fixture.store.grants.set(issued.grantRef, Object.freeze({ ...issued, budgetUsed: -1 }))
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
    const request = { grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, 'parser-admit'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 0 } as const
    const snapshot = await fixture.service.admitConsequence(request)
    const replayContext: ActiveAccountContext = {
      accountRef: ACCOUNT,
      actorPrincipalRef: AGENT,
      accountRevision: 9,
      correlationRef: request.context.correlationRef,
      idempotencyRef: request.context.idempotencyRef,
    }
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
    await expect(fixture.service.issueRoot({ context: fixture.context(AGENT, 'stranger-root'), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: 200 })).rejects.toThrow('canonical_root_issuer_rejected')
    await expect(fixture.service.issueRoot({ context: fixture.context(OWNER, 'inactive-subject'), subjectPrincipalRef: STRANGER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: 200 })).rejects.toThrow('canonical_principal_rejected')
    const first = await root(fixture, 'same')
    await expectCode(fixture.service.issueRoot({ context: fixture.context(OWNER, 'same'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: first.resourceRefs, budgetLimit: first.budgetLimit, expiresAt: first.expiresAt }), 'delegation_idempotency_conflict')

    const mutations: Array<(value: ActiveAccountContext) => ActiveAccountContext> = [
      (value) => ({ ...value, actorPrincipalRef: AGENT }),
      (value) => ({ ...value, accountRef: OTHER_ACCOUNT }),
      (value) => ({ ...value, correlationRef: 'forged' }),
      (value) => ({ ...value, idempotencyRef: 'forged' }),
    ]
    for (const resolvedMutation of mutations) {
      const shaped = setup({ resolvedMutation })
      await expectCode(shaped.service.issueRoot({ context: shaped.context(OWNER, 'shaped'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: 200 }), 'delegation_request_invalid')
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
    await expectCode(fixture.service.issueRoot({ context: fixture.context(OWNER, 'new'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: 200 }), 'delegation_grant_ref_conflict')
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
    const rootGrant = await fixture.service.issueRoot({ context: fixture.context(OWNER, 'depth-root'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 100, expiresAt: 10_000 })
    let current = rootGrant
    for (let depth = 2; depth <= 32; depth += 1) {
      const subject = depth % 2 === 0 ? AGENT : WORKLOAD
      current = await fixture.service.delegate({ parentGrantRef: current.grantRef, parentGeneration: 1, context: fixture.context(current.subjectPrincipalRef, `depth-${depth}`), subjectPrincipalRef: subject, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 100, expiresAt: 10_001 - depth })
    }
    const snapshot = await fixture.service.admitConsequence({ grantRef: current.grantRef, expectedGeneration: 1, context: fixture.context(current.subjectPrincipalRef, 'depth-admit'), requiredScopes: ['read'], resourceRefs: ['r'], budgetAmount: 0 })
    expect(snapshot.ancestry).toHaveLength(32)
    await expectCode(fixture.service.delegate({ parentGrantRef: current.grantRef, parentGeneration: 1, context: fixture.context(current.subjectPrincipalRef, 'depth-overflow'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 100, expiresAt: 9_968 }), 'delegation_limit_exceeded')

    const storedRoot = fixture.store.grants.get(rootGrant.grantRef)!
    fixture.store.grants.set(rootGrant.grantRef, Object.freeze({
      ...storedRoot,
      parentGrantRef: delegationGrantRef(`grt_${uuid(40).replaceAll('-', '')}`),
      parentGeneration: 1,
    }))
    await expectCode(fixture.service.admitConsequence({ grantRef: current.grantRef, expectedGeneration: 1, context: fixture.context(current.subjectPrincipalRef, 'persisted-depth-overflow'), requiredScopes: ['read'], resourceRefs: ['r'], budgetAmount: 0 }), 'delegation_limit_exceeded')
  })

  it('permits arbitrary depth while every child strictly narrows every ancestor', async () => {
    const fixture = setup()
    const issued = await fixture.service.issueRoot({ context: fixture.context(OWNER, 'wild-root'), subjectPrincipalRef: OWNER, scopes: ['*'], resourceRefs: ['*'], budgetLimit: 1_000, expiresAt: 1_000 })
    const first = await fixture.service.delegate({ parentGrantRef: issued.grantRef, parentGeneration: 1, context: fixture.context(OWNER, 'first'), subjectPrincipalRef: AGENT, scopes: ['read', 'write'], resourceRefs: ['resource:a', 'resource:b'], budgetLimit: 700, expiresAt: 900 })
    const second = await fixture.service.delegate({ parentGrantRef: first.grantRef, parentGeneration: 1, context: fixture.context(AGENT, 'second'), subjectPrincipalRef: WORKLOAD, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 300, expiresAt: 800 })
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
        current = await fixture.service.delegate({
          parentGrantRef: current.grantRef,
          parentGeneration: current.generation,
          context: fixture.context(current.subjectPrincipalRef, `property-${depth}-${hop}`),
          subjectPrincipalRef: nextSubject,
          scopes: ['read'],
          resourceRefs: ['resource:a'],
          budgetLimit: 10_000 - hop,
          expiresAt: 10_000 - hop,
        })
      }
      const admitted = await fixture.service.admitConsequence({
        grantRef: current.grantRef,
        expectedGeneration: current.generation,
        context: fixture.context(current.subjectPrincipalRef, `property-admit-${depth}`),
        requiredScopes: ['read'],
        resourceRefs: ['resource:a'],
        budgetAmount: depth,
      })
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
    await expectCode(fixture.service.delegate({
      parentGrantRef: issued.grantRef,
      parentGeneration: 1,
      context: fixture.context(OWNER, code),
      subjectPrincipalRef: AGENT,
      scopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetLimit: 500,
      expiresAt: 900,
      ...override,
    }), code)
  })

  it('rejects stale generation, wrong actor/account, expired and revoked parents', async () => {
    const stale = setup()
    const staleRoot = await root(stale)
    await expectCode(stale.service.delegate({ parentGrantRef: staleRoot.grantRef, parentGeneration: 2, context: stale.context(OWNER, 'stale'), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 900 }), 'delegation_generation_stale')
    await expectCode(stale.service.delegate({ parentGrantRef: staleRoot.grantRef, parentGeneration: 1, context: stale.context(AGENT, 'actor'), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 900 }), 'delegation_actor_mismatch')
    await expect(stale.service.delegate({ parentGrantRef: staleRoot.grantRef, parentGeneration: 1, context: stale.context(OWNER, 'account', OTHER_ACCOUNT), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 900 })).rejects.toThrow('canonical_context_rejected')

    const expired = setup()
    const expiredRoot = await root(expired)
    expired.setNow(1_000)
    await expectCode(expired.service.delegate({ parentGrantRef: expiredRoot.grantRef, parentGeneration: 1, context: expired.context(OWNER, 'expired'), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 1_100 }), 'delegation_expired')

    const revoked = setup()
    const revokedRoot = await root(revoked)
    await revoked.service.revoke({ grantRef: revokedRoot.grantRef, expectedGeneration: 1, context: revoked.context(OWNER, 'revoke') })
    await expectCode(revoked.service.delegate({ parentGrantRef: revokedRoot.grantRef, parentGeneration: 2, context: revoked.context(OWNER, 'revoked'), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 900 }), 'delegation_revoked')
  })

  it('rejects missing ancestry, cycles, cross-account ancestry and stale ancestor pins', async () => {
    const missing = setup()
    await expectCode(missing.service.delegate({ parentGrantRef: delegationGrantRef(`grt_${uuid(9).replaceAll('-', '')}`), parentGeneration: 1, context: missing.context(OWNER, 'missing'), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 1, expiresAt: 200 }), 'delegation_grant_not_found')

    const cycle = setup()
    const cycleRoot = await root(cycle)
    const cycleChild = await child(cycle, cycleRoot)
    cycle.store.grants.set(cycleRoot.grantRef, Object.freeze({ ...cycleRoot, parentGrantRef: cycleChild.grantRef, parentGeneration: cycleChild.generation }))
    await expectCode(cycle.service.delegate({ parentGrantRef: cycleChild.grantRef, parentGeneration: 1, context: cycle.context(AGENT, 'cycle'), subjectPrincipalRef: WORKLOAD, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 800 }), 'delegation_ancestry_cycle')

    const cross = setup()
    const crossRoot = await root(cross)
    const crossChild = await child(cross, crossRoot)
    cross.store.grants.set(crossChild.grantRef, Object.freeze({
      ...crossChild,
      accountRef: OTHER_ACCOUNT,
      createdBy: Object.freeze({ ...crossChild.createdBy, activeAccountRef: OTHER_ACCOUNT }),
    }))
    await expectCode(cross.service.delegate({ parentGrantRef: crossChild.grantRef, parentGeneration: 1, context: cross.context(AGENT, 'cross'), subjectPrincipalRef: WORKLOAD, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 800 }), 'delegation_ancestry_account_mismatch')

    const pinned = setup()
    const pinnedRoot = await root(pinned)
    const pinnedChild = await child(pinned, pinnedRoot)
    pinned.store.grants.set(pinnedRoot.grantRef, Object.freeze({ ...pinnedRoot, generation: 2, revision: 2 }))
    await expectCode(pinned.service.delegate({ parentGrantRef: pinnedChild.grantRef, parentGeneration: 1, context: pinned.context(AGENT, 'pin'), subjectPrincipalRef: WORKLOAD, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 800 }), 'delegation_ancestry_generation_stale')
  })

  it('rejects a persisted child whose claimed actor is not its parent subject', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
    fixture.store.grants.set(delegated.grantRef, Object.freeze({
      ...delegated,
      actorPrincipalRef: STRANGER,
      createdBy: Object.freeze(fixture.context(STRANGER, 'forged-edge')),
    }))

    await expectCode(fixture.service.admitConsequence({
      grantRef: delegated.grantRef,
      expectedGeneration: 1,
      context: fixture.context(AGENT, 'forged-edge-admit'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 1,
    }), 'delegation_ancestry_invalid')
    expect(fixture.store.snapshots).toHaveLength(0)
  })

  it.each([
    ['creation time', (grant: DelegationGrant) => ({ ...grant, createdAt: 99 })],
    ['scope', (grant: DelegationGrant) => ({ ...grant, scopes: Object.freeze(['admin']) })],
    ['resources', (grant: DelegationGrant) => ({ ...grant, resourceRefs: Object.freeze(['resource:x']) })],
    ['budget', (grant: DelegationGrant) => ({ ...grant, budgetLimit: 1_001 })],
    ['strict expiry', (grant: DelegationGrant) => ({ ...grant, expiresAt: 1_000 })],
  ] as const)('rejects a persisted child with a wider or impossible %s edge', async (_name, mutate) => {
    const fixture = setup()
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
    fixture.store.grants.set(delegated.grantRef, Object.freeze(mutate(delegated)))
    await expectCode(fixture.service.admitConsequence({
      grantRef: delegated.grantRef,
      expectedGeneration: 1,
      context: fixture.context(AGENT, `corrupt-${_name}`),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 0,
    }), 'delegation_ancestry_invalid')
  })

  it('rejects intrinsically malformed persisted grant attribution before snapshotting', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    fixture.store.grants.set(issued.grantRef, Object.freeze({
      ...issued,
      budgetUsed: -1,
      createdBy: Object.freeze({ ...issued.createdBy, actorPrincipalRef: STRANGER }),
    }))
    await expectCode(fixture.service.admitConsequence({
      grantRef: issued.grantRef,
      expectedGeneration: 1,
      context: fixture.context(OWNER, 'malformed-root'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 0,
    }), 'delegation_ancestry_invalid')

    const accountAttribution = setup()
    const accountRoot = await root(accountAttribution)
    accountAttribution.store.grants.set(accountRoot.grantRef, Object.freeze({
      ...accountRoot,
      createdBy: Object.freeze({ ...accountRoot.createdBy, activeAccountRef: OTHER_ACCOUNT }),
    }))
    await expectCode(accountAttribution.service.admitConsequence({
      grantRef: accountRoot.grantRef,
      expectedGeneration: 1,
      context: accountAttribution.context(OWNER, 'malformed-account'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 0,
    }), 'delegation_ancestry_account_mismatch')

    const missingProvenance = setup()
    const missingRoot = await root(missingProvenance)
    missingProvenance.store.grants.set(missingRoot.grantRef, Object.freeze({
      ...missingRoot,
      createdBy: undefined as unknown as AccountActionContext,
    }))
    await expectCode(missingProvenance.service.admitConsequence({
      grantRef: missingRoot.grantRef,
      expectedGeneration: 1,
      context: missingProvenance.context(OWNER, 'missing-created-by'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 0,
    }), 'delegation_ancestry_invalid')

    const malformedProvenance = setup()
    const malformedRoot = await root(malformedProvenance)
    malformedProvenance.store.grants.set(malformedRoot.grantRef, Object.freeze({
      ...malformedRoot,
      createdBy: {} as AccountActionContext,
    }))
    await expectCode(malformedProvenance.service.admitConsequence({
      grantRef: malformedRoot.grantRef,
      expectedGeneration: 1,
      context: malformedProvenance.context(OWNER, 'malformed-created-by'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 0,
    }), 'delegation_ancestry_invalid')

    const nullGrant = setup()
    const nullRoot = await root(nullGrant)
    nullGrant.store.grants.set(nullRoot.grantRef, null as unknown as DelegationGrant)
    await expectCode(nullGrant.service.admitConsequence({
      grantRef: nullRoot.grantRef,
      expectedGeneration: 1,
      context: nullGrant.context(OWNER, 'null-grant'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 0,
    }), 'delegation_ancestry_invalid')

    const activeWithRevocation = setup()
    const activeRoot = await root(activeWithRevocation)
    activeWithRevocation.store.grants.set(activeRoot.grantRef, Object.freeze({
      ...activeRoot,
      revokedAt: 101,
      revokedBy: Object.freeze(activeWithRevocation.context(OWNER, 'false-revocation')),
    }))
    await expectCode(activeWithRevocation.service.admitConsequence({
      grantRef: activeRoot.grantRef,
      expectedGeneration: 1,
      context: activeWithRevocation.context(OWNER, 'active-with-revocation'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 0,
    }), 'delegation_ancestry_invalid')

    const malformedRevocation = setup()
    const revocableRoot = await root(malformedRevocation)
    const revokedRoot = await malformedRevocation.service.revoke({
      grantRef: revocableRoot.grantRef,
      expectedGeneration: 1,
      context: malformedRevocation.context(OWNER, 'revoke-for-malformation'),
    })
    malformedRevocation.store.grants.set(revokedRoot.grantRef, Object.freeze({
      ...revokedRoot,
      revokedBy: Object.freeze(malformedRevocation.context(WORKLOAD, 'forged-revoker')),
    }))
    await expectCode(malformedRevocation.service.admitConsequence({
      grantRef: revokedRoot.grantRef,
      expectedGeneration: 2,
      context: malformedRevocation.context(OWNER, 'malformed-revoker'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 0,
    }), 'delegation_ancestry_invalid')

    const { revokedAt: removedRevokedAt, ...withoutRevokedAt } = revokedRoot
    expect(removedRevokedAt).toBe(100)
    malformedRevocation.store.grants.set(revokedRoot.grantRef, Object.freeze(withoutRevokedAt))
    await expectCode(malformedRevocation.service.admitConsequence({
      grantRef: revokedRoot.grantRef,
      expectedGeneration: 2,
      context: malformedRevocation.context(OWNER, 'missing-revoked-at'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 0,
    }), 'delegation_ancestry_invalid')

    const overLimit = setup()
    const overLimitRoot = await root(overLimit)
    overLimit.store.grants.set(overLimitRoot.grantRef, Object.freeze({
      ...overLimitRoot,
      scopes: Object.freeze(Array.from({ length: 65 }, (_, index) => `scope:${String(index).padStart(2, '0')}`)),
    }))
    await expectCode(overLimit.service.admitConsequence({ grantRef: overLimitRoot.grantRef, expectedGeneration: 1, context: overLimit.context(OWNER, 'persisted-scope-overflow'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 0 }), 'delegation_limit_exceeded')
    overLimit.store.grants.set(overLimitRoot.grantRef, Object.freeze({
      ...overLimitRoot,
      resourceRefs: Object.freeze(Array.from({ length: 65 }, (_, index) => `resource:${String(index).padStart(2, '0')}`)),
    }))
    await expectCode(overLimit.service.admitConsequence({ grantRef: overLimitRoot.grantRef, expectedGeneration: 1, context: overLimit.context(OWNER, 'persisted-resource-overflow'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 0 }), 'delegation_limit_exceeded')
  })

  it('replays matching delegation and rejects conflicting or colliding creation', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    const first = await child(fixture, issued, 'same-child')
    const replay = await child(fixture, issued, 'same-child')
    expect(replay).toStrictEqual(first)
    expect(replay).not.toBe(first)
    await expectCode(fixture.service.delegate({ parentGrantRef: issued.grantRef, parentGeneration: 1, context: fixture.context(OWNER, 'same-child'), subjectPrincipalRef: WORKLOAD, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 500, expiresAt: 900 }), 'delegation_idempotency_conflict')

    const collision = setup({ uuids: [uuid(1), uuid(1)] })
    const collisionRoot = await root(collision)
    await expectCode(child(collision, collisionRoot), 'delegation_grant_ref_conflict')

    const corruptReplay = setup()
    const corruptRoot = await root(corruptReplay)
    const corruptChild = await child(corruptReplay, corruptRoot, 'corrupt-replay')
    corruptReplay.store.grants.set(corruptChild.grantRef, Object.freeze({ ...corruptChild, scopes: Object.freeze(['admin']) }))
    await expectCode(child(corruptReplay, corruptRoot, 'corrupt-replay'), 'delegation_ancestry_invalid')
  })
})

describe('consequence admission and revocation', () => {
  it('uses current server time, consumes every ancestor budget atomically and idempotently pins attribution', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
    fixture.setNow(899)
    const request = { grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, 'admit'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 125 } as const
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
    expect(await fixture.service.admitConsequence(request)).toStrictEqual(snapshot)
  })

  it('rejects a forged persisted snapshot instead of blessing it through admission replay', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
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

    await expectCode(fixture.service.admitConsequence({
      grantRef: delegated.grantRef,
      expectedGeneration: delegated.generation,
      context: fixture.context(AGENT, 'forged-replay'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 1,
    }), 'delegation_snapshot_invalid')
    expect(fixture.store.commits).toHaveLength(2)
  })

  it('rejects corrupted snapshot headers, ancestry continuity and leaf agreement independently', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
    const request = {
      grantRef: delegated.grantRef,
      expectedGeneration: delegated.generation,
      context: fixture.context(AGENT, 'snapshot-integrity'),
      requiredScopes: ['read'],
      resourceRefs: ['resource:a'],
      budgetAmount: 1,
    } as const
    const snapshot = await fixture.service.admitConsequence(request)
    const rejectReplay = async (
      corrupt: DelegationAuthoritySnapshot,
      code = 'delegation_snapshot_invalid',
    ): Promise<void> => {
      fixture.store.snapshots.set(snapshot.snapshotRef, Object.freeze(corrupt))
      await expectCode(fixture.service.admitConsequence(request), code)
    }

    await rejectReplay({ ...snapshot, snapshotRef: 'das_invalid' as DelegationSnapshotRef })
    await rejectReplay({ ...snapshot, scopes: Object.freeze(Array.from({ length: 65 }, (_, index) => `scope:${String(index).padStart(2, '0')}`)) }, 'delegation_limit_exceeded')
    await rejectReplay({ ...snapshot, resourceRefs: Object.freeze(Array.from({ length: 65 }, (_, index) => `resource:${String(index).padStart(2, '0')}`)) }, 'delegation_limit_exceeded')
    await rejectReplay({ ...snapshot, ancestry: Object.freeze(Array.from({ length: 33 }, (_, index) => snapshot.ancestry[index % snapshot.ancestry.length]!)) }, 'delegation_limit_exceeded')
    await rejectReplay({ ...snapshot, scopes: Object.freeze(['bad value']) })
    await rejectReplay({ ...snapshot, ancestry: Object.freeze([]) })
    await rejectReplay({
      ...snapshot,
      ancestry: Object.freeze(snapshot.ancestry.map((ancestor, index) => Object.freeze(
        index === 0 ? { ...ancestor, budgetUsedBefore: -1 } : ancestor,
      ))),
    })
    await rejectReplay({
      ...snapshot,
      ancestry: Object.freeze(snapshot.ancestry.map((ancestor, index) => Object.freeze(
        index === snapshot.ancestry.length - 1 ? { ...ancestor, actorPrincipalRef: STRANGER } : ancestor,
      ))),
    })
    await rejectReplay({
      ...snapshot,
      ancestry: Object.freeze(snapshot.ancestry.map((ancestor, index) => Object.freeze(
        index === 0 ? { ...ancestor, accountRef: OTHER_ACCOUNT } : ancestor,
      ))),
    })
    await rejectReplay({
      ...snapshot,
      ancestry: Object.freeze(snapshot.ancestry.map((ancestor, index) => Object.freeze(
        index === 0 ? { ...ancestor, scopes: Object.freeze(['write']) } : ancestor,
      ))),
    })
    await rejectReplay({
      ...snapshot,
      ancestry: Object.freeze(snapshot.ancestry.map((ancestor, index) => Object.freeze(
        index === 0 ? { ...ancestor, resourceRefs: Object.freeze(['resource:b']) } : ancestor,
      ))),
    })
    await rejectReplay({
      ...snapshot,
      ancestry: Object.freeze(snapshot.ancestry.map((ancestor, index) => Object.freeze(
        index === snapshot.ancestry.length - 1
          ? { ...ancestor, scopes: Object.freeze(['admin', 'read']) }
          : ancestor,
      ))),
    })
    await rejectReplay({
      ...snapshot,
      ancestry: Object.freeze(snapshot.ancestry.map((ancestor, index) => Object.freeze(
        index === snapshot.ancestry.length - 1
          ? { ...ancestor, resourceRefs: Object.freeze(['resource:a', 'resource:x']) }
          : ancestor,
      ))),
    })
    await rejectReplay({ ...snapshot, subjectPrincipalRef: STRANGER })
    await rejectReplay({ ...snapshot, expiresAt: snapshot.expiresAt - 1 })
  })

  it('serializes sibling admissions against their shared ancestor budget', async () => {
    const fixture = setup()
    const issued = await fixture.service.issueRoot({ context: fixture.context(OWNER, 'root'), subjectPrincipalRef: OWNER, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 100, expiresAt: 1_000 })
    const one = await fixture.service.delegate({ parentGrantRef: issued.grantRef, parentGeneration: 1, context: fixture.context(OWNER, 'one'), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 100, expiresAt: 900 })
    const two = await fixture.service.delegate({ parentGrantRef: issued.grantRef, parentGeneration: 1, context: fixture.context(OWNER, 'two'), subjectPrincipalRef: WORKLOAD, scopes: ['read'], resourceRefs: ['r'], budgetLimit: 100, expiresAt: 900 })
    const outcomes = await Promise.allSettled([
      fixture.service.admitConsequence({ grantRef: one.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, 'a'), requiredScopes: ['read'], resourceRefs: ['r'], budgetAmount: 60 }),
      fixture.service.admitConsequence({ grantRef: two.grantRef, expectedGeneration: 1, context: fixture.context(WORKLOAD, 'b'), requiredScopes: ['read'], resourceRefs: ['r'], budgetAmount: 60 }),
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
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
    await expectCode(fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, code), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 1, ...override }), code)
  })

  it('defensively rejects a corrupted wider leaf, caller conflict, stale generation, active stranger and expiry race', async () => {
    const corrupt = setup()
    const corruptRoot = await root(corrupt)
    const corruptChild = await child(corrupt, corruptRoot)
    corrupt.store.grants.set(corruptChild.grantRef, Object.freeze({ ...corruptChild, scopes: Object.freeze(['admin']) }))
    await expectCode(corrupt.service.admitConsequence({ grantRef: corruptChild.grantRef, expectedGeneration: 1, context: corrupt.context(AGENT, 'corrupt'), requiredScopes: ['admin'], resourceRefs: ['resource:a'], budgetAmount: 1 }), 'delegation_ancestry_invalid')

    const accountMismatch = setup()
    const mismatchedRoot = await root(accountMismatch)
    accountMismatch.store.grants.set(mismatchedRoot.grantRef, Object.freeze({
      ...mismatchedRoot,
      accountRef: OTHER_ACCOUNT,
      createdBy: Object.freeze({ ...mismatchedRoot.createdBy, activeAccountRef: OTHER_ACCOUNT }),
    }))
    await expectCode(accountMismatch.service.delegate({ parentGrantRef: mismatchedRoot.grantRef, parentGeneration: 1, context: accountMismatch.context(OWNER, 'delegate-account'), subjectPrincipalRef: AGENT, scopes: ['read'], resourceRefs: ['resource:a'], budgetLimit: 1, expiresAt: 900 }), 'delegation_ancestry_account_mismatch')
    await expectCode(accountMismatch.service.admitConsequence({ grantRef: mismatchedRoot.grantRef, expectedGeneration: 1, context: accountMismatch.context(OWNER, 'admit-account'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 1 }), 'delegation_ancestry_account_mismatch')

    const fixture = setup()
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
    await fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, 'same-admit'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 1 })
    await expectCode(fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, 'same-admit'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 2 }), 'delegation_idempotency_conflict')
    await expectCode(fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 2, context: fixture.context(AGENT, 'stale'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 1 }), 'delegation_generation_stale')
    await expectCode(fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(OWNER, 'actor'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 1 }), 'delegation_actor_mismatch')
    await expect(fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(STRANGER, 'stranger'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 1 })).rejects.toThrow('canonical_context_rejected')
    fixture.setNow(900)
    await expectCode(fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, 'race'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 1 }), 'delegation_expired')
  })

  it('rejects snapshot-ref collisions and malformed admission authority', async () => {
    const fixture = setup({ uuids: [uuid(1), uuid(2), uuid(3)] })
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
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
    await expectCode(fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, 'collision'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 0 }), 'delegation_snapshot_ref_conflict')
    await expectCode(fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, 'budget'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: -1 }), 'delegation_budget_invalid')
  })

  it('monotonically advances revocation generation and invalidates all descendants', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
    const revoked = await fixture.service.revoke({ grantRef: issued.grantRef, expectedGeneration: 1, context: fixture.context(OWNER, 'revoke-root') })
    expect(revoked).toMatchObject({ lifecycle: 'revoked', generation: 2, revision: 2, revokedAt: 100 })
    expect(Object.isFrozen(revoked.revokedBy)).toBe(true)
    await expectCode(fixture.service.admitConsequence({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(AGENT, 'descendant'), requiredScopes: ['read'], resourceRefs: ['resource:a'], budgetAmount: 1 }), 'delegation_ancestry_generation_stale')
    await expectCode(fixture.service.revoke({ grantRef: issued.grantRef, expectedGeneration: 1, context: fixture.context(OWNER, 'stale-revoke') }), 'delegation_generation_stale')
    await expectCode(fixture.service.revoke({ grantRef: issued.grantRef, expectedGeneration: 2, context: fixture.context(OWNER, 'again') }), 'delegation_revoked')
  })

  it('allows the issuer to revoke a child and rejects wrong actor, account and missing grant', async () => {
    const fixture = setup()
    const issued = await root(fixture)
    const delegated = await child(fixture, issued)
    expect((await fixture.service.revoke({ grantRef: delegated.grantRef, expectedGeneration: 1, context: fixture.context(OWNER, 'issuer-revoke') })).lifecycle).toBe('revoked')

    const wrong = setup()
    const wrongRoot = await root(wrong)
    const wrongChild = await child(wrong, wrongRoot)
    await expectCode(wrong.service.revoke({ grantRef: wrongChild.grantRef, expectedGeneration: 1, context: wrong.context(WORKLOAD, 'wrong') }), 'delegation_actor_mismatch')
    wrong.store.grants.set(wrongChild.grantRef, Object.freeze({
      ...wrongChild,
      accountRef: OTHER_ACCOUNT,
      createdBy: Object.freeze({ ...wrongChild.createdBy, activeAccountRef: OTHER_ACCOUNT }),
    }))
    await expectCode(wrong.service.revoke({ grantRef: wrongChild.grantRef, expectedGeneration: 1, context: wrong.context(AGENT, 'mismatch') }), 'delegation_ancestry_account_mismatch')
    await expect(wrong.service.revoke({ grantRef: wrongChild.grantRef, expectedGeneration: 1, context: wrong.context(AGENT, 'account', OTHER_ACCOUNT) })).rejects.toThrow('canonical_context_rejected')
    await expectCode(wrong.service.revoke({ grantRef: delegationGrantRef(`grt_${uuid(30).replaceAll('-', '')}`), expectedGeneration: 1, context: wrong.context(OWNER, 'missing') }), 'delegation_grant_not_found')
  })
})
