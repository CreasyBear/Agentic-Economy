import { v } from 'convex/values'

import { internalMutation, mutation, query } from './_generated/server'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { literalUnion } from '../src/modules/common/convex-literals'
import {
  AgentPrincipalReputationTierValues,
  AgentPrincipalSourceVersion,
  AgentPrincipalStatusValues,
  buildAgentPrincipalId,
  ClearanceActionClassValues,
  ClearanceMandateStatusValues,
  ClearanceMandateVersion,
  ClearanceProtocolRecordStatusValues,
  ClearanceProtocolStoreRejectionReasonValues,
  ClearanceSignaturePostureValues,
  ClearanceSignedRecordKindValues,
  consumeClearanceGreenlight,
  createClearanceMandate,
  putClearanceRecordIfAbsentOrSame,
  recordClearanceProofGap,
  type AgentPrincipalRecord,
  type ClearanceProtocolRecord,
  type ConsumeClearanceGreenlightCommand,
} from '../src/modules/clearance/public'

const clearanceProtocolRecordValidator = v.object({
  recordId: v.string(),
  recordKind: literalUnion(ClearanceSignedRecordKindValues),
  principalId: v.string(),
  actionClass: literalUnion(ClearanceActionClassValues),
  actionRef: v.string(),
  mandateId: v.optional(v.string()),
  requestRef: v.optional(v.string()),
  greenlightRef: v.optional(v.string()),
  idempotencyKey: v.string(),
  payloadHash: v.string(),
  signaturePosture: literalUnion(ClearanceSignaturePostureValues),
  keyIdentityRef: v.string(),
  status: literalUnion(ClearanceProtocolRecordStatusValues),
  createdAt: v.number(),
  expiresAt: v.optional(v.number()),
  signature: v.optional(v.string()),
  signedAt: v.optional(v.string()),
  proofGapReason: v.optional(v.string()),
  consumedAt: v.optional(v.number()),
  consumedByRef: v.optional(v.string()),
})

const clearanceProtocolPutResult = v.union(
  v.object({ kind: v.literal('inserted'), record: clearanceProtocolRecordValidator }),
  v.object({ kind: v.literal('replayed'), record: clearanceProtocolRecordValidator }),
  v.object({
    kind: v.literal('rejected'),
    reason: literalUnion(ClearanceProtocolStoreRejectionReasonValues),
    record: v.optional(clearanceProtocolRecordValidator),
  }),
)

const clearanceProtocolConsumeCommandValidator = v.object({
  recordId: v.optional(v.string()),
  greenlightRef: v.optional(v.string()),
  principalId: v.string(),
  actionClass: literalUnion(ClearanceActionClassValues),
  actionRef: v.string(),
  now: v.number(),
  consumedByRef: v.string(),
})

const clearanceProtocolConsumeResult = v.union(
  v.object({ kind: v.literal('consumed'), record: clearanceProtocolRecordValidator }),
  v.object({
    kind: v.literal('rejected'),
    reason: literalUnion(ClearanceProtocolStoreRejectionReasonValues),
    record: v.optional(clearanceProtocolRecordValidator),
  }),
)

const agentPrincipalResult = v.object({
  principalId: v.string(),
  signatureAgent: v.string(),
  keyid: v.string(),
  operatorRef: v.optional(v.string()),
  status: literalUnion(AgentPrincipalStatusValues),
  reputationTier: literalUnion(AgentPrincipalReputationTierValues),
  sourceVersion: v.literal(AgentPrincipalSourceVersion),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  lastVerifiedAt: v.number(),
  requestCount: v.number(),
})

const clearanceMandateResult = v.object({
  mandateId: v.string(),
  principalId: v.string(),
  actionClass: literalUnion(ClearanceActionClassValues),
  actionRef: v.string(),
  allowedScopes: v.array(v.string()),
  status: literalUnion(ClearanceMandateStatusValues),
  sourceVersion: v.literal(ClearanceMandateVersion),
  createdAt: v.number(),
  expiresAt: v.number(),
  revokedAt: v.optional(v.number()),
  maxAmountCents: v.optional(v.number()),
  sourceHash: v.string(),
})

