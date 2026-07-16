import { v } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  evaluateStandingRouteAuthority,
  standingRoutePolicyDigest,
  type StandingRoutePolicy,
} from '@/modules/customer-request/standing-route-authority'
import { standingRoutePolicyValue } from '@/modules/customer-request/internal/route-mandate-convex-schema'

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

function domainPolicy(value: unknown): StandingRoutePolicy {
  return value as StandingRoutePolicy
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
