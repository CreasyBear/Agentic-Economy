import type { GenericDatabaseWriter } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, internalQuery } from './_generated/server'

const WINDOW_MS = 60_000
const LEASE_MS = 30_000
const TELEMETRY_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000
const KERNEL_TIME_P95_ALERT_MS = 250
const CLEANUP_BATCH_SIZE = 128
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
    await ctx.db.insert('routingKernelAdmissionDecisions', {
      requestId: args.requestId, agentId: args.agentId, operation: args.operation,
      disposition: 'admitted', decidedAt: args.admittedAt,
    })
    return { kind: 'admitted' as const, requestId: args.requestId, expiresAt }
  },
})

export const release = internalMutation({
  args: { requestId: v.string(), releasedAt: v.number(), providerWaitMs: v.optional(v.number()) },
  returns: v.union(v.object({ kind: v.literal('released'), requestId: v.string() }), v.object({ kind: v.literal('not_found') })),
  handler: async (ctx, args) => {
    const lease = await ctx.db.query('routingKernelAdmissionLeases').withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (lease === null) return { kind: 'not_found' as const }
    if (lease.status === 'active') await ctx.db.patch(lease._id, { status: 'released', releasedAt: args.releasedAt })
    const decision = await ctx.db.query('routingKernelAdmissionDecisions').withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (decision !== null && decision.disposition === 'admitted' && decision.releasedAt === undefined) {
      const originDurationMs = Math.max(0, args.releasedAt - lease.admittedAt)
      const providerWaitMs = Math.max(0, Math.min(originDurationMs, args.providerWaitMs ?? 0))
      await ctx.db.patch(decision._id, { releasedAt: args.releasedAt, originDurationMs, providerWaitMs, kernelTimeMs: originDurationMs - providerWaitMs })
    }
    return { kind: 'released' as const, requestId: args.requestId }
  },
})

