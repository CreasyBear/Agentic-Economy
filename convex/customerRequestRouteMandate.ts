import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  compileRouteMandate,
  routeMandateAuthorityScopeDigest,
  verifyRouteMandate,
  type RouteMandate,
} from '@/modules/customer-request/route-mandate'
import {
  routePlanGenerationIsInternallyConsistent,
  routePlanGenerationMatchesRequest,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'
import {
  routeMandateIssueEvidenceValue,
  routeMandateValue,
} from '@/modules/customer-request/runtime'

import { env, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import {
  aggregateIsInternallyConsistent,
  currentRoutePlanGenerationGraphStatus,
} from './customerRequestV2'
import {
  routeMandateHeadMatchesIssue,
  routeMandateIssueRecordIsValid,
  routeMandateRevocationRecordIsValid,
  type RouteMandateRevocationRecord,
} from './customerRequestRouteMandateIntegrity'

const MAX_ROUTE_MANDATE_HISTORY_ROWS = 512

const issueCommand = {
  requestId: v.string(),
  expectedRequestRevision: v.number(),
  expectedGenerationRef: v.string(),
  selectedRoutePlanId: v.string(),
  maximumTotalSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
  expiresAt: v.number(),
  idempotencyKey: v.string(),
}
const issueCommandValue = v.object(issueCommand)
const serviceAssertion = v.object({
  principalId: v.string(), ownerId: v.string(), credentialId: v.string(), scopes: v.array(v.string()),
  issuedAt: v.number(), signature: v.string(),
})
const confirmationCommand = v.object({
  requestRef: v.string(), revision: v.number(), routeRef: v.string(), idempotencyKey: v.string(),
})
const serviceAuthorization = v.object({ command: confirmationCommand, assertion: serviceAssertion })

const issueRefusalReason = v.union(
  v.literal('authentication_required'),
  v.literal('request_not_found'),
  v.literal('route_generation_invalid'),
  v.literal('mandate_scope_invalid'),
)

const issueResult = v.union(
  v.object({ kind: v.literal('issued'), mandate: routeMandateValue }),
  v.object({ kind: v.literal('replayed'), mandate: routeMandateValue }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('command_changed'),
      v.literal('request_revision_changed'),
      v.literal('route_generation_changed'),
      v.literal('active_mandate_exists'),
    ),
  }),
  v.object({ kind: v.literal('refused'), reason: issueRefusalReason }),
)

const currentResult = v.union(
  v.object({ kind: v.literal('active'), mandate: routeMandateValue }),
  v.object({ kind: v.literal('none') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('revoked'), mandateRef: v.string(), revocationRef: v.string() }),
  v.object({
    kind: v.literal('superseded'), mandateRef: v.string(), revocationRef: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('expired'), mandateRef: v.string() }),
)

const revocationProjection = v.object({
  revocationRef: v.string(),
  mandateRef: v.string(),
  mandateDigest: v.string(),
  reason: v.union(
    v.literal('customer_revoked'),
    v.literal('request_revised'),
    v.literal('route_generation_superseded'),
  ),
  requestRevision: v.number(),
  generationRef: v.string(),
  supersededByRequestRevision: v.optional(v.number()),
  supersededByGenerationRef: v.optional(v.string()),
  evidenceDigest: v.string(),
  recordedAt: v.number(),
})

const historyResult = v.union(
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('found'),
    issues: v.array(v.object({ mandate: routeMandateValue, evidence: routeMandateIssueEvidenceValue })),
    revocations: v.array(revocationProjection),
  }),
)

const revokeResult = v.union(
  v.object({ kind: v.literal('revoked'), revocation: revocationProjection }),
  v.object({ kind: v.literal('replayed'), revocation: revocationProjection }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('command_changed'), v.literal('mandate_not_current')),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(v.literal('authentication_required'), v.literal('request_not_found')),
  }),
)

