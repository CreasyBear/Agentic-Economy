import {
  accountRef,
  ownershipRef,
  type AccountActionContext,
  type AccountRef,
  type OwnershipRef,
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
import { canonicalDigest } from '../../common/canonical-digest'
import { captureBackendException } from '@/lib/observability/degrade-backend'

const ACTION_CONTEXT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const AUTHORITY_VALUE_PATTERN = /^[A-Za-z0-9*][A-Za-z0-9._:/*-]{0,199}$/u
const CONSEQUENCE_REF_PATTERN = /^[A-Za-z0-9/][A-Za-z0-9._:/?#=&%-]{0,499}$/u
const CONSEQUENCE_SUMMARY_MAX_LENGTH = 500

export const PACKAGE_3_CONSEQUENCE_ACTIONS = Object.freeze([
  'agent_access.create',
  'agent_access.replace_credential',
  'agent_access.increase_authority',
  'agent_access.reduce_authority',
  'agent_access.revoke_credential',
  'agent_access.disconnect',
  'connection.test',
  'connection.connect',
  'connection.reauthorize',
  'connection.revoke',
  'funding.top_up',
  'provider_obligation.reverse',
  'payout_authority.create',
  'payout_authority.replace',
  'payout.transfer',
  'publication.publish',
  'publication.republish',
  'publication.withdraw',
  'provider.offboard',
  'commercial_policy.activate',
  'commercial_policy.replace',
  'commercial_policy.suspend',
] as const)

export type Package3ConsequenceAction = typeof PACKAGE_3_CONSEQUENCE_ACTIONS[number]

export type ConsequenceActionClass =
  | 'safe_validation'
  | 'spend_or_transfer'
  | 'publish_or_withdraw'
  | 'authority_increase'
  | 'authority_reduction'
  | 'account_recovery'

export type ConsequenceRecoveryClass =
  | 'reversible_before_dispatch'
  | 'reversible_while_pending'
  | 'compensatable'
  | 'irreversible'

export type ConsequenceProofPolicy =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
    kind: 'clerk_reverification'
    preset: 'strict'
    uniquePerCommand: true
  }>

export type ConsequenceConfirmationField =
  | 'actor'
  | 'account'
  | 'target'
  | 'scope'
  | 'spending_limits'
  | 'expiry'
  | 'credential_generation'
  | 'provider_permissions'
  | 'authority_generation'
  | 'amount'
  | 'fees_and_total'
  | 'destination'
  | 'timing'
  | 'operation_revision'
  | 'market_visibility'
  | 'price_and_effects'
  | 'consequence'
  | 'recovery'

export type ConsequenceTarget = Readonly<{
  targetType: string
  targetRef: string
  targetRevision: number
}>

export type ConsequenceDescriptor = Readonly<{
  actionClass: ConsequenceActionClass
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  target: ConsequenceTarget
  requiredScopes: readonly string[]
  resourceRefs: readonly string[]
  budgetAmount: number
  consequenceSummary: string
  recoveryClass: ConsequenceRecoveryClass
  statusReadbackRef: string
  commandDigest: string
}>

export type ConsequenceActionPolicy = Readonly<{
  actionClass: ConsequenceActionClass
  proofPolicy: ConsequenceProofPolicy
  confirmationFields: readonly ConsequenceConfirmationField[]
  recoveryClass: ConsequenceRecoveryClass
}>

const NO_CONSEQUENCE_PROOF = Object.freeze({ kind: 'none' } as const)
const STRICT_CLERK_REVERIFICATION = Object.freeze({
  kind: 'clerk_reverification',
  preset: 'strict',
  uniquePerCommand: true,
} as const)

function consequencePolicy(
  actionClass: ConsequenceActionClass,
  proofPolicy: ConsequenceProofPolicy,
  confirmationFields: readonly ConsequenceConfirmationField[],
  recoveryClass: ConsequenceRecoveryClass,
): ConsequenceActionPolicy {
  return Object.freeze({
    actionClass,
    proofPolicy,
    confirmationFields: Object.freeze([...confirmationFields]),
    recoveryClass,
  })
}

export const PACKAGE_3_CONSEQUENCE_ACTION_POLICY = Object.freeze({
  'agent_access.create': consequencePolicy('authority_increase', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'scope', 'spending_limits', 'expiry', 'consequence', 'recovery'], 'reversible_before_dispatch'),
  'agent_access.replace_credential': consequencePolicy('authority_increase', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'scope', 'spending_limits', 'expiry', 'credential_generation', 'consequence', 'recovery'], 'reversible_while_pending'),
  'agent_access.increase_authority': consequencePolicy('authority_increase', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'scope', 'spending_limits', 'expiry', 'consequence', 'recovery'], 'reversible_before_dispatch'),
  'agent_access.reduce_authority': consequencePolicy('authority_reduction', NO_CONSEQUENCE_PROOF, ['actor', 'account', 'target', 'scope', 'spending_limits', 'consequence', 'recovery'], 'compensatable'),
  'agent_access.revoke_credential': consequencePolicy('authority_reduction', NO_CONSEQUENCE_PROOF, ['actor', 'account', 'target', 'credential_generation', 'consequence', 'recovery'], 'compensatable'),
  'agent_access.disconnect': consequencePolicy('authority_reduction', NO_CONSEQUENCE_PROOF, ['actor', 'account', 'target', 'consequence', 'recovery'], 'compensatable'),
  'connection.test': consequencePolicy('safe_validation', NO_CONSEQUENCE_PROOF, ['actor', 'account', 'target', 'provider_permissions', 'consequence', 'recovery'], 'reversible_before_dispatch'),
  'connection.connect': consequencePolicy('authority_increase', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'provider_permissions', 'expiry', 'authority_generation', 'consequence', 'recovery'], 'compensatable'),
  'connection.reauthorize': consequencePolicy('authority_increase', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'provider_permissions', 'expiry', 'authority_generation', 'consequence', 'recovery'], 'compensatable'),
  'connection.revoke': consequencePolicy('authority_reduction', NO_CONSEQUENCE_PROOF, ['actor', 'account', 'target', 'provider_permissions', 'authority_generation', 'consequence', 'recovery'], 'compensatable'),
  'funding.top_up': consequencePolicy('spend_or_transfer', NO_CONSEQUENCE_PROOF, ['actor', 'account', 'target', 'amount', 'fees_and_total', 'consequence', 'recovery'], 'irreversible'),
  'provider_obligation.reverse': consequencePolicy('spend_or_transfer', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'amount', 'destination', 'consequence', 'recovery'], 'compensatable'),
  'payout_authority.create': consequencePolicy('authority_increase', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'destination', 'authority_generation', 'consequence', 'recovery'], 'compensatable'),
  'payout_authority.replace': consequencePolicy('authority_increase', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'destination', 'authority_generation', 'consequence', 'recovery'], 'reversible_while_pending'),
  'payout.transfer': consequencePolicy('spend_or_transfer', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'amount', 'destination', 'timing', 'consequence', 'recovery'], 'irreversible'),
  'publication.publish': consequencePolicy('publish_or_withdraw', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'operation_revision', 'market_visibility', 'price_and_effects', 'consequence', 'recovery'], 'compensatable'),
  'publication.republish': consequencePolicy('publish_or_withdraw', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'operation_revision', 'market_visibility', 'price_and_effects', 'consequence', 'recovery'], 'compensatable'),
  'publication.withdraw': consequencePolicy('publish_or_withdraw', NO_CONSEQUENCE_PROOF, ['actor', 'account', 'target', 'operation_revision', 'market_visibility', 'consequence', 'recovery'], 'compensatable'),
  'provider.offboard': consequencePolicy('authority_reduction', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'market_visibility', 'provider_permissions', 'consequence', 'recovery'], 'compensatable'),
  'commercial_policy.activate': consequencePolicy('authority_increase', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'scope', 'expiry', 'consequence', 'recovery'], 'reversible_before_dispatch'),
  'commercial_policy.replace': consequencePolicy('authority_increase', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'scope', 'expiry', 'consequence', 'recovery'], 'reversible_before_dispatch'),
  'commercial_policy.suspend': consequencePolicy('authority_reduction', STRICT_CLERK_REVERIFICATION, ['actor', 'account', 'target', 'scope', 'expiry', 'consequence', 'recovery'], 'reversible_before_dispatch'),
} as const satisfies Readonly<Record<Package3ConsequenceAction, ConsequenceActionPolicy>>)

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

type AuthorityResolvedBindingBase = Readonly<{
  principalClass: AuthorityPrincipalClass
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
}>

export type AuthorityDelegationBinding = AuthorityResolvedBindingBase & Readonly<{
  authoritySource?: undefined
  grantRef: DelegationGrantRef
  grantGeneration: number
}>

export type AuthorityAccountOwnershipBinding = AuthorityResolvedBindingBase & Readonly<{
  principalClass: 'interactive'
  authoritySource: Readonly<{
    kind: 'account_ownership'
    ownershipRef: OwnershipRef
    ownershipRevision: number
    accountRevision: number
    admittedAt: number
    expiresAt: number
  }>
  grantRef?: never
  grantGeneration?: never
}>

export type AuthorityResolvedBinding = AuthorityDelegationBinding | AuthorityAccountOwnershipBinding

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
  consequence?: Readonly<{
    action: Package3ConsequenceAction
    target: ConsequenceTarget
    consequenceSummary: string
    statusReadbackRef: string
    command: unknown
  }>
}>

type AuthorityConsequenceAdmissionBase = Readonly<{
  surface: AuthoritySurface
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  accountRevision: number
  requiredScopes: readonly string[]
  resourceRefs: readonly string[]
  budgetAmount: number
  admittedAt: number
  expiresAt: number
  correlationRef: string
  idempotencyRef: string
  consequenceAction?: Package3ConsequenceAction
  descriptor?: ConsequenceDescriptor
  proofPolicy?: ConsequenceProofPolicy
}>

export type AuthorityConsequenceAdmission = AuthorityConsequenceAdmissionBase & (
  | Readonly<{
    authoritySource: Readonly<{
      kind: 'delegation_snapshot'
      snapshotRef: DelegationSnapshotRef
      grantRef: DelegationGrantRef
      grantGeneration: number
    }>
    snapshotRef: DelegationSnapshotRef
    grantRef: DelegationGrantRef
    grantGeneration: number
  }>
  | Readonly<{
    authoritySource: Readonly<{
      kind: 'account_ownership'
      ownershipRef: OwnershipRef
      ownershipRevision: number
    }>
    snapshotRef?: never
    grantRef?: never
    grantGeneration?: never
  }>
)

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

type CanonicalConsequenceIntent = Readonly<{
  action: Package3ConsequenceAction
  target: ConsequenceTarget
  consequenceSummary: string
  statusReadbackRef: string
  payloadDigest: string
}>

type CanonicalAuthorityConsequenceIntent = Omit<AuthorityConsequenceIntent, 'consequence'> & Readonly<{
  consequence?: CanonicalConsequenceIntent
}>

/**
 * The only protected consequence seam. Every call resolves canonical server facts
 * afresh and admits either a verified Account ownership or a generation-aware
 * Delegation snapshot. The callback receives that immutable attribution; later
 * retries must enter this boundary again and reconcile against current authority.
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
        const admission = isAccountOwnershipBinding(binding)
          ? admittedOwnerConsequence(protectedSurface, binding, canonical)
          : admittedDelegatedConsequence(
            protectedSurface,
            binding,
            canonical,
            canonicalAuthoritySnapshot(await this.#delegation.admitConsequence({
              grantRef: binding.grantRef,
              expectedGeneration: binding.grantGeneration,
              context,
              requiredScopes: canonical.requiredScopes,
              resourceRefs: canonical.resourceRefs,
              budgetAmount: canonical.budgetAmount,
            })),
          )
        return await consequence(admission)
      },
    })
  }
}

function canonicalIntent(intent: AuthorityConsequenceIntent): CanonicalAuthorityConsequenceIntent {
  try {
    const requiredScopes = canonicalIntentAuthorityValues(intent.requiredScopes, DELEGATION_MAX_SCOPES)
    const resourceRefs = canonicalIntentAuthorityValues(intent.resourceRefs, DELEGATION_MAX_RESOURCES)
    const budgetAmount = canonicalAdmissionInteger(intent.budgetAmount, 0)
    const correlationRef = canonicalAdmissionString(intent.correlationRef)
    const idempotencyRef = canonicalAdmissionString(intent.idempotencyRef)
    const consequence = intent.consequence === undefined
      ? undefined
      : canonicalConsequenceIntent(intent.consequence)
    const canonical = {
      requiredScopes,
      resourceRefs,
      budgetAmount,
      correlationRef,
      idempotencyRef,
    }
    return consequence === undefined
      ? Object.freeze(canonical)
      : Object.freeze({ ...canonical, consequence })
  } catch (cause) {
    captureBackendException(cause, { site: 'canonicalIntent' }, 'warning')
    throw new AuthorityBoundaryError('authority_admission_invalid')
  }
}

function canonicalConsequenceIntent(
  value: NonNullable<AuthorityConsequenceIntent['consequence']>,
): CanonicalConsequenceIntent {
  const actionValue = value.action
  const targetValue = value.target
  const consequenceSummaryValue = value.consequenceSummary
  const statusReadbackRefValue = value.statusReadbackRef
  const commandValue = value.command
  const action = package3ConsequenceAction(actionValue)
  const target = canonicalConsequenceTarget(targetValue)
  const consequenceSummary = canonicalConsequenceSummary(consequenceSummaryValue)
  const statusReadbackRef = canonicalConsequenceRef(statusReadbackRefValue)
  const payloadDigest = canonicalDigest(commandValue)
  return Object.freeze({ action, target, consequenceSummary, statusReadbackRef, payloadDigest })
}

function package3ConsequenceAction(value: unknown): Package3ConsequenceAction {
  assertAdmissionInvariant(PACKAGE_3_CONSEQUENCE_ACTIONS.some((candidate) => candidate === value))
  return value as Package3ConsequenceAction
}

function canonicalConsequenceTarget(value: ConsequenceTarget): ConsequenceTarget {
  const targetTypeValue = value.targetType
  const targetRefValue = value.targetRef
  const targetRevisionValue = value.targetRevision
  const targetType = canonicalAdmissionString(targetTypeValue)
  const targetRef = canonicalAdmissionString(targetRefValue)
  const targetRevision = canonicalAdmissionInteger(targetRevisionValue, 1)
  return Object.freeze({ targetType, targetRef, targetRevision })
}

function canonicalConsequenceSummary(value: unknown): string {
  assertAdmissionInvariant(typeof value === 'string')
  const canonical = value.trim()
  assertAdmissionInvariant(canonical.length >= 1 && canonical.length <= CONSEQUENCE_SUMMARY_MAX_LENGTH)
  assertAdmissionInvariant(!/[\u0000-\u001f\u007f]/u.test(canonical))
  return canonical
}

function canonicalConsequenceRef(value: unknown): string {
  assertAdmissionInvariant(typeof value === 'string')
  assertAdmissionInvariant(CONSEQUENCE_REF_PATTERN.test(value))
  return value
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
    const authoritySourceValue = value.authoritySource
    const grantRefValue = value.grantRef
    const grantGenerationValue = value.grantGeneration
    const principalClass = authorityPrincipalClass(principalClassValue)
    const actorPrincipalRef = principalRef(actorPrincipalRefValue)
    const activeAccountRef = accountRef(activeAccountRefValue)
    if (authoritySourceValue?.kind === 'account_ownership') {
      assertAdmissionInvariant(principalClass === 'interactive')
      assertAdmissionInvariant(grantRefValue === undefined)
      assertAdmissionInvariant(grantGenerationValue === undefined)
      const ownershipRefValue = authoritySourceValue.ownershipRef
      const ownershipRevisionValue = authoritySourceValue.ownershipRevision
      const accountRevisionValue = authoritySourceValue.accountRevision
      const admittedAtValue = authoritySourceValue.admittedAt
      const expiresAtValue = authoritySourceValue.expiresAt
      const canonicalOwnershipRef = ownershipRef(ownershipRefValue)
      const ownershipRevision = canonicalAdmissionInteger(ownershipRevisionValue, 1)
      const accountRevision = canonicalAdmissionInteger(accountRevisionValue, 1)
      const admittedAt = canonicalAdmissionInteger(admittedAtValue, 0)
      const expiresAt = canonicalAdmissionInteger(expiresAtValue, admittedAt + 1)
      return Object.freeze({
        principalClass,
        actorPrincipalRef,
        activeAccountRef,
        authoritySource: Object.freeze({
          kind: 'account_ownership',
          ownershipRef: canonicalOwnershipRef,
          ownershipRevision,
          accountRevision,
          admittedAt,
          expiresAt,
        }),
      })
    }
    assertAdmissionInvariant(authoritySourceValue === undefined)
    assertAdmissionInvariant(typeof grantRefValue === 'string')
    assertAdmissionInvariant(typeof grantGenerationValue === 'number')
    const grantRef = delegationGrantRef(grantRefValue)
    if (!Number.isSafeInteger(grantGenerationValue) || grantGenerationValue < 1) {
      throw new AuthorityBoundaryError('authority_binding_invalid')
    }
    return Object.freeze({
      principalClass,
      actorPrincipalRef,
      activeAccountRef,
      grantRef,
      grantGeneration: grantGenerationValue,
    })
  } catch (cause) {
    captureBackendException(cause, { site: 'authorityBinding' }, 'warning')
    throw new AuthorityBoundaryError('authority_binding_invalid')
  }
}

function isAccountOwnershipBinding(
  binding: AuthorityResolvedBinding,
): binding is AuthorityAccountOwnershipBinding {
  return binding.authoritySource?.kind === 'account_ownership'
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
  } catch (cause) {
    captureBackendException(cause, { site: 'canonicalAuthoritySnapshot' }, 'warning')
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

function admittedDelegatedConsequence(
  surface: AuthoritySurface,
  binding: AuthorityDelegationBinding,
  intent: CanonicalAuthorityConsequenceIntent,
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
  return Object.freeze(withConsequenceDescriptor({
    surface,
    authoritySource: Object.freeze({
      kind: 'delegation_snapshot',
      snapshotRef: snapshot.snapshotRef,
      grantRef: snapshot.grantRef,
      grantGeneration: snapshot.generation,
    }),
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
  }, intent))
}

function admittedOwnerConsequence(
  surface: AuthoritySurface,
  binding: AuthorityAccountOwnershipBinding,
  intent: CanonicalAuthorityConsequenceIntent,
): AuthorityConsequenceAdmission {
  const source = binding.authoritySource
  return Object.freeze(withConsequenceDescriptor({
    surface,
    authoritySource: Object.freeze({
      kind: 'account_ownership',
      ownershipRef: source.ownershipRef,
      ownershipRevision: source.ownershipRevision,
    }),
    actorPrincipalRef: binding.actorPrincipalRef,
    activeAccountRef: binding.activeAccountRef,
    accountRevision: source.accountRevision,
    requiredScopes: intent.requiredScopes,
    resourceRefs: intent.resourceRefs,
    budgetAmount: intent.budgetAmount,
    admittedAt: source.admittedAt,
    expiresAt: source.expiresAt,
    correlationRef: intent.correlationRef,
    idempotencyRef: intent.idempotencyRef,
  }, intent))
}

function withConsequenceDescriptor<Admission extends AuthorityConsequenceAdmissionBase & Pick<AuthorityConsequenceAdmission, 'authoritySource'>>(
  admission: Admission,
  intent: CanonicalAuthorityConsequenceIntent,
): Admission & Pick<AuthorityConsequenceAdmission, 'consequenceAction' | 'descriptor' | 'proofPolicy'> {
  if (intent.consequence === undefined) return admission
  const policy = PACKAGE_3_CONSEQUENCE_ACTION_POLICY[intent.consequence.action]
  const commandDigest = canonicalDigest(consequenceCommandEnvelope(admission, intent.consequence, policy))
  const descriptor = Object.freeze({
    actionClass: policy.actionClass,
    actorPrincipalRef: admission.actorPrincipalRef,
    activeAccountRef: admission.activeAccountRef,
    target: intent.consequence.target,
    requiredScopes: admission.requiredScopes,
    resourceRefs: admission.resourceRefs,
    budgetAmount: admission.budgetAmount,
    consequenceSummary: intent.consequence.consequenceSummary,
    recoveryClass: policy.recoveryClass,
    statusReadbackRef: intent.consequence.statusReadbackRef,
    commandDigest,
  } satisfies ConsequenceDescriptor)
  return {
    ...admission,
    consequenceAction: intent.consequence.action,
    descriptor,
    proofPolicy: policy.proofPolicy,
  }
}

function consequenceCommandEnvelope(
  admission: AuthorityConsequenceAdmissionBase & Pick<AuthorityConsequenceAdmission, 'authoritySource'>,
  consequence: CanonicalConsequenceIntent,
  policy: ConsequenceActionPolicy,
): Readonly<Record<string, unknown>> {
  const authoritySource = admission.authoritySource.kind === 'account_ownership'
    ? Object.freeze({
      kind: admission.authoritySource.kind,
      ownershipRef: admission.authoritySource.ownershipRef,
      ownershipRevision: admission.authoritySource.ownershipRevision,
    })
    : Object.freeze({
      kind: admission.authoritySource.kind,
      snapshotRef: admission.authoritySource.snapshotRef,
      grantRef: admission.authoritySource.grantRef,
      grantGeneration: admission.authoritySource.grantGeneration,
    })
  return Object.freeze({
    version: 'ae.consequence-command:v1',
    action: consequence.action,
    actionClass: policy.actionClass,
    confirmationFields: policy.confirmationFields,
    actorPrincipalRef: admission.actorPrincipalRef,
    activeAccountRef: admission.activeAccountRef,
    accountRevision: admission.accountRevision,
    authoritySource,
    target: consequence.target,
    requiredScopes: admission.requiredScopes,
    resourceRefs: admission.resourceRefs,
    budgetAmount: admission.budgetAmount,
    consequenceSummary: consequence.consequenceSummary,
    recoveryClass: policy.recoveryClass,
    statusReadbackRef: consequence.statusReadbackRef,
    payloadDigest: consequence.payloadDigest,
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
