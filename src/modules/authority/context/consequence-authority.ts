import {
  accountRef,
  type AccountActionContext,
  type AccountRef,
} from '../../principal-account/account/public'
import {
  principalRef,
  type PrincipalRef,
} from '../../principal-account/principal/public'
import {
  DELEGATION_MAX_RESOURCES,
  DELEGATION_MAX_SCOPES,
  delegationGrantRef,
  delegationSnapshotRef,
  type DelegationAuthoritySnapshot,
  type DelegationGrantRef,
  type DelegationService,
  type DelegationSnapshotRef,
} from '../delegation/public'

const ACTION_CONTEXT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const AUTHORITY_VALUE_PATTERN = /^[A-Za-z0-9*][A-Za-z0-9._:/*-]{0,199}$/u

export const AUTHORITY_SURFACES = Object.freeze([
  'http',
  'convex',
  'mcp',
  'cli',
  'callback',
  'worker',
  'job',
  'cron',
  'reconciliation',
] as const)

export type AuthoritySurface = typeof AUTHORITY_SURFACES[number]

export const WORKLOAD_AUTHORITY_SURFACES = Object.freeze([
  'callback',
  'worker',
  'job',
  'cron',
  'reconciliation',
] as const satisfies readonly AuthoritySurface[])

export type AuthorityPrincipalClass = 'interactive' | 'workload'

export type AuthorityResolvedBinding = Readonly<{
  principalClass: AuthorityPrincipalClass
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  grantRef: DelegationGrantRef
  grantGeneration: number
}>

export type AuthorityResolutionRequest = Readonly<{
  surface: AuthoritySurface
}>

/**
 * This port is implemented by a server adapter closed over authenticated identity
 * or declared workload evidence. Request bodies, credentials and callback payloads
 * are deliberately absent: they may select a canonical record in the adapter, but
 * can never become the returned Principal, Account or Grant provenance directly.
 */
export type ServerAuthorityResolutionPort = Readonly<{
  resolveCanonicalBinding(
    request: AuthorityResolutionRequest,
  ): Promise<AuthorityResolvedBinding | undefined>
}>

export type AuthorityConsequenceIntent = Readonly<{
  requiredScopes: readonly string[]
  resourceRefs: readonly string[]
  budgetAmount: number
  correlationRef: string
  idempotencyRef: string
}>

export type AuthorityConsequenceAdmission = Readonly<{
  surface: AuthoritySurface
  snapshotRef: DelegationSnapshotRef
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  accountRevision: number
  grantRef: DelegationGrantRef
  grantGeneration: number
  requiredScopes: readonly string[]
  resourceRefs: readonly string[]
  budgetAmount: number
  admittedAt: number
  expiresAt: number
  correlationRef: string
  idempotencyRef: string
}>

export type SurfaceAuthorityAdapter = Readonly<{
  surface: AuthoritySurface
  withCurrentAuthority<Result>(
    intent: AuthorityConsequenceIntent,
    consequence: (admission: AuthorityConsequenceAdmission) => Promise<Result>,
  ): Promise<Result>
}>

export type AuthorityBoundaryErrorCode =
  | 'authority_surface_invalid'
  | 'authority_binding_missing'
  | 'authority_binding_invalid'
  | 'authority_workload_required'
  | 'authority_admission_invalid'

export class AuthorityBoundaryError extends Error {
  readonly code: AuthorityBoundaryErrorCode

  constructor(code: AuthorityBoundaryErrorCode) {
    super(code)
    this.name = 'AuthorityBoundaryError'
    this.code = code
  }
}

type ConsequenceAdmissionPort = Pick<DelegationService, 'admitConsequence'>

type CanonicalAuthoritySnapshot = Readonly<{
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
}>

/**
 * The only protected consequence seam. Every call resolves canonical server facts
 * afresh and asks the generation-aware Delegation service for a current snapshot.
 * The callback receives that immutable snapshot attribution; later retries must
 * enter this boundary again and reconcile against current authority.
 */
export class ConsequenceAuthorityBoundary {
  readonly #delegation: ConsequenceAdmissionPort

  constructor(delegation: ConsequenceAdmissionPort) {
    this.#delegation = delegation
  }

  forSurface(
    surface: AuthoritySurface,
    resolver: ServerAuthorityResolutionPort,
  ): SurfaceAuthorityAdapter {
    const protectedSurface = authoritySurface(surface)
    const resolutionRequest = Object.freeze({ surface: protectedSurface })
    return Object.freeze({
      surface: protectedSurface,
      withCurrentAuthority: async <Result>(
        intent: AuthorityConsequenceIntent,
        consequence: (admission: AuthorityConsequenceAdmission) => Promise<Result>,
      ): Promise<Result> => {
        const canonical = canonicalIntent(intent)
        const resolved = await resolver.resolveCanonicalBinding(resolutionRequest)
        const binding = authorityBinding(resolved)
        if (requiresWorkload(protectedSurface) && binding.principalClass !== 'workload') {
          throw new AuthorityBoundaryError('authority_workload_required')
        }
        const context: AccountActionContext = Object.freeze({
          actorPrincipalRef: binding.actorPrincipalRef,
          activeAccountRef: binding.activeAccountRef,
          correlationRef: canonical.correlationRef,
          idempotencyRef: canonical.idempotencyRef,
        })
        const snapshot = await this.#delegation.admitConsequence({
          grantRef: binding.grantRef,
          expectedGeneration: binding.grantGeneration,
          context,
          requiredScopes: canonical.requiredScopes,
          resourceRefs: canonical.resourceRefs,
          budgetAmount: canonical.budgetAmount,
        })
        const canonicalSnapshot = canonicalAuthoritySnapshot(snapshot)
        const admission = admittedConsequence(protectedSurface, binding, canonical, canonicalSnapshot)
        return await consequence(admission)
      },
    })
  }
}

