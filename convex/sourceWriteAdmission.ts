import { v } from 'convex/values'

import { literalUnion } from '../src/modules/common/convex-literals'
import {
  SourceWriteAdmissionScopeValues,
  verifySourceWriteAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionScope,
} from '../src/modules/security/source-write-admission'
import type { CsrfCheckInput } from '../src/modules/security/public'

export const sourceWriteAdmissionArg = v.object({
  version: v.literal('source-write:v1'),
  scope: literalUnion(SourceWriteAdmissionScopeValues),
  operationKey: v.string(),
  correlationId: v.string(),
  issuedAt: v.number(),
  nonce: v.string(),
  method: v.string(),
  origin: v.string(),
  pathname: v.string(),
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
  | { kind: 'rejected'; reason: 'missing_csrf' | 'foreign_origin' }

export async function requireSourceWrite(
  args: SourceWriteArgs,
  scope: SourceWriteAdmissionScope
): Promise<SourceWriteCheck> {
  const secret = readEnv('AE_SOURCE_WRITE_SECRET')
  const admission = isSourceWriteAdmission(args.sourceWrite) ? args.sourceWrite : undefined
  const expectedOperationKey = args.operationKey ?? admission?.operationKey ?? ''
  const expectedCorrelationId = args.correlationId ?? admission?.correlationId ?? ''
  const verification = await verifySourceWriteAdmission({
    ...(admission === undefined ? {} : { admission }),
    ...(secret === undefined ? {} : { secret }),
    expected: {
      scope,
      operationKey: expectedOperationKey,
      correlationId: expectedCorrelationId,
    },
  })

  if (verification.kind === 'rejected') {
    return {
      kind: 'rejected',
      reason: verification.reason === 'invalid_source_write_signature' ? 'foreign_origin' : 'missing_csrf',
    }
  }

  return {
    kind: 'accepted',
    csrf: {
      origin: verification.admission.origin,
      allowedOrigins: [verification.admission.origin],
    },
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
    typeof record.operationKey === 'string' &&
    typeof record.correlationId === 'string' &&
    typeof record.issuedAt === 'number' &&
    typeof record.nonce === 'string' &&
    typeof record.method === 'string' &&
    typeof record.origin === 'string' &&
    typeof record.pathname === 'string' &&
    typeof record.signature === 'string'
  )
}

function readEnv(name: string): string | undefined {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}
