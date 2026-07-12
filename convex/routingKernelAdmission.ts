import type { GenericDatabaseWriter } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import { internalMutation, internalQuery } from './_generated/server'

const WINDOW_MS = 60_000
const LEASE_MS = 30_000
const GLOBAL_ACTIVE_LIMIT = 128
const AGENT_ACTIVE_LIMIT = 8
const operations = ['route', 'authorize', 'execute', 'reconcile', 'inspect', 'cancel', 'mcp_control'] as const
type AdmissionOperation = (typeof operations)[number]
const operation = v.union(...operations.map((value) => v.literal(value)))
const agentWindowLimits: Readonly<Record<AdmissionOperation, number>> = {
  route: 60, authorize: 60, execute: 30, reconcile: 60, inspect: 300, cancel: 30, mcp_control: 60,
}
const globalWindowLimits: Readonly<Record<AdmissionOperation, number>> = {
  route: 1_200, authorize: 600, execute: 300, reconcile: 600, inspect: 3_000, cancel: 300, mcp_control: 600,
}
const admissionResult = v.union(
  v.object({ kind: v.literal('admitted'), requestId: v.string(), expiresAt: v.number() }),
  v.object({ kind: v.literal('refused'), reason: v.union(
    v.literal('duplicate_request'), v.literal('agent_quota_exceeded'), v.literal('global_quota_exceeded'),
    v.literal('agent_saturated'), v.literal('kernel_saturated'),
  ), retryAfterMs: v.number() }),
)

export const admit = internalMutation({
  args: { requestId: v.string(), agentId: v.string(), operation, admittedAt: v.number() },
  returns: admissionResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('routingKernelAdmissionLeases').withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (existing !== null) {
      if (existing.agentId === args.agentId && existing.operation === args.operation && existing.status === 'active' && existing.expiresAt > args.admittedAt) {
        return { kind: 'admitted' as const, requestId: existing.requestId, expiresAt: existing.expiresAt }
      }
      return await refuse(ctx.db, args, 'duplicate_request', WINDOW_MS)
    }

    const activeAgent = await ctx.db.query('routingKernelAdmissionLeases')
      .withIndex('by_agentId_and_status_and_expiresAt', (query) => query.eq('agentId', args.agentId).eq('status', 'active').gte('expiresAt', args.admittedAt))
      .take(AGENT_ACTIVE_LIMIT)
    if (activeAgent.length >= AGENT_ACTIVE_LIMIT) return await refuse(ctx.db, args, 'agent_saturated', retryFromLeases(activeAgent, args.admittedAt))
    const activeGlobal = await ctx.db.query('routingKernelAdmissionLeases')
      .withIndex('by_status_and_expiresAt', (query) => query.eq('status', 'active').gte('expiresAt', args.admittedAt))
      .take(GLOBAL_ACTIVE_LIMIT)
    if (activeGlobal.length >= GLOBAL_ACTIVE_LIMIT) return await refuse(ctx.db, args, 'kernel_saturated', retryFromLeases(activeGlobal, args.admittedAt))

    const windowStartedAt = args.admittedAt - WINDOW_MS
    const agentMeterKey = `agent:${args.agentId}:${args.operation}`
    const agentMeters = await ctx.db.query('routingKernelAdmissionMeters')
      .withIndex('by_meterKey_and_admittedAt', (query) => query.eq('meterKey', agentMeterKey).gte('admittedAt', windowStartedAt))
      .take(agentWindowLimits[args.operation])
    if (agentMeters.length >= agentWindowLimits[args.operation]) return await refuse(ctx.db, args, 'agent_quota_exceeded', retryFromMeters(agentMeters, args.admittedAt))
    const globalMeterKey = `global:${args.operation}`
    const globalMeters = await ctx.db.query('routingKernelAdmissionMeters')
      .withIndex('by_meterKey_and_admittedAt', (query) => query.eq('meterKey', globalMeterKey).gte('admittedAt', windowStartedAt))
      .take(globalWindowLimits[args.operation])
    if (globalMeters.length >= globalWindowLimits[args.operation]) return await refuse(ctx.db, args, 'global_quota_exceeded', retryFromMeters(globalMeters, args.admittedAt))

    const expiresAt = args.admittedAt + LEASE_MS
    await ctx.db.insert('routingKernelAdmissionMeters', { meterKey: agentMeterKey, ...args })
    await ctx.db.insert('routingKernelAdmissionMeters', { meterKey: globalMeterKey, ...args })
    await ctx.db.insert('routingKernelAdmissionLeases', { ...args, status: 'active', expiresAt })
    await ctx.db.insert('routingKernelAdmissionDecisions', { ...args, disposition: 'admitted', decidedAt: args.admittedAt })
    return { kind: 'admitted' as const, requestId: args.requestId, expiresAt }
  },
})