function canonicalIntent(intent: AuthorityConsequenceIntent): AuthorityConsequenceIntent {
  try {
    const requiredScopes = canonicalIntentAuthorityValues(intent.requiredScopes, DELEGATION_MAX_SCOPES)
    const resourceRefs = canonicalIntentAuthorityValues(intent.resourceRefs, DELEGATION_MAX_RESOURCES)
    const budgetAmount = canonicalAdmissionInteger(intent.budgetAmount, 0)
    const correlationRef = canonicalAdmissionString(intent.correlationRef)
    const idempotencyRef = canonicalAdmissionString(intent.idempotencyRef)
    return Object.freeze({
      requiredScopes,
      resourceRefs,
      budgetAmount,
      correlationRef,
      idempotencyRef,
    })
  } catch {
    throw new AuthorityBoundaryError('authority_admission_invalid')
  }
}

function canonicalIntentAuthorityValues(value: unknown, maximum: number): readonly string[] {
  assertAdmissionInvariant(Array.isArray(value))
  assertAdmissionInvariant(value.length >= 1 && value.length <= maximum)
  const copy = value.map((candidate) => {
    assertAdmissionInvariant(typeof candidate === 'string')
    assertAdmissionInvariant(AUTHORITY_VALUE_PATTERN.test(candidate))
    return candidate
  })
  assertAdmissionInvariant(new Set(copy).size === copy.length)
  return Object.freeze(copy.sort())
}

function authoritySurface(value: unknown): AuthoritySurface {
  if (!AUTHORITY_SURFACES.some((surface) => surface === value)) {
    throw new AuthorityBoundaryError('authority_surface_invalid')
  }
  return value as AuthoritySurface
}

function authorityBinding(value: AuthorityResolvedBinding | undefined): AuthorityResolvedBinding {
  if (value === undefined) throw new AuthorityBoundaryError('authority_binding_missing')
  try {
    const principalClassValue = value.principalClass
    const actorPrincipalRefValue = value.actorPrincipalRef
    const activeAccountRefValue = value.activeAccountRef
    const grantRefValue = value.grantRef
    const grantGeneration = value.grantGeneration
    const principalClass = authorityPrincipalClass(principalClassValue)
    const actorPrincipalRef = principalRef(actorPrincipalRefValue)
    const activeAccountRef = accountRef(activeAccountRefValue)
    const grantRef = delegationGrantRef(grantRefValue)
    if (!Number.isSafeInteger(grantGeneration) || grantGeneration < 1) {
      throw new AuthorityBoundaryError('authority_binding_invalid')
    }
    return Object.freeze({
      principalClass,
      actorPrincipalRef,
      activeAccountRef,
      grantRef,
      grantGeneration,
    })
  } catch {
    throw new AuthorityBoundaryError('authority_binding_invalid')
  }
}

function authorityPrincipalClass(value: unknown): AuthorityPrincipalClass {
  if (value !== 'interactive' && value !== 'workload') {
    throw new AuthorityBoundaryError('authority_binding_invalid')
  }
  return value
}

function requiresWorkload(surface: AuthoritySurface): boolean {
  return WORKLOAD_AUTHORITY_SURFACES.some((candidate) => candidate === surface)
}

