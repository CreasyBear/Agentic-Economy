import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { literalUnion } from '../src/modules/common/convex-literals'
import {
  isSourceWriteBodyDigest,
  SourceWriteAdmissionError,
  SourceWriteAdmissionScopeValues,
  SOURCE_WRITE_MAX_AGE_MS,
  sourceWriteCommandDigest,
  sourceWriteKeyFamilyForScope,
  verifySourceWriteAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionFailureReason,
  type SourceWriteAdmissionRequest,
  type SourceWriteAdmissionScope,
} from '../src/modules/security/source-write-admission'
import type { CsrfCheckInput } from '../src/modules/security/public'

export const sourceWriteRequestArg = v.object({
  method: v.string(),
  initiatorOrigin: v.string(),
  targetOrigin: v.string(),
  targetPath: v.string(),
  targetQuery: v.string(),
  bodyDigest: v.string(),
})

export const sourceWriteAdmissionArg = v.object({
  version: v.literal('source-write:v2'),
  scope: literalUnion(SourceWriteAdmissionScopeValues),
  keyId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  commandDigest: v.string(),
  issuedAt: v.number(),
  nonce: v.string(),
  method: v.string(),
  initiatorOrigin: v.string(),
  targetOrigin: v.string(),
  targetPath: v.string(),
  targetQuery: v.string(),
  bodyDigest: v.string(),
  signature: v.string(),
  signatureInput: v.string(),
})

export const sourceWriteArgs = {
  sourceWrite: v.optional(sourceWriteAdmissionArg),
  sourceWriteRequest: v.optional(sourceWriteRequestArg),
} as const

export type SourceWriteArgs = {
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
  operationKey?: string
  correlationId?: string
  [key: string]: unknown
}

export type SourceWriteCheck =
  | { kind: 'accepted'; csrf: CsrfCheckInput }
  | { kind: 'rejected'; reason: SourceWriteAdmissionFailureReason | 'source_write_nonce_replayed' }

export async function requireSourceWrite(
  ctx: SourceWriteMutationCtx,
  args: SourceWriteArgs,
  scope: SourceWriteAdmissionScope,
): Promise<SourceWriteCheck> {
  const admission = isSourceWriteAdmission(args.sourceWrite) ? args.sourceWrite : undefined
  if (admission === undefined) return { kind: 'rejected', reason: 'missing_source_write_admission' }
  if (args.operationKey === undefined || args.operationKey.trim().length === 0) {
    return { kind: 'rejected', reason: 'source_write_operation_mismatch' }
  }
  if (args.correlationId === undefined || args.correlationId.trim().length === 0) {
    return { kind: 'rejected', reason: 'source_write_correlation_mismatch' }
  }

  const expectedRequest = isSourceWriteRequest(args.sourceWriteRequest) ? args.sourceWriteRequest : undefined
  if (expectedRequest === undefined) return { kind: 'rejected', reason: 'missing_source_write_request' }

  let commandDigest: string
  try {
    commandDigest = sourceWriteCommandDigest(args)
  } catch (error) {
    return { kind: 'rejected', reason: sourceWriteErrorReason(error) }
  }

  const verification = await verifyAdmission({
    admission,
    expected: {
      scope,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      commandDigest,
      request: expectedRequest,
    },
  })
  if (verification.kind === 'rejected') return verification

  const nonce = await consumeSourceWriteNonce(ctx, verification.admission)
  if (nonce.kind === 'rejected') return nonce

  return {
    kind: 'accepted',
    csrf: {
      origin: verification.admission.initiatorOrigin,
      allowedOrigins: [verification.admission.initiatorOrigin],
    },
  }
}

type SourceWriteMutationCtx = { db: unknown }
type SourceWriteNonceDb = {
  query: (tableName: string) => SourceWriteNonceQuery
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
}
type SourceWriteNonceQuery = {
  withIndex: (indexName: string, callback: (query: SourceWriteNonceIndexBuilder) => SourceWriteNonceIndexBuilder) => SourceWriteNonceQuery
  unique: () => Promise<Record<string, unknown> | null>
}
type SourceWriteNonceIndexBuilder = { eq: (field: string, value: unknown) => SourceWriteNonceIndexBuilder }

function isSourceWriteRequest(value: unknown): value is SourceWriteAdmissionRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.method === 'string'
    && typeof record.initiatorOrigin === 'string'
    && typeof record.targetOrigin === 'string'
    && typeof record.targetPath === 'string'
    && typeof record.targetQuery === 'string'
    && typeof record.bodyDigest === 'string'
}

