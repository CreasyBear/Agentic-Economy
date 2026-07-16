import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compileRouteMandate } from '@/modules/customer-request/route-mandate'
import {
  evaluateStandingRouteAuthority,
  standingRoutePolicyDigest,
  type StandingRouteAuthorityUse,
  type StandingRoutePolicy,
} from '@/modules/customer-request/standing-route-authority'
import {
  routeMandateValue,
  standingRouteAuthorityUseValue,
  standingRoutePolicyValue,
} from '@/modules/customer-request/runtime'

import { internalMutation, internalQuery } from './_generated/server'
import {
  authenticateRequestOwner,
  authenticateRequestOwnerForMutation,
  authenticateRequestOwnerForServiceOperation,
  openCurrentRouteGeneration,
  persistRouteMandateIssue,
} from './customerRequestRouteMandate'
import { currentRoutePlanGenerationGraphStatus } from './customerRequestV2'
import { routeMandateIssueRecordIsValid } from './customerRequestRouteMandateIntegrity'

const money = v.object({ currency: v.string(), amountMinor: v.number() })
const issueCommand = {
  requestId: v.string(),
  expectedRequestRevision: v.number(),
  expectedGenerationRef: v.string(),
  selectedRoutePlanId: v.string(),
  delegatedCredentialId: v.string(),
  perUseSpend: money,
  cumulativeSpend: money,
  perUseDataAllocations: v.number(),
  cumulativeDataAllocations: v.number(),
  occurrences: v.number(),
  validUntil: v.number(),
  idempotencyKey: v.string(),
}
const serviceAssertion = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  issuedAt: v.number(),
  signature: v.string(),
})
const allowRepeatCommand = v.object({
  requestRef: v.string(),
  revision: v.number(),
  routeRef: v.string(),
  delegatedCredentialId: v.string(),
  occurrences: v.number(),
  cumulativeSpend: money,
  validUntil: v.number(),
  idempotencyKey: v.string(),
})
const useRepeatCommand = v.object({
  requestRef: v.string(),
  revision: v.number(),
  routeRef: v.string(),
  permissionRef: v.string(),
  delegatedCredentialId: v.string(),
  idempotencyKey: v.string(),
})
const serviceAuthorization = v.union(
  v.object({
    operation: v.literal('allow_repeat'),
    command: allowRepeatCommand,
    assertion: serviceAssertion,
  }),
  v.object({
    operation: v.literal('use_repeat'),
    command: useRepeatCommand,
    assertion: serviceAssertion,
  }),
)
type StandingServiceAuthorization = Infer<typeof serviceAuthorization>

const issueResult = v.union(
  v.object({ kind: v.literal('issued'), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('replayed'), policy: standingRoutePolicyValue }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('command_changed'),
      v.literal('request_revision_changed'),
      v.literal('route_generation_changed'),
    ),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('request_not_found'),
      v.literal('policy_scope_invalid'),
      v.literal('route_generation_invalid'),
      v.literal('credential_not_authorized'),
      v.literal('explicit_confirmation_required'),
    ),
  }),
)

const issueMandateCommand = {
  requestId: v.string(),
  policyRef: v.string(),
  expectedPolicyDigest: v.string(),
  expectedRequestRevision: v.number(),
  expectedGenerationRef: v.string(),
  selectedRoutePlanId: v.string(),
  delegatedCredentialId: v.string(),
  mandateExpiresAt: v.number(),
  idempotencyKey: v.string(),
}
const issueMandateResult = v.union(
  v.object({
    kind: v.literal('issued'),
    use: standingRouteAuthorityUseValue,
    mandate: routeMandateValue,
  }),
  v.object({
    kind: v.literal('replayed'),
    use: standingRouteAuthorityUseValue,
    mandate: routeMandateValue,
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('command_changed'),
      v.literal('request_revision_changed'),
      v.literal('route_generation_changed'),
      v.literal('policy_changed'),
      v.literal('active_mandate_exists'),
    ),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('request_not_found'),
      v.literal('policy_not_found'),
      v.literal('policy_integrity_invalid'),
      v.literal('principal_mismatch'),
      v.literal('credential_mismatch'),
      v.literal('policy_not_yet_valid'),
      v.literal('policy_expired'),
      v.literal('policy_revoked'),
      v.literal('generation_changed'),
      v.literal('route_not_allowed'),
      v.literal('capability_not_allowed'),
      v.literal('consequential_effect_requires_confirmation'),
      v.literal('spend_limit_exceeded'),
      v.literal('data_limit_exceeded'),
      v.literal('occurrence_limit_exceeded'),
      v.literal('mandate_expiry_invalid'),
      v.literal('prior_use_invalid'),
    ),
  }),
)
const getResult = v.union(
  v.object({ kind: v.literal('active'), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('revoked'), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('not_found') }),
)
const resolvePermissionResult = v.union(
  v.object({ kind: v.literal('found'), requestRevision: v.number(), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('not_found') }),
)
const revokeResult = v.union(
  v.object({ kind: v.literal('revoked'), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('replayed'), policy: standingRoutePolicyValue }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('command_changed'), v.literal('policy_changed')),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('request_not_found'),
      v.literal('policy_not_found'),
      v.literal('policy_integrity_invalid'),
    ),
  }),
)