export const registerAgentPrincipal = mutation({
  args: {
    signatureAgent: v.string(),
    keyid: v.string(),
    verifiedAt: v.string(),
    observedAt: v.optional(v.number()),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: agentPrincipalResult,
  handler: async (ctx, args): Promise<AgentPrincipalRecord> => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'agent_identity')
    if (sourceWrite.kind === 'rejected') {
      throw new Error(`agent_identity_source_write_rejected:${sourceWrite.reason}`)
    }

    const now = args.observedAt ?? Date.now()
    const lastVerifiedAt = normalizeVerifiedAt(args.verifiedAt, now)
    const principalId = buildAgentPrincipalId({
      signatureAgent: args.signatureAgent,
      keyid: args.keyid,
    })
    const existing = await ctx.db
      .query('agentPrincipals')
      .withIndex('by_signatureAgent_keyid', (q) =>
        q.eq('signatureAgent', args.signatureAgent).eq('keyid', args.keyid)
      )
      .unique()

    if (existing !== null) {
      const updated: AgentPrincipalRecord = {
        principalId: existing.principalId,
        signatureAgent: existing.signatureAgent,
        keyid: existing.keyid,
        ...(existing.operatorRef === undefined ? {} : { operatorRef: existing.operatorRef }),
        status: existing.status,
        reputationTier: existing.reputationTier,
        sourceVersion: existing.sourceVersion,
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: now,
        lastVerifiedAt,
        requestCount: existing.requestCount + 1,
      }
      await ctx.db.patch(existing._id, {
        lastSeenAt: updated.lastSeenAt,
        lastVerifiedAt: updated.lastVerifiedAt,
        requestCount: updated.requestCount,
      })
      return updated
    }

    const created: AgentPrincipalRecord = {
      principalId,
      signatureAgent: args.signatureAgent,
      keyid: args.keyid,
      status: 'active',
      reputationTier: 'unrated',
      sourceVersion: AgentPrincipalSourceVersion,
      firstSeenAt: now,
      lastSeenAt: now,
      lastVerifiedAt,
      requestCount: 1,
    }
    await ctx.db.insert('agentPrincipals', created)
    return created
  },
})

export const readDevAgentPrincipalByIdentity = query({
  args: {
    signatureAgent: v.string(),
    keyid: v.string(),
    smokeSecret: v.string(),
  },
  returns: v.union(agentPrincipalResult, v.null()),
  handler: async (ctx, args): Promise<AgentPrincipalRecord | null> => {
    const expectedSecret = readEnv('AE_DEV_WBA_SMOKE_SECRET')
    if (
      readEnv('AE_DEV_WBA_SMOKE_ENABLED') !== '1' ||
      expectedSecret === undefined ||
      args.smokeSecret !== expectedSecret
    ) {
      throw new Error('WBA dev-smoke principal readback is disabled.')
    }

    const existing = await ctx.db
      .query('agentPrincipals')
      .withIndex('by_signatureAgent_keyid', (q) =>
        q.eq('signatureAgent', args.signatureAgent).eq('keyid', args.keyid)
      )
      .unique()

    if (existing === null) {
      return null
    }

    return {
      principalId: existing.principalId,
      signatureAgent: existing.signatureAgent,
      keyid: existing.keyid,
      ...(existing.operatorRef === undefined ? {} : { operatorRef: existing.operatorRef }),
      status: existing.status,
      reputationTier: existing.reputationTier,
      sourceVersion: existing.sourceVersion,
      firstSeenAt: existing.firstSeenAt,
      lastSeenAt: existing.lastSeenAt,
      lastVerifiedAt: existing.lastVerifiedAt,
      requestCount: existing.requestCount,
    }
  },
})