async function verifyAdmission(input: {
  admission: SourceWriteAdmission
  expected: {
    scope: SourceWriteAdmissionScope
    operationKey: string
    correlationId: string
    commandDigest: string
    request: SourceWriteAdmissionRequest
  }
}): Promise<{ kind: 'accepted'; admission: SourceWriteAdmission } | { kind: 'rejected'; reason: SourceWriteAdmissionFailureReason }> {
  try {
    return await verifySourceWriteAdmission({ admission: input.admission, expected: input.expected })
  } catch (error) {
    if (error instanceof SourceWriteAdmissionError) return { kind: 'rejected', reason: sourceWriteErrorReason(error) }
    throw error
  }
}

async function consumeSourceWriteNonce(
  ctx: SourceWriteMutationCtx,
  admission: SourceWriteAdmission,
): Promise<{ kind: 'accepted' } | { kind: 'rejected'; reason: 'source_write_nonce_replayed' }> {
  const db = ctx.db as SourceWriteNonceDb
  const existing = await db
    .query('sourceWriteNonces')
    .withIndex('by_keyId_and_nonce', (query) => query.eq('keyId', admission.keyId).eq('nonce', admission.nonce))
    .unique()
  if (existing !== null) return { kind: 'rejected', reason: 'source_write_nonce_replayed' }

  await db.insert('sourceWriteNonces', {
    keyId: admission.keyId,
    nonce: admission.nonce,
    family: sourceWriteKeyFamilyForScope(admission.scope),
    scope: admission.scope,
    operationKey: admission.operationKey,
    correlationId: admission.correlationId,
    commandDigest: admission.commandDigest,
    bodyDigest: admission.bodyDigest,
    issuedAt: admission.issuedAt,
    consumedAt: Date.now(),
    expiresAt: admission.issuedAt + SOURCE_WRITE_MAX_AGE_MS,
  })
  return { kind: 'accepted' }
}

function sourceWriteErrorReason(error: unknown): SourceWriteAdmissionFailureReason {
  if (!(error instanceof SourceWriteAdmissionError)) return 'invalid_source_write_request'
  switch (error.code) {
    case 'client_exposed_source_write_secret':
    case 'source_write_provider_secret_reuse':
      return 'missing_source_write_secret'
    default:
      return error.code
  }
}

function isSourceWriteAdmission(value: unknown): value is SourceWriteAdmission {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.version === 'source-write:v2'
    && typeof record.scope === 'string'
    && SourceWriteAdmissionScopeValues.includes(record.scope as SourceWriteAdmissionScope)
    && typeof record.keyId === 'string'
    && typeof record.operationKey === 'string'
    && typeof record.correlationId === 'string'
    && typeof record.commandDigest === 'string'
    && typeof record.issuedAt === 'number'
    && typeof record.nonce === 'string'
    && typeof record.method === 'string'
    && typeof record.initiatorOrigin === 'string'
    && typeof record.targetOrigin === 'string'
    && typeof record.targetPath === 'string'
    && typeof record.targetQuery === 'string'
    && typeof record.bodyDigest === 'string'
    && isSourceWriteBodyDigest(record.bodyDigest, true)
    && typeof record.signature === 'string'
    && typeof record.signatureInput === 'string'
}

const sourceWriteNonceCleanupResult = v.object({
  deleted: v.number(),
  cutoff: v.number(),
  rescheduled: v.boolean(),
})

const SOURCE_WRITE_NONCE_CLEANUP_BATCH_SIZE = 200
const SOURCE_WRITE_NONCE_CLEANUP_MAX_BATCH_SIZE = 500

export const cleanupExpiredSourceWriteNonces = internalMutation({
  args: {
    now: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: sourceWriteNonceCleanupResult,
  handler: async (ctx, args) => {
    const cutoff = args.now !== undefined && Number.isFinite(args.now) ? args.now : Date.now()
    const batchSize = args.batchSize !== undefined && Number.isFinite(args.batchSize)
      ? Math.min(Math.max(Math.floor(args.batchSize), 1), SOURCE_WRITE_NONCE_CLEANUP_MAX_BATCH_SIZE)
      : SOURCE_WRITE_NONCE_CLEANUP_BATCH_SIZE

    const expiredNonces = await ctx.db
      .query('sourceWriteNonces')
      .withIndex('by_expiresAt', (query) => query.lt('expiresAt', cutoff))
      .take(batchSize)

    await Promise.all(expiredNonces.map(({ _id }) => ctx.db.delete(_id)))

    const deleted = expiredNonces.length
    const rescheduled = deleted >= batchSize
    if (rescheduled) {
      await ctx.scheduler.runAfter(0, internal.sourceWriteAdmission.cleanupExpiredSourceWriteNonces, {
        now: cutoff,
        batchSize,
      })
    }

    return { deleted, cutoff, rescheduled }
  },
})