export const recordProviderWait = internalMutation({
  args: {
    telemetryId: v.string(), requestId: v.string(), bindingId: v.string(),
    operation: v.union(v.literal('quote'), v.literal('execute'), v.literal('reconcile'), v.literal('cancel')),
    providerWaitMs: v.number(), outcome: v.union(v.literal('returned'), v.literal('indeterminate')), observedAt: v.number(),
  },
  returns: v.object({ kind: v.literal('recorded'), telemetryId: v.string() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('routingKernelProviderTelemetry').withIndex('by_telemetryId', (query) => query.eq('telemetryId', args.telemetryId)).unique()
    if (existing === null) await ctx.db.insert('routingKernelProviderTelemetry', { ...args, expiresAt: args.observedAt + TELEMETRY_RETENTION_MS })
    return { kind: 'recorded' as const, telemetryId: args.telemetryId }
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
    metrics: v.object({
      sampleSize: v.number(), kernelTimeP95Ms: v.number(), providerWaitP95Ms: v.number(),
      saturationRefusals: v.number(), globalQuotaRefusals: v.number(),
    }),
    alerts: v.array(v.object({
      code: v.union(v.literal('kernel_time_p95_exceeded'), v.literal('kernel_saturated'), v.literal('global_quota_exceeded')),
      severity: v.union(v.literal('warning'), v.literal('critical')),
      observedValue: v.number(), threshold: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const active = await ctx.db.query('routingKernelAdmissionLeases')
      .withIndex('by_status_and_expiresAt', (query) => query.eq('status', 'active').gte('expiresAt', args.observedAt)).take(128)
    const recentRefusals = await ctx.db.query('routingKernelAdmissionDecisions')
      .withIndex('by_disposition_and_decidedAt', (query) => query.eq('disposition', 'refused').gte('decidedAt', args.observedAt - WINDOW_MS)).take(256)
    const recentDecisions = await ctx.db.query('routingKernelAdmissionDecisions')
      .withIndex('by_decidedAt', (query) => query.gte('decidedAt', args.observedAt - 5 * WINDOW_MS)).take(1_000)
    const completed = recentDecisions.filter((decision) => decision.disposition === 'admitted' && decision.kernelTimeMs !== undefined && decision.providerWaitMs !== undefined)
    const kernelTimeP95Ms = percentile95(completed.map((decision) => decision.kernelTimeMs ?? 0))
    const providerWaitP95Ms = percentile95(completed.map((decision) => decision.providerWaitMs ?? 0))
    const saturationRefusals = recentRefusals.filter((decision) => decision.reason === 'agent_saturated' || decision.reason === 'kernel_saturated').length
    const globalQuotaRefusals = recentRefusals.filter((decision) => decision.reason === 'global_quota_exceeded').length
    const alerts = [
      ...(kernelTimeP95Ms <= KERNEL_TIME_P95_ALERT_MS ? [] : [{ code: 'kernel_time_p95_exceeded' as const, severity: 'warning' as const, observedValue: kernelTimeP95Ms, threshold: KERNEL_TIME_P95_ALERT_MS }]),
      ...(saturationRefusals === 0 ? [] : [{ code: 'kernel_saturated' as const, severity: 'critical' as const, observedValue: saturationRefusals, threshold: 0 }]),
      ...(globalQuotaRefusals === 0 ? [] : [{ code: 'global_quota_exceeded' as const, severity: 'critical' as const, observedValue: globalQuotaRefusals, threshold: 0 }]),
    ]
    return {
      schemaVersion: 'routing-admission-recovery:v1' as const,
      observedAt: args.observedAt,
      active: active.map(({ requestId, agentId, operation: value, admittedAt, expiresAt }) => ({ requestId, agentId, operation: value, admittedAt, expiresAt })),
      recentRefusals: recentRefusals.flatMap(({ requestId, agentId, operation: value, reason, decidedAt }) => reason === undefined ? [] : [{ requestId, agentId, operation: value, reason, decidedAt }]),
      metrics: { sampleSize: completed.length, kernelTimeP95Ms, providerWaitP95Ms, saturationRefusals, globalQuotaRefusals },
      alerts,
    }
  },
})

export const cleanupOperationalRows = internalMutation({
  args: {},
  returns: v.object({ meters: v.number(), leases: v.number(), decisions: v.number(), providerTelemetry: v.number() }),
  handler: async (ctx) => {
    const now = Date.now()
    const meters = await ctx.db.query('routingKernelAdmissionMeters').withIndex('by_admittedAt', (query) => query.lt('admittedAt', now - 2 * WINDOW_MS)).take(CLEANUP_BATCH_SIZE)
    const leases = await ctx.db.query('routingKernelAdmissionLeases').withIndex('by_expiresAt', (query) => query.lt('expiresAt', now - WINDOW_MS)).take(CLEANUP_BATCH_SIZE)
    const decisions = await ctx.db.query('routingKernelAdmissionDecisions').withIndex('by_decidedAt', (query) => query.lt('decidedAt', now - TELEMETRY_RETENTION_MS)).take(CLEANUP_BATCH_SIZE)
    const providerTelemetry = await ctx.db.query('routingKernelProviderTelemetry').withIndex('by_expiresAt', (query) => query.lt('expiresAt', now)).take(CLEANUP_BATCH_SIZE)
    for (const row of [...meters, ...leases, ...decisions, ...providerTelemetry]) await ctx.db.delete(row._id)
    if ([meters, leases, decisions, providerTelemetry].some((rows) => rows.length === CLEANUP_BATCH_SIZE)) {
      await ctx.scheduler.runAfter(0, internal.routingKernelAdmission.cleanupOperationalRows, {})
    }
    return { meters: meters.length, leases: leases.length, decisions: decisions.length, providerTelemetry: providerTelemetry.length }
  },
})

async function refuse(
  db: GenericDatabaseWriter<DataModel>,
  args: Readonly<{ requestId: string; agentId: string; operation: AdmissionOperation; admittedAt: number }>,
  reason: 'duplicate_request' | 'agent_quota_exceeded' | 'global_quota_exceeded' | 'agent_saturated' | 'kernel_saturated',
  retryAfterMs: number,
) {
  await db.insert('routingKernelAdmissionDecisions', {
    requestId: args.requestId, agentId: args.agentId, operation: args.operation,
    disposition: 'refused', reason, decidedAt: args.admittedAt,
  })
  return { kind: 'refused' as const, reason, retryAfterMs: Math.max(1, retryAfterMs) }
}

function retryFromLeases(rows: Array<{ expiresAt: number }>, now: number): number {
  return Math.min(...rows.map((row) => row.expiresAt)) - now
}

function retryFromMeters(rows: Array<{ admittedAt: number }>, now: number): number {
  return Math.min(...rows.map((row) => row.admittedAt + WINDOW_MS)) - now
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
}
