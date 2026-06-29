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
  sourceWrite?: SourceWriteAdmission
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
  const expectedOperationKey = args.operationKey ?? args.sourceWrite?.operationKey ?? ''
  const expectedCorrelationId = args.correlationId ?? args.sourceWrite?.correlationId ?? ''
  const verification = await verifySourceWriteAdmission({
    ...(args.sourceWrite === undefined ? {} : { admission: args.sourceWrite }),
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

function readEnv(name: string): string | undefined {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}