type IssueCommand = Infer<typeof issueCommandValue>
type ServiceAuthorization = Infer<typeof serviceAuthorization>
type IssueEvidence = Infer<typeof routeMandateIssueEvidenceValue>
type RouteGeneration = CustomerRequestRoutePlanGeneration
type AuthenticatedRequest = Readonly<{
  principalId: string
  identity: Readonly<{ issuer: string; subject: string; tokenIdentifier: string }>
}>

export const issue = internalMutation({
  args: { ...issueCommand, serviceAuthorization: v.optional(serviceAuthorization) },
  returns: issueResult,
  handler: async (ctx, args) => {
    const authenticated = await authenticateRequestOwnerForMutation(ctx, args.requestId, args.serviceAuthorization)
    if (authenticated.kind === 'unauthenticated') {
      return { kind: 'refused' as const, reason: 'authentication_required' as const }
    }
    if (authenticated.kind === 'not_found') {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    if (args.serviceAuthorization !== undefined
      && (args.serviceAuthorization.command.revision !== args.expectedRequestRevision
        || args.serviceAuthorization.command.routeRef !== customerRouteRef(
          args.expectedGenerationRef, args.selectedRoutePlanId,
        )
        || args.serviceAuthorization.command.idempotencyKey !== args.idempotencyKey)) {
      return { kind: 'refused' as const, reason: 'mandate_scope_invalid' as const }
    }

    const commandKey = routeMandateCommandKey(authenticated.principalId, args)
    const commandDigest = canonicalDigest(issueCommandMaterial(args))
    const priorCommand = await ctx.db.query('customerRequestRouteMandateCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (priorCommand !== null) {
      if (priorCommand.commandDigest !== commandDigest
        || priorCommand.principalId !== authenticated.principalId
        || priorCommand.requestId !== args.requestId
        || priorCommand.mandateRef !== priorCommand.result.mandateRef
        || priorCommand.mandateDigest !== priorCommand.result.mandateDigest) {
        return { kind: 'conflict' as const, reason: 'command_changed' as const }
      }
      const issueRow = await ctx.db.query('customerRequestRouteMandateIssues')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', priorCommand.mandateRef)).unique()
      if (issueRow === null
        || issueRow.mandateDigest !== priorCommand.mandateDigest
        || !routeMandateIssueRecordIsValid(issueRow)
        || canonicalDigest(issueRow.mandate) !== canonicalDigest(priorCommand.result)) {
        throw new Error('customer_request_route_mandate_command_integrity_failure')
      }
      return { kind: 'replayed' as const, mandate: priorCommand.result }
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

    const activeHead = await ctx.db.query('customerRequestRouteMandateHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (activeHead !== null) {
      const revocation = await ctx.db.query('customerRequestRouteMandateRevocations')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', activeHead.currentMandateRef)).unique()
      if (revocation === null) {
        return { kind: 'conflict' as const, reason: 'active_mandate_exists' as const }
      }
      const priorIssue = await ctx.db.query('customerRequestRouteMandateIssues')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', activeHead.currentMandateRef)).unique()
      if (priorIssue === null
        || !routeMandateHeadMatchesIssue(activeHead, priorIssue)
        || !routeMandateRevocationRecordIsValid(revocation, priorIssue)) {
        throw new Error('customer_request_route_mandate_replacement_integrity_failure')
      }
    }

    const issuedAt = Date.now()
    const authenticationEvidence = {
      evidenceRef: `clerk-identity:${canonicalDigest(authenticated.identity)}`,
      ...authenticated.identity,
    }
    const authorizationEvidenceMaterial = {
      kind: 'explicit' as const,
      commandDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      requestRevision: args.expectedRequestRevision,
      generationRef: args.expectedGenerationRef,
      selectedRoutePlanId: args.selectedRoutePlanId,
      maximumTotalSpend: args.maximumTotalSpend,
      issuedAt,
      expiresAt: args.expiresAt,
      authenticatedBy: authenticated.identity,
    }
    const authorizationEvidenceDigest = canonicalDigest(authorizationEvidenceMaterial)
    const authorizationEvidence = {
      kind: 'explicit' as const,
      evidenceRef: `route-authorization:explicit:${authorizationEvidenceDigest}`,
      evidenceDigest: authorizationEvidenceDigest,
      commandDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      requestRevision: args.expectedRequestRevision,
      generationRef: args.expectedGenerationRef,
      selectedRoutePlanId: args.selectedRoutePlanId,
      maximumTotalSpend: { ...args.maximumTotalSpend },
      issuedAt,
      expiresAt: args.expiresAt,
      authenticatedActor: { ...authenticated.identity },
    }
    let authorityScopeDigest: string
    try {
      authorityScopeDigest = routeMandateAuthorityScopeDigest({
        generation: current.generation,
        selectedRoutePlanId: args.selectedRoutePlanId,
        principalId: authenticated.principalId,
        authorizationKind: 'explicit',
        maximumTotalSpend: args.maximumTotalSpend,
        issuedAt,
        expiresAt: args.expiresAt,
      })
    } catch {
      return { kind: 'refused' as const, reason: 'mandate_scope_invalid' as const }
    }
    const authorization = {
      kind: 'explicit' as const,
      authorizationEvidenceRef: authorizationEvidence.evidenceRef,
      authorizationEvidenceDigest,
      authorityScopeDigest,
    }
    const compiled = compileRouteMandate({
      generation: current.generation,
      selectedRoutePlanId: args.selectedRoutePlanId,
      principal: {
        principalId: authenticated.principalId,
        authenticationEvidenceRef: authenticationEvidence.evidenceRef,
      },
      authorization,
      maximumTotalSpend: args.maximumTotalSpend,
      expiresAt: args.expiresAt,
      now: issuedAt,
    })
    if (compiled.kind !== 'compiled') {
      return { kind: 'refused' as const, reason: 'mandate_scope_invalid' as const }
    }
    const persisted = await persistRouteMandateIssue(ctx, {
      mandate: compiled.mandate,
      evidence: { authentication: authenticationEvidence, authorization: authorizationEvidence },
      principalId: authenticated.principalId,
      requestId: args.requestId,
      requestRevision: args.expectedRequestRevision,
      generationRef: args.expectedGenerationRef,
      routePlanId: args.selectedRoutePlanId,
      commandKey,
      commandDigest,
      recordedAt: issuedAt,
    })
    if (persisted.kind === 'active_mandate_exists') {
      return { kind: 'conflict' as const, reason: 'active_mandate_exists' as const }
    }
    return { kind: 'issued' as const, mandate: persisted.mandate }
  },
})

export const revoke = internalMutation({
  args: { requestId: v.string(), mandateRef: v.string(), idempotencyKey: v.string() },
  returns: revokeResult,
  handler: async (ctx, args) => {
    const authenticated = await authenticateRequestOwnerForMutation(ctx, args.requestId)
    if (authenticated.kind === 'unauthenticated') {
      return { kind: 'refused' as const, reason: 'authentication_required' as const }
    }
    if (authenticated.kind === 'not_found') {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const commandKey = `route-mandate:revoke:${canonicalDigest({
      principalId: authenticated.principalId,
      requestId: args.requestId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const commandDigest = canonicalDigest(args)
    const priorCommand = await ctx.db.query('customerRequestRouteMandateRevocationCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (priorCommand !== null) {
      if (priorCommand.commandDigest !== commandDigest
        || priorCommand.principalId !== authenticated.principalId
        || priorCommand.requestId !== args.requestId
        || priorCommand.mandateRef !== args.mandateRef) {
        return { kind: 'conflict' as const, reason: 'command_changed' as const }
      }
      const row = await ctx.db.query('customerRequestRouteMandateRevocations')
        .withIndex('by_revocationRef', (query) => query.eq('revocationRef', priorCommand.revocationRef)).unique()
      const issueRow = row === null ? null : await ctx.db.query('customerRequestRouteMandateIssues')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', row.mandateRef)).unique()
      if (row === null || issueRow === null
        || row.mandateRef !== priorCommand.mandateRef
        || !routeMandateRevocationRecordIsValid(row, issueRow)) {
        throw new Error('customer_request_route_mandate_revocation_command_integrity_failure')
      }
      return { kind: 'replayed' as const, revocation: projectRevocation(row) }
    }
    const head = await ctx.db.query('customerRequestRouteMandateHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head === null || head.principalId !== authenticated.principalId
      || head.currentMandateRef !== args.mandateRef) {
      return { kind: 'conflict' as const, reason: 'mandate_not_current' as const }
    }
    const issueRow = await ctx.db.query('customerRequestRouteMandateIssues')
      .withIndex('by_mandateRef', (query) => query.eq('mandateRef', args.mandateRef)).unique()
    if (issueRow === null || issueRow.principalId !== authenticated.principalId
      || !routeMandateHeadMatchesIssue(head, issueRow)) {
      throw new Error('customer_request_route_mandate_head_integrity_failure')
    }
    const existing = await ctx.db.query('customerRequestRouteMandateRevocations')
      .withIndex('by_mandateRef', (query) => query.eq('mandateRef', args.mandateRef)).unique()
    if (existing !== null) {
      return { kind: 'conflict' as const, reason: 'mandate_not_current' as const }
    }
    const recordedAt = Date.now()
    const evidence = {
      mandateRef: head.currentMandateRef,
      mandateDigest: head.currentMandateDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      requestRevision: head.currentRequestRevision,
      generationRef: head.currentGenerationRef,
      reason: 'customer_revoked' as const,
      recordedAt,
    }
    const evidenceDigest = canonicalDigest(evidence)
    const revocationRef = `route-mandate-revocation:v1:${evidenceDigest}`
    const revocation = {
      revocationRef,
      mandateRef: head.currentMandateRef,
      mandateDigest: head.currentMandateDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      reason: 'customer_revoked' as const,
      requestRevision: head.currentRequestRevision,
      generationRef: head.currentGenerationRef,
      evidenceDigest,
      recordedAt,
    }
    await ctx.db.insert('customerRequestRouteMandateRevocations', revocation)
    await ctx.db.insert('customerRequestRouteMandateRevocationCommands', {
      commandKey,
      commandDigest,
      principalId: authenticated.principalId,
      requestId: args.requestId,
      mandateRef: args.mandateRef,
      revocationRef,
      committedAt: recordedAt,
    })
    return { kind: 'revoked' as const, revocation: projectRevocation(revocation) }
  },
})

export const getCurrent = internalQuery({
  args: { requestId: v.string() },
  returns: currentResult,
  handler: async (ctx, args) => {
    const current = await readCurrentRouteMandateState(ctx, args.requestId)
    return current.kind === 'active'
      ? { kind: 'active' as const, mandate: writableMandate(current.mandate) }
      : current
  },
})

export const getCurrentForPrincipal = internalQuery({
  args: { requestId: v.string(), principalId: v.string() },
  returns: currentResult,
  handler: async (ctx, args) => {
    const current = await readCurrentRouteMandateStateForPrincipal(ctx, args.requestId, args.principalId)
    return current.kind === 'active'
      ? { kind: 'active' as const, mandate: writableMandate(current.mandate) }
      : current
  },
})

export type CurrentRouteMandateState =
  | { kind: 'active'; mandate: RouteMandate; networkId: string }
  | { kind: 'none' | 'not_found' }
  | { kind: 'revoked'; mandateRef: string; revocationRef: string }
  | { kind: 'superseded'; mandateRef: string; revocationRef?: string }
  | { kind: 'expired'; mandateRef: string }

export async function readCurrentRouteMandateState(
  ctx: MutationCtx | QueryCtx,
  requestId: string,
  now = Date.now(),
  options: Readonly<{ requireCurrentGraph?: boolean }> = {},
): Promise<CurrentRouteMandateState> {
  const authenticated = await authenticateRequestOwner(ctx, requestId)
  if (authenticated.kind !== 'authenticated') return { kind: 'not_found' as const }
  return await readCurrentRouteMandateStateForPrincipal(ctx, requestId, authenticated.principalId, now, options)
}

export async function readCurrentRouteMandateStateForPrincipal(
  ctx: MutationCtx | QueryCtx,
  requestId: string,
  principalId: string,
  now = Date.now(),
  options: Readonly<{ requireCurrentGraph?: boolean }> = {},
): Promise<CurrentRouteMandateState> {
  const head = await ctx.db.query('customerRequestRouteMandateHeads')
    .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
  if (head === null) return { kind: 'none' as const }
  if (head.principalId !== principalId) return { kind: 'not_found' as const }
  const issueRow = await ctx.db.query('customerRequestRouteMandateIssues')
    .withIndex('by_mandateRef', (query) => query.eq('mandateRef', head.currentMandateRef)).unique()
  if (issueRow === null || !routeMandateHeadMatchesIssue(head, issueRow)) {
    throw new Error('customer_request_route_mandate_head_integrity_failure')
  }
  const revocation = await ctx.db.query('customerRequestRouteMandateRevocations')
    .withIndex('by_mandateRef', (query) => query.eq('mandateRef', head.currentMandateRef)).unique()
  if (revocation !== null) {
    if (!routeMandateRevocationRecordIsValid(revocation, issueRow)) {
      throw new Error('customer_request_route_mandate_revocation_integrity_failure')
    }
    return revocation.reason === 'customer_revoked'
      ? {
          kind: 'revoked' as const,
          mandateRef: head.currentMandateRef,
          revocationRef: revocation.revocationRef,
        }
      : {
          kind: 'superseded' as const,
          mandateRef: head.currentMandateRef,
          revocationRef: revocation.revocationRef,
        }
  }
  const current = await openCurrentRouteGeneration(ctx, requestId)
  if (current.kind === 'not_found'
    || current.requestRevision !== head.currentRequestRevision
    || current.generation.generationRef !== head.currentGenerationRef) {
    return { kind: 'superseded' as const, mandateRef: head.currentMandateRef }
  }
  if (options.requireCurrentGraph !== false) {
    const graphStatus = await currentRoutePlanGenerationGraphStatus(
      ctx.db,
      requestId,
      head.currentGenerationRef,
      now,
    )
    if (graphStatus !== 'current') {
      return { kind: 'superseded' as const, mandateRef: head.currentMandateRef }
    }
  }
  const verification = verifyRouteMandate({
    mandate: domainMandate(issueRow.mandate),
    generation: current.generation,
    expectedPrincipal: issueRow.mandate.principal,
    expectedAuthorization: issueRow.mandate.authorization,
    now,
  })
  if (verification.kind !== 'verified') {
    if (verification.reason === 'mandate_expired') {
      return { kind: 'expired' as const, mandateRef: head.currentMandateRef }
    }
    throw new Error('customer_request_route_mandate_integrity_failure')
  }
  return { kind: 'active' as const, mandate: verification.mandate, networkId: current.networkId }
}

export const getHistory = internalQuery({
  args: { requestId: v.string() },
  returns: historyResult,
  handler: async (ctx, args) => {
    const authenticated = await authenticateRequestOwner(ctx, args.requestId)
    if (authenticated.kind !== 'authenticated') return { kind: 'not_found' as const }
    const issues = await ctx.db.query('customerRequestRouteMandateIssues')
      .withIndex('by_requestId_and_recordedAt', (query) => query.eq('requestId', args.requestId))
      .take(MAX_ROUTE_MANDATE_HISTORY_ROWS + 1)
    if (issues.length > MAX_ROUTE_MANDATE_HISTORY_ROWS) {
      throw new Error('customer_request_route_mandate_history_limit_exceeded')
    }
    if (issues.some((row) => row.principalId !== authenticated.principalId
      || !routeMandateIssueRecordIsValid(row))) {
      throw new Error('customer_request_route_mandate_history_integrity_failure')
    }
    const revocations = await ctx.db.query('customerRequestRouteMandateRevocations')
      .withIndex('by_requestId_and_recordedAt', (query) => query.eq('requestId', args.requestId))
      .take(MAX_ROUTE_MANDATE_HISTORY_ROWS + 1)
    if (revocations.length > MAX_ROUTE_MANDATE_HISTORY_ROWS) {
      throw new Error('customer_request_route_mandate_history_limit_exceeded')
    }
    if (revocations.some((row) => {
      const issueRow = issues.find((candidate) => candidate.mandateRef === row.mandateRef)
      return row.principalId !== authenticated.principalId
        || issueRow === undefined
        || !routeMandateRevocationRecordIsValid(row, issueRow)
    })) {
      throw new Error('customer_request_route_mandate_history_integrity_failure')
    }
    return {
      kind: 'found' as const,
      issues: issues.map((row) => ({
        mandate: writableMandate(domainMandate(row.mandate)),
        evidence: writableIssueEvidence(row.evidence),
      })),
      revocations: revocations.map(projectRevocation),
    }
  },
})

function routeMandateCommandKey(principalId: string, args: IssueCommand): string {
  return `route-mandate:issue:${canonicalDigest({
    principalId,
    requestId: args.requestId,
    idempotencyKey: args.idempotencyKey,
  })}`
}

export async function persistRouteMandateIssue(
  ctx: MutationCtx,
  input: Readonly<{
    mandate: RouteMandate
    evidence: IssueEvidence
    principalId: string
    requestId: string
    requestRevision: number
    generationRef: string
    routePlanId: string
    commandKey: string
    commandDigest: string
    recordedAt: number
  }>,
): Promise<
  | { kind: 'issued'; mandate: ReturnType<typeof writableMandate> }
  | { kind: 'active_mandate_exists' }
> {
  const activeHead = await ctx.db.query('customerRequestRouteMandateHeads')
    .withIndex('by_requestId', (query) => query.eq('requestId', input.requestId)).unique()
  if (activeHead !== null) {
    const revocation = await ctx.db.query('customerRequestRouteMandateRevocations')
      .withIndex('by_mandateRef', (query) => query.eq('mandateRef', activeHead.currentMandateRef)).unique()
    if (revocation === null) return { kind: 'active_mandate_exists' }
    const priorIssue = await ctx.db.query('customerRequestRouteMandateIssues')
      .withIndex('by_mandateRef', (query) => query.eq('mandateRef', activeHead.currentMandateRef)).unique()
    if (priorIssue === null
      || !routeMandateHeadMatchesIssue(activeHead, priorIssue)
      || !routeMandateRevocationRecordIsValid(revocation, priorIssue)) {
      throw new Error('customer_request_route_mandate_replacement_integrity_failure')
    }
  }
  const mandate = writableMandate(input.mandate)
  const issueRecord = {
    mandateRef: mandate.mandateRef,
    mandateDigest: mandate.mandateDigest,
    principalId: input.principalId,
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    generationRef: input.generationRef,
    routePlanId: input.routePlanId,
    mandate,
    evidence: input.evidence,
    recordedAt: input.recordedAt,
  }
  if (!routeMandateIssueRecordIsValid(issueRecord)) {
    throw new Error('customer_request_route_mandate_issue_integrity_failure')
  }
  const existingIssue = await ctx.db.query('customerRequestRouteMandateIssues')
    .withIndex('by_mandateRef', (query) => query.eq('mandateRef', mandate.mandateRef)).unique()
  if (existingIssue !== null) throw new Error('customer_request_route_mandate_ref_collision')
  await ctx.db.insert('customerRequestRouteMandateIssues', issueRecord)
  if (activeHead === null) {
    await ctx.db.insert('customerRequestRouteMandateHeads', {
      requestId: input.requestId,
      principalId: input.principalId,
      currentMandateRef: mandate.mandateRef,
      currentMandateDigest: mandate.mandateDigest,
      currentRequestRevision: input.requestRevision,
      currentGenerationRef: input.generationRef,
      createdAt: input.recordedAt,
      updatedAt: input.recordedAt,
    })
  } else {
    await ctx.db.patch(activeHead._id, {
      currentMandateRef: mandate.mandateRef,
      currentMandateDigest: mandate.mandateDigest,
      currentRequestRevision: input.requestRevision,
      currentGenerationRef: input.generationRef,
      updatedAt: input.recordedAt,
    })
  }
  await ctx.db.insert('customerRequestRouteMandateCommands', {
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    principalId: input.principalId,
    requestId: input.requestId,
    mandateRef: mandate.mandateRef,
    mandateDigest: mandate.mandateDigest,
    result: mandate,
    committedAt: input.recordedAt,
  })
  return { kind: 'issued', mandate }
}

export async function authenticateRequestOwnerForMutation(
  ctx: MutationCtx,
  requestId: string,
  serviceAuthorization?: ServiceAuthorization,
): Promise<AuthenticatedRequestResult> {
  const identity = await ctx.auth.getUserIdentity()
  const head = await ctx.db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
  if (head === null) return { kind: 'not_found' }
  if (identity === null) {
    const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
    const proof = serviceAuthorization
    if (proof === undefined || key === undefined || key.length < 32
      || proof.command.requestRef !== requestId
      || !proof.assertion.scopes.includes('customer_requests:create')
      || !await verifyCustomerRequestServiceAssertion({
        key, operation: 'confirm', command: proof.command, assertion: proof.assertion,
      })) return { kind: 'unauthenticated' }
    if (head.principalId !== proof.assertion.principalId) return { kind: 'not_found' }
    const recorded = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', proof.assertion.principalId)).unique()
    const recordedScopes = new Set(recorded?.scopes ?? [])
    if (recorded === null || recorded.ownerId !== proof.assertion.ownerId
      || recorded.credentialId !== proof.assertion.credentialId
      || !proof.assertion.scopes.every((scope) => recordedScopes.has(scope))) {
      return { kind: 'unauthenticated' }
    }
    return authenticatedRequest(head.principalId, {
      issuer: 'ae:clerk-api-key', subject: proof.assertion.ownerId,
      tokenIdentifier: proof.assertion.credentialId,
    })
  }
  if (head.principalId !== identity.tokenIdentifier) {
    const delegated = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', head.principalId)).unique()
    if (delegated?.ownerTokenIdentifier !== identity.tokenIdentifier) return { kind: 'not_found' }
  }
  return authenticatedRequest(head.principalId, identity)
}

function issueCommandMaterial(args: IssueCommand): IssueCommand {
  return {
    requestId: args.requestId,
    expectedRequestRevision: args.expectedRequestRevision,
    expectedGenerationRef: args.expectedGenerationRef,
    selectedRoutePlanId: args.selectedRoutePlanId,
    maximumTotalSpend: { ...args.maximumTotalSpend },
    expiresAt: args.expiresAt,
    idempotencyKey: args.idempotencyKey,
  }
}

export async function authenticateRequestOwner(
  ctx: MutationCtx | QueryCtx,
  requestId: string,
): Promise<AuthenticatedRequestResult> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return { kind: 'unauthenticated' }
  const head = await ctx.db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
  if (head === null) return { kind: 'not_found' }
  if (head.principalId !== identity.tokenIdentifier) {
    const delegated = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', head.principalId)).unique()
    if (delegated?.ownerTokenIdentifier !== identity.tokenIdentifier) return { kind: 'not_found' }
  }
  return authenticatedRequest(head.principalId, identity)
}

export type AuthenticatedRequestResult =
  | { kind: 'authenticated'; principalId: string; identity: AuthenticatedRequest['identity'] }
  | { kind: 'unauthenticated' }
  | { kind: 'not_found' }

function authenticatedRequest(
  principalId: string,
  identity: AuthenticatedRequest['identity'],
): Extract<AuthenticatedRequestResult, { kind: 'authenticated' }> {
  return {
    kind: 'authenticated',
    principalId,
    identity: {
      issuer: identity.issuer,
      subject: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
    },
  }
}

export async function openCurrentRouteGeneration(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  requestId: string,
): Promise<{
  kind: 'found'
  requestRevision: number
  networkId: string
  generation: RouteGeneration
} | { kind: 'not_found' }> {
  const requestHead = await ctx.db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
  const routeHead = await ctx.db.query('customerRequestV2RoutePlanHeads')
    .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
  if (requestHead === null || routeHead?.currentGenerationRef === undefined
    || routeHead.currentRequestRevision !== requestHead.currentRevision) return { kind: 'not_found' }
  const revision = await ctx.db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => (
      query.eq('requestId', requestId).eq('requestRevision', requestHead.currentRevision)
    )).unique()
  if (revision === null
    || 'routes' in revision.aggregate.plan
    || revision.aggregate.aggregateDigest !== requestHead.currentAggregateDigest
    || revision.aggregate.snapshot.requestId !== requestId
    || revision.aggregate.snapshot.revision !== requestHead.currentRevision
    || revision.aggregate.snapshot.principalId !== requestHead.principalId
    || !aggregateIsInternallyConsistent(revision.aggregate, requestHead.currentRevision - 1)) {
    throw new Error('customer_request_route_mandate_request_integrity_failure')
  }
  const row = await ctx.db.query('customerRequestV2RoutePlanGenerations')
    .withIndex('by_requestId_and_generationRef', (query) => (
      query.eq('requestId', requestId).eq('generationRef', routeHead.currentGenerationRef as string)
    )).unique()
  if (row === null
    || row.generation !== routeHead.currentGeneration
    || row.generationRef !== routeHead.currentGenerationRef
    || row.generationDigest !== routeHead.currentGenerationDigest
    || row.requestRevision !== requestHead.currentRevision
    || !routePlanGenerationIsInternallyConsistent(domainGeneration(row.routeGeneration), row.generation - 1)
    || !routePlanGenerationMatchesRequest(
      domainGeneration(row.routeGeneration), revision.aggregate.snapshot, row.generation - 1,
    )) {
    throw new Error('customer_request_route_plan_head_integrity_failure')
  }
  return {
    kind: 'found',
    requestRevision: requestHead.currentRevision,
    networkId: revision.aggregate.snapshot.networkId,
    generation: domainGeneration(row.routeGeneration),
  }
}

function domainGeneration(value: unknown): RouteGeneration {
  return value as RouteGeneration
}

function domainMandate(value: unknown): RouteMandate {
  return value as RouteMandate
}

function writableMandate(value: RouteMandate) {
  return {
    ...value,
    principal: { ...value.principal },
    authorization: { ...value.authorization },
    request: { ...value.request },
    route: {
      ...value.route,
      steps: value.route.steps.map((step) => ({
        ...step,
        contractRef: { ...step.contractRef },
        price: { ...step.price },
        dataScope: step.dataScope.map((scope) => ({
          ...scope,
          recipient: { ...scope.recipient },
          purposes: [...scope.purposes],
        })),
        effects: step.effects.map((effect) => ({ ...effect })),
        evidence: step.evidence.map((evidence) => ({ ...evidence })),
        cancellation: { ...step.cancellation, evidenceRefs: [...step.cancellation.evidenceRefs] },
        recovery: { ...step.recovery },
      })),
      maximumTotalSpend: { ...value.route.maximumTotalSpend },
      fallback: {
        ...value.route.fallback,
        alternatives: value.route.fallback.alternatives.map((alternative) => ({ ...alternative })),
      },
    },
  }
}

function writableIssueEvidence(value: IssueEvidence): IssueEvidence {
  return {
    authentication: { ...value.authentication },
    authorization: {
      ...value.authorization,
      maximumTotalSpend: { ...value.authorization.maximumTotalSpend },
      authenticatedActor: { ...value.authorization.authenticatedActor },
    },
  }
}

function projectRevocation(value: RouteMandateRevocationRecord): Infer<typeof revocationProjection> {
  return {
    revocationRef: value.revocationRef,
    mandateRef: value.mandateRef,
    mandateDigest: value.mandateDigest,
    reason: value.reason,
    requestRevision: value.requestRevision,
    generationRef: value.generationRef,
    ...(value.supersededByRequestRevision === undefined
      ? {}
      : { supersededByRequestRevision: value.supersededByRequestRevision }),
    ...(value.supersededByGenerationRef === undefined
      ? {}
      : { supersededByGenerationRef: value.supersededByGenerationRef }),
    evidenceDigest: value.evidenceDigest,
    recordedAt: value.recordedAt,
  }
}
