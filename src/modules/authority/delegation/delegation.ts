import type {
  AccountActionContext,
  AccountRef,
  ActiveAccountContext,
} from '../../principal-account/account/public'
import type { PrincipalRef } from '../../principal-account/principal/public'

const GRANT_REF_PATTERN = /^grt_[0-9a-f]{32}$/u
const SNAPSHOT_REF_PATTERN = /^das_[0-9a-f]{32}$/u
const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u
const PRINCIPAL_REF_PATTERN = /^prn_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const AUTHORITY_VALUE_PATTERN = /^[A-Za-z0-9*][A-Za-z0-9._:/*-]{0,199}$/u

declare const delegationGrantRefBrand: unique symbol
declare const delegationSnapshotRefBrand: unique symbol

export type DelegationGrantRef = string & Readonly<{ [delegationGrantRefBrand]: 'DelegationGrantRef' }>
export type DelegationSnapshotRef = string & Readonly<{ [delegationSnapshotRefBrand]: 'DelegationSnapshotRef' }>

export type DelegationGrantLifecycle = 'active' | 'revoked'

export type DelegationGrant = Readonly<{
  grantRef: DelegationGrantRef
  accountRef: AccountRef
  actorPrincipalRef: PrincipalRef
  subjectPrincipalRef: PrincipalRef
  parentGrantRef?: DelegationGrantRef
  parentGeneration?: number
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetLimit: number
  budgetUsed: number
  expiresAt: number
  generation: number
  revision: number
  lifecycle: DelegationGrantLifecycle
  createdAt: number
  createdBy: AccountActionContext
  revokedAt?: number
  revokedBy?: AccountActionContext
}>

export type DelegationAuthorityAncestor = Readonly<{
  grantRef: DelegationGrantRef
  generation: number
  accountRef: AccountRef
  actorPrincipalRef: PrincipalRef
  subjectPrincipalRef: PrincipalRef
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetLimit: number
  budgetUsedBefore: number
  expiresAt: number
}>

export type DelegationAuthoritySnapshot = Readonly<{
  snapshotRef: DelegationSnapshotRef
  grantRef: DelegationGrantRef
  generation: number
  accountRef: AccountRef
  accountRevision: number
  actorPrincipalRef: PrincipalRef
  subjectPrincipalRef: PrincipalRef
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetAmount: number
  admittedAt: number
  expiresAt: number
  correlationRef: string
  idempotencyRef: string
  ancestry: readonly DelegationAuthorityAncestor[]
}>

export type DelegationGrantReplacement = Readonly<{
  value: DelegationGrant
  expectedRevision: number
}>

export type DelegationCommit = Readonly<{
  grantInsert?: DelegationGrant
  grantReplacements?: readonly DelegationGrantReplacement[]
  snapshotInsert?: DelegationAuthoritySnapshot
}>

export type DelegationTransaction = Readonly<{
  getGrant(grantRef: DelegationGrantRef): Promise<DelegationGrant | undefined>
  getGrantByCreationIdempotency(
    accountRef: AccountRef,
    actorPrincipalRef: PrincipalRef,
    idempotencyRef: string,
  ): Promise<DelegationGrant | undefined>
  getSnapshotByAdmissionIdempotency(
    accountRef: AccountRef,
    actorPrincipalRef: PrincipalRef,
    idempotencyRef: string,
  ): Promise<DelegationAuthoritySnapshot | undefined>
  getSnapshot(snapshotRef: DelegationSnapshotRef): Promise<DelegationAuthoritySnapshot | undefined>
  commit(change: DelegationCommit): Promise<void>
}>

export type DelegationStore = Readonly<{
  transact<Result>(operation: (transaction: DelegationTransaction) => Promise<Result>): Promise<Result>
}>

/**
 * Trusted adapter over the canonical Principal/Account registry. Request fields
 * are only selectors; this port establishes membership and root-issuer authority.
 */
export type DelegationContextPort = Readonly<{
  resolveActiveContext(context: AccountActionContext): Promise<ActiveAccountContext>
  resolveRootIssuerContext(context: AccountActionContext): Promise<ActiveAccountContext>
  requireActivePrincipal(principalRef: PrincipalRef): Promise<void>
}>

export type DelegationServiceOptions = Readonly<{
  now?: () => number
  randomUuid?: () => string
}>

export type DelegationErrorCode =
  | 'delegation_actor_mismatch'
  | 'delegation_ancestry_account_mismatch'
  | 'delegation_ancestry_cycle'
  | 'delegation_ancestry_generation_stale'
  | 'delegation_ancestry_invalid'
  | 'delegation_budget_denied'
  | 'delegation_budget_invalid'
  | 'delegation_budget_widened'
  | 'delegation_expired'
  | 'delegation_expiry_invalid'
  | 'delegation_expiry_not_strictly_narrower'
  | 'delegation_generation_stale'
  | 'delegation_grant_not_found'
  | 'delegation_grant_ref_conflict'
  | 'delegation_grant_ref_invalid'
  | 'delegation_idempotency_conflict'
  | 'delegation_request_invalid'
  | 'delegation_resource_denied'
  | 'delegation_resource_invalid'
  | 'delegation_resource_widened'
  | 'delegation_revoked'
  | 'delegation_scope_denied'
  | 'delegation_scope_invalid'
  | 'delegation_scope_widened'
  | 'delegation_snapshot_ref_conflict'
  | 'delegation_snapshot_ref_invalid'
  | 'delegation_snapshot_invalid'

export class DelegationError extends Error {
  readonly code: DelegationErrorCode

  constructor(code: DelegationErrorCode) {
    super(code)
    this.name = 'DelegationError'
    this.code = code
  }
}

export type IssueRootGrantRequest = Readonly<{
  context: AccountActionContext
  subjectPrincipalRef: PrincipalRef
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetLimit: number
  expiresAt: number
}>

export type DelegateGrantRequest = IssueRootGrantRequest & Readonly<{
  parentGrantRef: DelegationGrantRef
  parentGeneration: number
}>

export type AdmitConsequenceRequest = Readonly<{
  grantRef: DelegationGrantRef
  expectedGeneration: number
  context: AccountActionContext
  requiredScopes: readonly string[]
  resourceRefs: readonly string[]
  budgetAmount: number
}>

export type RevokeGrantRequest = Readonly<{
  grantRef: DelegationGrantRef
  expectedGeneration: number
  context: AccountActionContext
}>

export function delegationGrantRef(value: string): DelegationGrantRef {
  if (!GRANT_REF_PATTERN.test(value)) throw new DelegationError('delegation_grant_ref_invalid')
  return value as DelegationGrantRef
}

export function delegationSnapshotRef(value: string): DelegationSnapshotRef {
  if (!SNAPSHOT_REF_PATTERN.test(value)) throw new DelegationError('delegation_snapshot_ref_invalid')
  return value as DelegationSnapshotRef
}

export function generateDelegationGrantRef(randomUuid: () => string = () => crypto.randomUUID()): DelegationGrantRef {
  const value = randomUuid()
  if (!UUID_PATTERN.test(value)) throw new DelegationError('delegation_grant_ref_invalid')
  return delegationGrantRef(`grt_${value.replaceAll('-', '')}`)
}

export function generateDelegationSnapshotRef(randomUuid: () => string = () => crypto.randomUUID()): DelegationSnapshotRef {
  const value = randomUuid()
  if (!UUID_PATTERN.test(value)) throw new DelegationError('delegation_snapshot_ref_invalid')
  return delegationSnapshotRef(`das_${value.replaceAll('-', '')}`)
}

export class DelegationService {
  readonly #store: DelegationStore
  readonly #contexts: DelegationContextPort
  readonly #now: () => number
  readonly #randomUuid: () => string

  constructor(store: DelegationStore, contexts: DelegationContextPort, options: DelegationServiceOptions = {}) {
    this.#store = store
    this.#contexts = contexts
    this.#now = options.now ?? Date.now
    this.#randomUuid = options.randomUuid ?? (() => crypto.randomUUID())
  }

  async issueRoot(request: IssueRootGrantRequest): Promise<DelegationGrant> {
    const activeContext = await this.#contexts.resolveRootIssuerContext(request.context)
    await this.#contexts.requireActivePrincipal(request.subjectPrincipalRef)
    assertResolvedContext(request.context, activeContext)
    const scopes = authorityValues(request.scopes, 'delegation_scope_invalid')
    const resourceRefs = authorityValues(request.resourceRefs, 'delegation_resource_invalid')
    const budgetLimit = budget(request.budgetLimit, false)

    return await this.#store.transact(async (transaction) => {
      const admittedAt = currentTime(this.#now)
      assertFutureExpiry(request.expiresAt, admittedAt)
      const existing = await transaction.getGrantByCreationIdempotency(
        activeContext.accountRef,
        activeContext.actorPrincipalRef,
        activeContext.idempotencyRef,
      )
      if (existing !== undefined) {
        assertStoredGrantIntegrity(existing)
        if (matchesRoot(existing, request, scopes, resourceRefs)) return existing
        throw new DelegationError('delegation_idempotency_conflict')
      }
      const grantRef = generateDelegationGrantRef(this.#randomUuid)
      if (await transaction.getGrant(grantRef) !== undefined) {
        throw new DelegationError('delegation_grant_ref_conflict')
      }
      const grant = freezeGrant({
        grantRef,
        accountRef: activeContext.accountRef,
        actorPrincipalRef: activeContext.actorPrincipalRef,
        subjectPrincipalRef: request.subjectPrincipalRef,
        scopes,
        resourceRefs,
        budgetLimit,
        budgetUsed: 0,
        expiresAt: request.expiresAt,
        generation: 1,
        revision: 1,
        lifecycle: 'active',
        createdAt: admittedAt,
        createdBy: request.context,
      })
      await transaction.commit({ grantInsert: grant })
      return grant
    })
  }

  async delegate(request: DelegateGrantRequest): Promise<DelegationGrant> {
    const activeContext = await this.#contexts.resolveActiveContext(request.context)
    await this.#contexts.requireActivePrincipal(request.subjectPrincipalRef)
    assertResolvedContext(request.context, activeContext)
    const scopes = authorityValues(request.scopes, 'delegation_scope_invalid')
    const resourceRefs = authorityValues(request.resourceRefs, 'delegation_resource_invalid')
    const budgetLimit = budget(request.budgetLimit, false)
    assertGeneration(request.parentGeneration)

    return await this.#store.transact(async (transaction) => {
      const admittedAt = currentTime(this.#now)
      assertFutureExpiry(request.expiresAt, admittedAt)
      const ancestry = await loadAncestry(transaction, request.parentGrantRef)
      const parent = ancestry[ancestry.length - 1] as DelegationGrant
      assertLiveAncestry(ancestry, admittedAt)
      if (parent.generation !== request.parentGeneration) {
        throw new DelegationError('delegation_generation_stale')
      }
      if (parent.accountRef !== activeContext.accountRef) {
        throw new DelegationError('delegation_ancestry_account_mismatch')
      }
      if (parent.subjectPrincipalRef !== activeContext.actorPrincipalRef) {
        throw new DelegationError('delegation_actor_mismatch')
      }
      for (const ancestor of ancestry) {
        assertSubset(scopes, ancestor.scopes, 'delegation_scope_widened')
        assertSubset(resourceRefs, ancestor.resourceRefs, 'delegation_resource_widened')
        if (budgetLimit > ancestor.budgetLimit) throw new DelegationError('delegation_budget_widened')
        if (request.expiresAt >= ancestor.expiresAt) {
          throw new DelegationError('delegation_expiry_not_strictly_narrower')
        }
      }
      const existing = await transaction.getGrantByCreationIdempotency(
        activeContext.accountRef,
        activeContext.actorPrincipalRef,
        activeContext.idempotencyRef,
      )
      if (existing !== undefined) {
        assertStoredGrantIntegrity(existing)
        assertDelegationEdgeIntegrity(parent, existing)
        if (matchesChild(existing, request, scopes, resourceRefs)) {
          return existing
        }
        throw new DelegationError('delegation_idempotency_conflict')
      }
      const grantRef = generateDelegationGrantRef(this.#randomUuid)
      if (ancestry.some((ancestor) => ancestor.grantRef === grantRef)
        || await transaction.getGrant(grantRef) !== undefined) {
        throw new DelegationError('delegation_grant_ref_conflict')
      }
      const grant = freezeGrant({
        grantRef,
        accountRef: parent.accountRef,
        actorPrincipalRef: activeContext.actorPrincipalRef,
        subjectPrincipalRef: request.subjectPrincipalRef,
        parentGrantRef: parent.grantRef,
        parentGeneration: parent.generation,
        scopes,
        resourceRefs,
        budgetLimit,
        budgetUsed: 0,
        expiresAt: request.expiresAt,
        generation: 1,
        revision: 1,
        lifecycle: 'active',
        createdAt: admittedAt,
        createdBy: request.context,
      })
      await transaction.commit({ grantInsert: grant })
      return grant
    })
  }

  async admitConsequence(request: AdmitConsequenceRequest): Promise<DelegationAuthoritySnapshot> {
    const activeContext = await this.#contexts.resolveActiveContext(request.context)
    assertResolvedContext(request.context, activeContext)
    const scopes = authorityValues(request.requiredScopes, 'delegation_scope_invalid')
    const resourceRefs = authorityValues(request.resourceRefs, 'delegation_resource_invalid')
    const budgetAmount = budget(request.budgetAmount, true)
    assertGeneration(request.expectedGeneration)

    return await this.#store.transact(async (transaction) => {
      const existing = await transaction.getSnapshotByAdmissionIdempotency(
        activeContext.accountRef,
        activeContext.actorPrincipalRef,
        activeContext.idempotencyRef,
      )
      if (existing !== undefined) {
        const replay = reconstructPersistedSnapshot(existing, activeContext)
        if (matchesAdmission(replay, request, scopes, resourceRefs)) return replay
        throw new DelegationError('delegation_idempotency_conflict')
      }
      const ancestry = await loadAncestry(transaction, request.grantRef)
      const grant = ancestry[ancestry.length - 1] as DelegationGrant
      const admittedAt = currentTime(this.#now)
      assertLiveAncestry(ancestry, admittedAt)
      if (grant.generation !== request.expectedGeneration) {
        throw new DelegationError('delegation_generation_stale')
      }
      if (grant.accountRef !== activeContext.accountRef) {
        throw new DelegationError('delegation_ancestry_account_mismatch')
      }
      if (grant.subjectPrincipalRef !== activeContext.actorPrincipalRef) {
        throw new DelegationError('delegation_actor_mismatch')
      }
      for (const ancestor of ancestry) {
        assertSubset(scopes, ancestor.scopes, 'delegation_scope_denied')
        assertSubset(resourceRefs, ancestor.resourceRefs, 'delegation_resource_denied')
        if (ancestor.budgetUsed + budgetAmount > ancestor.budgetLimit) {
          throw new DelegationError('delegation_budget_denied')
        }
      }
      const ancestrySnapshot = ancestry.map((ancestor) => Object.freeze({
        grantRef: ancestor.grantRef,
        generation: ancestor.generation,
        accountRef: ancestor.accountRef,
        actorPrincipalRef: ancestor.actorPrincipalRef,
        subjectPrincipalRef: ancestor.subjectPrincipalRef,
        scopes: ancestor.scopes,
        resourceRefs: ancestor.resourceRefs,
        budgetLimit: ancestor.budgetLimit,
        budgetUsedBefore: ancestor.budgetUsed,
        expiresAt: ancestor.expiresAt,
      }))
      const snapshotRef = generateDelegationSnapshotRef(this.#randomUuid)
      const snapshot = Object.freeze({
        snapshotRef,
        grantRef: grant.grantRef,
        generation: grant.generation,
        accountRef: grant.accountRef,
        accountRevision: activeContext.accountRevision,
        actorPrincipalRef: activeContext.actorPrincipalRef,
        subjectPrincipalRef: grant.subjectPrincipalRef,
        scopes,
        resourceRefs,
        budgetAmount,
        admittedAt,
        expiresAt: Math.min(...ancestry.map((ancestor) => ancestor.expiresAt)),
        correlationRef: activeContext.correlationRef,
        idempotencyRef: activeContext.idempotencyRef,
        ancestry: Object.freeze(ancestrySnapshot),
      } satisfies DelegationAuthoritySnapshot)
      if (await transaction.getSnapshot(snapshotRef) !== undefined) {
        throw new DelegationError('delegation_snapshot_ref_conflict')
      }
      const replacements = ancestry.map((ancestor) => ({
        expectedRevision: ancestor.revision,
        value: freezeGrant({
          ...ancestor,
          budgetUsed: ancestor.budgetUsed + budgetAmount,
          revision: ancestor.revision + 1,
        }),
      }))
      await transaction.commit({ grantReplacements: replacements, snapshotInsert: snapshot })
      return snapshot
    })
  }

  async revoke(request: RevokeGrantRequest): Promise<DelegationGrant> {
    const activeContext = await this.#contexts.resolveActiveContext(request.context)
    assertResolvedContext(request.context, activeContext)
    assertGeneration(request.expectedGeneration)
    return await this.#store.transact(async (transaction) => {
      const grant = await transaction.getGrant(request.grantRef)
      if (grant === undefined) throw new DelegationError('delegation_grant_not_found')
      const revokedAt = currentTime(this.#now)
      if (grant.accountRef !== activeContext.accountRef) {
        throw new DelegationError('delegation_ancestry_account_mismatch')
      }
      if (grant.generation !== request.expectedGeneration) {
        throw new DelegationError('delegation_generation_stale')
      }
      if (grant.lifecycle === 'revoked') throw new DelegationError('delegation_revoked')
      if (activeContext.actorPrincipalRef !== grant.subjectPrincipalRef
        && activeContext.actorPrincipalRef !== grant.actorPrincipalRef) {
        throw new DelegationError('delegation_actor_mismatch')
      }
      const revoked = freezeGrant({
        ...grant,
        lifecycle: 'revoked',
        generation: grant.generation + 1,
        revision: grant.revision + 1,
        revokedAt,
        revokedBy: request.context,
      })
      await transaction.commit({
        grantReplacements: [{ value: revoked, expectedRevision: grant.revision }],
      })
      return revoked
    })
  }
}

