import { v } from 'convex/values'

import { mutation, query } from './_generated/server'

import { resolveAdminAuthority } from './authz'
import { sourceWriteArgs } from './sourceWriteAdmission'
import {
  computeExternalRunGate,
  externalRunAdmittedStartIntegrityValid,
  externalRunAdmittedStartSchema,
  externalRunEvidenceIntegrityValid,
  externalRunEvidenceSchema,
  externalRunManifestIntegrityValid,
  externalRunManifestSchema,
  type ExternalRunAdmittedStart,
  type ExternalRunEvidence,
  type ExternalRunManifest,
} from '../src/modules/external-run/convex'
import { stableStringify } from '../src/modules/common/stable-hash'

const MAX_EXTERNAL_RUN_STARTS = 12
const MAX_EXTERNAL_RUN_EVIDENCE_PER_START = 64
const MAX_EXTERNAL_RUN_EVIDENCE = MAX_EXTERNAL_RUN_STARTS * MAX_EXTERNAL_RUN_EVIDENCE_PER_START

const manifestInput = v.object({
  runId: v.string(),
  window: v.object({ startsOn: v.string(), endsOn: v.string() }),
  providerRefs: v.array(v.string()),
  independentProviderRefs: v.array(v.string()),
  requiresSettledPayment: v.boolean(),
})
const candidateInput = v.object({
  startRef: v.string(),
  startedAt: v.number(),
  basOutcome: v.union(v.literal('current'), v.literal('overdue')),
  attribution: v.object({ channel: v.string(), campaign: v.optional(v.string()) }),
  consentAccepted: v.boolean(),
  providerRef: v.string(),
  independentProviderRef: v.string(),
})
const evidenceInput = v.object({
  evidenceRef: v.string(),
  startRef: v.string(),
  evidenceClass: v.union(v.literal('sandbox'), v.literal('hosted'), v.literal('provider'), v.literal('customer'), v.literal('payment')),
  providerRef: v.optional(v.string()),
  signal: v.union(
    v.literal('decision_ready_within_24h'), v.literal('blind_preference'), v.literal('provider_backed_completion'),
    v.literal('customer_accepted_next_step'), v.literal('refusal_unknown'), v.literal('false_success_claim'),
    v.literal('false_fulfilment_claim'), v.literal('false_payment_claim'), v.literal('operator_touch_count'),
    v.literal('signed_paid_pilot'), v.literal('settled_real_payment'), v.literal('contribution_margin_minor'),
  ),
  value: v.union(v.boolean(), v.number(), v.string()),
  observedAt: v.number(),
})
const writeContext = {
  operationKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
} as const

function retiredLegacyWriter(): never {
  throw new Error('legacy_writer_retired')
}

export const createManifest = mutation({
  args: { manifest: manifestInput, ...writeContext, ...sourceWriteArgs },
  handler: retiredLegacyWriter,
})

export const updateManifest = mutation({
  args: { manifest: manifestInput, ...writeContext, ...sourceWriteArgs },
  handler: retiredLegacyWriter,
})

export const inspectManifest = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db, auth: ctx.auth }, 'read_admin_readbacks')
    if (authority.kind === 'denied') {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
    const row = await ctx.db.query('externalRunManifests')
      .withIndex('by_runId', (query) => query.eq('runId', args.runId))
      .unique()
    if (row === null) return { kind: 'refused' as const, reason: 'manifest_not_found' as const }
    try {
      const manifest = parseManifest(row.manifestJson)
      if (manifest.digest !== row.manifestDigest || !externalRunManifestIntegrityValid(manifest)) throw new Error('integrity')
      return { kind: 'accepted' as const, manifestJson: row.manifestJson, manifestDigest: row.manifestDigest, state: row.state }
    } catch {
      return { kind: 'refused' as const, reason: 'integrity_failure' as const }
    }
  },
})

export const admitStart = mutation({
  args: { runId: v.string(), candidate: candidateInput, ...writeContext, ...sourceWriteArgs },
  handler: retiredLegacyWriter,
})

export const recordEvidence = mutation({
  args: { runId: v.string(), evidence: evidenceInput, ...writeContext, ...sourceWriteArgs },
  handler: retiredLegacyWriter,
})
export const finalizeRun = mutation({
  args: { manifest: manifestInput, ...writeContext, ...sourceWriteArgs },
  handler: retiredLegacyWriter,
})

export const readReport = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db, auth: ctx.auth }, 'read_admin_readbacks')
    if (authority.kind === 'denied') {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
    const manifestRow = await ctx.db.query('externalRunManifests')
      .withIndex('by_runId', (query) => query.eq('runId', args.runId))
      .unique()
    if (manifestRow === null) return { kind: 'refused' as const, reason: 'manifest_not_found' as const }
    try {
      const manifest = parseManifest(manifestRow.manifestJson)
      if (manifest.digest !== manifestRow.manifestDigest || !externalRunManifestIntegrityValid(manifest)) throw new Error('manifest_integrity')
      const startRows = await ctx.db.query('externalRunStarts')
        .withIndex('by_runId_and_startedAt', (query) => query.eq('runId', args.runId))
        .take(MAX_EXTERNAL_RUN_STARTS + 1)
      const starts = startRows.map((row) => parseStart(row.startJson))
      const evidenceRows = await ctx.db.query('externalRunEvidence')
        .withIndex('by_runId_and_startRef', (query) => query.eq('runId', args.runId))
        .take(MAX_EXTERNAL_RUN_EVIDENCE + 1)
      if (evidenceRows.length > MAX_EXTERNAL_RUN_EVIDENCE) return { kind: 'refused' as const, reason: 'evidence_limit' as const }
      const evidence = evidenceRows.map((row) => parseEvidence(row.evidenceJson))
      const gate = computeExternalRunGate(manifest, starts, evidence)
      const finalRow = await ctx.db.query('externalRunGateDecisions')
        .withIndex('by_runId', (query) => query.eq('runId', args.runId))
        .unique()
      return {
        kind: 'accepted' as const,
        manifestJson: manifestRow.manifestJson,
        manifestDigest: manifest.digest,
        reportJson: stableStringify(gate.report as never),
        reportDigest: gate.report.reportDigest,
        decision: gate.decision,
        finalDecision: finalRow?.decision ?? null,
        finalizedAt: finalRow?.finalizedAt ?? null,
        failedGates: [...gate.failedGates],
      }
    } catch {
      return { kind: 'refused' as const, reason: 'integrity_failure' as const }
    }
  },
})

function parseManifest(value: string): ExternalRunManifest {
  return externalRunManifestSchema.parse(JSON.parse(value))
}
function parseStart(value: string): ExternalRunAdmittedStart {
  const start = externalRunAdmittedStartSchema.parse(JSON.parse(value))
  if (!externalRunAdmittedStartIntegrityValid(start)) throw new Error('start_integrity')
  return start
}

function parseEvidence(value: string): ExternalRunEvidence {
  const evidence = externalRunEvidenceSchema.parse(JSON.parse(value))
  if (!externalRunEvidenceIntegrityValid(evidence)) throw new Error('evidence_integrity')
  return evidence
}
