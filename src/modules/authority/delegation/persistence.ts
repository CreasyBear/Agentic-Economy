import type {
  AccountActionContext,
  AccountRef,
  ActiveAccountContext,
} from '../../principal-account/account/public'
import type { PrincipalRef } from '../../principal-account/principal/public'

import {
  DELEGATION_MAX_SCOPES,
  DELEGATION_MAX_RESOURCES,
  DELEGATION_MAX_ANCESTRY_GRANTS,
  DelegationError,
  type DelegationGrantRef,
  type DelegationSnapshotRef,
  type DelegationGrant,
  type DelegationAuthorityAncestor,
  type DelegationAuthoritySnapshot,
  type DelegationTransaction,
  type IssueRootGrantRequest,
  type DelegateGrantRequest,
  type AdmitConsequenceRequest,
} from './contracts'

const GRANT_REF_PATTERN = /^grt_[0-9a-f]{32}$/u
const SNAPSHOT_REF_PATTERN = /^das_[0-9a-f]{32}$/u
const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u
const PRINCIPAL_REF_PATTERN = /^prn_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const AUTHORITY_VALUE_PATTERN = /^[A-Za-z0-9*][A-Za-z0-9._:/*-]{0,199}$/u

const anyInvalid = (facts: readonly boolean[]): boolean => facts.some(Boolean)
const invalidWhen = (condition: boolean, invalid: boolean): boolean => condition ? invalid : false

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

export async function loadAncestry(
  transaction: DelegationTransaction,
  leafRef: DelegationGrantRef,
): Promise<readonly DelegationGrant[]> {
  const reverse: DelegationGrant[] = []
  const visited = new Set<DelegationGrantRef>()
  let nextRef: DelegationGrantRef | undefined = leafRef
  let child: DelegationGrant | undefined
  while (nextRef !== undefined) {
    if (reverse.length >= DELEGATION_MAX_ANCESTRY_GRANTS) {
      throw new DelegationError('delegation_limit_exceeded')
    }
    if (visited.has(nextRef)) throw new DelegationError('delegation_ancestry_cycle')
    visited.add(nextRef)
    const persisted = await transaction.getGrant(nextRef)
    if (persisted === undefined) throw new DelegationError('delegation_grant_not_found')
    const grant = parsePersistedDelegationGrant(persisted)
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

export function assertStoredGrantIntegrity(grant: DelegationGrant): void {
  if (!isRecord(grant)) throw new DelegationError('delegation_ancestry_invalid')
  assertCollectionLimit(grant.scopes, DELEGATION_MAX_SCOPES)
  assertCollectionLimit(grant.resourceRefs, DELEGATION_MAX_RESOURCES)
  const hasParentRef = grant.parentGrantRef !== undefined
  const hasParentGeneration = grant.parentGeneration !== undefined
  const createdBy = persistedActionContext(grant.createdBy)
  if (createdBy === undefined) throw new DelegationError('delegation_ancestry_invalid')
  if (createdBy.activeAccountRef !== grant.accountRef) {
    throw new DelegationError('delegation_ancestry_account_mismatch')
  }
  if (anyInvalid([
    !matchesPattern(grant.grantRef, GRANT_REF_PATTERN),
    !matchesPattern(grant.accountRef, ACCOUNT_REF_PATTERN),
    !matchesPattern(grant.actorPrincipalRef, PRINCIPAL_REF_PATTERN),
    !matchesPattern(grant.subjectPrincipalRef, PRINCIPAL_REF_PATTERN),
    invalidWhen(hasParentRef, !matchesPattern(grant.parentGrantRef, GRANT_REF_PATTERN)),
    invalidWhen(hasParentGeneration, !Number.isSafeInteger(grant.parentGeneration)),
    invalidWhen(hasParentGeneration, (grant.parentGeneration as number) < 1),
    !isCanonicalAuthorityValues(grant.scopes),
    !isCanonicalAuthorityValues(grant.resourceRefs),
    !Number.isSafeInteger(grant.budgetLimit),
    grant.budgetLimit < 1,
    !Number.isSafeInteger(grant.budgetUsed),
    grant.budgetUsed < 0,
    grant.budgetUsed > grant.budgetLimit,
    !Number.isSafeInteger(grant.createdAt),
    grant.createdAt < 0,
    !Number.isSafeInteger(grant.expiresAt),
    grant.expiresAt <= grant.createdAt,
    !Number.isSafeInteger(grant.generation),
    grant.generation < 1,
    !Number.isSafeInteger(grant.revision),
    grant.revision < grant.generation,
    createdBy.actorPrincipalRef !== grant.actorPrincipalRef,
    hasParentRef !== hasParentGeneration,
  ])) {
    throw new DelegationError('delegation_ancestry_invalid')
  }

  if (grant.lifecycle === 'active') {
    if (grant.revokedAt !== undefined || grant.revokedBy !== undefined) {
      throw new DelegationError('delegation_ancestry_invalid')
    }
    return
  }
  const revokedBy = persistedActionContext(grant.revokedBy)
  if (anyInvalid([
    grant.lifecycle !== 'revoked',
    grant.generation < 2,
    revokedBy === undefined,
    revokedBy?.activeAccountRef !== grant.accountRef,
    revokedBy?.actorPrincipalRef !== grant.actorPrincipalRef
      && revokedBy?.actorPrincipalRef !== grant.subjectPrincipalRef,
  ])) {
    throw new DelegationError('delegation_ancestry_invalid')
  }
  const revokedAt = grant.revokedAt
  if (typeof revokedAt !== 'number'
    || !Number.isSafeInteger(revokedAt)
    || revokedAt < grant.createdAt) {
    throw new DelegationError('delegation_ancestry_invalid')
  }
}

/** Defensive Convex-row parser. This validates one stored fact; live admission still requires DelegationService. */
export function parsePersistedDelegationGrant(value: unknown): DelegationGrant {
  const grant = value as DelegationGrant
  assertStoredGrantIntegrity(grant)
  const createdBy = persistedActionContext(grant.createdBy) as AccountActionContext
  const revokedBy = persistedActionContext(grant.revokedBy)
  return Object.freeze({
    grantRef: grant.grantRef,
    accountRef: grant.accountRef,
    actorPrincipalRef: grant.actorPrincipalRef,
    subjectPrincipalRef: grant.subjectPrincipalRef,
    ...(grant.parentGrantRef === undefined ? {} : { parentGrantRef: grant.parentGrantRef }),
    ...(grant.parentGeneration === undefined ? {} : { parentGeneration: grant.parentGeneration }),
    scopes: Object.freeze([...grant.scopes]),
    resourceRefs: Object.freeze([...grant.resourceRefs]),
    budgetLimit: grant.budgetLimit,
    budgetUsed: grant.budgetUsed,
    expiresAt: grant.expiresAt,
    generation: grant.generation,
    revision: grant.revision,
    lifecycle: grant.lifecycle,
    createdAt: grant.createdAt,
    createdBy: freezeContext(createdBy),
    ...(grant.revokedAt === undefined ? {} : { revokedAt: grant.revokedAt }),
    ...(revokedBy === undefined ? {} : { revokedBy: freezeContext(revokedBy) }),
  })
}

export function assertDelegationEdgeIntegrity(parent: DelegationGrant, child: DelegationGrant): void {
  if (child.actorPrincipalRef !== parent.subjectPrincipalRef
    || child.createdAt < parent.createdAt
    || !isSubset(child.scopes, parent.scopes)
    || !isSubset(child.resourceRefs, parent.resourceRefs)
    || child.budgetLimit > parent.budgetLimit
    || child.expiresAt >= parent.expiresAt) {
    throw new DelegationError('delegation_ancestry_invalid')
  }
}

/** Reconstructs an already-admitted pinned snapshot for idempotent replay; it never admits new authority. */
export function reconstructPinnedDelegationSnapshotForReplay(
  value: unknown,
  context: ActiveAccountContext,
): DelegationAuthoritySnapshot {
  const snapshot = value as DelegationAuthoritySnapshot
  if (!isRecord(snapshot) || !Array.isArray(snapshot.ancestry)) {
    throw new DelegationError('delegation_snapshot_invalid')
  }
  assertCollectionLimit(snapshot.scopes, DELEGATION_MAX_SCOPES)
  assertCollectionLimit(snapshot.resourceRefs, DELEGATION_MAX_RESOURCES)
  assertCollectionLimit(snapshot.ancestry, DELEGATION_MAX_ANCESTRY_GRANTS)
  if (anyInvalid([
    !matchesPattern(snapshot.snapshotRef, SNAPSHOT_REF_PATTERN),
    !matchesPattern(snapshot.grantRef, GRANT_REF_PATTERN),
    !matchesPattern(snapshot.accountRef, ACCOUNT_REF_PATTERN),
    !matchesPattern(snapshot.actorPrincipalRef, PRINCIPAL_REF_PATTERN),
    !matchesPattern(snapshot.subjectPrincipalRef, PRINCIPAL_REF_PATTERN),
    !Number.isSafeInteger(snapshot.accountRevision),
    snapshot.accountRevision < 1,
    !Number.isSafeInteger(snapshot.generation),
    snapshot.generation < 1,
    !isCanonicalAuthorityValues(snapshot.scopes),
    !isCanonicalAuthorityValues(snapshot.resourceRefs),
    !Number.isSafeInteger(snapshot.budgetAmount),
    snapshot.budgetAmount < 0,
    !Number.isSafeInteger(snapshot.admittedAt),
    snapshot.admittedAt < 0,
    !Number.isSafeInteger(snapshot.expiresAt),
    snapshot.expiresAt <= snapshot.admittedAt,
    !matchesPattern(snapshot.correlationRef, AUTHORITY_VALUE_PATTERN),
    !matchesPattern(snapshot.idempotencyRef, AUTHORITY_VALUE_PATTERN),
    snapshot.accountRef !== context.accountRef,
    snapshot.actorPrincipalRef !== context.actorPrincipalRef,
    snapshot.correlationRef !== context.correlationRef,
    snapshot.idempotencyRef !== context.idempotencyRef,
    snapshot.ancestry.length === 0,
  ])) {
    throw new DelegationError('delegation_snapshot_invalid')
  }

  const seen = new Set<DelegationGrantRef>()
  const ancestry: DelegationAuthorityAncestor[] = []
  for (const persisted of snapshot.ancestry) {
    const parent = ancestry[ancestry.length - 1]
    if (!isRecord(persisted)) {
      throw new DelegationError('delegation_snapshot_invalid')
    }
    assertCollectionLimit(persisted.scopes, DELEGATION_MAX_SCOPES)
    assertCollectionLimit(persisted.resourceRefs, DELEGATION_MAX_RESOURCES)
    if (anyInvalid([
      !matchesPattern(persisted.grantRef, GRANT_REF_PATTERN),
      !Number.isSafeInteger(persisted.generation),
      persisted.generation < 1,
      !matchesPattern(persisted.accountRef, ACCOUNT_REF_PATTERN),
      persisted.accountRef !== snapshot.accountRef,
      !matchesPattern(persisted.actorPrincipalRef, PRINCIPAL_REF_PATTERN),
      !matchesPattern(persisted.subjectPrincipalRef, PRINCIPAL_REF_PATTERN),
      !isCanonicalAuthorityValues(persisted.scopes),
      !isCanonicalAuthorityValues(persisted.resourceRefs),
      !isSubset(snapshot.scopes, persisted.scopes),
      !isSubset(snapshot.resourceRefs, persisted.resourceRefs),
      !Number.isSafeInteger(persisted.budgetLimit),
      persisted.budgetLimit < 1,
      !Number.isSafeInteger(persisted.budgetUsedBefore),
      persisted.budgetUsedBefore < 0,
      persisted.budgetUsedBefore + snapshot.budgetAmount > persisted.budgetLimit,
      !Number.isSafeInteger(persisted.expiresAt),
      persisted.expiresAt <= snapshot.admittedAt,
      seen.has(persisted.grantRef),
      invalidWhen(parent !== undefined, persisted.actorPrincipalRef !== parent?.subjectPrincipalRef),
      invalidWhen(parent !== undefined, !isSubset(persisted.scopes, parent?.scopes ?? [])),
      invalidWhen(parent !== undefined, !isSubset(persisted.resourceRefs, parent?.resourceRefs ?? [])),
      invalidWhen(parent !== undefined, persisted.budgetLimit > (parent?.budgetLimit ?? Number.MAX_SAFE_INTEGER)),
      invalidWhen(parent !== undefined, persisted.expiresAt >= (parent?.expiresAt ?? Number.MAX_SAFE_INTEGER)),
    ])) {
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

export function isRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

export function matchesPattern(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value)
}

export function assertCollectionLimit(value: unknown, maximum: number): void {
  if (Array.isArray(value) && value.length > maximum) {
    throw new DelegationError('delegation_limit_exceeded')
  }
}

export function persistedActionContext(value: unknown): AccountActionContext | undefined {
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

export function isCanonicalAuthorityValues(values: readonly string[]): boolean {
  return Array.isArray(values)
    && values.length > 0
    && values.every((value) => typeof value === 'string' && AUTHORITY_VALUE_PATTERN.test(value))
    && new Set(values).size === values.length
    && values.every((value, index) => index === 0 || values[index - 1]! < value)
}

export function isSubset(requested: readonly string[], permitted: readonly string[]): boolean {
  if (permitted.includes('*')) return true
  const permittedSet = new Set(permitted)
  return requested.every((value) => permittedSet.has(value))
}

export function assertLiveAncestry(ancestry: readonly DelegationGrant[], now: number): void {
  for (const grant of ancestry) {
    if (grant.lifecycle !== 'active') throw new DelegationError('delegation_revoked')
    if (now >= grant.expiresAt) throw new DelegationError('delegation_expired')
  }
}

export function assertResolvedContext(request: AccountActionContext, resolved: ActiveAccountContext): void {
  if (request.actorPrincipalRef !== resolved.actorPrincipalRef
    || request.activeAccountRef !== resolved.accountRef
    || request.correlationRef !== resolved.correlationRef
    || request.idempotencyRef !== resolved.idempotencyRef) {
    throw new DelegationError('delegation_request_invalid')
  }
}

export function authorityValues(
  values: readonly string[],
  code: 'delegation_scope_invalid' | 'delegation_resource_invalid',
  maximum: number,
): readonly string[] {
  assertCollectionLimit(values, maximum)
  if (!Array.isArray(values) || values.length === 0) throw new DelegationError(code)
  const normalized = values.map((value) => {
    if (typeof value !== 'string' || !AUTHORITY_VALUE_PATTERN.test(value)) throw new DelegationError(code)
    return value
  })
  if (new Set(normalized).size !== normalized.length) throw new DelegationError(code)
  return Object.freeze([...normalized].sort())
}

export function budget(value: number, allowZero: boolean): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new DelegationError('delegation_budget_invalid')
  }
  return value
}

export function currentTime(now: () => number): number {
  const value = now()
  if (!Number.isSafeInteger(value) || value < 0) throw new DelegationError('delegation_request_invalid')
  return value
}

export function assertFutureExpiry(expiresAt: number, now: number): void {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    throw new DelegationError('delegation_expiry_invalid')
  }
}

export function assertGeneration(generation: number): void {
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new DelegationError('delegation_generation_stale')
  }
}

export function assertSubset(
  requested: readonly string[],
  permitted: readonly string[],
  code: 'delegation_scope_widened' | 'delegation_resource_widened' | 'delegation_scope_denied' | 'delegation_resource_denied',
): void {
  if (!isSubset(requested, permitted)) throw new DelegationError(code)
}

export function freezeContext(context: AccountActionContext): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: context.actorPrincipalRef,
    activeAccountRef: context.activeAccountRef,
    correlationRef: context.correlationRef,
    idempotencyRef: context.idempotencyRef,
  })
}

export function freezeGrant(grant: DelegationGrant): DelegationGrant {
  return Object.freeze({
    ...grant,
    scopes: Object.freeze([...grant.scopes]),
    resourceRefs: Object.freeze([...grant.resourceRefs]),
    createdBy: freezeContext(grant.createdBy),
    ...(grant.revokedBy === undefined ? {} : { revokedBy: freezeContext(grant.revokedBy) }),
  })
}

export function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function matchesRoot(
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

export function matchesChild(
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

export function matchesAdmission(
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
