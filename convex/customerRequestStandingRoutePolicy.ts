import { v } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  evaluateStandingRouteAuthority,
  standingRoutePolicyDigest,
  type StandingRouteAuthorityUse,
  type StandingRoutePolicy,
} from '@/modules/customer-request/standing-route-authority'
import {
  standingRouteAuthorityUseValue,
  standingRoutePolicyValue,
} from '@/modules/customer-request/internal/route-mandate-convex-schema'

import { internalMutation } from './_generated/server'
import {
  authenticateRequestOwnerForMutation,
  openCurrentRouteGeneration,
} from './customerRequestRouteMandate'
import { currentRoutePlanGenerationGraphStatus } from './customerRequestV2'

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

const reserveUseCommand = {
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
const reserveUseResult = v.union(
  v.object({ kind: v.literal('reserved'), use: standingRouteAuthorityUseValue }),
  v.object({ kind: v.literal('replayed'), use: standingRouteAuthorityUseValue }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('command_changed'),
      v.literal('request_revision_changed'),
      v.literal('route_generation_changed'),
      v.literal('policy_changed'),
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

export const issue = internalMutation({
  args: issueCommand,
  returns: issueResult,
  handler: async (ctx, args) => {
    const authenticated = await authenticateRequestOwnerForMutation(ctx, args.requestId)
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
      || delegatedCredential.ownerTokenIdentifier !== authenticated.identity.tokenIdentifier
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

export const reserveUse = internalMutation({
  args: reserveUseCommand,
  returns: reserveUseResult,
  handler: async (ctx, args) => {
    const authenticated = await authenticateRequestOwnerForMutation(ctx, args.requestId)
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
      if (replay.commandDigest !== commandDigest
        || replay.principalId !== authenticated.principalId
        || replay.requestId !== args.requestId
        || replay.standingPolicyRef !== args.policyRef) {
        return { kind: 'conflict' as const, reason: 'command_changed' as const }
      }
      if (useRow === null
        || useRow.authorityUseDigest !== replay.authorityUseDigest
        || useRow.commandDigest !== replay.commandDigest
        || !validUse(domainUse(useRow.use))
        || canonicalDigest(useRow.use) !== canonicalDigest(replay.result)) {
        throw new Error('customer_request_standing_route_authority_use_command_integrity_failure')
      }
      return { kind: 'replayed' as const, use: replay.result }
    }
    const issueRow = await ctx.db.query('customerRequestStandingRoutePolicyIssues')
      .withIndex('by_policyRef', (query) => query.eq('policyRef', args.policyRef)).unique()
    if (issueRow === null) return { kind: 'refused' as const, reason: 'policy_not_found' as const }
    if (issueRow.policyDigest !== args.expectedPolicyDigest) {
      return { kind: 'conflict' as const, reason: 'policy_changed' as const }
    }
    const policy = domainPolicy(issueRow.policy)
    if (standingRoutePolicyDigest(policyMaterial(policy)) !== policy.policyDigest
      || policy.policyRef !== args.policyRef
      || issueRow.principalId !== authenticated.principalId
      || issueRow.requestId !== args.requestId) {
      return { kind: 'refused' as const, reason: 'policy_integrity_invalid' as const }
    }
    const delegatedCredential = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', args.delegatedCredentialId)).unique()
    if (delegatedCredential === null
      || delegatedCredential.ownerTokenIdentifier !== authenticated.identity.tokenIdentifier
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
    const writable = writableUse(evaluated.use)
    await ctx.db.insert('customerRequestStandingRouteAuthorityUses', {
      authorityUseRef: writable.authorityUseRef,
      authorityUseDigest: writable.authorityUseDigest,
      standingPolicyRef: policy.policyRef,
      standingPolicyDigest: policy.policyDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      delegatedCredentialId: args.delegatedCredentialId,
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
      result: writable,
      committedAt: writable.usedAt,
    })
    return { kind: 'reserved' as const, use: writable }
  },
})

function domainPolicy(value: unknown): StandingRoutePolicy {
  return value as StandingRoutePolicy
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
