import {
  DELEGATION_MAX_SCOPES,
  DELEGATION_MAX_RESOURCES,
  DELEGATION_MAX_ANCESTRY_GRANTS,
  DelegationError,
  type DelegationGrant,
  type DelegationAuthoritySnapshot,
  type DelegationStore,
  type DelegationContextPort,
  type DelegationServiceOptions,
  type IssueRootGrantRequest,
  type DelegateGrantRequest,
  type AdmitConsequenceRequest,
  type RevokeGrantRequest
} from './contracts'
import {
  generateDelegationGrantRef,
  generateDelegationSnapshotRef,
  loadAncestry,
  assertDelegationEdgeIntegrity,
  assertLiveAncestry,
  assertResolvedContext,
  authorityValues,
  budget,
  currentTime,
  assertFutureExpiry,
  assertGeneration,
  assertSubset,
  freezeGrant,
  matchesRoot,
  matchesChild,
  matchesAdmission,
  parsePersistedDelegationGrant,
  reconstructPinnedDelegationSnapshotForReplay,
} from './persistence'

export * from './contracts'
export {
  delegationGrantRef,
  delegationSnapshotRef,
  generateDelegationGrantRef,
  generateDelegationSnapshotRef,
  parsePersistedDelegationGrant,
  reconstructPinnedDelegationSnapshotForReplay,
} from './persistence'

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
    const scopes = authorityValues(request.scopes, 'delegation_scope_invalid', DELEGATION_MAX_SCOPES)
    const resourceRefs = authorityValues(request.resourceRefs, 'delegation_resource_invalid', DELEGATION_MAX_RESOURCES)
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
        const parsed = parsePersistedDelegationGrant(existing)
        if (matchesRoot(parsed, request, scopes, resourceRefs)) return parsed
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
    const scopes = authorityValues(request.scopes, 'delegation_scope_invalid', DELEGATION_MAX_SCOPES)
    const resourceRefs = authorityValues(request.resourceRefs, 'delegation_resource_invalid', DELEGATION_MAX_RESOURCES)
    const budgetLimit = budget(request.budgetLimit, false)
    assertGeneration(request.parentGeneration)

    return await this.#store.transact(async (transaction) => {
      const admittedAt = currentTime(this.#now)
      assertFutureExpiry(request.expiresAt, admittedAt)
      const ancestry = await loadAncestry(transaction, request.parentGrantRef)
      if (ancestry.length >= DELEGATION_MAX_ANCESTRY_GRANTS) {
        throw new DelegationError('delegation_limit_exceeded')
      }
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
        const parsed = parsePersistedDelegationGrant(existing)
        assertDelegationEdgeIntegrity(parent, parsed)
        if (matchesChild(parsed, request, scopes, resourceRefs)) {
          return parsed
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
    const scopes = authorityValues(request.requiredScopes, 'delegation_scope_invalid', DELEGATION_MAX_SCOPES)
    const resourceRefs = authorityValues(request.resourceRefs, 'delegation_resource_invalid', DELEGATION_MAX_RESOURCES)
    const budgetAmount = budget(request.budgetAmount, true)
    assertGeneration(request.expectedGeneration)

    return await this.#store.transact(async (transaction) => {
      const existing = await transaction.getSnapshotByAdmissionIdempotency(
        activeContext.accountRef,
        activeContext.actorPrincipalRef,
        activeContext.idempotencyRef,
      )
      if (existing !== undefined) {
        const replay = reconstructPinnedDelegationSnapshotForReplay(existing, activeContext)
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
      const persisted = await transaction.getGrant(request.grantRef)
      if (persisted === undefined) throw new DelegationError('delegation_grant_not_found')
      const grant = parsePersistedDelegationGrant(persisted)
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