export const readActiveAgentToolMandate = query({
  args: {
    principalId: v.string(),
    actionRef: v.string(),
  },
  returns: v.union(clearanceMandateResult, v.null()),
  handler: async (ctx, args) => {
    const now = Date.now()
    const candidates = await ctx.db
      .query('clearanceMandates')
      .withIndex('by_principal_action_ref_status_expiresAt', (q) =>
        q.eq('principalId', args.principalId)
          .eq('actionClass', 'contact_follow_up')
          .eq('actionRef', args.actionRef)
          .eq('status', 'active')
          .gt('expiresAt', now)
      )

    for await (const admitted of candidates) {
      if (!admitted.allowedScopes.includes('public_inquiry')) {
        continue
      }

      return {
        mandateId: admitted.mandateId,
        principalId: admitted.principalId,
        actionClass: admitted.actionClass,
        actionRef: admitted.actionRef,
        allowedScopes: admitted.allowedScopes,
        status: admitted.status,
        sourceVersion: admitted.sourceVersion,
        createdAt: admitted.createdAt,
        expiresAt: admitted.expiresAt,
        ...(admitted.revokedAt === undefined ? {} : { revokedAt: admitted.revokedAt }),
        ...(admitted.maxAmountCents === undefined ? {} : { maxAmountCents: admitted.maxAmountCents }),
        sourceHash: admitted.sourceHash,
      }
    }

    return null
  },
})

/**
 * Operator/source-write gated issue of a public_inquiry mandate for inquiry.submit.
 * Used to admit a verified Signature-Agent principal for the product loop audit.
 */