async function loadAncestry(
  transaction: DelegationTransaction,
  leafRef: DelegationGrantRef,
): Promise<readonly DelegationGrant[]> {
  const reverse: DelegationGrant[] = []
  const visited = new Set<DelegationGrantRef>()
  let nextRef: DelegationGrantRef | undefined = leafRef
  let child: DelegationGrant | undefined
  while (nextRef !== undefined) {
    if (visited.has(nextRef)) throw new DelegationError('delegation_ancestry_cycle')
    visited.add(nextRef)
    const grant = await transaction.getGrant(nextRef)
    if (grant === undefined) throw new DelegationError('delegation_grant_not_found')
    assertStoredGrantIntegrity(grant)
    if (child !== undefined) {
      if (child.accountRef !== grant.accountRef) {
        throw new DelegationError('delegation_ancestry_account_mismatch')
      }
      if (child.parentGeneration !== grant.generation) {
        throw new DelegationError('delegation_ancestry_generation_stale')
      }
      assertDelegationEdgeIntegrity(grant, child)
    }
    reverse.push(grant)
    child = grant
    nextRef = grant.parentGrantRef
  }
  return Object.freeze(reverse.reverse())
}

function assertStoredGrantIntegrity(grant: DelegationGrant): void {
  if (!isRecord(grant)) throw new DelegationError('delegation_ancestry_invalid')
  const hasParentRef = grant.parentGrantRef !== undefined
  const hasParentGeneration = grant.parentGeneration !== undefined
  const createdBy = persistedActionContext(grant.createdBy)
  if (createdBy === undefined) throw new DelegationError('delegation_ancestry_invalid')
  if (createdBy.activeAccountRef !== grant.accountRef) {
    throw new DelegationError('delegation_ancestry_account_mismatch')
  }
  if (!GRANT_REF_PATTERN.test(grant.grantRef)
    || !ACCOUNT_REF_PATTERN.test(grant.accountRef)
    || !PRINCIPAL_REF_PATTERN.test(grant.actorPrincipalRef)
    || !PRINCIPAL_REF_PATTERN.test(grant.subjectPrincipalRef)
    || !isCanonicalAuthorityValues(grant.scopes)
    || !isCanonicalAuthorityValues(grant.resourceRefs)
    || !Number.isSafeInteger(grant.budgetLimit)
    || grant.budgetLimit < 1
    || !Number.isSafeInteger(grant.budgetUsed)
    || grant.budgetUsed < 0
    || grant.budgetUsed > grant.budgetLimit
    || !Number.isSafeInteger(grant.createdAt)
    || grant.createdAt < 0
    || !Number.isSafeInteger(grant.expiresAt)
    || grant.expiresAt <= grant.createdAt
    || !Number.isSafeInteger(grant.generation)
    || grant.generation < 1
    || !Number.isSafeInteger(grant.revision)
    || grant.revision < grant.generation
    || createdBy.actorPrincipalRef !== grant.actorPrincipalRef
    || hasParentRef !== hasParentGeneration) {
    throw new DelegationError('delegation_ancestry_invalid')
  }

  if (grant.lifecycle === 'active') {
    if (grant.revokedAt !== undefined || grant.revokedBy !== undefined) {
      throw new DelegationError('delegation_ancestry_invalid')
    }
    return
  }
  const revokedBy = persistedActionContext(grant.revokedBy)
  if (grant.lifecycle !== 'revoked'
    || grant.generation < 2
    || revokedBy === undefined
    || revokedBy.activeAccountRef !== grant.accountRef
    || (revokedBy.actorPrincipalRef !== grant.actorPrincipalRef
      && revokedBy.actorPrincipalRef !== grant.subjectPrincipalRef)) {
    throw new DelegationError('delegation_ancestry_invalid')
  }
  const revokedAt = grant.revokedAt
  if (typeof revokedAt !== 'number'
    || !Number.isSafeInteger(revokedAt)
    || revokedAt < grant.createdAt) {
    throw new DelegationError('delegation_ancestry_invalid')
  }
}

