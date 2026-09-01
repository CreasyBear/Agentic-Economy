import { describe, expect, it } from 'vitest'

import {
  DelegationService,
  delegationSnapshotRef,
  type DelegationAuthoritySnapshot,
  type DelegationCommit,
  type DelegationContextPort,
  type DelegationGrant,
  type DelegationGrantRef,
  type DelegationStore,
  type DelegationTransaction,
} from '../../../../src/modules/authority/delegation/public'
import {
  ConsequenceAuthorityBoundary,
  AuthorityBoundaryError,
  PACKAGE_3_CONSEQUENCE_ACTION_POLICY,
  PACKAGE_3_CONSEQUENCE_ACTIONS,
  type AuthorityAccountOwnershipBinding,
  type AuthorityDelegationBinding,
  type AuthorityResolvedBinding,
  type ServerAuthorityResolutionPort,
} from '../../../../src/modules/authority/context/public'
import {
  createCallbackAuthorityAdapter,
  createCliAuthorityAdapter,
  createConvexAuthorityAdapter,
  createCronAuthorityAdapter,
  createHttpAuthorityAdapter,
  createJobAuthorityAdapter,
  createMcpAuthorityAdapter,
  createReconciliationAuthorityAdapter,
  createSurfaceAuthorityAdapters,
  createWorkerAuthorityAdapter,
} from '../../../../src/lib/server/authority-boundary/public'
import {
  accountRef,
  ownershipRef,
  type AccountActionContext,
  type ActiveAccountContext,
} from '../../../../src/modules/principal-account/account/public'
import {
  principalRef,
  type PrincipalRef,
} from '../../../../src/modules/principal-account/principal/public'
import { sourceWriteCommandDigest } from '../../../../src/modules/security/source-write-admission'

class MemoryDelegationStore implements DelegationStore {
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
      commit: async (change) => this.commit(change),
    })
  }

  private commit(change: DelegationCommit): void {
    if (change.grantInsert !== undefined) this.grants.set(change.grantInsert.grantRef, change.grantInsert)
    for (const replacement of change.grantReplacements ?? []) {
      this.grants.set(replacement.value.grantRef, replacement.value)
    }
    if (change.snapshotInsert !== undefined) {
      this.snapshots.set(change.snapshotInsert.snapshotRef, change.snapshotInsert)
    }
  }
}

const ACCOUNT = accountRef('acc_00000000000040008000000000000021')
const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000022')
const HUMAN = principalRef('prn_00000000000040008000000000000021')
const WORKLOAD = principalRef('prn_00000000000040008000000000000022')
const STRANGER = principalRef('prn_00000000000040008000000000000023')

function action(actorPrincipalRef: PrincipalRef, suffix: string): AccountActionContext {
  return {
    actorPrincipalRef,
    activeAccountRef: ACCOUNT,
    correlationRef: `correlation:${suffix}`,
    idempotencyRef: `idempotency:${suffix}`,
  }
}

async function harness() {
  const store = new MemoryDelegationStore()
  let now = 100
  let sequence = 0
  const active = new Set<PrincipalRef>([HUMAN, WORKLOAD, STRANGER])
  const contexts: DelegationContextPort = {
    resolveActiveContext: async (candidate) => {
      if (candidate.activeAccountRef !== ACCOUNT || !active.has(candidate.actorPrincipalRef)) {
        throw new Error('trusted_context_rejected')
      }
      return Object.freeze({
        accountRef: ACCOUNT,
        actorPrincipalRef: candidate.actorPrincipalRef,
        accountRevision: 17,
        correlationRef: candidate.correlationRef,
        idempotencyRef: candidate.idempotencyRef,
      } satisfies ActiveAccountContext)
    },
    resolveRootIssuerContext: async (candidate) => {
      if (candidate.activeAccountRef !== ACCOUNT || candidate.actorPrincipalRef !== HUMAN) {
        throw new Error('trusted_root_rejected')
      }
      return Object.freeze({
        accountRef: ACCOUNT,
        actorPrincipalRef: HUMAN,
        accountRevision: 17,
        correlationRef: candidate.correlationRef,
        idempotencyRef: candidate.idempotencyRef,
      } satisfies ActiveAccountContext)
    },
    requireActivePrincipal: async (candidate) => {
      if (!active.has(candidate)) throw new Error('trusted_principal_rejected')
    },
  }
  const delegation = new DelegationService(store, contexts, {
    now: () => now,
    randomUuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  })
  const humanGrant = await delegation.issueRoot({
    context: action(HUMAN, 'human-root'),
    subjectPrincipalRef: HUMAN,
    scopes: ['operation:invoke'],
    resourceRefs: ['operation:alpha'],
    budgetLimit: 100,
    expiresAt: 1_000,
  })
  const workloadGrant = await delegation.issueRoot({
    context: action(HUMAN, 'workload-root'),
    subjectPrincipalRef: WORKLOAD,
    scopes: ['operation:invoke'],
    resourceRefs: ['operation:alpha'],
    budgetLimit: 100,
    expiresAt: 1_000,
  })
  const binding = (principalClass: 'interactive' | 'workload' = 'interactive'): AuthorityDelegationBinding => ({
    principalClass,
    actorPrincipalRef: principalClass === 'workload' ? WORKLOAD : HUMAN,
    activeAccountRef: ACCOUNT,
    grantRef: principalClass === 'workload' ? workloadGrant.grantRef : humanGrant.grantRef,
    grantGeneration: 1,
  })
  const resolver = (resolved: AuthorityResolvedBinding | undefined): ServerAuthorityResolutionPort => ({
    resolveCanonicalBinding: async () => resolved,
  })
  return {
    boundary: new ConsequenceAuthorityBoundary(delegation),
    binding,
    delegation,
    humanGrant,
    resolver,
    setNow(value: number) { now = value },
    store,
    workloadGrant,
  }
}

const intent = (suffix: string) => ({
  requiredScopes: ['operation:invoke'],
  resourceRefs: ['operation:alpha'],
  budgetAmount: 1,
  correlationRef: `correlation:${suffix}`,
  idempotencyRef: `idempotency:${suffix}`,
})