export const issuePublicInquiryMandate = mutation({
  args: {
    principalId: v.string(),
    expiresAt: v.number(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: clearanceMandateResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
    if (sourceWrite.kind === 'rejected') {
      throw new Error(`mandate_source_write_rejected:${sourceWrite.reason}`)
    }

    return persistPublicInquiryMandate(ctx, {
      principalId: args.principalId,
      expiresAt: args.expiresAt,
    })
  },
})

/**
 * CLI/ops path for product-loop audits. Requires AE_AUDIT_MANDATE_ISSUE_SECRET on Convex
 * to match the caller secret. Does not use HTTP source-write admission.
 */
export const issuePublicInquiryMandateForAudit = mutation({
  args: {
    principalId: v.string(),
    expiresAt: v.number(),
    issueSecret: v.string(),
  },
  returns: clearanceMandateResult,
  handler: async (ctx, args) => {
    const expected = readEnv('AE_AUDIT_MANDATE_ISSUE_SECRET')
    if (expected === undefined || args.issueSecret !== expected) {
      throw new Error('mandate_issue_secret_rejected')
    }

    return persistPublicInquiryMandate(ctx, {
      principalId: args.principalId,
      expiresAt: args.expiresAt,
    })
  },
})

async function persistPublicInquiryMandate(
  // Convex mutation ctx — keep loose to avoid coupling this helper to generated Db types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  input: { principalId: string; expiresAt: number },
) {
  if (!Number.isFinite(input.expiresAt) || input.expiresAt <= Date.now()) {
    throw new Error('mandate_expires_at_invalid')
  }

  const mandate = createClearanceMandate({
    principalId: input.principalId,
    actionClass: 'contact_follow_up',
    actionRef: 'inquiry.submit',
    allowedScopes: ['public_inquiry'],
    createdAt: Date.now(),
    expiresAt: input.expiresAt,
    status: 'active',
  })

  const existing = await ctx.db
    .query('clearanceMandates')
    .withIndex('by_mandateId', (q: { eq: (field: string, value: string) => unknown }) =>
      q.eq('mandateId', mandate.mandateId),
    )
    .unique()

  if (existing === null) {
    await ctx.db.insert('clearanceMandates', {
      mandateId: mandate.mandateId,
      principalId: mandate.principalId,
      actionClass: mandate.actionClass,
      actionRef: mandate.actionRef,
      allowedScopes: [...mandate.allowedScopes],
      status: mandate.status,
      sourceVersion: mandate.sourceVersion,
      createdAt: mandate.createdAt,
      expiresAt: mandate.expiresAt,
      sourceHash: mandate.sourceHash,
    })
  }

  return {
    mandateId: mandate.mandateId,
    principalId: mandate.principalId,
    actionClass: mandate.actionClass,
    actionRef: mandate.actionRef,
    allowedScopes: [...mandate.allowedScopes],
    status: mandate.status,
    sourceVersion: mandate.sourceVersion,
    createdAt: mandate.createdAt,
    expiresAt: mandate.expiresAt,
    sourceHash: mandate.sourceHash,
  }
}

function normalizeVerifiedAt(value: string, fallback: number): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function readEnv(name: string): string | undefined {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}


export const putHandshakeRecord = internalMutation({
  args: {
    record: clearanceProtocolRecordValidator,
  },
  returns: clearanceProtocolPutResult,
  handler: async (ctx, args) => {
    const result = await putClearanceRecordIfAbsentOrSame(runtimeClearanceDb(ctx.db), args.record as ClearanceProtocolRecord)
    return normalizePutResult(result)
  },
})

export const recordHandshakeProofGap = internalMutation({
  args: {
    record: clearanceProtocolRecordValidator,
  },
  returns: clearanceProtocolPutResult,
  handler: async (ctx, args) => {
    const result = await recordClearanceProofGap(runtimeClearanceDb(ctx.db), args.record as ClearanceProtocolRecord)
    return normalizePutResult(result)
  },
})

export const consumeHandshakeGreenlight = internalMutation({
  args: {
    command: clearanceProtocolConsumeCommandValidator,
  },
  returns: clearanceProtocolConsumeResult,
  handler: async (ctx, args) => {
    const result = await consumeClearanceGreenlight(
      runtimeClearanceDb(ctx.db),
      args.command as ConsumeClearanceGreenlightCommand,
    )
    return result.kind === 'consumed'
      ? { kind: 'consumed' as const, record: stripClearanceRecord(result.record) }
      : result.record === undefined
        ? { kind: 'rejected' as const, reason: result.reason }
        : { kind: 'rejected' as const, reason: result.reason, record: stripClearanceRecord(result.record) }
  },
})

function runtimeClearanceDb(db: object) {
  return db as Parameters<typeof putClearanceRecordIfAbsentOrSame>[0]
}

function normalizePutResult(result: Awaited<ReturnType<typeof putClearanceRecordIfAbsentOrSame>>) {
  if (result.kind === 'rejected') {
    return result.record === undefined
      ? { kind: 'rejected' as const, reason: result.reason }
      : { kind: 'rejected' as const, reason: result.reason, record: stripClearanceRecord(result.record) }
  }

  return { kind: result.kind, record: stripClearanceRecord(result.record) }
}

function stripClearanceRecord(record: ClearanceProtocolRecord) {
  return {
    recordId: record.recordId,
    recordKind: record.recordKind,
    principalId: record.principalId,
    actionClass: record.actionClass,
    actionRef: record.actionRef,
    ...(record.mandateId === undefined ? {} : { mandateId: record.mandateId }),
    ...(record.requestRef === undefined ? {} : { requestRef: record.requestRef }),
    ...(record.greenlightRef === undefined ? {} : { greenlightRef: record.greenlightRef }),
    idempotencyKey: record.idempotencyKey,
    payloadHash: record.payloadHash,
    signaturePosture: record.signaturePosture,
    keyIdentityRef: record.keyIdentityRef,
    status: record.status,
    createdAt: record.createdAt,
    ...(record.expiresAt === undefined ? {} : { expiresAt: record.expiresAt }),
    ...(record.signature === undefined ? {} : { signature: record.signature }),
    ...(record.signedAt === undefined ? {} : { signedAt: record.signedAt }),
    ...(record.proofGapReason === undefined ? {} : { proofGapReason: record.proofGapReason }),
    ...(record.consumedAt === undefined ? {} : { consumedAt: record.consumedAt }),
    ...(record.consumedByRef === undefined ? {} : { consumedByRef: record.consumedByRef }),
  }
}
