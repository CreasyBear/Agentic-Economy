import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  verifyRouteMandate,
  type RouteMandate,
} from '@/modules/customer-request/route-mandate'
import {
  routePlanGenerationIsInternallyConsistent,
  routePlanGenerationMatchesRequest,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import type {
  AuthenticatedRequestResult,
  IssueEvidence,
  MandateHeadSnapshot,
  MandateIssueSnapshot,
  MandateRevocationSnapshot,
  OpenCurrentRouteGenerationResult,
  PersistIssueInput,
  PersistIssueResult,
  RevocationProjection,
  RouteMandateMutationPorts,
  ServiceAuthorization,
} from '@/modules/customer-request/route-mandate-mutation'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

import { env, type MutationCtx, type QueryCtx } from './_generated/server'
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

type AuthenticatedIdentity = Extract<
  AuthenticatedRequestResult,
  { kind: 'authenticated' }
>['identity']

export type CustomerRequestServiceAssertion = ServiceAuthorization['assertion']

export type CurrentRouteMandateState =
  | { kind: 'active'; mandate: RouteMandate; networkId: string }
  | { kind: 'none' | 'not_found' }
  | { kind: 'revoked'; mandateRef: string; revocationRef: string }
  | { kind: 'superseded'; mandateRef: string; revocationRef?: string }
  | { kind: 'expired'; mandateRef: string }

export function routeMandateMutationPorts(
  ctx: MutationCtx | QueryCtx,
): RouteMandateMutationPorts {
  return {
    now: () => Date.now(),

    authenticateOwnerForMutation: async (requestId, serviceAuthorization) => (
      await authenticateRequestOwnerForMutation(ctx as MutationCtx, requestId, serviceAuthorization)
    ),

    authenticateOwner: async (requestId) => await authenticateRequestOwner(ctx, requestId),

    loadIssueCommand: async (commandKey) => {
      const prior = await ctx.db.query('customerRequestRouteMandateCommands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      if (prior === null) return null
      return {
        commandKey: prior.commandKey,
        commandDigest: prior.commandDigest,
        principalId: prior.principalId,
        requestId: prior.requestId,
        mandateRef: prior.mandateRef,
        mandateDigest: prior.mandateDigest,
        result: domainMandate(prior.result),
      }
    },

    verifyIssueCommandReplay: async (command) => {
      const issueRow = await ctx.db.query('customerRequestRouteMandateIssues')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', command.mandateRef)).unique()
      if (issueRow === null
        || issueRow.mandateDigest !== command.mandateDigest
        || !routeMandateIssueRecordIsValid(issueRow as never)
        || canonicalDigest(issueRow.mandate) !== canonicalDigest(command.result)) {
        throw new Error('customer_request_route_mandate_command_integrity_failure')
      }
      return domainMandate(command.result)
    },

    openCurrentRouteGeneration: async (requestId) => (
      await openCurrentRouteGeneration(ctx, requestId)
    ),

    routePlanGenerationGraphStatus: async (requestId, generationRef) => (
      await currentRoutePlanGenerationGraphStatus(ctx.db, requestId, generationRef)
    ),

    loadMandateHead: async (requestId) => {
      const head = await ctx.db.query('customerRequestRouteMandateHeads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      return head === null ? null : toMandateHead(head)
    },

    loadIssueByMandateRef: async (mandateRef) => {
      const issue = await ctx.db.query('customerRequestRouteMandateIssues')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', mandateRef)).unique()
      return issue === null ? null : toMandateIssue(issue as never)
    },

    loadRevocationByMandateRef: async (mandateRef) => {
      const revocation = await ctx.db.query('customerRequestRouteMandateRevocations')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', mandateRef)).unique()
      return revocation === null ? null : toMandateRevocation(revocation)
    },

    assertReplacementIntegrity: (head, priorIssue, revocation) => {
      if (!routeMandateHeadMatchesIssue(head, priorIssue as never)
        || !routeMandateRevocationRecordIsValid(revocation as never, priorIssue as never)) {
        throw new Error('customer_request_route_mandate_replacement_integrity_failure')
      }
    },

    persistIssue: async (input) => (
      await persistRouteMandateIssue(ctx as MutationCtx, input) as PersistIssueResult
    ),

    loadRevocationCommand: async (commandKey) => {
      const prior = await ctx.db.query('customerRequestRouteMandateRevocationCommands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      if (prior === null) return null
      return {
        commandKey: prior.commandKey,
        commandDigest: prior.commandDigest,
        principalId: prior.principalId,
        requestId: prior.requestId,
        mandateRef: prior.mandateRef,
        revocationRef: prior.revocationRef,
      }
    },

    verifyRevocationCommandReplay: async (command) => {
      const row = await ctx.db.query('customerRequestRouteMandateRevocations')
        .withIndex('by_revocationRef', (query) => query.eq('revocationRef', command.revocationRef))
        .unique()
      const issueRow = row === null
        ? null
        : await ctx.db.query('customerRequestRouteMandateIssues')
          .withIndex('by_mandateRef', (query) => query.eq('mandateRef', row.mandateRef)).unique()
      if (row === null || issueRow === null
        || row.mandateRef !== command.mandateRef
        || !routeMandateRevocationRecordIsValid(row, issueRow as never)) {
        throw new Error('customer_request_route_mandate_revocation_command_integrity_failure')
      }
      return projectRevocation(row)
    },

    assertHeadMatchesIssue: (head, issue) => {
      if (!routeMandateHeadMatchesIssue(head, issue as never)) {
        throw new Error('customer_request_route_mandate_head_integrity_failure')
      }
    },

    commitCustomerRevocation: async (input) => {
      const mutationCtx = ctx as MutationCtx
      const evidence = {
        mandateRef: input.head.currentMandateRef,
        mandateDigest: input.head.currentMandateDigest,
        principalId: input.principalId,
        requestId: input.requestId,
        requestRevision: input.head.currentRequestRevision,
        generationRef: input.head.currentGenerationRef,
        reason: 'customer_revoked' as const,
        recordedAt: input.recordedAt,
      }
      const evidenceDigest = canonicalDigest(evidence)
      const revocationRef = `route-mandate-revocation:v1:${evidenceDigest}`
      const revocation = {
        revocationRef,
        mandateRef: input.head.currentMandateRef,
        mandateDigest: input.head.currentMandateDigest,
        principalId: input.principalId,
        requestId: input.requestId,
        reason: 'customer_revoked' as const,
        requestRevision: input.head.currentRequestRevision,
        generationRef: input.head.currentGenerationRef,
        evidenceDigest,
        recordedAt: input.recordedAt,
      }
      await mutationCtx.db.insert('customerRequestRouteMandateRevocations', revocation)
      await mutationCtx.db.insert('customerRequestRouteMandateRevocationCommands', {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        principalId: input.principalId,
        requestId: input.requestId,
        mandateRef: input.mandateRef,
        revocationRef,
        committedAt: input.recordedAt,
      })
      return projectRevocation(revocation)
    },

    loadHistory: async (requestId, principalId) => {
      const issues = await ctx.db.query('customerRequestRouteMandateIssues')
        .withIndex('by_requestId_and_recordedAt', (query) => query.eq('requestId', requestId))
        .take(MAX_ROUTE_MANDATE_HISTORY_ROWS + 1)
      if (issues.length > MAX_ROUTE_MANDATE_HISTORY_ROWS) {
        throw new Error('customer_request_route_mandate_history_limit_exceeded')
      }
      if (issues.some((row) => row.principalId !== principalId
        || !routeMandateIssueRecordIsValid(row as never))) {
        throw new Error('customer_request_route_mandate_history_integrity_failure')
      }
      const revocations = await ctx.db.query('customerRequestRouteMandateRevocations')
        .withIndex('by_requestId_and_recordedAt', (query) => query.eq('requestId', requestId))
        .take(MAX_ROUTE_MANDATE_HISTORY_ROWS + 1)
      if (revocations.length > MAX_ROUTE_MANDATE_HISTORY_ROWS) {
        throw new Error('customer_request_route_mandate_history_limit_exceeded')
      }
      if (revocations.some((row) => {
        const issueRow = issues.find((candidate) => candidate.mandateRef === row.mandateRef)
        return row.principalId !== principalId
          || issueRow === undefined
          || !routeMandateRevocationRecordIsValid(row, issueRow as never)
      })) {
        throw new Error('customer_request_route_mandate_history_integrity_failure')
      }
      return {
        kind: 'found' as const,
        issues: issues.map((row) => ({
          mandate: writableMandate(domainMandate(row.mandate)),
          evidence: writableIssueEvidence(row.evidence as IssueEvidence),
        })),
        revocations: revocations.map(projectRevocation),
      }
    },
  }
}

export async function persistRouteMandateIssue(
  ctx: MutationCtx,
  input: PersistIssueInput,
): Promise<
  | { kind: 'issued'; mandate: ReturnType<typeof writableMandate> }
  | { kind: 'active_mandate_exists' }
> {
  const activeHead = await ctx.db.query('customerRequestRouteMandateHeads')
    .withIndex('by_requestId', (query) => query.eq('requestId', input.requestId)).unique()
  if (activeHead !== null) {
    const revocation = await ctx.db.query('customerRequestRouteMandateRevocations')
      .withIndex('by_mandateRef', (query) => query.eq('mandateRef', activeHead.currentMandateRef))
      .unique()
    if (revocation === null) return { kind: 'active_mandate_exists' }
    const priorIssue = await ctx.db.query('customerRequestRouteMandateIssues')
      .withIndex('by_mandateRef', (query) => query.eq('mandateRef', activeHead.currentMandateRef))
      .unique()
    if (priorIssue === null
      || !routeMandateHeadMatchesIssue(activeHead, priorIssue as never)
      || !routeMandateRevocationRecordIsValid(revocation, priorIssue as never)) {
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
  if (!routeMandateIssueRecordIsValid(issueRecord as never)) {
    throw new Error('customer_request_route_mandate_issue_integrity_failure')
  }
  const existingIssue = await ctx.db.query('customerRequestRouteMandateIssues')
    .withIndex('by_mandateRef', (query) => query.eq('mandateRef', mandate.mandateRef)).unique()
  if (existingIssue !== null) throw new Error('customer_request_route_mandate_ref_collision')
  await ctx.db.insert('customerRequestRouteMandateIssues', issueRecord as never)
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
    result: mandate as never,
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
    const proof = serviceAuthorization
    if (proof === undefined || proof.command.requestRef !== requestId) {
      return { kind: 'unauthenticated' }
    }
    return await authenticateRequestOwnerForServiceOperation(
      ctx,
      requestId,
      'confirm',
      proof.command,
      proof.assertion,
    )
  }
  if (head.principalId !== identity.tokenIdentifier) {
    const delegated = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', head.principalId)).unique()
    if (delegated?.ownerTokenIdentifier !== identity.tokenIdentifier) return { kind: 'not_found' }
  }
  return authenticatedRequest(head.principalId, identity)
}

export async function authenticateRequestOwnerForServiceOperation(
  ctx: MutationCtx,
  requestId: string,
  operation: string,
  command: Record<string, unknown>,
  assertion: CustomerRequestServiceAssertion,
): Promise<AuthenticatedRequestResult> {
  const head = await ctx.db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
  if (head === null) return { kind: 'not_found' }
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32
    || !assertion.scopes.includes('customer_requests:create')
    || !await verifyCustomerRequestServiceAssertion({
      key,
      operation,
      command: command as never,
      assertion,
    })) return { kind: 'unauthenticated' }
  if (head.principalId !== assertion.principalId) return { kind: 'not_found' }
  const recorded = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', assertion.principalId)).unique()
  const recordedScopes = new Set(recorded?.scopes ?? [])
  if (recorded === null || recorded.ownerId !== assertion.ownerId
    || recorded.credentialId !== assertion.credentialId
    || !assertion.scopes.every((scope) => recordedScopes.has(scope))) {
    return { kind: 'unauthenticated' }
  }
  return authenticatedRequest(head.principalId, {
    issuer: 'ae:clerk-api-key',
    subject: assertion.ownerId,
    tokenIdentifier: assertion.credentialId,
  })
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
    const delegated = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', head.principalId)).unique()
    if (delegated?.ownerTokenIdentifier !== identity.tokenIdentifier) return { kind: 'not_found' }
  }
  return authenticatedRequest(head.principalId, identity)
}

export async function readCurrentRouteMandateState(
  ctx: MutationCtx | QueryCtx,
  requestId: string,
  now = Date.now(),
  options: Readonly<{ requireCurrentGraph?: boolean }> = {},
): Promise<CurrentRouteMandateState> {
  const authenticated = await authenticateRequestOwner(ctx, requestId)
  if (authenticated.kind !== 'authenticated') return { kind: 'not_found' as const }
  return await readCurrentRouteMandateStateForPrincipal(
    ctx, requestId, authenticated.principalId, now, options,
  )
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
  if (issueRow === null || !routeMandateHeadMatchesIssue(head, issueRow as never)) {
    throw new Error('customer_request_route_mandate_head_integrity_failure')
  }
  const revocation = await ctx.db.query('customerRequestRouteMandateRevocations')
    .withIndex('by_mandateRef', (query) => query.eq('mandateRef', head.currentMandateRef)).unique()
  if (revocation !== null) {
    if (!routeMandateRevocationRecordIsValid(revocation, issueRow as never)) {
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

export async function openCurrentRouteGeneration(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  requestId: string,
): Promise<OpenCurrentRouteGenerationResult> {
  const [requestHead, routeHead] = await Promise.all([
    ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique(),
    ctx.db.query('customerRequestV2RoutePlanHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique(),
  ])
  if (requestHead === null || routeHead?.currentGenerationRef === undefined
    || routeHead.currentRequestRevision !== requestHead.currentRevision) {
    return { kind: 'not_found' }
  }
  const revision = await ctx.db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => (
      query.eq('requestId', requestId).eq('requestRevision', requestHead.currentRevision)
    )).unique()
  if (revision === null
    || revision.aggregate.aggregateDigest !== requestHead.currentAggregateDigest
    || revision.aggregate.snapshot.requestId !== requestId
    || revision.aggregate.snapshot.revision !== requestHead.currentRevision
    || revision.aggregate.snapshot.principalId !== requestHead.principalId
    || !aggregateIsInternallyConsistent(
      revision.aggregate as never,
      requestHead.currentRevision - 1,
    )) {
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

export function writableMandate(value: RouteMandate) {
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
        dataScope: step.dataScope.map((scope: RouteMandate['route']['steps'][number]['dataScope'][number]) => ({
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
    authorization: value.authorization.kind === 'explicit'
      ? {
          ...value.authorization,
          maximumTotalSpend: { ...value.authorization.maximumTotalSpend },
          authenticatedActor: { ...value.authorization.authenticatedActor },
        }
      : {
          ...value.authorization,
          maximumTotalSpend: { ...value.authorization.maximumTotalSpend },
          authenticatedActor: { ...value.authorization.authenticatedActor },
        },
  }
}

function projectRevocation(value: RouteMandateRevocationRecord): RevocationProjection {
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

function authenticatedRequest(
  principalId: string,
  identity: AuthenticatedIdentity,
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

function toMandateHead(head: Readonly<{
  requestId: string
  principalId: string
  currentMandateRef: string
  currentMandateDigest: string
  currentRequestRevision: number
  currentGenerationRef: string
}>): MandateHeadSnapshot {
  return {
    requestId: head.requestId,
    principalId: head.principalId,
    currentMandateRef: head.currentMandateRef,
    currentMandateDigest: head.currentMandateDigest,
    currentRequestRevision: head.currentRequestRevision,
    currentGenerationRef: head.currentGenerationRef,
  }
}

function toMandateIssue(issue: Readonly<{
  mandateRef: string
  mandateDigest: string
  principalId: string
  requestId: string
  requestRevision: number
  generationRef: string
  routePlanId: string
  mandate: unknown
  evidence: IssueEvidence
  recordedAt: number
}>): MandateIssueSnapshot {
  return {
    mandateRef: issue.mandateRef,
    mandateDigest: issue.mandateDigest,
    principalId: issue.principalId,
    requestId: issue.requestId,
    requestRevision: issue.requestRevision,
    generationRef: issue.generationRef,
    routePlanId: issue.routePlanId,
    mandate: domainMandate(issue.mandate),
    evidence: issue.evidence,
    recordedAt: issue.recordedAt,
  }
}

function toMandateRevocation(
  revocation: RouteMandateRevocationRecord,
): MandateRevocationSnapshot {
  return {
    revocationRef: revocation.revocationRef,
    mandateRef: revocation.mandateRef,
    mandateDigest: revocation.mandateDigest,
    principalId: revocation.principalId,
    requestId: revocation.requestId,
    reason: revocation.reason,
    requestRevision: revocation.requestRevision,
    generationRef: revocation.generationRef,
    ...(revocation.supersededByRequestRevision === undefined
      ? {}
      : { supersededByRequestRevision: revocation.supersededByRequestRevision }),
    ...(revocation.supersededByGenerationRef === undefined
      ? {}
      : { supersededByGenerationRef: revocation.supersededByGenerationRef }),
    evidenceDigest: revocation.evidenceDigest,
    recordedAt: revocation.recordedAt,
  }
}

function domainGeneration(value: unknown): CustomerRequestRoutePlanGeneration {
  return value as CustomerRequestRoutePlanGeneration
}

function domainMandate(value: unknown): RouteMandate {
  return value as RouteMandate
}