export const issue = internalMutation({
  args: { ...issueCommand, serviceAuthorization: v.optional(serviceAuthorization) },
  returns: issueResult,
  handler: async (ctx, args) => {
    const authenticated = await authenticateStandingRequestOwner(
      ctx,
      args.requestId,
      args.serviceAuthorization,
    )
    if (authenticated.kind === 'unauthenticated') {
      return { kind: 'refused' as const, reason: 'authentication_required' as const }
    }
    if (authenticated.kind === 'not_found') {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const commandKey = `standing-route-policy-command:v1:${canonicalDigest({
      principalId: authenticated.principalId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const commandMaterial = {
      requestId: args.requestId,
      expectedRequestRevision: args.expectedRequestRevision,
      expectedGenerationRef: args.expectedGenerationRef,
      selectedRoutePlanId: args.selectedRoutePlanId,
      delegatedCredentialId: args.delegatedCredentialId,
      perUseSpend: { ...args.perUseSpend },
      cumulativeSpend: { ...args.cumulativeSpend },
      perUseDataAllocations: args.perUseDataAllocations,
      cumulativeDataAllocations: args.cumulativeDataAllocations,
      occurrences: args.occurrences,
      validUntil: args.validUntil,
      idempotencyKey: args.idempotencyKey,
    }
    const commandDigest = canonicalDigest(commandMaterial)
    const replay = await ctx.db.query('customerRequestStandingRoutePolicyCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (replay !== null) {
      const issueRow = await ctx.db.query('customerRequestStandingRoutePolicyIssues')
        .withIndex('by_policyRef', (query) => query.eq('policyRef', replay.policyRef)).unique()
      if (replay.commandDigest !== commandDigest
        || replay.principalId !== authenticated.principalId
        || replay.requestId !== args.requestId) {
        return { kind: 'conflict' as const, reason: 'command_changed' as const }
      }
      if (issueRow === null
        || issueRow.policyDigest !== replay.policyDigest
        || issueRow.commandDigest !== replay.commandDigest
        || standingRoutePolicyDigest(policyMaterial(domainPolicy(issueRow.policy))) !== issueRow.policyDigest
        || canonicalDigest(issueRow.policy) !== canonicalDigest(replay.result)) {
        throw new Error('customer_request_standing_route_policy_command_integrity_failure')
      }
      return { kind: 'replayed' as const, policy: replay.result }
    }

    const current = await openCurrentRouteGeneration(ctx, args.requestId)
    if (current.kind === 'not_found') {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    if (current.requestRevision !== args.expectedRequestRevision) {
      return { kind: 'conflict' as const, reason: 'request_revision_changed' as const }
    }
    if (current.generation.generationRef !== args.expectedGenerationRef) {
      return { kind: 'conflict' as const, reason: 'route_generation_changed' as const }
    }
    const graphStatus = await currentRoutePlanGenerationGraphStatus(
      ctx.db,
      args.requestId,
      args.expectedGenerationRef,
    )
    if (graphStatus === 'stale') {
      return { kind: 'conflict' as const, reason: 'route_generation_changed' as const }
    }
    if (graphStatus === 'invalid') {
      return { kind: 'refused' as const, reason: 'route_generation_invalid' as const }
    }
    const route = current.generation.routes.find(({ routePlanId }) => routePlanId === args.selectedRoutePlanId)
    const delegatedCredential = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', args.delegatedCredentialId)).unique()
    if (delegatedCredential === null
      || !credentialBelongsToAuthenticatedRequest(delegatedCredential, authenticated)
      || !delegatedCredential.scopes.includes('customer_requests:standing_authority')) {
      return { kind: 'refused' as const, reason: 'credential_not_authorized' as const }
    }
    if (route === undefined || route.maximumTotalCost.kind !== 'known'
      || !validIdentifier(args.delegatedCredentialId)
      || !validPositiveCount(args.occurrences)
      || !validPositiveCount(args.perUseDataAllocations)
      || !validPositiveCount(args.cumulativeDataAllocations)
      || args.cumulativeDataAllocations < args.perUseDataAllocations
      || !validMoney(args.perUseSpend)
      || !validMoney(args.cumulativeSpend)
      || args.perUseSpend.currency !== route.maximumTotalCost.currency
      || args.perUseSpend.amountMinor < route.maximumTotalCost.amountMinor
      || args.cumulativeSpend.currency !== route.maximumTotalCost.currency
      || args.cumulativeSpend.amountMinor < args.perUseSpend.amountMinor
      || !Number.isSafeInteger(args.validUntil)) {
      return { kind: 'refused' as const, reason: 'policy_scope_invalid' as const }
    }

    const now = Date.now()
    const material = {
      format: 'ae.standing-route-policy:v1' as const,
      principalId: authenticated.principalId,
      delegatedCredentialId: args.delegatedCredentialId,
      generationRef: current.generation.generationRef,
      generationDigest: current.generation.generationDigest,
      routes: [{ routePlanId: route.routePlanId, routeDigest: route.routeDigest }],
      capabilityContracts: route.steps.map(({ contractRef }) => ({ ...contractRef })),
      allowedEffectClasses: ['data_release'] as const,
      limits: {
        perUseSpend: { ...args.perUseSpend },
        cumulativeSpend: { ...args.cumulativeSpend },
        perUseDataAllocations: args.perUseDataAllocations,
        cumulativeDataAllocations: args.cumulativeDataAllocations,
        occurrences: args.occurrences,
      },
      fallback: { kind: 'explicit_confirmation_required' as const },
      validFrom: now,
      validUntil: args.validUntil,
    }
    const policyDigest = standingRoutePolicyDigest(material)
    const policy: StandingRoutePolicy = {
      ...material,
      policyRef: `standing-route-policy:v1:${policyDigest}`,
      policyDigest,
    }
    const validation = evaluateStandingRouteAuthority({
      policy,
      generation: current.generation,
      selectedRoutePlanId: route.routePlanId,
      authenticatedPrincipalId: authenticated.principalId,
      delegatedCredentialId: args.delegatedCredentialId,
      priorUses: [],
      now,
      mandateExpiresAt: args.validUntil,
    })
    if (validation.kind !== 'authorized') {
      return {
        kind: 'refused' as const,
        reason: validation.reason === 'consequential_effect_requires_confirmation'
          ? 'explicit_confirmation_required' as const
          : 'policy_scope_invalid' as const,
      }
    }
    const authenticationEvidenceRef = `clerk-identity:${canonicalDigest(authenticated.identity)}`
    const writable = writablePolicy(policy)
    await ctx.db.insert('customerRequestStandingRoutePolicyIssues', {
      policyRef: policy.policyRef,
      policyDigest: policy.policyDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      requestRevision: args.expectedRequestRevision,
      generationRef: args.expectedGenerationRef,
      routePlanId: args.selectedRoutePlanId,
      delegatedCredentialId: args.delegatedCredentialId,
      policy: writable,
      authenticationEvidenceRef,
      commandDigest,
      recordedAt: now,
    })
    await ctx.db.insert('customerRequestStandingRoutePolicyCommands', {
      commandKey,
      commandDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      policyRef: policy.policyRef,
      policyDigest: policy.policyDigest,
      result: writable,
      committedAt: now,
    })
    return { kind: 'issued' as const, policy: writable }
  },
})

export const issueMandate = internalMutation({
  args: { ...issueMandateCommand, serviceAuthorization: v.optional(serviceAuthorization) },
  returns: issueMandateResult,
  handler: async (ctx, args) => {
    const authenticated = await authenticateStandingRequestOwner(
      ctx,
      args.requestId,
      args.serviceAuthorization,
    )
    if (authenticated.kind === 'unauthenticated') {
      return { kind: 'refused' as const, reason: 'authentication_required' as const }
    }
    if (authenticated.kind === 'not_found') {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const commandKey = `standing-route-authority-use-command:v1:${canonicalDigest({
      principalId: authenticated.principalId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const commandMaterial = {
      requestId: args.requestId,
      policyRef: args.policyRef,
      expectedPolicyDigest: args.expectedPolicyDigest,
      expectedRequestRevision: args.expectedRequestRevision,
      expectedGenerationRef: args.expectedGenerationRef,
      selectedRoutePlanId: args.selectedRoutePlanId,
      delegatedCredentialId: args.delegatedCredentialId,
      mandateExpiresAt: args.mandateExpiresAt,
      idempotencyKey: args.idempotencyKey,
    }
    const commandDigest = canonicalDigest(commandMaterial)
    const replay = await ctx.db.query('customerRequestStandingRouteAuthorityUseCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (replay !== null) {
      const useRow = await ctx.db.query('customerRequestStandingRouteAuthorityUses')
        .withIndex('by_authorityUseRef', (query) => query.eq('authorityUseRef', replay.authorityUseRef)).unique()
      const mandateIssue = await ctx.db.query('customerRequestRouteMandateIssues')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', replay.mandateRef)).unique()
      if (replay.commandDigest !== commandDigest
        || replay.principalId !== authenticated.principalId
        || replay.requestId !== args.requestId
        || replay.standingPolicyRef !== args.policyRef) {
        return { kind: 'conflict' as const, reason: 'command_changed' as const }
      }
      if (useRow === null || mandateIssue === null
        || useRow.authorityUseDigest !== replay.authorityUseDigest
        || useRow.commandDigest !== replay.commandDigest
        || useRow.mandateRef !== replay.mandateRef
        || useRow.mandateDigest !== replay.mandateDigest
        || !validUse(domainUse(useRow.use))
        || canonicalDigest(useRow.use) !== canonicalDigest(replay.result)
        || replay.mandate.mandateRef !== replay.mandateRef
        || replay.mandate.mandateDigest !== replay.mandateDigest
        || !routeMandateIssueRecordIsValid(mandateIssue)
        || canonicalDigest(mandateIssue.mandate) !== canonicalDigest(replay.mandate)) {
        throw new Error('customer_request_standing_route_authority_use_command_integrity_failure')
      }
      return { kind: 'replayed' as const, use: replay.result, mandate: replay.mandate }
    }
    const issueRow = await ctx.db.query('customerRequestStandingRoutePolicyIssues')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', args.policyRef)).unique()
    if (issueRow === null) return { kind: 'refused' as const, reason: 'policy_not_found' as const }
    if (issueRow.policyDigest !== args.expectedPolicyDigest) {
      return { kind: 'conflict' as const, reason: 'policy_changed' as const }
    }
    const storedPolicy = domainPolicy(issueRow.policy)
    const revocation = await ctx.db.query('customerRequestStandingRoutePolicyRevocations')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', args.policyRef)).unique()
    if (revocation !== null && !validPolicyRevocation(revocation, storedPolicy, args.requestId)) {
      return { kind: 'refused' as const, reason: 'policy_integrity_invalid' as const }
    }
    const policy = revocation === null
      ? storedPolicy
      : { ...storedPolicy, revokedAt: revocation.revokedAt }
    if (standingRoutePolicyDigest(policyMaterial(policy)) !== policy.policyDigest
      || policy.policyRef !== args.policyRef
      || issueRow.principalId !== authenticated.principalId
      || issueRow.requestId !== args.requestId) {
      return { kind: 'refused' as const, reason: 'policy_integrity_invalid' as const }
    }
    const delegatedCredential = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', args.delegatedCredentialId)).unique()
    if (delegatedCredential === null
      || !credentialBelongsToAuthenticatedRequest(delegatedCredential, authenticated)
      || !delegatedCredential.scopes.includes('customer_requests:standing_authority')) {
      return { kind: 'refused' as const, reason: 'credential_mismatch' as const }
    }
    const current = await openCurrentRouteGeneration(ctx, args.requestId)
    if (current.kind === 'not_found') {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    if (current.requestRevision !== args.expectedRequestRevision) {
      return { kind: 'conflict' as const, reason: 'request_revision_changed' as const }
    }
    if (current.generation.generationRef !== args.expectedGenerationRef) {
      return { kind: 'conflict' as const, reason: 'route_generation_changed' as const }
    }
    const graphStatus = await currentRoutePlanGenerationGraphStatus(
      ctx.db,
      args.requestId,
      args.expectedGenerationRef,
    )
    if (graphStatus !== 'current') {
      return graphStatus === 'stale'
        ? { kind: 'conflict' as const, reason: 'route_generation_changed' as const }
        : { kind: 'refused' as const, reason: 'generation_changed' as const }
    }
    const rows = await ctx.db.query('customerRequestStandingRouteAuthorityUses')
      .withIndex('by_standingPolicyRef_and_recordedAt', (query) => query.eq('standingPolicyRef', args.policyRef))
      .take(513)
    if (rows.length > 512) return { kind: 'refused' as const, reason: 'prior_use_invalid' as const }
    const evaluated = evaluateStandingRouteAuthority({
      policy,
      generation: current.generation,
      selectedRoutePlanId: args.selectedRoutePlanId,
      authenticatedPrincipalId: authenticated.principalId,
      delegatedCredentialId: args.delegatedCredentialId,
      priorUses: rows.map(({ use }) => domainUse(use)),
      now: Date.now(),
      mandateExpiresAt: args.mandateExpiresAt,
    })
    if (evaluated.kind !== 'authorized') return evaluated
    const compiled = compileRouteMandate({
      generation: current.generation,
      selectedRoutePlanId: args.selectedRoutePlanId,
      principal: {
        principalId: authenticated.principalId,
        authenticationEvidenceRef: `clerk-identity:${canonicalDigest(authenticated.identity)}`,
      },
      authorization: evaluated.authorization,
      maximumTotalSpend: evaluated.use.maximumSpend,
      expiresAt: args.mandateExpiresAt,
      now: evaluated.use.usedAt,
    })
    if (compiled.kind !== 'compiled') {
      return { kind: 'refused' as const, reason: 'policy_integrity_invalid' as const }
    }
    const writable = writableUse(evaluated.use)
    const evidenceMaterial = {
      kind: 'standing_low_risk' as const,
      commandDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      requestRevision: args.expectedRequestRevision,
      generationRef: args.expectedGenerationRef,
      selectedRoutePlanId: args.selectedRoutePlanId,
      standingPolicyRef: policy.policyRef,
      standingPolicyDigest: policy.policyDigest,
      authorityUseRef: writable.authorityUseRef,
      authorityUseDigest: writable.authorityUseDigest,
      delegatedCredentialId: args.delegatedCredentialId,
      maximumTotalSpend: { ...writable.maximumSpend },
      issuedAt: writable.usedAt,
      expiresAt: writable.mandateExpiresAt,
      authenticatedBy: authenticated.identity,
    }
    const evidenceDigest = canonicalDigest(evidenceMaterial)
    const persisted = await persistRouteMandateIssue(ctx, {
      mandate: compiled.mandate,
      evidence: {
        authentication: {
          evidenceRef: `clerk-identity:${canonicalDigest(authenticated.identity)}`,
          ...authenticated.identity,
        },
        authorization: {
          kind: 'standing_low_risk',
          evidenceRef: `route-authorization:standing-low-risk:${evidenceDigest}`,
          evidenceDigest,
          commandDigest,
          principalId: authenticated.principalId,
          requestId: args.requestId,
          requestRevision: args.expectedRequestRevision,
          generationRef: args.expectedGenerationRef,
          selectedRoutePlanId: args.selectedRoutePlanId,
          standingPolicyRef: policy.policyRef,
          standingPolicyDigest: policy.policyDigest,
          authorityUseRef: writable.authorityUseRef,
          authorityUseDigest: writable.authorityUseDigest,
          delegatedCredentialId: args.delegatedCredentialId,
          maximumTotalSpend: { ...writable.maximumSpend },
          issuedAt: writable.usedAt,
          expiresAt: writable.mandateExpiresAt,
          authenticatedActor: { ...authenticated.identity },
        },
      },
      principalId: authenticated.principalId,
      requestId: args.requestId,
      requestRevision: args.expectedRequestRevision,
      generationRef: args.expectedGenerationRef,
      routePlanId: args.selectedRoutePlanId,
      commandKey,
      commandDigest,
      recordedAt: writable.usedAt,
    })
    if (persisted.kind === 'active_mandate_exists') {
      return { kind: 'conflict' as const, reason: 'active_mandate_exists' as const }
    }
    await ctx.db.insert('customerRequestStandingRouteAuthorityUses', {
      authorityUseRef: writable.authorityUseRef,
      authorityUseDigest: writable.authorityUseDigest,
      standingPolicyRef: policy.policyRef,
      standingPolicyDigest: policy.policyDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      delegatedCredentialId: args.delegatedCredentialId,
      mandateRef: persisted.mandate.mandateRef,
      mandateDigest: persisted.mandate.mandateDigest,
      use: writable,
      commandDigest,
      recordedAt: writable.usedAt,
    })
    await ctx.db.insert('customerRequestStandingRouteAuthorityUseCommands', {
      commandKey,
      commandDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      standingPolicyRef: policy.policyRef,
      authorityUseRef: writable.authorityUseRef,
      authorityUseDigest: writable.authorityUseDigest,
      mandateRef: persisted.mandate.mandateRef,
      mandateDigest: persisted.mandate.mandateDigest,
      mandate: persisted.mandate,
      result: writable,
      committedAt: writable.usedAt,
    })
    return { kind: 'issued' as const, use: writable, mandate: persisted.mandate }
  },
})

export const get = internalQuery({
  args: { requestId: v.string(), policyRef: v.string() },
  returns: getResult,
  handler: async (ctx, args) => {
    const authenticated = await authenticateRequestOwner(ctx, args.requestId)
    if (authenticated.kind !== 'authenticated') return { kind: 'not_found' as const }
    const issueRow = await ctx.db.query('customerRequestStandingRoutePolicyIssues')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', args.policyRef)).unique()
    if (issueRow === null
      || issueRow.requestId !== args.requestId
      || issueRow.principalId !== authenticated.principalId) {
      return { kind: 'not_found' as const }
    }
    const storedPolicy = domainPolicy(issueRow.policy)
    if (!validStoredPolicy(issueRow, storedPolicy, args.requestId)) {
      throw new Error('customer_request_standing_route_policy_integrity_failure')
    }
    const revocation = await ctx.db.query('customerRequestStandingRoutePolicyRevocations')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', args.policyRef)).unique()
    if (revocation === null) return { kind: 'active' as const, policy: writablePolicy(storedPolicy) }
    if (!validPolicyRevocation(revocation, storedPolicy, args.requestId)) {
      throw new Error('customer_request_standing_route_policy_revocation_integrity_failure')
    }
    return {
      kind: 'revoked' as const,
      policy: writablePolicy({ ...storedPolicy, revokedAt: revocation.revokedAt }),
    }
  },
})

export const resolvePermission = internalQuery({
  args: { requestId: v.string(), permissionRef: v.string(), principalId: v.string() },
  returns: resolvePermissionResult,
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('customerRequestStandingRoutePolicyIssues')
      .withIndex('by_requestId_and_recordedAt', (query) => query.eq('requestId', args.requestId))
      .order('desc')
      .take(513)
    if (rows.length > 512) throw new Error('customer_request_standing_route_policy_history_overflow')
    const row = rows.find((candidate) => (
      candidate.principalId === args.principalId
      && repeatPermissionRef(candidate.policyRef) === args.permissionRef
    ))
    if (row === undefined) return { kind: 'not_found' as const }
    const policy = domainPolicy(row.policy)
    if (!validStoredPolicy(row, policy, args.requestId)) {
      throw new Error('customer_request_standing_route_policy_integrity_failure')
    }
    const revocation = await ctx.db.query('customerRequestStandingRoutePolicyRevocations')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', policy.policyRef)).unique()
    if (revocation === null) {
      return {
        kind: 'found' as const,
        requestRevision: row.requestRevision,
        policy: writablePolicy(policy),
      }
    }
    if (!validPolicyRevocation(revocation, policy, args.requestId)) {
      throw new Error('customer_request_standing_route_policy_revocation_integrity_failure')
    }
    return {
      kind: 'found' as const,
      requestRevision: row.requestRevision,
      policy: writablePolicy({ ...policy, revokedAt: revocation.revokedAt }),
    }
  },
})

export const revoke = internalMutation({
  args: {
    requestId: v.string(),
    policyRef: v.string(),
    expectedPolicyDigest: v.string(),
    idempotencyKey: v.string(),
  },
  returns: revokeResult,
  handler: async (ctx, args) => {
    const authenticated = await authenticateRequestOwnerForMutation(ctx, args.requestId)
    if (authenticated.kind === 'unauthenticated') {
      return { kind: 'refused' as const, reason: 'authentication_required' as const }
    }
    if (authenticated.kind === 'not_found') {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const commandKey = `standing-route-policy-revocation-command:v1:${canonicalDigest({
      principalId: authenticated.principalId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const commandDigest = canonicalDigest(args)
    const replay = await ctx.db.query('customerRequestStandingRoutePolicyRevocationCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (replay !== null) {
      if (replay.commandDigest !== commandDigest
        || replay.principalId !== authenticated.principalId
        || replay.requestId !== args.requestId
        || replay.policyRef !== args.policyRef) {
        return { kind: 'conflict' as const, reason: 'command_changed' as const }
      }
      const issueRow = await ctx.db.query('customerRequestStandingRoutePolicyIssues')
        .withIndex('by_policyRef', (query) => query.eq('policyRef', args.policyRef)).unique()
      const revocation = await ctx.db.query('customerRequestStandingRoutePolicyRevocations')
        .withIndex('by_revocationRef', (query) => query.eq('revocationRef', replay.revocationRef)).unique()
      if (issueRow === null || revocation === null
        || !validStoredPolicy(issueRow, domainPolicy(issueRow.policy), args.requestId)
        || !validPolicyRevocation(revocation, domainPolicy(issueRow.policy), args.requestId)) {
        throw new Error('customer_request_standing_route_policy_revocation_command_integrity_failure')
      }
      return {
        kind: 'replayed' as const,
        policy: writablePolicy({ ...domainPolicy(issueRow.policy), revokedAt: revocation.revokedAt }),
      }
    }
    const issueRow = await ctx.db.query('customerRequestStandingRoutePolicyIssues')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', args.policyRef)).unique()
    if (issueRow === null
      || issueRow.requestId !== args.requestId
      || issueRow.principalId !== authenticated.principalId) {
      return { kind: 'refused' as const, reason: 'policy_not_found' as const }
    }
    if (issueRow.policyDigest !== args.expectedPolicyDigest) {
      return { kind: 'conflict' as const, reason: 'policy_changed' as const }
    }
    const policy = domainPolicy(issueRow.policy)
    if (!validStoredPolicy(issueRow, policy, args.requestId)) {
      return { kind: 'refused' as const, reason: 'policy_integrity_invalid' as const }
    }
    const existing = await ctx.db.query('customerRequestStandingRoutePolicyRevocations')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', args.policyRef)).unique()
    if (existing !== null) return { kind: 'conflict' as const, reason: 'policy_changed' as const }
    const revokedAt = Date.now()
    const material = {
      policyRef: policy.policyRef,
      policyDigest: policy.policyDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      revokedAt,
    }
    const revocationDigest = canonicalDigest(material)
    const revocationRef = `standing-route-policy-revocation:v1:${revocationDigest}`
    await ctx.db.insert('customerRequestStandingRoutePolicyRevocations', {
      revocationRef,
      revocationDigest,
      ...material,
    })
    await ctx.db.insert('customerRequestStandingRoutePolicyRevocationCommands', {
      commandKey,
      commandDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      policyRef: args.policyRef,
      revocationRef,
      committedAt: revokedAt,
    })
    return { kind: 'revoked' as const, policy: writablePolicy({ ...policy, revokedAt }) }
  },
})

function domainPolicy(value: unknown): StandingRoutePolicy {
  return value as StandingRoutePolicy
}

async function authenticateStandingRequestOwner(
  ctx: Parameters<typeof authenticateRequestOwnerForMutation>[0],
  requestId: string,
  authorization?: StandingServiceAuthorization,
) {
  if (authorization === undefined) {
    return await authenticateRequestOwnerForMutation(ctx, requestId)
  }
  if (authorization.command.requestRef !== requestId) {
    return { kind: 'unauthenticated' as const }
  }
  return await authenticateRequestOwnerForServiceOperation(
    ctx,
    requestId,
    authorization.operation,
    authorization.command,
    authorization.assertion,
  )
}

function domainUse(value: unknown): StandingRouteAuthorityUse {
  return value as StandingRouteAuthorityUse
}

function validUse(use: StandingRouteAuthorityUse): boolean {
  const { authorityUseRef: _ref, authorityUseDigest: _digest, ...material } = use
  return use.authorityUseRef === `standing-authority-use:v1:${use.authorityUseDigest}`
    && canonicalDigest(material) === use.authorityUseDigest
}

function writableUse(use: StandingRouteAuthorityUse) {
  return { ...use, maximumSpend: { ...use.maximumSpend } }
}

function writablePolicy(policy: StandingRoutePolicy) {
  return {
    ...policy,
    routes: policy.routes.map((route) => ({ ...route })),
    capabilityContracts: policy.capabilityContracts.map((contract) => ({ ...contract })),
    allowedEffectClasses: [...policy.allowedEffectClasses],
    limits: {
      ...policy.limits,
      perUseSpend: { ...policy.limits.perUseSpend },
      cumulativeSpend: { ...policy.limits.cumulativeSpend },
    },
    fallback: { ...policy.fallback },
  }
}

function policyMaterial(
  policy: StandingRoutePolicy,
): Omit<StandingRoutePolicy, 'policyRef' | 'policyDigest'> {
  const { policyRef: _policyRef, policyDigest: _policyDigest, ...material } = policy
  return material
}

function validStoredPolicy(
  issueRow: Readonly<{
    policyRef: string
    policyDigest: string
    principalId: string
    requestId: string
    policy: unknown
  }>,
  policy: StandingRoutePolicy,
  requestId: string,
): boolean {
  return standingRoutePolicyDigest(policyMaterial(policy)) === policy.policyDigest
    && policy.policyRef === issueRow.policyRef
    && policy.policyDigest === issueRow.policyDigest
    && policy.principalId === issueRow.principalId
    && issueRow.requestId === requestId
}

function validPolicyRevocation(
  revocation: Readonly<{
    revocationRef: string
    revocationDigest: string
    policyRef: string
    policyDigest: string
    principalId: string
    requestId: string
    revokedAt: number
  }>,
  policy: StandingRoutePolicy,
  requestId: string,
): boolean {
  const material = {
    policyRef: revocation.policyRef,
    policyDigest: revocation.policyDigest,
    principalId: revocation.principalId,
    requestId: revocation.requestId,
    revokedAt: revocation.revokedAt,
  }
  return revocation.policyRef === policy.policyRef
    && revocation.policyDigest === policy.policyDigest
    && revocation.principalId === policy.principalId
    && revocation.requestId === requestId
    && revocation.revocationDigest === canonicalDigest(material)
    && revocation.revocationRef === `standing-route-policy-revocation:v1:${revocation.revocationDigest}`
}

function validIdentifier(value: string): boolean {
  return value.trim().length > 0
}

function validPositiveCount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function validMoney(value: Readonly<{ currency: string; amountMinor: number }>): boolean {
  return value.currency.trim().length > 0
    && Number.isSafeInteger(value.amountMinor)
    && value.amountMinor >= 0
}

function credentialBelongsToAuthenticatedRequest(
  credential: Readonly<{
    principalId: string
    credentialId: string
    ownerTokenIdentifier?: string
  }>,
  authenticated: Readonly<{
    principalId: string
    identity: Readonly<{ tokenIdentifier: string }>
  }>,
): boolean {
  return credential.ownerTokenIdentifier === authenticated.identity.tokenIdentifier
    || (credential.principalId === authenticated.principalId
      && credential.credentialId === authenticated.identity.tokenIdentifier)
}

function repeatPermissionRef(policyRef: string): string {
  return `repeat-permission:${canonicalDigest({ policyRef })}`
}
