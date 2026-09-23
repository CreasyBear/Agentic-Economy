import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../_generated/server'
import { sourceWriteArgs, requireSourceRead, requireSourceWrite } from '../../sourceWriteAdmission'
import { principalValue } from './contracts'
import { resolveCurrentAgentAuthority } from './authorityHandlers'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { toolProcureInputSchema, toolProcureResultSchema } from '@/modules/capability-execution/procure'

const fields = {
  principal: principalValue,
  idempotencyKey: v.string(),
  inputJson: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

export const reserveProcureArgs = fields
export const checkpointProcureArgs = { ...fields, quoteRef: v.string(), quoteJson: v.string() }
export const completeProcureArgs = { ...fields, resultJson: v.string() }
export const procureIdentityResult = v.union(
  v.object({ kind: v.literal('reserved') }),
  v.object({ kind: v.literal('replay'), resultJson: v.union(v.string(), v.null()), quoteRef: v.union(v.string(), v.null()) }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('unauthorized') }),
)

type Args = Infer<typeof principalValue>

type Command = {
  principal: Args
  idempotencyKey: string
  inputJson: string
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

async function admitted(ctx: MutationCtx, args: Command, write: boolean) {
  const source = write
    ? await requireSourceWrite(ctx, args, 'protected_action')
    : await requireSourceRead(args, 'protected_action')
  if (source.kind !== 'accepted') return false
  if (!args.principal.scopes.includes('market_tools:call')) return false
  const authority = await resolveCurrentAgentAuthority(ctx, args.principal, Date.now(), { kind: 'receipt_list' })
  return authority !== null && authority.principal.principalId === args.principal.principalId
}

async function rowFor(ctx: MutationCtx, args: Command) {
  return await ctx.db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => query
      .eq('actorRef', args.principal.principalId)
      .eq('operationName', 'tool.procure')
      .eq('key', args.idempotencyKey))
    .unique()
}

function material(args: Command) {
  const input = toolProcureInputSchema.parse(JSON.parse(args.inputJson))
  if (input.idempotencyKey !== args.idempotencyKey) throw new Error('procure_key_mismatch')
  return canonicalDigest(input)
}

export async function reserveProcureHandler(ctx: MutationCtx, args: Command) {
  if (!await admitted(ctx, args, false)) return { kind: 'unauthorized' as const }
  const digest = material(args)
  const existing = await rowFor(ctx, args)
  if (existing !== null) {
    if (existing.requestHash !== digest || existing.scope !== 'capability_execution') return { kind: 'conflict' as const }
    return { kind: 'replay' as const, resultJson: existing.resultJson ?? null, quoteRef: existing.effectRefs[0] ?? null }
  }
  if (!await admitted(ctx, args, true)) return { kind: 'unauthorized' as const }
  const now = Date.now()
  await ctx.db.insert('operationKeys', {
    scope: 'capability_execution', actorKind: 'agent', actorRef: args.principal.principalId,
    operationName: 'tool.procure', key: args.idempotencyKey, requestHash: digest,
    status: 'in_progress', effectRefs: [], createdAt: now, updatedAt: now,
  })
  return { kind: 'reserved' as const }
}

export async function checkpointProcureHandler(ctx: MutationCtx, args: Command & { quoteRef: string; quoteJson: string }) {
  if (!await admitted(ctx, args, true)) return { kind: 'unauthorized' as const }
  const row = await rowFor(ctx, args)
  if (row === null || row.requestHash !== material(args) || row.scope !== 'capability_execution') return { kind: 'conflict' as const }
  const quote: unknown = JSON.parse(args.quoteJson)
  if (typeof quote !== 'object' || quote === null || !('quoteRef' in quote) || quote.quoteRef !== args.quoteRef) {
    return { kind: 'conflict' as const }
  }
  if (row.effectRefs.length > 0) {
    if (row.effectRefs[0] !== args.quoteRef) return { kind: 'conflict' as const }
    return { kind: 'replay' as const, resultJson: row.resultJson ?? null, quoteRef: args.quoteRef }
  }
  await ctx.db.patch(row._id, { effectRefs: [args.quoteRef], resultJson: args.quoteJson, updatedAt: Date.now() })
  return { kind: 'replay' as const, resultJson: args.quoteJson, quoteRef: args.quoteRef }
}

export async function completeProcureHandler(ctx: MutationCtx, args: Command & { resultJson: string }) {
  if (!await admitted(ctx, args, true)) return { kind: 'unauthorized' as const }
  const row = await rowFor(ctx, args)
  if (row === null || row.requestHash !== material(args) || row.scope !== 'capability_execution') return { kind: 'conflict' as const }
  const result = toolProcureResultSchema.parse(JSON.parse(args.resultJson))
  if (result.idempotencyKey !== args.idempotencyKey) return { kind: 'conflict' as const }
  if ('quoteRef' in result && row.effectRefs[0] !== result.quoteRef) return { kind: 'conflict' as const }
  if (row.status !== 'in_progress') {
    return { kind: 'replay' as const, resultJson: row.resultJson ?? null, quoteRef: row.effectRefs[0] ?? null }
  }
  const resultJson = JSON.stringify(result)
  await ctx.db.patch(row._id, {
    status: result.status === 'refused' || result.status === 'refused_after_dispatch' ? 'failed_terminal' : 'succeeded',
    resultJson, resultHash: canonicalDigest(result),
    effectRefs: 'callRef' in result ? [...row.effectRefs, result.callRef] : row.effectRefs,
    updatedAt: Date.now(),
  })
  return { kind: 'replay' as const, resultJson, quoteRef: row.effectRefs[0] ?? null }
}
