import { v } from 'convex/values'

import { mutation, query, type MutationCtx } from './_generated/server'

import { resolveAdminAuthority } from './authz'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import {
  admitBasStart,
  computeExternalRunGate,
  createExternalRunEvidence,
  createExternalRunManifest,
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

export const createManifest = mutation({
  args: { manifest: manifestInput, ...writeContext, ...sourceWriteArgs },
  handler: async (ctx, args) => {
    const guard = await requireExternalRunAdmin(ctx, args)
    if (guard.kind === 'refused') return guard
    let manifest: ExternalRunManifest
    try {
      manifest = createExternalRunManifest(args.manifest, Date.now(), guard.actorRef)
    } catch {
      return { kind: 'refused' as const, reason: 'manifest_invalid' as const }
    }
    const existing = await ctx.db.query('externalRunManifests')
      .withIndex('by_runId', (query) => query.eq('runId', manifest.runId))
      .unique()
    if (existing !== null) {
      return existing.manifestDigest === manifest.digest
        ? manifestResult('replayed', existing.manifestJson, existing.manifestDigest)
        : { kind: 'refused' as const, reason: 'manifest_conflict' as const }
    }
    const manifestJson = stableStringify(manifest as never)
    await ctx.db.insert('externalRunManifests', {
      runId: manifest.runId,
      manifestDigest: manifest.digest,
      manifestJson,
      state: 'frozen',
      operationKey: args.operationKey,
      actorRef: guard.actorRef,
      createdAt: manifest.createdAt,
      frozenAt: manifest.frozenAt,
    })
    return manifestResult('accepted', manifestJson, manifest.digest)
  },
})

export const updateManifest = mutation({
  args: { manifest: manifestInput, ...writeContext, ...sourceWriteArgs },
  handler: async (ctx, args) => {
    const guard = await requireExternalRunAdmin(ctx, args)
    if (guard.kind === 'refused') return guard
    const existing = await ctx.db.query('externalRunManifests')
      .withIndex('by_runId', (query) => query.eq('runId', args.manifest.runId))
      .unique()
    if (existing === null) return { kind: 'refused' as const, reason: 'manifest_not_found' as const }
    return {
      kind: 'refused' as const,
      reason: existing.state === 'frozen' ? 'manifest_frozen' as const : 'manifest_update_refused' as const,
      manifestDigest: existing.manifestDigest,
    }
  },
})

export const inspectManifest = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
    const source = await requireExternalRunSourceWrite(ctx, args)
    if (source.kind === 'refused') return source
    const finalized = await ctx.db.query('externalRunGateDecisions')
      .withIndex('by_runId', (query) => query.eq('runId', args.runId))
      .unique()
    if (finalized !== null) return { kind: 'refused' as const, reason: 'run_finalized' as const }
    const manifestRow = await ctx.db.query('externalRunManifests')
      .withIndex('by_runId', (query) => query.eq('runId', args.runId))
      .unique()
    if (manifestRow === null) return { kind: 'refused' as const, reason: 'manifest_not_found' as const }
    let manifest: ExternalRunManifest
    try {
      manifest = parseManifest(manifestRow.manifestJson)
      if (manifest.digest !== manifestRow.manifestDigest || !externalRunManifestIntegrityValid(manifest)) throw new Error('integrity')
    } catch {
      return { kind: 'refused' as const, reason: 'integrity_failure' as const }
    }
    const existing = await ctx.db.query('externalRunStarts')
      .withIndex('by_runId_and_startRef', (query) => query.eq('runId', args.runId).eq('startRef', args.candidate.startRef))
      .unique()
    if (existing !== null) {
      try {
        const storedStart = parseStart(existing.startJson)
        if (storedStart.digest !== existing.startDigest || storedStart.runId !== args.runId || storedStart.startRef !== args.candidate.startRef) {
          throw new Error('integrity')
        }
        const candidateMaterial = stableStringify(args.candidate as never)
        const storedCandidateMaterial = stableStringify({
          startRef: storedStart.startRef,
          startedAt: storedStart.startedAt,
          basOutcome: storedStart.basOutcome,
          attribution: storedStart.attribution,
          consentAccepted: storedStart.consentAccepted,
          providerRef: storedStart.providerRef,
          independentProviderRef: storedStart.independentProviderRef,
        } as never)
        return candidateMaterial === storedCandidateMaterial
          ? { kind: 'replayed' as const, startJson: existing.startJson, startDigest: existing.startDigest }
          : { kind: 'refused' as const, reason: 'start_conflict' as const }
      } catch {
        return { kind: 'refused' as const, reason: 'integrity_failure' as const }
      }
    }
    const admission = admitBasStart(manifest, args.candidate, Date.now())
    if (admission.kind === 'refused') return admission
    const starts = await ctx.db.query('externalRunStarts')
      .withIndex('by_runId_and_startedAt', (query) => query.eq('runId', args.runId))
      .take(MAX_EXTERNAL_RUN_STARTS + 1)
    if (starts.length >= MAX_EXTERNAL_RUN_STARTS) return { kind: 'refused' as const, reason: 'cohort_full' as const }
    const startJson = stableStringify(admission.start as never)
    await ctx.db.insert('externalRunStarts', {
      runId: args.runId,
      startRef: admission.start.startRef,
      startDigest: admission.start.digest,
      startJson,
      providerRef: admission.start.providerRef,
      independentProviderRef: admission.start.independentProviderRef,
      startedAt: admission.start.startedAt,
      operationKey: args.operationKey,
      admittedAt: admission.start.admittedAt,
    })
    return { kind: 'accepted' as const, startJson, startDigest: admission.start.digest }
  },
})

