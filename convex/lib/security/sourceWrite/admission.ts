import { isSourceWriteBodyDigest, SourceWriteAdmissionError, SourceWriteAdmissionScopeValues, sourceWriteCommandDigest, verifySourceWriteAdmission, type SourceWriteAdmission, type SourceWriteAdmissionFailureReason, type SourceWriteAdmissionRequest, type SourceWriteAdmissionScope } from '../../../../src/modules/security/source-write-admission'
import { consumeSourceWriteNonce, type SourceWriteMutationCtx } from './nonce'
import type { SourceWriteArgs, SourceWriteCheck } from './contracts'

export const SOURCE_READ_MAX_AGE_MS = 30_000

export async function requireSourceRead(
  args: SourceWriteArgs & { operationKey: string; correlationId: string },
  scope: SourceWriteAdmissionScope,
): Promise<Exclude<SourceWriteCheck, { kind: 'rejected'; reason: 'source_write_nonce_replayed' }>> {
  const admission = isSourceWriteAdmission(args.sourceWrite) ? args.sourceWrite : undefined
  if (admission === undefined) return { kind: 'rejected', reason: 'missing_source_write_admission' }
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
    maxAgeMs: SOURCE_READ_MAX_AGE_MS,
  })
  if (verification.kind === 'rejected') return verification
  return {
    kind: 'accepted',
    csrf: {
      origin: verification.admission.initiatorOrigin,
      allowedOrigins: [verification.admission.initiatorOrigin],
    },
  }
}

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
  maxAgeMs?: number
}): Promise<{ kind: 'accepted'; admission: SourceWriteAdmission } | { kind: 'rejected'; reason: SourceWriteAdmissionFailureReason }> {
  try {
    return await verifySourceWriteAdmission({ admission: input.admission, expected: input.expected, ...(input.maxAgeMs === undefined ? {} : { maxAgeMs: input.maxAgeMs }) })
  } catch (error) {
    if (error instanceof SourceWriteAdmissionError) return { kind: 'rejected', reason: sourceWriteErrorReason(error) }
    throw error
  }
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