function assertDelegationEdgeIntegrity(parent: DelegationGrant, child: DelegationGrant): void {
  if (child.actorPrincipalRef !== parent.subjectPrincipalRef
    || child.createdAt < parent.createdAt
    || !isSubset(child.scopes, parent.scopes)
    || !isSubset(child.resourceRefs, parent.resourceRefs)
    || child.budgetLimit > parent.budgetLimit
    || child.expiresAt >= parent.expiresAt) {
    throw new DelegationError('delegation_ancestry_invalid')
  }
}

function reconstructPersistedSnapshot(
  snapshot: DelegationAuthoritySnapshot,
  context: ActiveAccountContext,
): DelegationAuthoritySnapshot {
  if (!isRecord(snapshot)
    || !SNAPSHOT_REF_PATTERN.test(snapshot.snapshotRef)
    || !GRANT_REF_PATTERN.test(snapshot.grantRef)
    || !ACCOUNT_REF_PATTERN.test(snapshot.accountRef)
    || !PRINCIPAL_REF_PATTERN.test(snapshot.actorPrincipalRef)
    || !PRINCIPAL_REF_PATTERN.test(snapshot.subjectPrincipalRef)
    || !Number.isSafeInteger(snapshot.accountRevision)
    || snapshot.accountRevision < 1
    || !Number.isSafeInteger(snapshot.generation)
    || snapshot.generation < 1
    || !isCanonicalAuthorityValues(snapshot.scopes)
    || !isCanonicalAuthorityValues(snapshot.resourceRefs)
    || !Number.isSafeInteger(snapshot.budgetAmount)
    || snapshot.budgetAmount < 0
    || !Number.isSafeInteger(snapshot.admittedAt)
    || snapshot.admittedAt < 0
    || !Number.isSafeInteger(snapshot.expiresAt)
    || snapshot.expiresAt <= snapshot.admittedAt
    || !AUTHORITY_VALUE_PATTERN.test(snapshot.correlationRef)
    || !AUTHORITY_VALUE_PATTERN.test(snapshot.idempotencyRef)
    || snapshot.accountRef !== context.accountRef
    || snapshot.actorPrincipalRef !== context.actorPrincipalRef
    || snapshot.correlationRef !== context.correlationRef
    || snapshot.idempotencyRef !== context.idempotencyRef
    || !Array.isArray(snapshot.ancestry)
    || snapshot.ancestry.length === 0) {
    throw new DelegationError('delegation_snapshot_invalid')
  }

  const seen = new Set<DelegationGrantRef>()
  const ancestry: DelegationAuthorityAncestor[] = []
  for (const persisted of snapshot.ancestry) {
    const parent = ancestry[ancestry.length - 1]
    if (!isRecord(persisted)
      || !GRANT_REF_PATTERN.test(persisted.grantRef)
      || !Number.isSafeInteger(persisted.generation)
      || persisted.generation < 1
      || !ACCOUNT_REF_PATTERN.test(persisted.accountRef)
      || persisted.accountRef !== snapshot.accountRef
      || !PRINCIPAL_REF_PATTERN.test(persisted.actorPrincipalRef)
      || !PRINCIPAL_REF_PATTERN.test(persisted.subjectPrincipalRef)
      || !isCanonicalAuthorityValues(persisted.scopes)
      || !isCanonicalAuthorityValues(persisted.resourceRefs)
      || !isSubset(snapshot.scopes, persisted.scopes)
      || !isSubset(snapshot.resourceRefs, persisted.resourceRefs)
      || !Number.isSafeInteger(persisted.budgetLimit)
      || persisted.budgetLimit < 1
      || !Number.isSafeInteger(persisted.budgetUsedBefore)
      || persisted.budgetUsedBefore < 0
      || persisted.budgetUsedBefore + snapshot.budgetAmount > persisted.budgetLimit
      || !Number.isSafeInteger(persisted.expiresAt)
      || persisted.expiresAt <= snapshot.admittedAt
      || seen.has(persisted.grantRef)
      || (parent !== undefined && persisted.actorPrincipalRef !== parent.subjectPrincipalRef)
      || (parent !== undefined && !isSubset(persisted.scopes, parent.scopes))
      || (parent !== undefined && !isSubset(persisted.resourceRefs, parent.resourceRefs))
      || (parent !== undefined && persisted.budgetLimit > parent.budgetLimit)
      || (parent !== undefined && persisted.expiresAt >= parent.expiresAt)) {
      throw new DelegationError('delegation_snapshot_invalid')
    }
    seen.add(persisted.grantRef)
    ancestry.push(Object.freeze({
      grantRef: persisted.grantRef,
      generation: persisted.generation,
      accountRef: persisted.accountRef,
      actorPrincipalRef: persisted.actorPrincipalRef,
      subjectPrincipalRef: persisted.subjectPrincipalRef,
      scopes: Object.freeze([...persisted.scopes]),
      resourceRefs: Object.freeze([...persisted.resourceRefs]),
      budgetLimit: persisted.budgetLimit,
      budgetUsedBefore: persisted.budgetUsedBefore,
      expiresAt: persisted.expiresAt,
    }))
  }

  const leaf = ancestry[ancestry.length - 1] as DelegationAuthorityAncestor
  if (leaf.grantRef !== snapshot.grantRef
    || leaf.generation !== snapshot.generation
    || leaf.subjectPrincipalRef !== snapshot.subjectPrincipalRef
    || leaf.subjectPrincipalRef !== snapshot.actorPrincipalRef
    || snapshot.expiresAt !== Math.min(...ancestry.map((ancestor) => ancestor.expiresAt))) {
    throw new DelegationError('delegation_snapshot_invalid')
  }

  return Object.freeze({
    snapshotRef: snapshot.snapshotRef,
    grantRef: snapshot.grantRef,
    generation: snapshot.generation,
    accountRef: snapshot.accountRef,
    accountRevision: snapshot.accountRevision,
    actorPrincipalRef: snapshot.actorPrincipalRef,
    subjectPrincipalRef: snapshot.subjectPrincipalRef,
    scopes: Object.freeze([...snapshot.scopes]),
    resourceRefs: Object.freeze([...snapshot.resourceRefs]),
    budgetAmount: snapshot.budgetAmount,
    admittedAt: snapshot.admittedAt,
    expiresAt: snapshot.expiresAt,
    correlationRef: snapshot.correlationRef,
    idempotencyRef: snapshot.idempotencyRef,
    ancestry: Object.freeze(ancestry),
  })
}

function isRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

function persistedActionContext(value: unknown): AccountActionContext | undefined {
  if (!isRecord(value)) return undefined
  const record = value as Readonly<Record<string, unknown>>
  if (typeof record.actorPrincipalRef !== 'string'
    || !PRINCIPAL_REF_PATTERN.test(record.actorPrincipalRef)
    || typeof record.activeAccountRef !== 'string'
    || !ACCOUNT_REF_PATTERN.test(record.activeAccountRef)
    || typeof record.correlationRef !== 'string'
    || !AUTHORITY_VALUE_PATTERN.test(record.correlationRef)
    || typeof record.idempotencyRef !== 'string'
    || !AUTHORITY_VALUE_PATTERN.test(record.idempotencyRef)) {
    return undefined
  }
  return {
    actorPrincipalRef: record.actorPrincipalRef as PrincipalRef,
    activeAccountRef: record.activeAccountRef as AccountRef,
    correlationRef: record.correlationRef,
    idempotencyRef: record.idempotencyRef,
  }
}

function isCanonicalAuthorityValues(values: readonly string[]): boolean {
  return Array.isArray(values)
    && values.length > 0
    && values.every((value) => typeof value === 'string' && AUTHORITY_VALUE_PATTERN.test(value))
    && new Set(values).size === values.length
    && values.every((value, index) => index === 0 || values[index - 1]! < value)
}