export const recordEvidence = mutation({
  args: { runId: v.string(), evidence: evidenceInput, ...writeContext, ...sourceWriteArgs },
  handler: async (ctx, args) => {
    const source = await requireExternalRunSourceWrite(ctx, args)
    if (source.kind === 'refused') return source
    const finalized = await ctx.db.query('externalRunGateDecisions')
      .withIndex('by_runId', (query) => query.eq('runId', args.runId))
      .unique()
    if (finalized !== null) return { kind: 'refused' as const, reason: 'run_finalized' as const }
    const start = await ctx.db.query('externalRunStarts')
      .withIndex('by_runId_and_startRef', (query) => query.eq('runId', args.runId).eq('startRef', args.evidence.startRef))
      .unique()
    if (start === null) return { kind: 'refused' as const, reason: 'start_not_found' as const }
    let evidence: ExternalRunEvidence
    try {
      evidence = createExternalRunEvidence(args.evidence)
    } catch {
      return { kind: 'refused' as const, reason: 'evidence_invalid' as const }
    }
    if (evidence.providerRef !== undefined && evidence.providerRef !== start.providerRef) {
      return { kind: 'refused' as const, reason: 'provider_evidence_mismatch' as const }
    }
    const existing = await ctx.db.query('externalRunEvidence')
      .withIndex('by_runId_and_evidenceRef', (query) => query.eq('runId', args.runId).eq('evidenceRef', evidence.evidenceRef))
      .unique()
    if (existing !== null) {
      return existing.evidenceDigest === evidence.digest
        ? { kind: 'replayed' as const, evidenceJson: existing.evidenceJson, evidenceDigest: existing.evidenceDigest }
        : { kind: 'refused' as const, reason: 'evidence_conflict' as const }
    }
    const rows = await ctx.db.query('externalRunEvidence')
      .withIndex('by_runId_and_startRef', (query) => query.eq('runId', args.runId).eq('startRef', evidence.startRef))
      .take(MAX_EXTERNAL_RUN_EVIDENCE_PER_START + 1)
    if (rows.length >= MAX_EXTERNAL_RUN_EVIDENCE_PER_START) return { kind: 'refused' as const, reason: 'evidence_limit' as const }
    const evidenceJson = stableStringify(evidence as never)
    await ctx.db.insert('externalRunEvidence', {
      runId: args.runId,
      startRef: evidence.startRef,
      evidenceRef: evidence.evidenceRef,
      evidenceDigest: evidence.digest,
      evidenceJson,
      evidenceClass: evidence.evidenceClass,
      signal: evidence.signal,
      observedAt: evidence.observedAt,
      operationKey: args.operationKey,
    })

    return { kind: 'accepted' as const, evidenceJson, evidenceDigest: evidence.digest }
  },
})
export const finalizeRun = mutation({
  args: { manifest: manifestInput, ...writeContext, ...sourceWriteArgs },
  handler: async (ctx, args) => {
    const guard = await requireExternalRunAdmin(ctx, args)
    if (guard.kind === 'refused') return guard
    const manifestRow = await ctx.db.query('externalRunManifests')
      .withIndex('by_runId', (query) => query.eq('runId', args.manifest.runId))
      .unique()
    if (manifestRow === null) return { kind: 'refused' as const, reason: 'manifest_not_found' as const }
    let manifest: ExternalRunManifest
    try {
      manifest = parseManifest(manifestRow.manifestJson)
      if (manifest.digest !== manifestRow.manifestDigest || !externalRunManifestIntegrityValid(manifest)) throw new Error('manifest_integrity')
    } catch {
      return { kind: 'refused' as const, reason: 'integrity_failure' as const }
    }
    let suppliedManifest: ExternalRunManifest
    try {
      suppliedManifest = createExternalRunManifest(args.manifest, manifest.createdAt, manifest.createdBy)
    } catch {
      return { kind: 'refused' as const, reason: 'manifest_conflict' as const }
    }
    if (suppliedManifest.digest !== manifest.digest) {
      return { kind: 'refused' as const, reason: 'manifest_conflict' as const }
    }
    const existing = await ctx.db.query('externalRunGateDecisions')
      .withIndex('by_runId', (query) => query.eq('runId', args.manifest.runId))
      .unique()
    if (existing !== null) {
      return {
        kind: 'replayed' as const,
        decision: existing.decision,
        reportDigest: existing.reportDigest,
        manifestDigest: existing.manifestDigest,
      }
    }
    try {
      const startRows = await ctx.db.query('externalRunStarts')
        .withIndex('by_runId_and_startedAt', (query) => query.eq('runId', args.manifest.runId))
        .take(MAX_EXTERNAL_RUN_STARTS + 1)
      const evidenceRows = await ctx.db.query('externalRunEvidence')
        .withIndex('by_runId_and_startRef', (query) => query.eq('runId', args.manifest.runId))
        .take(MAX_EXTERNAL_RUN_EVIDENCE + 1)
      if (evidenceRows.length > MAX_EXTERNAL_RUN_EVIDENCE) return { kind: 'refused' as const, reason: 'evidence_limit' as const }
      const gate = computeExternalRunGate(manifest, startRows.map((row) => parseStart(row.startJson)), evidenceRows.map((row) => parseEvidence(row.evidenceJson)))
      await ctx.db.insert('externalRunGateDecisions', {
        runId: manifest.runId,
        manifestDigest: manifest.digest,
        reportDigest: gate.report.reportDigest,
        decision: gate.decision,
        failedGatesJson: stableStringify(gate.failedGates as never),
        operationKey: args.operationKey,
        actorRef: guard.actorRef,
        finalizedAt: Date.now(),
      })
      return {
        kind: 'accepted' as const,
        decision: gate.decision,
        reportDigest: gate.report.reportDigest,
        manifestDigest: manifest.digest,
        failedGates: [...gate.failedGates],
      }
    } catch {
      return { kind: 'refused' as const, reason: 'integrity_failure' as const }
    }
  },
})

export const readReport = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
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

async function requireExternalRunSourceWrite(ctx: MutationCtx, args: SourceWriteArgs): Promise<{ kind: 'allowed' } | { kind: 'refused'; reason: string }> {
  const source = await requireSourceWrite(ctx, args, 'admin_operator')
  return source.kind === 'accepted' ? { kind: 'allowed' } : { kind: 'refused', reason: `source_write_rejected:${source.reason}` }
}

async function requireExternalRunAdmin(ctx: MutationCtx, args: SourceWriteArgs): Promise<{ kind: 'allowed'; actorRef: string } | { kind: 'refused'; reason: string }> {
  const source = await requireExternalRunSourceWrite(ctx, args)
  if (source.kind === 'refused') return source
  const authority = await resolveAdminAuthority({ db: ctx.db, auth: ctx.auth }, 'register_capability_supply')
  return authority.kind === 'allowed'
    ? { kind: 'allowed', actorRef: authority.membership.tokenIdentifier }
    : { kind: 'refused', reason: 'authorization_denied' }
}
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

function manifestResult(kind: 'accepted' | 'replayed', manifestJson: string, manifestDigest: string) {
  return { kind, manifestJson, manifestDigest, state: 'frozen' as const }
}