import { v } from 'convex/values'
import { literalUnion } from '../../../../src/modules/common/convex-literals'
import { SourceWriteAdmissionScopeValues, type SourceWriteAdmissionFailureReason } from '../../../../src/modules/security/source-write-admission'
import type { CsrfCheckInput } from '../../../../src/modules/security/public'

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