function isSubset(requested: readonly string[], permitted: readonly string[]): boolean {
  if (permitted.includes('*')) return true
  const permittedSet = new Set(permitted)
  return requested.every((value) => permittedSet.has(value))
}

function assertLiveAncestry(ancestry: readonly DelegationGrant[], now: number): void {
  for (const grant of ancestry) {
    if (grant.lifecycle !== 'active') throw new DelegationError('delegation_revoked')
    if (now >= grant.expiresAt) throw new DelegationError('delegation_expired')
  }
}

function assertResolvedContext(request: AccountActionContext, resolved: ActiveAccountContext): void {
  if (request.actorPrincipalRef !== resolved.actorPrincipalRef
    || request.activeAccountRef !== resolved.accountRef
    || request.correlationRef !== resolved.correlationRef
    || request.idempotencyRef !== resolved.idempotencyRef) {
    throw new DelegationError('delegation_request_invalid')
  }
}

function authorityValues(values: readonly string[], code: 'delegation_scope_invalid' | 'delegation_resource_invalid'): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) throw new DelegationError(code)
  const normalized = values.map((value) => {
    if (typeof value !== 'string' || !AUTHORITY_VALUE_PATTERN.test(value)) throw new DelegationError(code)
    return value
  })
  if (new Set(normalized).size !== normalized.length) throw new DelegationError(code)
  return Object.freeze([...normalized].sort())
}