export const release = internalMutation({
  args: { requestId: v.string(), releasedAt: v.number() },
  returns: v.union(v.object({ kind: v.literal('released'), requestId: v.string() }), v.object({ kind: v.literal('not_found') })),
  handler: async (ctx, args) => {
    const lease = await ctx.db.query('routingKernelAdmissionLeases').withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (lease === null) return { kind: 'not_found' as const }
    if (lease.status === 'active') await ctx.db.patch(lease._id, { status: 'released', releasedAt: args.releasedAt })
    const decision = await ctx.db.query('routingKernelAdmissionDecisions').withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (decision !== null && decision.disposition === 'admitted' && decision.releasedAt === undefined) await ctx.db.patch(decision._id, { releasedAt: args.releasedAt })
    return { kind: 'released' as const, requestId: args.requestId }
  },
})

export const recoverySnapshot = internalQuery({
  args: { observedAt: v.number() },
  returns: v.object({
    schemaVersion: v.literal('routing-admission-recovery:v1'), observedAt: v.number(),
    active: v.array(v.object({ requestId: v.string(), agentId: v.string(), operation, admittedAt: v.number(), expiresAt: v.number() })),
    recentRefusals: v.array(v.object({ requestId: v.string(), agentId: v.string(), operation, reason: v.union(
      v.literal('duplicate_request'), v.literal('agent_quota_exceeded'), v.literal('global_quota_exceeded'),
      v.literal('agent_saturated'), v.literal('kernel_saturated'),
    ), decidedAt: v.number() })),
  }),
  handler: async (ctx, args) => {
    const active = await ctx.db.query('routingKernelAdmissionLeases')
      .withIndex('by_status_and_expiresAt', (query) => query.eq('status', 'active').gte('expiresAt', args.observedAt)).take(128)
    const recentRefusals = await ctx.db.query('routingKernelAdmissionDecisions')
      .withIndex('by_disposition_and_decidedAt', (query) => query.eq('disposition', 'refused').gte('decidedAt', args.observedAt - WINDOW_MS)).take(256)
    return {
      schemaVersion: 'routing-admission-recovery:v1' as const,
      observedAt: args.observedAt,
      active: active.map(({ requestId, agentId, operation: value, admittedAt, expiresAt }) => ({ requestId, agentId, operation: value, admittedAt, expiresAt })),
      recentRefusals: recentRefusals.flatMap(({ requestId, agentId, operation: value, reason, decidedAt }) => reason === undefined ? [] : [{ requestId, agentId, operation: value, reason, decidedAt }]),
    }
  },
})

async function refuse(
  db: GenericDatabaseWriter<DataModel>,
  args: Readonly<{ requestId: string; agentId: string; operation: AdmissionOperation; admittedAt: number }>,
  reason: 'duplicate_request' | 'agent_quota_exceeded' | 'global_quota_exceeded' | 'agent_saturated' | 'kernel_saturated',
  retryAfterMs: number,
) {
  await db.insert('routingKernelAdmissionDecisions', { ...args, disposition: 'refused', reason, decidedAt: args.admittedAt })
  return { kind: 'refused' as const, reason, retryAfterMs: Math.max(1, retryAfterMs) }
}

function retryFromLeases(rows: Array<{ expiresAt: number }>, now: number): number {
  return Math.min(...rows.map((row) => row.expiresAt)) - now
}

function retryFromMeters(rows: Array<{ admittedAt: number }>, now: number): number {
  return Math.min(...rows.map((row) => row.admittedAt + WINDOW_MS)) - now
}
