import { v, type Infer } from 'convex/values'

import type { RouteMandate } from '@/modules/customer-request/route-mandate'
import {
  getHistory as getHistoryMachine,
  issue as issueMachine,
  revoke as revokeMachine,
} from '@/modules/customer-request/route-mandate-mutation'
import {
  routeMandateIssueEvidenceValue,
  routeMandateValue,
} from '@/modules/customer-request/runtime'

import { internalMutation, internalQuery } from './_generated/server'
import {
  routeMandateMutationPorts,
  readCurrentRouteMandateState,
  readCurrentRouteMandateStateForPrincipal,
  writableMandate,
} from './customerRequestRouteMandatePorts'

export {
  authenticateRequestOwner,
  authenticateRequestOwnerForMutation,
  authenticateRequestOwnerForServiceOperation,
  openCurrentRouteGeneration,
  persistRouteMandateIssue,
  readCurrentRouteMandateState,
  readCurrentRouteMandateStateForPrincipal,
  type CurrentRouteMandateState,
  type CustomerRequestServiceAssertion,
} from './customerRequestRouteMandatePorts'

export type { AuthenticatedRequestResult } from '@/modules/customer-request/route-mandate-mutation'

const issueCommand = {
  requestId: v.string(),
  expectedRequestRevision: v.number(),
  expectedGenerationRef: v.string(),
  selectedRoutePlanId: v.string(),
  maximumTotalSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
  expiresAt: v.number(),
  idempotencyKey: v.string(),
}
export const serviceAssertion = v.object({
  principalId: v.string(), ownerId: v.string(), credentialId: v.string(), scopes: v.array(v.string()),
  issuedAt: v.number(), signature: v.string(),
})
const confirmationCommand = v.object({
  requestRef: v.string(), revision: v.number(), routeRef: v.string(), idempotencyKey: v.string(),
})
const serviceAuthorization = v.object({
  command: confirmationCommand, assertion: serviceAssertion,
})

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

export const issue = internalMutation({
  args: { ...issueCommand, serviceAuthorization: v.optional(serviceAuthorization) },
  returns: issueResult,
  handler: async (ctx, args): Promise<Infer<typeof issueResult>> => (
    await issueMachine(
      args as unknown as Parameters<typeof issueMachine>[0],
      routeMandateMutationPorts(ctx),
    ) as Infer<typeof issueResult>
  ),
})

export const revoke = internalMutation({
  args: { requestId: v.string(), mandateRef: v.string(), idempotencyKey: v.string() },
  returns: revokeResult,
  handler: async (ctx, args): Promise<Infer<typeof revokeResult>> => (
    await revokeMachine(
      args,
      routeMandateMutationPorts(ctx),
    ) as Infer<typeof revokeResult>
  ),
})

export const getCurrent = internalQuery({
  args: { requestId: v.string() },
  returns: currentResult,
  handler: async (ctx, args): Promise<Infer<typeof currentResult>> => {
    const current = await readCurrentRouteMandateState(ctx, args.requestId)
    return (current.kind === 'active'
      ? { kind: 'active' as const, mandate: writableMandate(current.mandate) }
      : current) as Infer<typeof currentResult>
  },
})

export const getCurrentForPrincipal = internalQuery({
  args: { requestId: v.string(), principalId: v.string() },
  returns: currentResult,
  handler: async (ctx, args): Promise<Infer<typeof currentResult>> => {
    const current = await readCurrentRouteMandateStateForPrincipal(
      ctx, args.requestId, args.principalId,
    )
    return (current.kind === 'active'
      ? { kind: 'active' as const, mandate: writableMandate(current.mandate) }
      : current) as Infer<typeof currentResult>
  },
})

export const getHistory = internalQuery({
  args: { requestId: v.string() },
  returns: historyResult,
  handler: async (ctx, args): Promise<Infer<typeof historyResult>> => (
    await getHistoryMachine(
      args,
      routeMandateMutationPorts(ctx),
    ) as Infer<typeof historyResult>
  ),
})

export type { RouteMandate }