function budget(value: number, allowZero: boolean): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new DelegationError('delegation_budget_invalid')
  }
  return value
}

function currentTime(now: () => number): number {
  const value = now()
  if (!Number.isSafeInteger(value) || value < 0) throw new DelegationError('delegation_request_invalid')
  return value
}

function assertFutureExpiry(expiresAt: number, now: number): void {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    throw new DelegationError('delegation_expiry_invalid')
  }
}

function assertGeneration(generation: number): void {
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new DelegationError('delegation_generation_stale')
  }
}

function assertSubset(
  requested: readonly string[],
  permitted: readonly string[],
  code: 'delegation_scope_widened' | 'delegation_resource_widened' | 'delegation_scope_denied' | 'delegation_resource_denied',
): void {
  if (!isSubset(requested, permitted)) throw new DelegationError(code)
}

function freezeContext(context: AccountActionContext): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: context.actorPrincipalRef,
    activeAccountRef: context.activeAccountRef,
    correlationRef: context.correlationRef,
    idempotencyRef: context.idempotencyRef,
  })
}

function freezeGrant(grant: DelegationGrant): DelegationGrant {
  return Object.freeze({
    ...grant,
    scopes: Object.freeze([...grant.scopes]),
    resourceRefs: Object.freeze([...grant.resourceRefs]),
    createdBy: freezeContext(grant.createdBy),
    ...(grant.revokedBy === undefined ? {} : { revokedBy: freezeContext(grant.revokedBy) }),
  })
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function matchesRoot(
  grant: DelegationGrant,
  request: IssueRootGrantRequest,
  scopes: readonly string[],
  resourceRefs: readonly string[],
): boolean {
  return grant.parentGrantRef === undefined
    && grant.subjectPrincipalRef === request.subjectPrincipalRef
    && sameValues(grant.scopes, scopes)
    && sameValues(grant.resourceRefs, resourceRefs)
    && grant.budgetLimit === request.budgetLimit
    && grant.expiresAt === request.expiresAt
}

function matchesChild(
  grant: DelegationGrant,
  request: DelegateGrantRequest,
  scopes: readonly string[],
  resourceRefs: readonly string[],
): boolean {
  return grant.parentGrantRef === request.parentGrantRef
    && grant.parentGeneration === request.parentGeneration
    && grant.subjectPrincipalRef === request.subjectPrincipalRef
    && sameValues(grant.scopes, scopes)
    && sameValues(grant.resourceRefs, resourceRefs)
    && grant.budgetLimit === request.budgetLimit
    && grant.expiresAt === request.expiresAt
}

function matchesAdmission(
  snapshot: DelegationAuthoritySnapshot,
  request: AdmitConsequenceRequest,
  scopes: readonly string[],
  resourceRefs: readonly string[],
): boolean {
  return snapshot.grantRef === request.grantRef
    && snapshot.generation === request.expectedGeneration
    && sameValues(snapshot.scopes, scopes)
    && sameValues(snapshot.resourceRefs, resourceRefs)
    && snapshot.budgetAmount === request.budgetAmount
}