describe('centralized cross-surface consequence authority', () => {
  it('admits interactive surfaces with one exact server-resolved Principal, Account and Grant snapshot', async () => {
    const setup = await harness()
    const adapters = [
      createHttpAuthorityAdapter(setup.boundary, setup.resolver(setup.binding())),
      createConvexAuthorityAdapter(setup.boundary, setup.resolver(setup.binding())),
      createMcpAuthorityAdapter(setup.boundary, setup.resolver(setup.binding())),
      createCliAuthorityAdapter(setup.boundary, setup.resolver(setup.binding())),
    ]

    for (const [index, adapter] of adapters.entries()) {
      const admission = await adapter.withCurrentAuthority(intent(`interactive-${index}`), async (current) => current)
      expect(admission).toMatchObject({
        surface: adapter.surface,
        authoritySource: {
          kind: 'delegation_snapshot',
          grantRef: setup.humanGrant.grantRef,
          grantGeneration: 1,
        },
        actorPrincipalRef: HUMAN,
        activeAccountRef: ACCOUNT,
        accountRevision: 17,
        grantRef: setup.humanGrant.grantRef,
        grantGeneration: 1,
        requiredScopes: ['operation:invoke'],
        resourceRefs: ['operation:alpha'],
        budgetAmount: 1,
        admittedAt: 100,
        expiresAt: 1_000,
      })
      expect(Object.isFrozen(admission)).toBe(true)
      expect(Object.isFrozen(admission.authoritySource)).toBe(true)
      expect(Object.isFrozen(admission.requiredScopes)).toBe(true)
      expect(Object.isFrozen(admission.resourceRefs)).toBe(true)
    }
  })

  it('admits every background surface only with an explicit workload Principal', async () => {
    const setup = await harness()
    const workload = setup.resolver(setup.binding('workload'))
    const adapters = [
      createCallbackAuthorityAdapter(setup.boundary, workload),
      createWorkerAuthorityAdapter(setup.boundary, workload),
      createJobAuthorityAdapter(setup.boundary, workload),
      createCronAuthorityAdapter(setup.boundary, workload),
      createReconciliationAuthorityAdapter(setup.boundary, workload),
    ]

    for (const [index, adapter] of adapters.entries()) {
      await expect(adapter.withCurrentAuthority(intent(`background-${index}`), async (admission) => admission))
        .resolves.toMatchObject({
          surface: adapter.surface,
          actorPrincipalRef: WORKLOAD,
          activeAccountRef: ACCOUNT,
          grantRef: setup.workloadGrant.grantRef,
        })
    }

    await expect(createCronAuthorityAdapter(setup.boundary, setup.resolver(undefined))
      .withCurrentAuthority(intent('missing-workload'), async () => 'not-run'))
      .rejects.toMatchObject({ code: 'authority_binding_missing' })
    await expect(createJobAuthorityAdapter(setup.boundary, setup.resolver(setup.binding()))
      .withCurrentAuthority(intent('human-job'), async () => 'not-run'))
      .rejects.toMatchObject({ code: 'authority_workload_required' })
  })

  it('builds a complete frozen fixed-surface adapter set for driver composition', async () => {
    const setup = await harness()
    const interactive = setup.resolver(setup.binding())
    const workload = setup.resolver(setup.binding('workload'))
    const adapters = createSurfaceAuthorityAdapters(setup.boundary, {
      http: interactive,
      convex: interactive,
      mcp: interactive,
      cli: interactive,
      callback: workload,
      worker: workload,
      job: workload,
      cron: workload,
      reconciliation: workload,
    })

    expect(Object.isFrozen(adapters)).toBe(true)
    expect(Object.keys(adapters)).toEqual([
      'http', 'convex', 'mcp', 'cli', 'callback', 'worker', 'job', 'cron', 'reconciliation',
    ])
  })

  it('never passes caller credentials, provider identifiers, payloads or proof-shaped data to the trusted resolver', async () => {
    const setup = await harness()
    const resolutionRequests: unknown[] = []
    const resolver: ServerAuthorityResolutionPort = {
      resolveCanonicalBinding: async (request) => {
        resolutionRequests.push(request)
        return {
          ...setup.binding(),
          credentialId: 'credential-attacker',
          ownerId: OTHER_ACCOUNT,
          providerAccountRef: OTHER_ACCOUNT,
          authorityProof: { actorPrincipalRef: STRANGER },
        } as unknown as AuthorityResolvedBinding
      },
    }
    const injected = {
      ...intent('untrusted-data'),
      credentialId: 'credential-attacker',
      clerkUserId: 'clerk-attacker',
      providerAccountRef: OTHER_ACCOUNT,
      ownerAccountRef: OTHER_ACCOUNT,
      authorityProof: { actorPrincipalRef: STRANGER, activeAccountRef: OTHER_ACCOUNT },
      callbackPayload: { grantGeneration: 999 },
    }

    const result = await createHttpAuthorityAdapter(setup.boundary, resolver)
      .withCurrentAuthority(injected, async (admission) => admission)

    expect(resolutionRequests).toEqual([{ surface: 'http' }])
    expect(JSON.stringify(result)).not.toMatch(/credential|clerk|provider|proof|payload/iu)
    expect(result).toMatchObject({ actorPrincipalRef: HUMAN, activeAccountRef: ACCOUNT })
  })

  it('canonicalizes mutable getter-backed intent once before any await or durable admission', async () => {
    const setup = await harness()
    const reads = {
      requiredScopes: 0,
      resourceRefs: 0,
      budgetAmount: 0,
      correlationRef: 0,
      idempotencyRef: 0,
    }
    const sourceScopes = ['operation:invoke']
    const sourceResources = ['operation:alpha']
    const mutableIntent = {
      get requiredScopes() {
        reads.requiredScopes += 1
        return reads.requiredScopes === 1 ? sourceScopes : ['*']
      },
      get resourceRefs() {
        reads.resourceRefs += 1
        sourceScopes.push('*')
        return reads.resourceRefs === 1 ? sourceResources : ['operation:attacker']
      },
      get budgetAmount() {
        reads.budgetAmount += 1
        sourceResources[0] = 'operation:attacker'
        return reads.budgetAmount === 1 ? 1 : 2
      },
      get correlationRef() {
        reads.correlationRef += 1
        return reads.correlationRef === 1 ? 'correlation:canonical-once' : 'correlation:attacker'
      },
      get idempotencyRef() {
        reads.idempotencyRef += 1
        return reads.idempotencyRef === 1 ? 'idempotency:canonical-once' : 'idempotency:attacker'
      },
    }
    const resolver: ServerAuthorityResolutionPort = {
      resolveCanonicalBinding: async () => {
        sourceScopes.push('connection:read')
        sourceResources[0] = 'operation:resolver-attacker'
        return setup.binding()
      },
    }
    let consequenceRuns = 0

    const admission = await createHttpAuthorityAdapter(setup.boundary, resolver)
      .withCurrentAuthority(mutableIntent, async (current) => {
        consequenceRuns += 1
        return current
      })

    expect(reads).toEqual({
      requiredScopes: 1,
      resourceRefs: 1,
      budgetAmount: 1,
      correlationRef: 1,
      idempotencyRef: 1,
    })
    expect(admission).toMatchObject({
      requiredScopes: ['operation:invoke'],
      resourceRefs: ['operation:alpha'],
      budgetAmount: 1,
      correlationRef: 'correlation:canonical-once',
      idempotencyRef: 'idempotency:canonical-once',
    })
    expect(consequenceRuns).toBe(1)
    expect(setup.store.snapshots.size).toBe(1)
  })

  it('runtime-validates all intent fields synchronously and rejects malformed getter-backed input before resolver use', async () => {
    const setup = await harness()
    let resolverRuns = 0
    let admissionRuns = 0
    let consequenceRuns = 0
    const boundary = new ConsequenceAuthorityBoundary({
      admitConsequence: async () => {
        admissionRuns += 1
        throw new Error('admission_must_not_run')
      },
    })
    const resolver: ServerAuthorityResolutionPort = {
      resolveCanonicalBinding: async () => {
        resolverRuns += 1
        return setup.binding()
      },
    }
    const valid = intent('malformed-pre-await')
    const tooManyScopes = Array.from({ length: 65 }, (_, index) => `scope:${index}`)
    const malformed = [
      { ...valid, requiredScopes: [] },
      { ...valid, requiredScopes: 'operation:invoke' },
      { ...valid, requiredScopes: ['operation:invoke', 'operation:invoke'] },
      { ...valid, requiredScopes: ['invalid?scope'] },
      { ...valid, requiredScopes: tooManyScopes },
      { ...valid, resourceRefs: [] },
      { ...valid, resourceRefs: ['operation:alpha', 'operation:alpha'] },
      { ...valid, resourceRefs: ['invalid resource'] },
      { ...valid, budgetAmount: -1 },
      { ...valid, budgetAmount: 0.5 },
      { ...valid, correlationRef: '' },
      { ...valid, correlationRef: 42 },
      { ...valid, idempotencyRef: 'invalid/ref' },
    ]

    for (const candidate of malformed) {
      await expect(createHttpAuthorityAdapter(boundary, resolver).withCurrentAuthority(
        candidate as never,
        async () => { consequenceRuns += 1 },
      )).rejects.toMatchObject({ code: 'authority_admission_invalid' })
    }

    const reads = {
      requiredScopes: 0,
      resourceRefs: 0,
      budgetAmount: 0,
      correlationRef: 0,
      idempotencyRef: 0,
    }
    const getterBackedMalformed = {
      get requiredScopes() { reads.requiredScopes += 1; return ['operation:invoke'] },
      get resourceRefs() { reads.resourceRefs += 1; return ['operation:alpha'] },
      get budgetAmount() { reads.budgetAmount += 1; return 1 },
      get correlationRef() { reads.correlationRef += 1; return 'correlation:getter-malformed' },
      get idempotencyRef() { reads.idempotencyRef += 1; return 'invalid/ref' },
    }
    await expect(createHttpAuthorityAdapter(boundary, resolver).withCurrentAuthority(
      getterBackedMalformed,
      async () => { consequenceRuns += 1 },
    )).rejects.toMatchObject({ code: 'authority_admission_invalid' })

    expect(reads).toEqual({
      requiredScopes: 1,
      resourceRefs: 1,
      budgetAmount: 1,
      correlationRef: 1,
      idempotencyRef: 1,
    })
    expect({ resolverRuns, admissionRuns, consequenceRuns }).toEqual({
      resolverRuns: 0,
      admissionRuns: 0,
      consequenceRuns: 0,
    })
  })

  it('canonicalizes every getter-backed server binding field exactly once before parsing', async () => {
    const setup = await harness()
    const canonical = setup.binding()
    const reads = {
      principalClass: 0,
      actorPrincipalRef: 0,
      activeAccountRef: 0,
      grantRef: 0,
      grantGeneration: 0,
    }
    const resolver: ServerAuthorityResolutionPort = {
      resolveCanonicalBinding: async () => ({
        get principalClass() {
          reads.principalClass += 1
          return reads.principalClass === 1 ? canonical.principalClass : 'workload'
        },
        get actorPrincipalRef() {
          reads.actorPrincipalRef += 1
          return reads.actorPrincipalRef === 1 ? canonical.actorPrincipalRef : STRANGER
        },
        get activeAccountRef() {
          reads.activeAccountRef += 1
          return reads.activeAccountRef === 1 ? canonical.activeAccountRef : OTHER_ACCOUNT
        },
        get grantRef() {
          reads.grantRef += 1
          return reads.grantRef === 1 ? canonical.grantRef : 'grt_ffffffffffffffffffffffffffffffff'
        },
        get grantGeneration() {
          reads.grantGeneration += 1
          return reads.grantGeneration === 1 ? canonical.grantGeneration : 2
        },
      } as AuthorityResolvedBinding),
    }

    const admission = await createHttpAuthorityAdapter(setup.boundary, resolver)
      .withCurrentAuthority(intent('getter-binding'), async (current) => current)

    expect(reads).toEqual({
      principalClass: 1,
      actorPrincipalRef: 1,
      activeAccountRef: 1,
      grantRef: 1,
      grantGeneration: 1,
    })
    expect(admission).toMatchObject({
      actorPrincipalRef: HUMAN,
      activeAccountRef: ACCOUNT,
      grantRef: setup.humanGrant.grantRef,
      grantGeneration: 1,
    })
  })

  it('canonicalizes every getter-backed snapshot field once and never exposes post-validation forgery', async () => {
    const setup = await harness()
    const binding = setup.binding()
    const snapshotRef = delegationSnapshotRef('das_00000000000040008000000000000097')
    const sourceScopes = ['operation:invoke']
    const sourceResources = ['operation:alpha']
    const reads = {
      snapshotRef: 0,
      grantRef: 0,
      generation: 0,
      accountRef: 0,
      accountRevision: 0,
      actorPrincipalRef: 0,
      subjectPrincipalRef: 0,
      scopes: 0,
      resourceRefs: 0,
      budgetAmount: 0,
      admittedAt: 0,
      expiresAt: 0,
      correlationRef: 0,
      idempotencyRef: 0,
    }
    const forgedBoundary = new ConsequenceAuthorityBoundary({
      admitConsequence: async (request) => ({
        get snapshotRef() { reads.snapshotRef += 1; return snapshotRef },
        get grantRef() { reads.grantRef += 1; return request.grantRef },
        get generation() { reads.generation += 1; return request.expectedGeneration },
        get accountRef() { reads.accountRef += 1; return request.context.activeAccountRef },
        get accountRevision() { reads.accountRevision += 1; return 17 },
        get actorPrincipalRef() {
          reads.actorPrincipalRef += 1
          return reads.actorPrincipalRef === 1 ? request.context.actorPrincipalRef : STRANGER
        },
        get subjectPrincipalRef() { reads.subjectPrincipalRef += 1; return request.context.actorPrincipalRef },
        get scopes() { reads.scopes += 1; return sourceScopes },
        get resourceRefs() {
          reads.resourceRefs += 1
          sourceScopes[0] = '*'
          return sourceResources
        },
        get budgetAmount() {
          reads.budgetAmount += 1
          sourceResources[0] = 'operation:attacker'
          return request.budgetAmount
        },
        get admittedAt() { reads.admittedAt += 1; return 100 },
        get expiresAt() { reads.expiresAt += 1; return 1_000 },
        get correlationRef() { reads.correlationRef += 1; return request.context.correlationRef },
        get idempotencyRef() { reads.idempotencyRef += 1; return request.context.idempotencyRef },
        ancestry: Object.freeze([]),
      } as DelegationAuthoritySnapshot),
    })

    const admission = await createHttpAuthorityAdapter(forgedBoundary, setup.resolver(binding))
      .withCurrentAuthority(intent('getter-snapshot'), async (current) => current)

    expect(reads).toEqual({
      snapshotRef: 1,
      grantRef: 1,
      generation: 1,
      accountRef: 1,
      accountRevision: 1,
      actorPrincipalRef: 1,
      subjectPrincipalRef: 1,
      scopes: 1,
      resourceRefs: 1,
      budgetAmount: 1,
      admittedAt: 1,
      expiresAt: 1,
      correlationRef: 1,
      idempotencyRef: 1,
    })
    expect(admission).toMatchObject({
      snapshotRef,
      actorPrincipalRef: HUMAN,
      activeAccountRef: ACCOUNT,
      grantRef: binding.grantRef,
      grantGeneration: 1,
      requiredScopes: ['operation:invoke'],
      resourceRefs: ['operation:alpha'],
    })
    expect(admission.actorPrincipalRef).not.toBe(STRANGER)
  })

  it('denies a stranger, wrong Account, stale generation, revoked Grant and expiry race before consequence execution', async () => {
    const setup = await harness()
    let consequenceRuns = 0
    const consequence = async () => { consequenceRuns += 1; return 'ran' }
    const wrongAccount = { ...setup.binding(), activeAccountRef: OTHER_ACCOUNT }
    const stranger = { ...setup.binding(), actorPrincipalRef: STRANGER }
    const stale = { ...setup.binding(), grantGeneration: 2 }

    for (const [suffix, binding] of [['wrong-account', wrongAccount], ['stranger', stranger], ['stale', stale]] as const) {
      await expect(createHttpAuthorityAdapter(setup.boundary, setup.resolver(binding))
        .withCurrentAuthority(intent(suffix), consequence)).rejects.toBeInstanceOf(Error)
    }

    await setup.delegation.revoke({
      context: action(HUMAN, 'revoke'),
      grantRef: setup.humanGrant.grantRef,
      expectedGeneration: 1,
    })
    await expect(createHttpAuthorityAdapter(setup.boundary, setup.resolver(setup.binding()))
      .withCurrentAuthority(intent('revoked'), consequence)).rejects.toMatchObject({ code: 'delegation_revoked' })

    const expiring = await harness()
    const expiryResolver: ServerAuthorityResolutionPort = {
      resolveCanonicalBinding: async () => {
        expiring.setNow(1_000)
        return expiring.binding()
      },
    }
    await expect(createHttpAuthorityAdapter(expiring.boundary, expiryResolver)
      .withCurrentAuthority(intent('expired-race'), consequence)).rejects.toMatchObject({ code: 'delegation_expired' })
    expect(consequenceRuns).toBe(0)
  })

  it('rejects omitted or malformed surfaces and bindings instead of providing an internal-superuser path', async () => {
    const setup = await harness()
    const malformedBindings = [
      undefined,
      { ...setup.binding(), actorPrincipalRef: 'clerk_user_1' },
      { ...setup.binding(), activeAccountRef: 'provider-account' },
      { ...setup.binding(), grantRef: 'credential:grant' },
      { ...setup.binding(), grantGeneration: 0 },
      { ...setup.binding(), principalClass: 'admin' },
    ]
    for (const [index, binding] of malformedBindings.entries()) {
      const adapter = setup.boundary.forSurface('http', setup.resolver(binding as AuthorityResolvedBinding | undefined))
      await expect(adapter.withCurrentAuthority(intent(`malformed-${index}`), async () => 'not-run'))
        .rejects.toBeInstanceOf(AuthorityBoundaryError)
    }

    expect(() => setup.boundary.forSurface(undefined as never, setup.resolver(setup.binding())))
      .toThrowError(AuthorityBoundaryError)
    expect(() => setup.boundary.forSurface('internal' as never, setup.resolver(setup.binding())))
      .toThrowError(AuthorityBoundaryError)
  })

  it('rejects hybrid ownership bindings and any declared authority source on legacy delegation bindings', async () => {
    const setup = await harness()
    const ownerSource = {
      kind: 'account_ownership',
      ownershipRef: ownershipRef('own_00000000000040008000000000000021'),
      ownershipRevision: 3,
      accountRevision: 17,
      admittedAt: 100,
      expiresAt: 200,
    } as const
    const hybridOwnerWithGrantRef = {
      principalClass: 'interactive',
      actorPrincipalRef: HUMAN,
      activeAccountRef: ACCOUNT,
      authoritySource: ownerSource,
      grantRef: setup.humanGrant.grantRef,
    }
    const hybridOwnerWithGeneration = {
      principalClass: 'interactive',
      actorPrincipalRef: HUMAN,
      activeAccountRef: ACCOUNT,
      authoritySource: ownerSource,
      grantGeneration: 1,
    }
    const declaredDelegationSource = {
      ...setup.binding(),
      authoritySource: {
        kind: 'delegation_snapshot',
        snapshotRef: 'das_00000000000040008000000000000021',
      },
    }
    const unknownSource = {
      ...setup.binding(),
      authoritySource: { kind: 'provider_admin' },
    }

    for (const [index, binding] of [
      hybridOwnerWithGrantRef,
      hybridOwnerWithGeneration,
      declaredDelegationSource,
      unknownSource,
    ].entries()) {
      await expect(createHttpAuthorityAdapter(
        setup.boundary,
        setup.resolver(binding as unknown as AuthorityResolvedBinding),
      ).withCurrentAuthority(intent(`authority-source-${index}`), async () => 'not-run'))
        .rejects.toMatchObject({ code: 'authority_binding_invalid' })
    }
  })

  it('fails closed if an authority provider returns attribution that differs from the resolved binding', async () => {
    const setup = await harness()
    const forgedBoundary = new ConsequenceAuthorityBoundary({
      admitConsequence: async (request) => Object.freeze({
        snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000099'),
        grantRef: request.grantRef,
        generation: request.expectedGeneration,
        accountRef: request.context.activeAccountRef,
        accountRevision: 17,
        actorPrincipalRef: STRANGER,
        subjectPrincipalRef: STRANGER,
        scopes: Object.freeze([...request.requiredScopes]),
        resourceRefs: Object.freeze([...request.resourceRefs]),
        budgetAmount: request.budgetAmount,
        admittedAt: 100,
        expiresAt: 1_000,
        correlationRef: request.context.correlationRef,
        idempotencyRef: request.context.idempotencyRef,
        ancestry: Object.freeze([]),
      } satisfies DelegationAuthoritySnapshot),
    })

    await expect(createHttpAuthorityAdapter(forgedBoundary, setup.resolver(setup.binding()))
      .withCurrentAuthority(intent('forged-provider'), async () => 'not-run'))
      .rejects.toMatchObject({ code: 'authority_admission_invalid' })
  })

  it('fails closed if an authority provider returns a malformed current-time snapshot', async () => {
    const setup = await harness()
    const invalidSnapshotBoundary = new ConsequenceAuthorityBoundary({
      admitConsequence: async (request) => Object.freeze({
        snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000098'),
        grantRef: request.grantRef,
        generation: request.expectedGeneration,
        accountRef: request.context.activeAccountRef,
        accountRevision: 0,
        actorPrincipalRef: request.context.actorPrincipalRef,
        subjectPrincipalRef: request.context.actorPrincipalRef,
        scopes: Object.freeze([...request.requiredScopes]),
        resourceRefs: Object.freeze([...request.resourceRefs]),
        budgetAmount: request.budgetAmount,
        admittedAt: 100,
        expiresAt: 1_000,
        correlationRef: request.context.correlationRef,
        idempotencyRef: request.context.idempotencyRef,
        ancestry: Object.freeze([]),
      } satisfies DelegationAuthoritySnapshot),
    })

    await expect(createHttpAuthorityAdapter(invalidSnapshotBoundary, setup.resolver(setup.binding()))
      .withCurrentAuthority(intent('invalid-snapshot'), async () => 'not-run'))
      .rejects.toMatchObject({ code: 'authority_admission_invalid' })
  })

  it('pins an admitted snapshot for the consequence and reconciles a later retry through a fresh authority decision', async () => {
    const setup = await harness()
    const adapter = createHttpAuthorityAdapter(setup.boundary, setup.resolver(setup.binding()))
    const first = await adapter.withCurrentAuthority(intent('pin'), async (admission) => admission)
    expect(first.admittedAt).toBe(100)

    await setup.delegation.revoke({
      context: action(HUMAN, 'pin-revoke'),
      grantRef: setup.humanGrant.grantRef,
      expectedGeneration: 1,
    })

    expect(first).toMatchObject({ grantGeneration: 1, admittedAt: 100 })
    await expect(adapter.withCurrentAuthority(intent('reconcile'), async () => 'not-run'))
      .rejects.toMatchObject({ code: 'delegation_revoked' })
  })

  it('defines one closed and frozen policy for every Package 3 consequential action', () => {
    expect(Object.keys(PACKAGE_3_CONSEQUENCE_ACTION_POLICY)).toEqual(PACKAGE_3_CONSEQUENCE_ACTIONS)
    expect(Object.isFrozen(PACKAGE_3_CONSEQUENCE_ACTIONS)).toBe(true)
    expect(Object.isFrozen(PACKAGE_3_CONSEQUENCE_ACTION_POLICY)).toBe(true)

    expect(PACKAGE_3_CONSEQUENCE_ACTION_POLICY).toEqual({
      'agent_access.create': {
        actionClass: 'authority_increase',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'scope', 'spending_limits', 'expiry', 'consequence', 'recovery'],
        recoveryClass: 'reversible_before_dispatch',
      },
      'agent_access.replace_credential': {
        actionClass: 'authority_increase',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'scope', 'spending_limits', 'expiry', 'credential_generation', 'consequence', 'recovery'],
        recoveryClass: 'reversible_while_pending',
      },
      'agent_access.increase_authority': {
        actionClass: 'authority_increase',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'scope', 'spending_limits', 'expiry', 'consequence', 'recovery'],
        recoveryClass: 'reversible_before_dispatch',
      },
      'agent_access.reduce_authority': {
        actionClass: 'authority_reduction',
        proofPolicy: { kind: 'none' },
        confirmationFields: ['actor', 'account', 'target', 'scope', 'spending_limits', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
      'agent_access.revoke_credential': {
        actionClass: 'authority_reduction',
        proofPolicy: { kind: 'none' },
        confirmationFields: ['actor', 'account', 'target', 'credential_generation', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
      'agent_access.disconnect': {
        actionClass: 'authority_reduction',
        proofPolicy: { kind: 'none' },
        confirmationFields: ['actor', 'account', 'target', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
      'connection.test': {
        actionClass: 'safe_validation',
        proofPolicy: { kind: 'none' },
        confirmationFields: ['actor', 'account', 'target', 'provider_permissions', 'consequence', 'recovery'],
        recoveryClass: 'reversible_before_dispatch',
      },
      'connection.connect': {
        actionClass: 'authority_increase',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'provider_permissions', 'expiry', 'authority_generation', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
      'connection.reauthorize': {
        actionClass: 'authority_increase',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'provider_permissions', 'expiry', 'authority_generation', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
      'connection.revoke': {
        actionClass: 'authority_reduction',
        proofPolicy: { kind: 'none' },
        confirmationFields: ['actor', 'account', 'target', 'provider_permissions', 'authority_generation', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
      'funding.top_up': {
        actionClass: 'spend_or_transfer',
        proofPolicy: { kind: 'none' },
        confirmationFields: ['actor', 'account', 'target', 'amount', 'fees_and_total', 'consequence', 'recovery'],
        recoveryClass: 'irreversible',
      },
      'payout_authority.create': {
        actionClass: 'authority_increase',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'destination', 'authority_generation', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
      'payout_authority.replace': {
        actionClass: 'authority_increase',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'destination', 'authority_generation', 'consequence', 'recovery'],
        recoveryClass: 'reversible_while_pending',
      },
      'payout.transfer': {
        actionClass: 'spend_or_transfer',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'amount', 'destination', 'timing', 'consequence', 'recovery'],
        recoveryClass: 'irreversible',
      },
      'publication.publish': {
        actionClass: 'publish_or_withdraw',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'operation_revision', 'market_visibility', 'price_and_effects', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
      'publication.republish': {
        actionClass: 'publish_or_withdraw',
        proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
        confirmationFields: ['actor', 'account', 'target', 'operation_revision', 'market_visibility', 'price_and_effects', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
      'publication.withdraw': {
        actionClass: 'publish_or_withdraw',
        proofPolicy: { kind: 'none' },
        confirmationFields: ['actor', 'account', 'target', 'operation_revision', 'market_visibility', 'consequence', 'recovery'],
        recoveryClass: 'compensatable',
      },
    })

    for (const action of PACKAGE_3_CONSEQUENCE_ACTIONS) {
      const policy = PACKAGE_3_CONSEQUENCE_ACTION_POLICY[action]
      expect(Object.isFrozen(policy)).toBe(true)
      expect(Object.isFrozen(policy.proofPolicy)).toBe(true)
      expect(Object.isFrozen(policy.confirmationFields)).toBe(true)
      expect(policy.confirmationFields).toEqual(expect.arrayContaining([
        'actor', 'account', 'target', 'consequence', 'recovery',
      ]))
      expect(new Set(policy.confirmationFields).size).toBe(policy.confirmationFields.length)
      if (policy.actionClass === 'authority_increase') {
        expect(policy.proofPolicy).toEqual({
          kind: 'clerk_reverification',
          preset: 'strict',
          uniquePerCommand: true,
        })
      }
      if (policy.actionClass === 'authority_reduction') {
        expect(policy.proofPolicy).toEqual({ kind: 'none' })
      }
    }

    expect(PACKAGE_3_CONSEQUENCE_ACTION_POLICY['funding.top_up'].proofPolicy).toEqual({ kind: 'none' })
    expect(PACKAGE_3_CONSEQUENCE_ACTION_POLICY['payout.transfer'].proofPolicy.kind)
      .toBe('clerk_reverification')
    expect(PACKAGE_3_CONSEQUENCE_ACTION_POLICY['publication.publish'].proofPolicy.kind)
      .toBe('clerk_reverification')
    expect(PACKAGE_3_CONSEQUENCE_ACTION_POLICY['publication.republish'].proofPolicy.kind)
      .toBe('clerk_reverification')
    expect(PACKAGE_3_CONSEQUENCE_ACTION_POLICY['publication.withdraw'].proofPolicy).toEqual({ kind: 'none' })
  })

  it('rejects actions outside the closed Package 3 policy before resolving authority', async () => {
    const setup = await harness()
    let resolverRuns = 0
    const resolver: ServerAuthorityResolutionPort = {
      resolveCanonicalBinding: async () => {
        resolverRuns += 1
        return setup.binding()
      },
    }

    await expect(createHttpAuthorityAdapter(setup.boundary, resolver).withCurrentAuthority({
      ...intent('unknown-policy'),
      consequence: {
        action: 'provider.generic_connect',
        target: {
          targetType: 'provider_connection',
          targetRef: 'connection:alpha',
          targetRevision: 1,
        },
        consequenceSummary: 'Connect an unsupported generic provider.',
        statusReadbackRef: '/owner/connections/connection:alpha',
        command: { provider: 'generic' },
      },
    } as never, async () => 'not-run')).rejects.toMatchObject({ code: 'authority_admission_invalid' })

    expect(resolverRuns).toBe(0)
  })

  it('snapshots the payload before awaiting authority and derives the final descriptor from admitted canonical authority', async () => {
    const setup = await harness()
    const command = {
      displayName: 'Research agent',
      expiresAt: 4_000,
      operationRefs: ['operation:alpha'],
    }
    const expectedPayloadDigest = sourceWriteCommandDigest(command)
    const reads = {
      action: 0,
      target: 0,
      consequenceSummary: 0,
      statusReadbackRef: 0,
      command: 0,
      targetType: 0,
      targetRef: 0,
      targetRevision: 0,
    }
    const consequence = {
      get action() {
        reads.action += 1
        return 'agent_access.create' as const
      },
      get target() {
        reads.target += 1
        return {
          get targetType() { reads.targetType += 1; return 'agent_access_grant' },
          get targetRef() { reads.targetRef += 1; return 'grant:pending:alpha' },
          get targetRevision() { reads.targetRevision += 1; return 1 },
        }
      },
      get consequenceSummary() {
        reads.consequenceSummary += 1
        return '  Create an Agent with access to one Operation.  '
      },
      get statusReadbackRef() {
        reads.statusReadbackRef += 1
        return '/owner/agent-access/grant:pending:alpha'
      },
      get command() {
        reads.command += 1
        return command
      },
    }
    const resolver: ServerAuthorityResolutionPort = {
      resolveCanonicalBinding: async () => {
        command.displayName = 'Attacker mutation'
        command.operationRefs[0] = 'operation:attacker'
        return setup.binding()
      },
    }

    const admission = await createHttpAuthorityAdapter(setup.boundary, resolver)
      .withCurrentAuthority({ ...intent('descriptor'), consequence }, async (current) => current)
    const expectedDigest = sourceWriteCommandDigest({
      version: 'ae.consequence-command:v1',
      action: 'agent_access.create',
      actionClass: 'authority_increase',
      confirmationFields: [
        'actor',
        'account',
        'target',
        'scope',
        'spending_limits',
        'expiry',
        'consequence',
        'recovery',
      ],
      actorPrincipalRef: admission.actorPrincipalRef,
      activeAccountRef: admission.activeAccountRef,
      accountRevision: admission.accountRevision,
      authoritySource: admission.authoritySource,
      target: {
        targetType: 'agent_access_grant',
        targetRef: 'grant:pending:alpha',
        targetRevision: 1,
      },
      requiredScopes: admission.requiredScopes,
      resourceRefs: admission.resourceRefs,
      budgetAmount: admission.budgetAmount,
      consequenceSummary: 'Create an Agent with access to one Operation.',
      recoveryClass: 'reversible_before_dispatch',
      statusReadbackRef: '/owner/agent-access/grant:pending:alpha',
      payloadDigest: expectedPayloadDigest,
    })

    expect(reads).toEqual({
      action: 1,
      target: 1,
      consequenceSummary: 1,
      statusReadbackRef: 1,
      command: 1,
      targetType: 1,
      targetRef: 1,
      targetRevision: 1,
    })
    expect(admission).toMatchObject({
      consequenceAction: 'agent_access.create',
      proofPolicy: {
        kind: 'clerk_reverification',
        preset: 'strict',
        uniquePerCommand: true,
      },
      descriptor: {
        actionClass: 'authority_increase',
        actorPrincipalRef: HUMAN,
        activeAccountRef: ACCOUNT,
        target: {
          targetType: 'agent_access_grant',
          targetRef: 'grant:pending:alpha',
          targetRevision: 1,
        },
        requiredScopes: ['operation:invoke'],
        resourceRefs: ['operation:alpha'],
        budgetAmount: 1,
        consequenceSummary: 'Create an Agent with access to one Operation.',
        recoveryClass: 'reversible_before_dispatch',
        statusReadbackRef: '/owner/agent-access/grant:pending:alpha',
        commandDigest: expectedDigest,
      },
    })
    expect(Object.isFrozen(admission.descriptor)).toBe(true)
    expect(Object.isFrozen(admission.descriptor?.target)).toBe(true)
    expect(Object.isFrozen(admission.descriptor?.requiredScopes)).toBe(true)
    expect(Object.isFrozen(admission.descriptor?.resourceRefs)).toBe(true)
    expect(Object.isFrozen(admission.proofPolicy)).toBe(true)
  })

  it('binds the final digest to every material canonical command and authority field', async () => {
    const baseOwnerBinding: AuthorityAccountOwnershipBinding = {
      principalClass: 'interactive',
      actorPrincipalRef: HUMAN,
      activeAccountRef: ACCOUNT,
      authoritySource: {
        kind: 'account_ownership',
        ownershipRef: ownershipRef('own_00000000000040008000000000000021'),
        ownershipRevision: 3,
        accountRevision: 17,
        admittedAt: 100,
        expiresAt: 200,
      },
    }
    const baseTarget = {
      targetType: 'agent_access_grant',
      targetRef: 'grant:pending:alpha',
      targetRevision: 1,
    }
    const ownerDigest = async (options: Readonly<{
      binding?: AuthorityAccountOwnershipBinding
      action?: 'agent_access.create' | 'agent_access.replace_credential'
      target?: typeof baseTarget
      requiredScopes?: readonly string[]
      resourceRefs?: readonly string[]
      budgetAmount?: number
      consequenceSummary?: string
      statusReadbackRef?: string
      command?: unknown
    }> = {}) => {
      const boundary = new ConsequenceAuthorityBoundary({
        admitConsequence: async () => { throw new Error('delegation_must_not_run_for_owner') },
      })
      const admission = await createHttpAuthorityAdapter(boundary, {
        resolveCanonicalBinding: async () => options.binding ?? baseOwnerBinding,
      }).withCurrentAuthority({
        requiredScopes: options.requiredScopes ?? ['operation:invoke'],
        resourceRefs: options.resourceRefs ?? ['operation:alpha'],
        budgetAmount: options.budgetAmount ?? 1,
        correlationRef: 'correlation:digest-envelope',
        idempotencyRef: 'idempotency:digest-envelope',
        consequence: {
          action: options.action ?? 'agent_access.create',
          target: options.target ?? baseTarget,
          consequenceSummary: options.consequenceSummary ?? 'Create one bounded Agent credential.',
          statusReadbackRef: options.statusReadbackRef ?? '/owner/agent-access/grant:pending:alpha',
          command: options.command ?? { displayName: 'Research agent', limits: { calls: 5, spend: 10 } },
        },
      }, async (current) => current)
      if (admission.descriptor === undefined) throw new Error('descriptor_missing')
      return admission.descriptor.commandDigest
    }
    const withOwnerBinding = (
      binding: Partial<Omit<AuthorityAccountOwnershipBinding, 'authoritySource'>> & Readonly<{
        authoritySource?: Partial<AuthorityAccountOwnershipBinding['authoritySource']>
      }>,
    ): AuthorityAccountOwnershipBinding => ({
      ...baseOwnerBinding,
      ...binding,
      authoritySource: {
        ...baseOwnerBinding.authoritySource,
        ...binding.authoritySource,
      },
    })

    const baseline = await ownerDigest()
    const changed = await Promise.all([
      ownerDigest({ binding: withOwnerBinding({ actorPrincipalRef: STRANGER }) }),
      ownerDigest({ binding: withOwnerBinding({ activeAccountRef: OTHER_ACCOUNT }) }),
      ownerDigest({ binding: withOwnerBinding({ authoritySource: { ownershipRef: ownershipRef('own_00000000000040008000000000000022') } }) }),
      ownerDigest({ binding: withOwnerBinding({ authoritySource: { ownershipRevision: 4 } }) }),
      ownerDigest({ binding: withOwnerBinding({ authoritySource: { accountRevision: 18 } }) }),
      ownerDigest({ target: { ...baseTarget, targetType: 'agent_credential' } }),
      ownerDigest({ target: { ...baseTarget, targetRef: 'grant:pending:beta' } }),
      ownerDigest({ target: { ...baseTarget, targetRevision: 2 } }),
      ownerDigest({ requiredScopes: ['agent:manage'] }),
      ownerDigest({ resourceRefs: ['operation:beta'] }),
      ownerDigest({ budgetAmount: 2 }),
      ownerDigest({ consequenceSummary: 'Replace one bounded Agent credential.' }),
      ownerDigest({ statusReadbackRef: '/owner/agent-access/grant:pending:beta' }),
      ownerDigest({ action: 'agent_access.replace_credential' }),
      ownerDigest({ command: { displayName: 'Different agent', limits: { calls: 5, spend: 10 } } }),
    ])
    for (const digest of changed) expect(digest).not.toBe(baseline)

    const orderedPayload = await ownerDigest({
      command: { displayName: 'Research agent', limits: { calls: 5, spend: 10 } },
    })
    const reorderedPayload = await ownerDigest({
      command: { limits: { spend: 10, calls: 5 }, displayName: 'Research agent' },
    })
    expect(reorderedPayload).toBe(orderedPayload)

    const setup = await harness()
    const delegatedDigest = async (options: Readonly<{
      grantRef?: DelegationGrantRef
      generation?: number
      snapshotRef?: ReturnType<typeof delegationSnapshotRef>
    }> = {}) => {
      const binding: AuthorityDelegationBinding = {
        ...setup.binding(),
        grantRef: options.grantRef ?? setup.humanGrant.grantRef,
        grantGeneration: options.generation ?? 1,
      }
      const boundary = new ConsequenceAuthorityBoundary({
        admitConsequence: async (request) => Object.freeze({
          snapshotRef: options.snapshotRef ?? delegationSnapshotRef('das_00000000000040008000000000000031'),
          grantRef: request.grantRef,
          generation: request.expectedGeneration,
          accountRef: request.context.activeAccountRef,
          accountRevision: 17,
          actorPrincipalRef: request.context.actorPrincipalRef,
          subjectPrincipalRef: request.context.actorPrincipalRef,
          scopes: Object.freeze([...request.requiredScopes]),
          resourceRefs: Object.freeze([...request.resourceRefs]),
          budgetAmount: request.budgetAmount,
          admittedAt: 100,
          expiresAt: 1_000,
          correlationRef: request.context.correlationRef,
          idempotencyRef: request.context.idempotencyRef,
          ancestry: Object.freeze([]),
        } satisfies DelegationAuthoritySnapshot),
      })
      const admission = await createHttpAuthorityAdapter(boundary, setup.resolver(binding))
        .withCurrentAuthority({
          ...intent('delegated-digest'),
          consequence: {
            action: 'agent_access.create',
            target: baseTarget,
            consequenceSummary: 'Create one bounded Agent credential.',
            statusReadbackRef: '/owner/agent-access/grant:pending:alpha',
            command: { displayName: 'Research agent', limits: { calls: 5, spend: 10 } },
          },
        }, async (current) => current)
      if (admission.descriptor === undefined) throw new Error('descriptor_missing')
      return admission.descriptor.commandDigest
    }

    const delegatedBaseline = await delegatedDigest()
    expect(await delegatedDigest({ generation: 2 })).not.toBe(delegatedBaseline)
    expect(await delegatedDigest({ grantRef: setup.workloadGrant.grantRef })).not.toBe(delegatedBaseline)
    expect(await delegatedDigest({
      snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000032'),
    })).not.toBe(delegatedBaseline)
    expect(delegatedBaseline).not.toBe(baseline)
  })

  it('admits a trusted Account ownership source without inventing a Delegation Grant', async () => {
    let delegationRuns = 0
    const boundary = new ConsequenceAuthorityBoundary({
      admitConsequence: async () => {
        delegationRuns += 1
        throw new Error('delegation_must_not_run_for_owner')
      },
    })
    const ownerBinding: AuthorityAccountOwnershipBinding = {
      principalClass: 'interactive',
      actorPrincipalRef: HUMAN,
      activeAccountRef: ACCOUNT,
      authoritySource: {
        kind: 'account_ownership',
        ownershipRef: ownershipRef('own_00000000000040008000000000000021'),
        ownershipRevision: 3,
        accountRevision: 17,
        admittedAt: 100,
        expiresAt: 200,
      },
    }
    const resolver: ServerAuthorityResolutionPort = {
      resolveCanonicalBinding: async () => ownerBinding,
    }

    const admission = await createHttpAuthorityAdapter(boundary, resolver)
      .withCurrentAuthority(intent('owner-source'), async (current) => current)

    expect(delegationRuns).toBe(0)
    expect(admission).toMatchObject({
      actorPrincipalRef: HUMAN,
      activeAccountRef: ACCOUNT,
      accountRevision: 17,
      admittedAt: 100,
      expiresAt: 200,
      authoritySource: {
        kind: 'account_ownership',
        ownershipRef: 'own_00000000000040008000000000000021',
        ownershipRevision: 3,
      },
    })
    expect('grantRef' in admission).toBe(false)
    expect('grantGeneration' in admission).toBe(false)
    expect('snapshotRef' in admission).toBe(false)
    expect(Object.isFrozen(admission)).toBe(true)
    expect(Object.isFrozen(admission.authoritySource)).toBe(true)
  })
})