function canonicalAuthoritySnapshot(snapshot: DelegationAuthoritySnapshot): CanonicalAuthoritySnapshot {
  try {
    const snapshotRef = delegationSnapshotRef(snapshot.snapshotRef)
    const grantRef = delegationGrantRef(snapshot.grantRef)
    const generation = canonicalAdmissionInteger(snapshot.generation, 1)
    const accountRefValue = accountRef(snapshot.accountRef)
    const accountRevision = canonicalAdmissionInteger(snapshot.accountRevision, 1)
    const actorPrincipalRef = principalRef(snapshot.actorPrincipalRef)
    const subjectPrincipalRef = principalRef(snapshot.subjectPrincipalRef)
    const scopes = canonicalAdmissionValues(snapshot.scopes)
    const resourceRefs = canonicalAdmissionValues(snapshot.resourceRefs)
    const budgetAmount = canonicalAdmissionInteger(snapshot.budgetAmount, 0)
    const admittedAt = canonicalAdmissionInteger(snapshot.admittedAt, 0)
    const expiresAt = canonicalAdmissionInteger(snapshot.expiresAt, 0)
    const correlationRef = canonicalAdmissionString(snapshot.correlationRef)
    const idempotencyRef = canonicalAdmissionString(snapshot.idempotencyRef)
    return Object.freeze({
      snapshotRef,
      grantRef,
      generation,
      accountRef: accountRefValue,
      accountRevision,
      actorPrincipalRef,
      subjectPrincipalRef,
      scopes,
      resourceRefs,
      budgetAmount,
      admittedAt,
      expiresAt,
      correlationRef,
      idempotencyRef,
    })
  } catch {
    throw new AuthorityBoundaryError('authority_admission_invalid')
  }
}

function canonicalAdmissionInteger(value: unknown, minimum: number): number {
  assertAdmissionInvariant(Number.isSafeInteger(value) && (value as number) >= minimum)
  return value as number
}

function canonicalAdmissionString(value: unknown): string {
  assertAdmissionInvariant(typeof value === 'string')
  assertAdmissionInvariant(ACTION_CONTEXT_REF_PATTERN.test(value))
  return value
}

function canonicalAdmissionValues(value: unknown): readonly string[] {
  assertAdmissionInvariant(Array.isArray(value))
  const copy = value.map((candidate) => {
    assertAdmissionInvariant(typeof candidate === 'string')
    return candidate
  })
  return Object.freeze(copy)
}

function admittedConsequence(
  surface: AuthoritySurface,
  binding: AuthorityResolvedBinding,
  intent: AuthorityConsequenceIntent,
  snapshot: CanonicalAuthoritySnapshot,
): AuthorityConsequenceAdmission {
  assertAdmissionField(snapshot.actorPrincipalRef, binding.actorPrincipalRef)
  assertAdmissionField(snapshot.subjectPrincipalRef, binding.actorPrincipalRef)
  assertAdmissionField(snapshot.accountRef, binding.activeAccountRef)
  assertAdmissionField(snapshot.grantRef, binding.grantRef)
  assertAdmissionField(snapshot.generation, binding.grantGeneration)
  assertAdmissionField(snapshot.budgetAmount, intent.budgetAmount)
  assertAdmissionField(snapshot.correlationRef, intent.correlationRef)
  assertAdmissionField(snapshot.idempotencyRef, intent.idempotencyRef)
  const requiredScopes = Object.freeze([...intent.requiredScopes].sort())
  const resourceRefs = Object.freeze([...intent.resourceRefs].sort())
  assertAdmissionValues(snapshot.scopes, requiredScopes)
  assertAdmissionValues(snapshot.resourceRefs, resourceRefs)
  assertAdmissionInvariant(Number.isSafeInteger(snapshot.accountRevision) && snapshot.accountRevision >= 1)
  assertAdmissionInvariant(Number.isSafeInteger(snapshot.admittedAt) && snapshot.admittedAt >= 0)
  assertAdmissionInvariant(Number.isSafeInteger(snapshot.expiresAt) && snapshot.expiresAt > snapshot.admittedAt)
  return Object.freeze({
    surface,
    snapshotRef: snapshot.snapshotRef,
    actorPrincipalRef: snapshot.actorPrincipalRef,
    activeAccountRef: snapshot.accountRef,
    accountRevision: snapshot.accountRevision,
    grantRef: snapshot.grantRef,
    grantGeneration: snapshot.generation,
    requiredScopes: snapshot.scopes,
    resourceRefs: snapshot.resourceRefs,
    budgetAmount: snapshot.budgetAmount,
    admittedAt: snapshot.admittedAt,
    expiresAt: snapshot.expiresAt,
    correlationRef: snapshot.correlationRef,
    idempotencyRef: snapshot.idempotencyRef,
  })
}

function assertAdmissionField<Value>(actual: Value, expected: Value): void {
  if (actual !== expected) throw new AuthorityBoundaryError('authority_admission_invalid')
}

function assertAdmissionValues(actual: readonly string[], expected: readonly string[]): void {
  assertAdmissionField(actual.length, expected.length)
  for (const [index, value] of expected.entries()) assertAdmissionField(actual[index], value)
}

function assertAdmissionInvariant(value: boolean): asserts value {
  if (!value) throw new AuthorityBoundaryError('authority_admission_invalid')
}
