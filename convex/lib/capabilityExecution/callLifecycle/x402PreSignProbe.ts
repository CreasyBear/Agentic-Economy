import { v } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { jsonObject } from '@/modules/capability-execution/convex'

const PROBE_START_TTL_MS = 60_000

export const beginX402UnpaidProbeArgs = {
  callRef: v.string(),
  expectedDigest: v.string(),
} as const

export const beginX402UnpaidProbeResult = v.union(
  v.object({ kind: v.literal('claimed') }),
  v.object({ kind: v.literal('matched') }),
  v.object({ kind: v.literal('pending') }),
  v.object({ kind: v.literal('refused') }),
)

export async function beginX402UnpaidProbeHandler(
  ctx: MutationCtx,
  args: { callRef: string; expectedDigest: string },
): Promise<{ kind: 'claimed' | 'matched' | 'pending' | 'refused' }> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (row === null || row.authority === undefined) return { kind: 'refused' }
  const probe = row.x402UnpaidProbe
  if (probe?.kind === 'matched') {
    return probe.requirementDigest === args.expectedDigest ? { kind: 'matched' } : { kind: 'refused' }
  }
  if (probe?.kind === 'refused') return { kind: 'refused' }
  if (probe?.kind === 'started') {
    if (Date.now() - probe.startedAt >= PROBE_START_TTL_MS) {
      await ctx.db.patch(row._id, { x402UnpaidProbe: { kind: 'refused' } })
      return { kind: 'refused' }
    }
    return { kind: 'pending' }
  }
  await ctx.db.patch(row._id, { x402UnpaidProbe: { kind: 'started', startedAt: Date.now() } })
  return { kind: 'claimed' }
}

export const finishX402UnpaidProbeArgs = {
  callRef: v.string(),
  outcome: v.union(
    v.object({ kind: v.literal('matched'), requirementDigest: v.string() }),
    v.object({ kind: v.literal('refused') }),
  ),
} as const

export const finishX402UnpaidProbeResult = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('refused') }),
)

export async function finishX402UnpaidProbeHandler(
  ctx: MutationCtx,
  args: {
    callRef: string
    outcome: { kind: 'matched'; requirementDigest: string } | { kind: 'refused' }
  },
): Promise<{ kind: 'recorded' | 'refused' }> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (row?.x402UnpaidProbe?.kind !== 'started') return { kind: 'refused' }
  await ctx.db.patch(row._id, {
    x402UnpaidProbe: args.outcome.kind === 'matched'
      ? { kind: 'matched', requirementDigest: args.outcome.requirementDigest }
      : { kind: 'refused' },
  })
  return { kind: 'recorded' }
}

export const readX402UnpaidProbeAdmissionArgs = {
  callRef: v.string(),
  toolRef: v.string(),
  principalId: v.string(),
  input: jsonObject,
} as const

export const readX402UnpaidProbeAdmissionResult = v.boolean()

export async function readX402UnpaidProbeAdmissionHandler(
  ctx: QueryCtx,
  args: { callRef: string; toolRef: string; principalId: string; input: Record<string, unknown> },
): Promise<boolean> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (row === null || row.authority === undefined || row.x402UnpaidProbe?.kind !== 'started') return false
  if (row.toolRef !== args.toolRef || row.principalId !== args.principalId) return false
  return canonicalDigest(args.input as never) === row.inputDigest
}
