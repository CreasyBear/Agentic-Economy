import { v, type Infer } from 'convex/values'

import {
  issueProviderApprovalDecision,
  type ProviderApprovalDecision,
  type ProviderApprovalDecisionCommandResult,
} from '../../../../src/modules/capability-supply/provider-approval'
import { isProviderConnectionAuthorityCurrent } from '../../../../src/modules/capability-supply/provider-connection'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'

const decisionKind = v.union(v.literal('granted'), v.literal('refused'), v.literal('partial'))
const decisionValue = v.object({
  decisionRef: v.string(),
  commandId: v.string(),
  commandDigest: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  connectionRef: v.string(),
  authorityGeneration: v.number(),
  connectionAuthorityDigest: v.string(),
  requestedScopes: v.array(v.string()),
  grantedScopes: v.array(v.string()),
  requestedResources: v.array(v.string()),
  grantedResources: v.array(v.string()),
  decision: decisionKind,
  decisionDigest: v.string(),
  decisionTime: v.number(),
  decisionMakerAuthorityRef: v.string(),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
})

export const issueArgs = {
  commandId: v.string(),
  decisionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  connectionRef: v.string(),
  authorityGeneration: v.number(),
  connectionAuthorityDigest: v.string(),
  requestedScopes: v.array(v.string()),
  grantedScopes: v.array(v.string()),
  requestedResources: v.array(v.string()),
  grantedResources: v.array(v.string()),
  decision: decisionKind,
  decisionMakerAuthorityRef: v.string(),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
  now: v.number(),
}
export const issueResult = v.union(
  v.object({ kind: v.literal('applied'), decision: decisionValue, commandDigest: v.string() }),
  v.object({ kind: v.literal('duplicate'), decision: decisionValue, commandDigest: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'),
      v.literal('invalid_scope'),
      v.literal('invalid_resource'),
      v.literal('invalid_decision'),
      v.literal('invalid_time'),
      v.literal('invalid_generation'),
      v.literal('invalid_digest'),
      v.literal('invalid_evidence'),
      v.literal('connection_not_found'),
      v.literal('connection_not_active'),
      v.literal('stale_generation'),
      v.literal('stale_digest'),
      v.literal('authority_identity_mismatch'),
      v.literal('credential_material_forbidden'),
      v.literal('decision_conflict'),
      v.literal('command_identity_conflict'),
    ),
  }),
)

type IssueArgs = { [K in keyof typeof issueArgs]: Infer<(typeof issueArgs)[K]> }

function toDomain(row: Doc<'capabilityProviderApprovals'>): ProviderApprovalDecision {
  return {
    decisionRef: row.decisionRef,
    commandId: row.commandId,
    commandDigest: row.commandDigest,
    providerRef: row.providerRef,
    providerAccountRef: row.providerAccountRef,
    connectionRef: row.connectionRef,
    authorityGeneration: row.authorityGeneration,
    connectionAuthorityDigest: row.connectionAuthorityDigest,
    requestedScopes: row.requestedScopes,
    grantedScopes: row.grantedScopes,
    requestedResources: row.requestedResources,
    grantedResources: row.grantedResources,
    decision: row.decision,
    decisionDigest: row.decisionDigest,
    decisionTime: row.decisionTime,
    decisionMakerAuthorityRef: row.decisionMakerAuthorityRef,
    reasonCode: row.reasonCode,
    evidenceRefs: row.evidenceRefs,
  }
}

function toRow(decision: ProviderApprovalDecision) {
  return {
    decisionRef: decision.decisionRef,
    commandId: decision.commandId,
    commandDigest: decision.commandDigest,
    providerRef: decision.providerRef,
    providerAccountRef: decision.providerAccountRef,
    connectionRef: decision.connectionRef,
    authorityGeneration: decision.authorityGeneration,
    connectionAuthorityDigest: decision.connectionAuthorityDigest,
    requestedScopes: [...decision.requestedScopes],
    grantedScopes: [...decision.grantedScopes],
    requestedResources: [...decision.requestedResources],
    grantedResources: [...decision.grantedResources],
    decision: decision.decision,
    decisionDigest: decision.decisionDigest,
    decisionTime: decision.decisionTime,
    decisionMakerAuthorityRef: decision.decisionMakerAuthorityRef,
    reasonCode: decision.reasonCode,
    evidenceRefs: [...decision.evidenceRefs],
  }
}

function projectCommandResult(result: ProviderApprovalDecisionCommandResult) {
  if (result.kind === 'refused') return result
  return {
    kind: result.kind,
    decision: toRow(result.decision),
    commandDigest: result.commandDigest,
  }
}

export async function issueHandler(ctx: MutationCtx, args: IssueArgs): Promise<Infer<typeof issueResult>> {
  const [byCommandId, byDecisionRef, byConnectionGeneration] = await Promise.all([
    ctx.db.query('capabilityProviderApprovals')
      .withIndex('by_commandId', (query) => query.eq('commandId', args.commandId)).unique(),
    ctx.db.query('capabilityProviderApprovals')
      .withIndex('by_decisionRef', (query) => query.eq('decisionRef', args.decisionRef)).unique(),
    ctx.db.query('capabilityProviderApprovals')
      .withIndex('by_connectionRef_and_authorityGeneration', (query) => (
        query.eq('connectionRef', args.connectionRef).eq('authorityGeneration', args.authorityGeneration)
      )).unique(),
  ])
  const existing = byCommandId === null && byDecisionRef === null && byConnectionGeneration === null
    ? undefined
    : {
        ...(byCommandId === null ? {} : { byCommandId: toDomain(byCommandId) }),
        ...(byDecisionRef === null ? {} : { byDecisionRef: toDomain(byDecisionRef) }),
        ...(byConnectionGeneration === null ? {} : { byConnectionGeneration: toDomain(byConnectionGeneration) }),
      }
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  const currentAuthority = connection === null || connection.lifecycle !== 'active'
    || !isProviderConnectionAuthorityCurrent(connection)
    ? undefined
    : {
        connectionRef: connection.connectionRef,
        providerRef: connection.providerRef,
        providerAccountRef: connection.providerAccountRef,
        authorityGeneration: connection.authorityGeneration,
        authorityDigest: connection.authorityDigest,
      }
  const result = issueProviderApprovalDecision(args, args.now, currentAuthority, existing)
  if (result.kind === 'refused' && result.code === 'connection_not_found' && connection !== null) {
    return {
      kind: 'refused' as const,
      code: connection.lifecycle === 'active' ? 'invalid_digest' as const : 'connection_not_active' as const,
    }
  }
  if (result.kind === 'applied') await ctx.db.insert('capabilityProviderApprovals', toRow(result.decision))
  return projectCommandResult(result)
}
