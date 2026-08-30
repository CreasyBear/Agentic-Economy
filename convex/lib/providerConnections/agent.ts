import { v, type Infer } from 'convex/values'

import type { MutationCtx } from '../../_generated/server'
import { agentAccessPrincipalValue, verifySupplyAgentPrincipal } from '../../agentAccessPrincipals'
import { requireSourceWrite, sourceWriteArgs } from '../../sourceWriteAdmission'
import {
  connectX402ProviderConnectionForActor,
  listProviderConnectionsForActor,
  ownerCommandResult,
  ownerProjection,
  projectOwnerProjection,
  readProviderConnectionForActor,
  reauthorizeProviderConnectionForActor,
  retryProviderConnectionCleanupForActor,
  revokeProviderConnectionForActor,
  type ProviderConnectionActor,
} from './owner'
import { lifecycle } from './contracts'
import { toDomain } from './lifecycle'

const agentRequestFields = {
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

const listAgentArgsValue = v.object({
  businessId: v.id('businesses'),
  lifecycle: v.optional(lifecycle),
  limit: v.number(),
  ...agentRequestFields,
})
export const listAgentArgs = listAgentArgsValue.fields

const readAgentArgsValue = v.object({
  connectionRef: v.string(),
  ...agentRequestFields,
})
export const readAgentArgs = readAgentArgsValue.fields

const expectedAuthorityValue = v.object({
  connectionRef: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  commandId: v.string(),
  ...agentRequestFields,
})

export const reconnectAgentArgs = expectedAuthorityValue.fields
export const revokeAgentArgs = expectedAuthorityValue.fields

const retryCleanupAgentArgsValue = v.object({
  connectionRef: v.string(),
  commandId: v.string(),
  ...agentRequestFields,
})
export const retryCleanupAgentArgs = retryCleanupAgentArgsValue.fields

const connectX402AgentArgsValue = v.object({
  businessId: v.id('businesses'),
  resourceUrl: v.string(),
  evidenceRefs: v.array(v.string()),
  commandId: v.string(),
  ...agentRequestFields,
})
export const connectX402AgentArgs = connectX402AgentArgsValue.fields

export const agentConnectionListResult = v.union(
  v.object({
    kind: v.literal('available'),
    businessId: v.string(),
    connections: v.array(ownerProjection),
  }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)

export const agentConnectionReadResult = v.union(
  v.object({ kind: v.literal('found'), connection: ownerProjection }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)

export { ownerCommandResult as agentConnectionCommandResult }

type AgentRequest = Readonly<{
  agentPrincipal: Infer<typeof agentAccessPrincipalValue>
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}>

async function agentActor(
  ctx: MutationCtx,
  args: AgentRequest,
  requireMandate: boolean,
): Promise<ProviderConnectionActor | null> {
  const source = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (source.kind === 'rejected') return null
  const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, requireMandate)
  return admission.kind === 'allowed'
    ? {
        canonicalPrincipalRef: admission.principalId,
        canonicalAccountRef: admission.ownerId,
      }
    : null
}

export async function listAgentHandler(
  ctx: MutationCtx,
  args: Infer<typeof listAgentArgsValue>,
) {
  const actor = await agentActor(ctx, args, false)
  if (actor === null) return { kind: 'error' as const, code: 'unauthenticated' as const }
  if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100) {
    return { kind: 'not_found' as const }
  }
  const connections = await listProviderConnectionsForActor(ctx, args, actor)
  return connections === null
    ? { kind: 'not_found' as const }
    : { kind: 'available' as const, businessId: String(args.businessId), connections }
}

export async function readAgentHandler(
  ctx: MutationCtx,
  args: Infer<typeof readAgentArgsValue>,
) {
  const actor = await agentActor(ctx, args, false)
  if (actor === null) return { kind: 'error' as const, code: 'unauthenticated' as const }
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor, false)
  return owned === null
    ? { kind: 'not_found' as const }
    : { kind: 'found' as const, connection: projectOwnerProjection(toDomain(owned.row), owned.row.updatedAt) }
}

export async function reconnectAgentHandler(
  ctx: MutationCtx,
  args: Infer<typeof expectedAuthorityValue>,
) {
  const actor = await agentActor(ctx, args, true)
  if (actor === null) return { kind: 'refused' as const, code: 'invalid_identity' as const }
  const now = Date.now()
  const result = await reauthorizeProviderConnectionForActor(ctx, args, actor, now)
  if (result.kind === 'refused') return result
  return result.kind === 'applied'
    ? { kind: 'applied' as const, connection: projectOwnerProjection(result.connection, now), commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, connection: projectOwnerProjection(result.connection, now), commandDigest: result.commandDigest }
}

export async function revokeAgentHandler(
  ctx: MutationCtx,
  args: Infer<typeof expectedAuthorityValue>,
) {
  const actor = await agentActor(ctx, args, true)
  return actor === null
    ? { kind: 'refused' as const, code: 'invalid_identity' as const }
    : await revokeProviderConnectionForActor(ctx, args, actor)
}

export async function retryCleanupAgentHandler(
  ctx: MutationCtx,
  args: Infer<typeof retryCleanupAgentArgsValue>,
) {
  const actor = await agentActor(ctx, args, true)
  return actor === null
    ? { kind: 'refused' as const, code: 'invalid_identity' as const }
    : await retryProviderConnectionCleanupForActor(ctx, args, actor)
}

export async function connectX402AgentHandler(
  ctx: MutationCtx,
  args: Infer<typeof connectX402AgentArgsValue>,
) {
  const actor = await agentActor(ctx, args, true)
  return actor === null
    ? { kind: 'refused' as const, code: 'invalid_identity' as const }
    : await connectX402ProviderConnectionForActor(ctx, args, actor)
}
