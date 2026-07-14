import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { literalUnion } from '../src/modules/common/convex-literals'
import {
  SourceWriteAdmissionError,
  SourceWriteAdmissionScopeValues,
  sourceWriteKeyFamilyForScope,
  verifySourceWriteAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionFailureReason,
  type SourceWriteAdmissionScope,
} from '../src/modules/security/source-write-admission'
import type { CsrfCheckInput } from '../src/modules/security/public'

export const sourceWriteAdmissionArg = v.object({
  version: v.literal('source-write:v1'),
  scope: literalUnion(SourceWriteAdmissionScopeValues),
  keyId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  issuedAt: v.number(),
  nonce: v.string(),
  method: v.string(),
  origin: v.string(),
  pathname: v.string(),
  bodyDigest: v.string(),
  signature: v.string(),
})

export const sourceWriteArgs = {
  sourceWrite: v.optional(sourceWriteAdmissionArg),
} as const

export type SourceWriteArgs = {
  sourceWrite?: unknown
  operationKey?: string
  correlationId?: string
}

export type SourceWriteCheck =
  | { kind: 'accepted'; csrf: CsrfCheckInput }
  | { kind: 'rejected'; reason: SourceWriteAdmissionFailureReason | 'source_write_nonce_replayed' }

export async function requireSourceWrite(
  ctx: SourceWriteMutationCtx,
  args: SourceWriteArgs,
  scope: SourceWriteAdmissionScope
): Promise<SourceWriteCheck> {
  const admission = isSourceWriteAdmission(args.sourceWrite) ? args.sourceWrite : undefined
  if (args.operationKey === undefined || args.operationKey.trim().length === 0) {
    return { kind: 'rejected', reason: 'source_write_operation_mismatch' }
  }
  if (args.correlationId === undefined || args.correlationId.trim().length === 0) {
    return { kind: 'rejected', reason: 'source_write_correlation_mismatch' }
  }

  const expected = {
    scope,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
  }
  const verification = admission === undefined
    ? verifyAdmission({ expected })
    : verifyAdmission({ admission, expected })

  if (verification.kind === 'rejected') {
    return {
      kind: 'rejected',
      reason: verification.reason,
    }
  }

  const nonce = await consumeSourceWriteNonce(ctx, verification.admission)
  if (nonce.kind === 'rejected') {
    return nonce
  }

  return {
    kind: 'accepted',
    csrf: {
      origin: verification.admission.origin,
      allowedOrigins: [verification.admission.origin],
    },
  }
}

type SourceWriteMutationCtx = {
  db: unknown
}

type SourceWriteNonceDb = {
  query: (tableName: string) => SourceWriteNonceQuery
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
}

type SourceWriteNonceQuery = {
  withIndex: (indexName: string, callback: (query: SourceWriteNonceIndexBuilder) => SourceWriteNonceIndexBuilder) => SourceWriteNonceQuery
  unique: () => Promise<Record<string, unknown> | null>
}

type SourceWriteNonceIndexBuilder = {
  eq: (field: string, value: unknown) => SourceWriteNonceIndexBuilder
}

function verifyAdmission(input: {
  admission?: SourceWriteAdmission
  expected: {
    scope: SourceWriteAdmissionScope
    operationKey: string
    correlationId: string
  }
}): { kind: 'accepted'; admission: SourceWriteAdmission } | { kind: 'rejected'; reason: SourceWriteAdmissionFailureReason } {
  try {
    if (input.admission === undefined) {
      return verifySourceWriteAdmission({ expected: input.expected })
    }
    return verifySourceWriteAdmission({
      admission: input.admission,
      expected: input.expected,
    })
  } catch (error) {
    if (error instanceof SourceWriteAdmissionError) {
      return { kind: 'rejected', reason: sourceWriteErrorReason(error) }
    }
    throw error
  }
}

async function consumeSourceWriteNonce(
  ctx: SourceWriteMutationCtx,
  admission: SourceWriteAdmission
): Promise<{ kind: 'accepted' } | { kind: 'rejected'; reason: 'source_write_nonce_replayed' }> {
  const db = ctx.db as SourceWriteNonceDb
  const existing = await db
    .query('sourceWriteNonces')
    .withIndex('by_keyId_and_nonce', (query) => query.eq('keyId', admission.keyId).eq('nonce', admission.nonce))
    .unique()
  if (existing !== null) {
    return { kind: 'rejected', reason: 'source_write_nonce_replayed' }
  }

  const now = Date.now()
  await db.insert('sourceWriteNonces', {
    keyId: admission.keyId,
    nonce: admission.nonce,
    family: sourceWriteKeyFamilyForScope(admission.scope),
    scope: admission.scope,
    operationKey: admission.operationKey,
    correlationId: admission.correlationId,
    bodyDigest: admission.bodyDigest,
    issuedAt: admission.issuedAt,
    consumedAt: now,
    expiresAt: admission.issuedAt + 5 * 60_000,
  })

  return { kind: 'accepted' }
}

function sourceWriteErrorReason(error: SourceWriteAdmissionError): SourceWriteAdmissionFailureReason {
  switch (error.code) {
    case 'client_exposed_source_write_secret':
    case 'source_write_provider_secret_reuse':
    case 'missing_source_write_request':
      return 'missing_source_write_secret'
    default:
      return error.code
  }
}

function isSourceWriteAdmission(value: unknown): value is SourceWriteAdmission {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    record.version === 'source-write:v1' &&
    typeof record.scope === 'string' &&
    SourceWriteAdmissionScopeValues.includes(record.scope as SourceWriteAdmissionScope) &&
    typeof record.keyId === 'string' &&
    typeof record.operationKey === 'string' &&
    typeof record.correlationId === 'string' &&
    typeof record.issuedAt === 'number' &&
    typeof record.nonce === 'string' &&
    typeof record.method === 'string' &&
    typeof record.origin === 'string' &&
    typeof record.pathname === 'string' &&
    typeof record.bodyDigest === 'string' &&
    typeof record.signature === 'string'
  )
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
    const batchSize =
      args.batchSize !== undefined && Number.isFinite(args.batchSize)
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
