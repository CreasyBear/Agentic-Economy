import { expect } from 'vitest'

import {
  DelegationService,
  type DelegationAuthoritySnapshot,
  type DelegationContextPort,
  type DelegationGrant,
  type DelegationGrantRef,
  type DelegationSnapshotRef,
  type DelegationStore,
  type DelegationCommit,
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

export const ACCOUNT = accountRef('acc_00000000000040008000000000000001')
export const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000002')
export const OWNER = principalRef('prn_00000000000040008000000000000001')
export const AGENT = principalRef('prn_00000000000040008000000000000002')
export const WORKLOAD = principalRef('prn_00000000000040008000000000000003')
export const STRANGER = principalRef('prn_00000000000040008000000000000004')

export const uuid = (suffix: number): string => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

export class MemoryDelegationStore implements DelegationStore {
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

export type Setup = Readonly<{
  service: DelegationService
  store: MemoryDelegationStore
  setNow(value: number): void
  context(actor: PrincipalRef, suffix: string, account?: AccountRef): AccountActionContext
  active: Set<PrincipalRef>
}>

export function setup(options: Readonly<{
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

export async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'DelegationError', code, message: code })
}

export type IssueRootInput = Readonly<{
  context: AccountActionContext
  subjectPrincipalRef: PrincipalRef
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetLimit: number
  expiresAt: number
}>

export function issueRootRequest(
  fixture: Setup,
  suffix: string,
  overrides: Partial<Omit<IssueRootInput, 'context'>> & { actor?: PrincipalRef; account?: AccountRef } = {},
): IssueRootInput {
  const { actor = OWNER, account, ...rest } = overrides
  return {
    context: fixture.context(actor, suffix, account),
    subjectPrincipalRef: OWNER,
    scopes: ['read'],
    resourceRefs: ['r'],
    budgetLimit: 1,
    expiresAt: 200,
    ...rest,
  }
}

export async function root(fixture: Setup, suffix = 'root'): Promise<DelegationGrant> {
  return await fixture.service.issueRoot({
    context: fixture.context(OWNER, suffix),
    subjectPrincipalRef: OWNER,
    scopes: ['write', 'read'],
    resourceRefs: ['resource:b', 'resource:a'],
    budgetLimit: 1_000,
    expiresAt: 1_000,
  })
}

export type DelegateInput = Readonly<{
  parentGrantRef: DelegationGrantRef
  parentGeneration: number
  context: AccountActionContext
  subjectPrincipalRef: PrincipalRef
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetLimit: number
  expiresAt: number
}>

export function delegateRequest(
  fixture: Setup,
  parent: DelegationGrant,
  suffix: string,
  overrides: Partial<Omit<DelegateInput, 'parentGrantRef' | 'context'>> & {
    actor?: PrincipalRef
    account?: AccountRef
  } = {},
): DelegateInput {
  const {
    actor = parent.subjectPrincipalRef,
    account,
    parentGeneration = parent.generation,
    subjectPrincipalRef = AGENT,
    scopes = ['read'],
    resourceRefs = ['resource:a'],
    budgetLimit = 500,
    expiresAt = 900,
    ...rest
  } = overrides
  return {
    parentGrantRef: parent.grantRef,
    parentGeneration,
    context: fixture.context(actor, suffix, account),
    subjectPrincipalRef,
    scopes,
    resourceRefs,
    budgetLimit,
    expiresAt,
    ...rest,
  }
}

export async function child(fixture: Setup, parent: DelegationGrant, suffix = 'child'): Promise<DelegationGrant> {
  return await fixture.service.delegate(delegateRequest(fixture, parent, suffix))
}

export async function delegateTo(
  fixture: Setup,
  parent: DelegationGrant,
  suffix: string,
  overrides?: Parameters<typeof delegateRequest>[3],
): Promise<DelegationGrant> {
  return await fixture.service.delegate(delegateRequest(fixture, parent, suffix, overrides))
}

export async function expectDelegateCode(
  fixture: Setup,
  parent: DelegationGrant,
  suffix: string,
  code: string,
  overrides?: Parameters<typeof delegateRequest>[3],
): Promise<void> {
  await expectCode(fixture.service.delegate(delegateRequest(fixture, parent, suffix, overrides)), code)
}

export type AdmitInput = Readonly<{
  grantRef: DelegationGrantRef
  expectedGeneration: number
  context: AccountActionContext
  requiredScopes: readonly string[]
  resourceRefs: readonly string[]
  budgetAmount: number
}>

export function admitRequest(
  fixture: Setup,
  grant: DelegationGrant,
  suffix: string,
  overrides: Partial<Omit<AdmitInput, 'grantRef' | 'context'>> & { actor?: PrincipalRef } = {},
): AdmitInput {
  const {
    actor = grant.subjectPrincipalRef,
    expectedGeneration = grant.generation,
    requiredScopes = ['read'],
    resourceRefs = ['resource:a'],
    budgetAmount = 0,
    ...rest
  } = overrides
  return {
    grantRef: grant.grantRef,
    expectedGeneration,
    context: fixture.context(actor, suffix),
    requiredScopes,
    resourceRefs,
    budgetAmount,
    ...rest,
  }
}

export async function admit(
  fixture: Setup,
  grant: DelegationGrant,
  suffix: string,
  overrides?: Parameters<typeof admitRequest>[3],
): Promise<DelegationAuthoritySnapshot> {
  return await fixture.service.admitConsequence(admitRequest(fixture, grant, suffix, overrides))
}

export async function expectAdmitCode(
  fixture: Setup,
  grant: DelegationGrant,
  suffix: string,
  code: string,
  overrides?: Parameters<typeof admitRequest>[3],
): Promise<void> {
  await expectCode(fixture.service.admitConsequence(admitRequest(fixture, grant, suffix, overrides)), code)
}

export function patchGrant(
  fixture: Setup,
  grantRef: DelegationGrantRef,
  mutate: (grant: DelegationGrant) => DelegationGrant,
): void {
  const current = fixture.store.grants.get(grantRef)!
  fixture.store.grants.set(grantRef, Object.freeze(mutate(current)))
}

export async function rootChild(
  fixture: Setup,
  rootSuffix = 'root',
  childSuffix = 'child',
): Promise<Readonly<{ issued: DelegationGrant; delegated: DelegationGrant }>> {
  const issued = await root(fixture, rootSuffix)
  const delegated = await child(fixture, issued, childSuffix)
  return { issued, delegated }
}

export function activeReplayContext(
  fixture: Setup,
  request: AdmitInput,
  actor: PrincipalRef = AGENT,
): ActiveAccountContext {
  return {
    accountRef: ACCOUNT,
    actorPrincipalRef: actor,
    accountRevision: 9,
    correlationRef: request.context.correlationRef,
    idempotencyRef: request.context.idempotencyRef,
  }
}

export function indexedList(prefix: 'scope' | 'resource', length: number): readonly string[] {
  return Object.freeze(Array.from({ length }, (_, index) => `${prefix}:${String(index).padStart(2, '0')}`))
}

export async function expectCorruptChildAdmit(
  fixture: Setup,
  suffix: string,
  mutate: (grant: DelegationGrant) => DelegationGrant,
  code = 'delegation_ancestry_invalid',
): Promise<void> {
  const { delegated } = await rootChild(fixture)
  patchGrant(fixture, delegated.grantRef, mutate)
  await expectAdmitCode(fixture, delegated, suffix, code)
}

export async function rejectSnapshotReplay(
  fixture: Setup,
  snapshot: DelegationAuthoritySnapshot,
  request: AdmitInput,
  corrupt: DelegationAuthoritySnapshot,
  code = 'delegation_snapshot_invalid',
): Promise<void> {
  fixture.store.snapshots.set(snapshot.snapshotRef, Object.freeze(corrupt))
  await expectCode(fixture.service.admitConsequence(request), code)
}

export function mapAncestry(
  snapshot: DelegationAuthoritySnapshot,
  mutateAt: (index: number, ancestor: DelegationAuthoritySnapshot['ancestry'][number]) => DelegationAuthoritySnapshot['ancestry'][number],
): DelegationAuthoritySnapshot['ancestry'] {
  return Object.freeze(snapshot.ancestry.map((ancestor, index) => Object.freeze(mutateAt(index, ancestor))))
}
