import { expect } from 'vitest'

import {
  DelegationService,
  delegationSnapshotRef,
  type AdmitConsequenceRequest,
  type DelegationAuthoritySnapshot,
  type DelegationCommit,
  type DelegationContextPort,
  type DelegationGrant,
  type DelegationGrantRef,
  type DelegationService as DelegationServiceType,
  type DelegationStore,
  type DelegationTransaction,
} from '../../../../src/modules/authority/delegation/public'
import {
  ConsequenceAuthorityBoundary,
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

export class MemoryDelegationStore implements DelegationStore {
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

export const ACCOUNT = accountRef('acc_00000000000040008000000000000021')
export const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000022')
export const HUMAN = principalRef('prn_00000000000040008000000000000021')
export const WORKLOAD = principalRef('prn_00000000000040008000000000000022')
export const STRANGER = principalRef('prn_00000000000040008000000000000023')

export const OWNER_SOURCE = {
  kind: 'account_ownership',
  ownershipRef: ownershipRef('own_00000000000040008000000000000021'),
  ownershipRevision: 3,
  accountRevision: 17,
  admittedAt: 100,
  expiresAt: 200,
} as const

export const BASE_OWNER_BINDING: AuthorityAccountOwnershipBinding = {
  principalClass: 'interactive',
  actorPrincipalRef: HUMAN,
  activeAccountRef: ACCOUNT,
  authoritySource: OWNER_SOURCE,
}

export const BASE_AGENT_ACCESS_TARGET = {
  targetType: 'agent_access_grant',
  targetRef: 'grant:pending:alpha',
  targetRevision: 1,
}

export function action(actorPrincipalRef: PrincipalRef, suffix: string): AccountActionContext {
  return {
    actorPrincipalRef,
    activeAccountRef: ACCOUNT,
    correlationRef: `correlation:${suffix}`,
    idempotencyRef: `idempotency:${suffix}`,
  }
}

export const intent = (suffix: string) => ({
  requiredScopes: ['operation:invoke'],
  resourceRefs: ['operation:alpha'],
  budgetAmount: 1,
  correlationRef: `correlation:${suffix}`,
  idempotencyRef: `idempotency:${suffix}`,
})

export type ConsequenceAuthorityHarness = Awaited<ReturnType<typeof createConsequenceAuthorityHarness>>

export async function createConsequenceAuthorityHarness() {
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

export function httpAdapter(
  boundary: ConsequenceAuthorityBoundary,
  resolution: ServerAuthorityResolutionPort,
) {
  return createHttpAuthorityAdapter(boundary, resolution)
}

export function interactiveAuthorityAdapters(setup: ConsequenceAuthorityHarness) {
  const resolution = setup.resolver(setup.binding())
  return [
    createHttpAuthorityAdapter(setup.boundary, resolution),
    createConvexAuthorityAdapter(setup.boundary, resolution),
    createMcpAuthorityAdapter(setup.boundary, resolution),
    createCliAuthorityAdapter(setup.boundary, resolution),
  ] as const
}

export function backgroundAuthorityAdapters(setup: ConsequenceAuthorityHarness) {
  const workload = setup.resolver(setup.binding('workload'))
  return [
    createCallbackAuthorityAdapter(setup.boundary, workload),
    createWorkerAuthorityAdapter(setup.boundary, workload),
    createJobAuthorityAdapter(setup.boundary, workload),
    createCronAuthorityAdapter(setup.boundary, workload),
    createReconciliationAuthorityAdapter(setup.boundary, workload),
  ] as const
}

export function frozenDelegationSnapshotFromRequest(
  request: AdmitConsequenceRequest,
  overrides: Readonly<{
    snapshotRef?: ReturnType<typeof delegationSnapshotRef>
    actorPrincipalRef?: PrincipalRef
    subjectPrincipalRef?: PrincipalRef
    accountRevision?: number
  }> = {},
): DelegationAuthoritySnapshot {
  return Object.freeze({
    snapshotRef: overrides.snapshotRef ?? delegationSnapshotRef('das_00000000000040008000000000000099'),
    grantRef: request.grantRef,
    generation: request.expectedGeneration,
    accountRef: request.context.activeAccountRef,
    accountRevision: overrides.accountRevision ?? 17,
    actorPrincipalRef: overrides.actorPrincipalRef ?? request.context.actorPrincipalRef,
    subjectPrincipalRef: overrides.subjectPrincipalRef ?? request.context.actorPrincipalRef,
    scopes: Object.freeze([...request.requiredScopes]),
    resourceRefs: Object.freeze([...request.resourceRefs]),
    budgetAmount: request.budgetAmount,
    admittedAt: 100,
    expiresAt: 1_000,
    correlationRef: request.context.correlationRef,
    idempotencyRef: request.context.idempotencyRef,
    ancestry: Object.freeze([]),
  } satisfies DelegationAuthoritySnapshot)
}

export function boundaryWithDelegationAdmission(
  admit: AdmitConsequence | 'forged' | 'invalid_revision',
) {
  const admitConsequence: AdmitConsequence = admit === 'forged'
    ? async (request: AdmitConsequenceRequest) =>
      frozenDelegationSnapshotFromRequest(request, {
        actorPrincipalRef: STRANGER,
        subjectPrincipalRef: STRANGER,
      })
    : admit === 'invalid_revision'
      ? async (request: AdmitConsequenceRequest) =>
        frozenDelegationSnapshotFromRequest(request, {
          snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000098'),
          accountRevision: 0,
        })
      : admit
  return new ConsequenceAuthorityBoundary({ admitConsequence })
}

export async function ownerCommandDigest(
  options: Readonly<{
    binding?: AuthorityAccountOwnershipBinding
    action?: 'agent_access.create' | 'agent_access.replace_credential'
    target?: typeof BASE_AGENT_ACCESS_TARGET
    requiredScopes?: readonly string[]
    resourceRefs?: readonly string[]
    budgetAmount?: number
    consequenceSummary?: string
    statusReadbackRef?: string
    command?: unknown
  }> = {},
) {
  const boundary = boundaryBlockingDelegation()
  const admission = await httpAdapter(boundary, {
    resolveCanonicalBinding: async () => options.binding ?? BASE_OWNER_BINDING,
  }).withCurrentAuthority({
    requiredScopes: options.requiredScopes ?? ['operation:invoke'],
    resourceRefs: options.resourceRefs ?? ['operation:alpha'],
    budgetAmount: options.budgetAmount ?? 1,
    correlationRef: 'correlation:digest-envelope',
    idempotencyRef: 'idempotency:digest-envelope',
    consequence: {
      action: options.action ?? 'agent_access.create',
      target: options.target ?? BASE_AGENT_ACCESS_TARGET,
      consequenceSummary: options.consequenceSummary ?? 'Create one bounded Agent credential.',
      statusReadbackRef: options.statusReadbackRef ?? '/owner/agent-access/grant:pending:alpha',
      command: options.command ?? { displayName: 'Research agent', limits: { calls: 5, spend: 10 } },
    },
  }, async (current) => current)
  if (admission.descriptor === undefined) throw new Error('descriptor_missing')
  return admission.descriptor.commandDigest
}

export async function delegatedCommandDigest(
  setup: ConsequenceAuthorityHarness,
  options: Readonly<{
    grantRef?: DelegationGrantRef
    generation?: number
    snapshotRef?: ReturnType<typeof delegationSnapshotRef>
  }> = {},
) {
  const binding: AuthorityDelegationBinding = {
    ...setup.binding(),
    grantRef: options.grantRef ?? setup.humanGrant.grantRef,
    grantGeneration: options.generation ?? 1,
  }
  const boundary = boundaryWithDelegationAdmission(async (request) =>
    frozenDelegationSnapshotFromRequest(request, {
      snapshotRef: options.snapshotRef ?? delegationSnapshotRef('das_00000000000040008000000000000031'),
    }))
  const admission = await httpAdapter(boundary, setup.resolver(binding))
    .withCurrentAuthority({
      ...intent('delegated-digest'),
      consequence: {
        action: 'agent_access.create',
        target: BASE_AGENT_ACCESS_TARGET,
        consequenceSummary: 'Create one bounded Agent credential.',
        statusReadbackRef: '/owner/agent-access/grant:pending:alpha',
        command: { displayName: 'Research agent', limits: { calls: 5, spend: 10 } },
      },
    }, async (current) => current)
  if (admission.descriptor === undefined) throw new Error('descriptor_missing')
  return admission.descriptor.commandDigest
}

export function boundaryBlockingDelegation(message = 'delegation_must_not_run_for_owner') {
  return new ConsequenceAuthorityBoundary({
    admitConsequence: async () => { throw new Error(message) },
  })
}

export function withOwnerBinding(
  binding: Partial<Omit<AuthorityAccountOwnershipBinding, 'authoritySource'>> & Readonly<{
    authoritySource?: Partial<AuthorityAccountOwnershipBinding['authoritySource']>
  }>,
): AuthorityAccountOwnershipBinding {
  return {
    ...BASE_OWNER_BINDING,
    ...binding,
    authoritySource: {
      ...BASE_OWNER_BINDING.authoritySource,
      ...binding.authoritySource,
    },
  }
}

type AdmitConsequence = DelegationServiceType['admitConsequence']

export function expectInteractiveAdmissionFrozen(admission: {
  authoritySource: unknown
  requiredScopes: unknown
  resourceRefs: unknown
}) {
  expect(Object.isFrozen(admission)).toBe(true)
  expect(Object.isFrozen(admission.authoritySource)).toBe(true)
  expect(Object.isFrozen(admission.requiredScopes)).toBe(true)
  expect(Object.isFrozen(admission.resourceRefs)).toBe(true)
}

export function fullInteractiveAdmissionExpect(setup: ConsequenceAuthorityHarness) {
  return {
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
  }
}

export const MALFORMED_INTENT_CASES = (valid: ReturnType<typeof intent>) => {
  const tooManyScopes = Array.from({ length: 65 }, (_, index) => `scope:${index}`)
  return [
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
}

export const EXPECTED_PACKAGE_3_CONSEQUENCE_ACTION_POLICY = {
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
  'provider.offboard': {
    actionClass: 'authority_reduction',
    proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
    confirmationFields: ['actor', 'account', 'target', 'market_visibility', 'provider_permissions', 'consequence', 'recovery'],
    recoveryClass: 'compensatable',
  },
  'funding.top_up': {
    actionClass: 'spend_or_transfer',
    proofPolicy: { kind: 'none' },
    confirmationFields: ['actor', 'account', 'target', 'amount', 'fees_and_total', 'consequence', 'recovery'],
    recoveryClass: 'irreversible',
  },
  'provider_obligation.reverse': {
    actionClass: 'spend_or_transfer',
    proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
    confirmationFields: ['actor', 'account', 'target', 'amount', 'destination', 'consequence', 'recovery'],
    recoveryClass: 'compensatable',
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
  'commercial_policy.activate': {
    actionClass: 'authority_increase',
    proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
    confirmationFields: ['actor', 'account', 'target', 'scope', 'expiry', 'consequence', 'recovery'],
    recoveryClass: 'reversible_before_dispatch',
  },
  'commercial_policy.replace': {
    actionClass: 'authority_increase',
    proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
    confirmationFields: ['actor', 'account', 'target', 'scope', 'expiry', 'consequence', 'recovery'],
    recoveryClass: 'reversible_before_dispatch',
  },
  'commercial_policy.suspend': {
    actionClass: 'authority_reduction',
    proofPolicy: { kind: 'clerk_reverification', preset: 'strict', uniquePerCommand: true },
    confirmationFields: ['actor', 'account', 'target', 'scope', 'expiry', 'consequence', 'recovery'],
    recoveryClass: 'reversible_before_dispatch',
  },
} as const
