import { v } from 'convex/values'

import { createBindingRoutingEvidenceSnapshot, isCanonicalAuthorityDigest } from '@/modules/routing-kernel/runtime'

import { internalMutation, internalQuery } from './_generated/server'

const evidenceStanding = v.union(
  v.literal('eligible_observed'), v.literal('eligible_run_bound'), v.literal('eligible_corroborated'),
  v.literal('visible_unbound'), v.literal('ineligible_domain'), v.literal('ineligible_scope'),
  v.literal('held'), v.literal('retracted_or_removed'),
)
const snapshot = v.object({
  contractVersion: v.literal('routing-evidence:v1'), snapshotDigest: v.string(),
  networkId: v.string(), bindingId: v.string(), bindingRegistrationHash: v.string(), environment: v.string(),
  networkPolicyVersion: v.literal('network-policy:binding-evidence:v2'), estimatorVersion: v.literal('execution-reliability-lcb:v1'),
  sourceCommitment: v.string(), observedAt: v.number(), expiresAt: v.number(),
  health: v.object({ state: v.union(v.literal('healthy'), v.literal('degraded'), v.literal('unavailable'), v.literal('frozen'), v.literal('unknown')), evidenceStanding }),
  incident: v.object({ routingEffect: v.union(v.literal('none'), v.literal('deprioritize'), v.literal('exclude_new_routes'), v.literal('freeze')), activeIncidentIds: v.array(v.string()), evidenceStanding }),
  standing: v.object({ evidenceStanding, executionReliability: v.object({ status: v.union(v.literal('sufficient'), v.literal('insufficient_evidence')), sampleSize: v.number(), lowerConfidenceBoundPermille: v.optional(v.number()) }) }),
})

export const admitInternal = internalMutation({
  args: { snapshot, admittedAt: v.number() },
  handler: async (ctx, args) => {
    const candidate = args.snapshot
    const binding = await ctx.db.query('routingKernelBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', candidate.bindingId)).unique()
    if (binding === null || binding.networkId !== candidate.networkId || binding.registrationHash !== candidate.bindingRegistrationHash) {
      return { kind: 'refused' as const, reason: 'binding_identity_mismatch' as const }
    }
    let expectedEnvironment: string
    try { expectedEnvironment = new URL(binding.endpointUrl).origin } catch { return { kind: 'refused' as const, reason: 'binding_environment_invalid' as const } }
    if (candidate.environment !== expectedEnvironment || !isCanonicalAuthorityDigest(candidate.sourceCommitment)
      || candidate.observedAt > args.admittedAt || candidate.expiresAt <= args.admittedAt
      || candidate.expiresAt - candidate.observedAt > 7 * 24 * 60 * 60 * 1_000
      || !validIncident(candidate.incident) || !validReliability(candidate.standing.executionReliability)) {
      return { kind: 'refused' as const, reason: 'snapshot_invalid' as const }
    }
    const { snapshotDigest: _snapshotDigest, ...material } = candidate
    const canonical = createBindingRoutingEvidenceSnapshot(material)
    if (canonical.snapshotDigest !== candidate.snapshotDigest) return { kind: 'refused' as const, reason: 'snapshot_digest_mismatch' as const }
    const exact = await ctx.db.query('routingKernelBindingEvidenceSnapshots').withIndex('by_snapshotDigest', (query) => query.eq('snapshotDigest', candidate.snapshotDigest)).unique()
    if (exact !== null) return { kind: 'admitted' as const, snapshotDigest: exact.snapshotDigest }
    const latest = await ctx.db.query('routingKernelBindingEvidenceSnapshots').withIndex('by_bindingId_observedAt', (query) => query.eq('bindingId', candidate.bindingId)).order('desc').first()
    if (latest !== null && candidate.observedAt <= latest.observedAt) return { kind: 'refused' as const, reason: 'snapshot_not_newer' as const }
    await ctx.db.insert('routingKernelBindingEvidenceSnapshots', { ...candidate, incident: { ...candidate.incident, activeIncidentIds: [...candidate.incident.activeIncidentIds].sort() }, admittedAt: args.admittedAt })
    return { kind: 'admitted' as const, snapshotDigest: candidate.snapshotDigest }
  },
})

export const listCurrent = internalQuery({
  args: { networkId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('routingKernelBindingEvidenceSnapshots').withIndex('by_networkId_observedAt', (query) => query.eq('networkId', args.networkId)).order('desc').take(1_000)
    const current = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (current.has(row.bindingId)) continue
      const quarantine = await ctx.db.query('routingKernelIncidentEvidenceQuarantines')
        .withIndex('by_evidenceRef', (query) => query.eq('evidenceRef', row.snapshotDigest)).first()
      if (quarantine === null) current.set(row.bindingId, row)
    }
    return [...current.values()].sort((left, right) => left.bindingId.localeCompare(right.bindingId)).map(({ _id, _creationTime, admittedAt: _admittedAt, ...value }) => value)
  },
})

function validIncident(input: { routingEffect: 'none' | 'deprioritize' | 'exclude_new_routes' | 'freeze'; activeIncidentIds: string[] }) {
  const ids = input.activeIncidentIds
  return ids.length <= 32 && ids.every((value) => value.trim().length > 0 && value.length <= 200)
    && (input.routingEffect === 'none' || ids.length > 0)
}

function validReliability(input: { status: 'sufficient' | 'insufficient_evidence'; sampleSize: number; lowerConfidenceBoundPermille?: number }) {
  if (!Number.isSafeInteger(input.sampleSize) || input.sampleSize < 0) return false
  if (input.status === 'insufficient_evidence') return input.lowerConfidenceBoundPermille === undefined
  const lowerConfidenceBoundPermille = input.lowerConfidenceBoundPermille
  return input.sampleSize > 0 && lowerConfidenceBoundPermille !== undefined && Number.isSafeInteger(lowerConfidenceBoundPermille)
    && lowerConfidenceBoundPermille >= 0 && lowerConfidenceBoundPermille <= 1_000
}
