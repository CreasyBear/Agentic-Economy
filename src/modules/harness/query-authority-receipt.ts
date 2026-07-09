// Server-only: handshake-protocol-kernel/adapter-sdk constructs AsyncLocalStorage at module scope.
// Never re-export this module from src/modules/harness/public.ts, which is client-reachable.
/**
 * Kernel-backed authority-boundary receipts for agent-door query runs.
 *
 * AE queries (registry.search / registry.detail / inquiry.submit through the
 * quiet agent door) are discovery / intent operations. They do NOT create
 * authority, mint certificates, hold custody, or settle anything. This module
 * binds each machine-surface query run to a verifiable receipt that makes that
 * boundary machine-checkable.
 *
 * The authority boundary itself is a real handshake-protocol-kernel primitive:
 * `adapterSdkAuthorityBoundary` (an all-`false`, strict-schema attestation of
 * the nine "adapter SDK does not ..." non-claims) imported from the quarantine-
 * allowed `handshake-protocol-kernel/adapter-sdk` entry point. We validate it
 * with the kernel's own `AdapterSdkAuthorityBoundarySchema` so the receipt fails
 * loudly if the kernel ever changes the boundary shape.
 *
 * The verifiable signature is AE's native clearance HMAC signing — the same
 * signing authority that backs the clearance protocol store — so the receipt
 * sits inside AE's existing evidence trust boundary and is Convex-safe
 * (@noble/hashes, no node:* imports). The receipt reference is content-addressed
 * (timestamp-free), so replaying an identical query reproduces an identical
 * reference: idempotency by construction.
 *
 * Extension path (deferred; see report): when AE actually issues authority
 * (booking / charging / dispatch), the same receipt shape can carry the kernel's
 * asymmetric authority certificate (buildAuthorityCertificateSigningInput +
 * verifyAuthorityCertificate + projectAuthorityCertificateJwks) so external
 * agents verify independently via JWKS. Today that would over-claim authority on
 * a read surface, so we hold the honest all-`false` boundary.
 */
import {
  adapterSdkAuthorityBoundary,
  adapterSdkRequiredNonClaims,
  AdapterSdkAuthorityBoundarySchema,
  type AdapterSdkAuthorityBoundary,
} from 'handshake-protocol-kernel/adapter-sdk'

import {
  resolveClearanceSigningKeyFromEnv,
  signClearanceRecord,
  verifyClearanceSignature,
  type ClearanceSignatureVerification,
  type ClearanceSigningKeyResolution,
} from '@/modules/clearance/public'
import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'

import type { HarnessToolResult, HarnessToolStatus } from './harness.schema'

export const HarnessQueryAuthorityReceiptVersion = 'harness-query-authority-receipt:v1' as const

/**
 * Version-agnostic scheme id. Integrity of the concrete kernel boundary shape is
 * carried by `boundaryDigest`, so this string never needs to encode a kernel
 * version (and can never drift into a false version claim).
 */
export const HarnessAuthorityBoundaryScheme = 'handshake-protocol-kernel/adapter-sdk#authority-boundary' as const

const HarnessAuthorityReceiptSurfaceValues = ['agentTools', 'agentJson'] as const
export type HarnessAuthorityReceiptSurface = (typeof HarnessAuthorityReceiptSurfaceValues)[number]

export type HarnessQueryAuthoritySignature =
  | Readonly<{
    posture: 'local_hmac'
    keyIdentityRef: string
    signedAt: string
    signature: string
  }>
  | Readonly<{
    posture: 'proof_gap'
    keyIdentityRef: string
    reason: string
  }>

export type HarnessQueryAuthorityReceipt = Readonly<{
  version: typeof HarnessQueryAuthorityReceiptVersion
  boundaryScheme: typeof HarnessAuthorityBoundaryScheme
  toolId: string
  surface: HarnessAuthorityReceiptSurface
  status: HarnessToolStatus
  /** Content hash of the tool result this receipt attests to. */
  sourceEvidenceHash: string
  /** Digest of the concrete kernel authority boundary (integrity anchor). */
  boundaryDigest: string
  /** The all-`false` kernel authority boundary attestation. */
  authorityBoundary: AdapterSdkAuthorityBoundary
  /** The kernel's required "adapter SDK does not ..." non-claims. */
  nonClaims: readonly string[]
  /** Deterministic, content-addressed reference (timestamp-free → replay-safe). */
  receiptRef: string
  issuedAt: number
  signature: HarnessQueryAuthoritySignature
}>

export type HarnessQueryAuthorityReceiptInput = {
  result: Pick<HarnessToolResult, 'toolId' | 'status' | 'resultHash'>
  surface: HarnessAuthorityReceiptSurface
  issuedAt?: number
  /** Resolved clearance signing key; a proof-gap resolution yields a proof-gap receipt. */
  signing?: ClearanceSigningKeyResolution
}

/**
 * Produce a kernel authority-boundary receipt for a single harness query run.
 *
 * Deterministic aside from the caller-supplied `issuedAt`/secret: the same
 * result + surface always yields the same `receiptRef`, and the same
 * `issuedAt` + secret always yields a byte-identical receipt.
 */
export function buildHarnessQueryAuthorityReceipt(
  input: HarnessQueryAuthorityReceiptInput,
): HarnessQueryAuthorityReceipt {
  // Validate the kernel primitive is live and shape-conformant. `.parse` throws
  // if a future kernel version changes the boundary contract, surfacing drift
  // instead of silently emitting a stale attestation.
  const authorityBoundary = AdapterSdkAuthorityBoundarySchema.parse(adapterSdkAuthorityBoundary)
  const nonClaims: readonly string[] = [...adapterSdkRequiredNonClaims]
  // The kernel boundary is schema-validated above; project it to a plain boolean
  // record (no cast) so it hashes as a StableHashValue and any future non-`false`
  // drift changes the digest.
  const boundaryStableValue: { readonly [key: string]: boolean } =
    Object.fromEntries(Object.entries(authorityBoundary))
  const boundaryDigest = stableHash(boundaryStableValue)

  const referencePayload: StableHashValue = {
    version: HarnessQueryAuthorityReceiptVersion,
    boundaryScheme: HarnessAuthorityBoundaryScheme,
    toolId: input.result.toolId,
    surface: input.surface,
    status: input.result.status,
    sourceEvidenceHash: input.result.resultHash,
    boundaryDigest,
    nonClaims: [...nonClaims],
  }
  const receiptRef = `${HarnessQueryAuthorityReceiptVersion}:${stableHash(referencePayload)}`

  const issuedAt = input.issuedAt ?? Date.now()
  const signedAt = new Date(issuedAt).toISOString()
  const signaturePayload = receiptSigningPayload({
    receiptRef,
    toolId: input.result.toolId,
    surface: input.surface,
    status: input.result.status,
    sourceEvidenceHash: input.result.resultHash,
    boundaryDigest,
    nonClaims,
  })

  const signature = signQueryAuthorityReceipt({
    payload: signaturePayload,
    signedAt,
    signing: input.signing,
  })

  return {
    version: HarnessQueryAuthorityReceiptVersion,
    boundaryScheme: HarnessAuthorityBoundaryScheme,
    toolId: input.result.toolId,
    surface: input.surface,
    status: input.result.status,
    sourceEvidenceHash: input.result.resultHash,
    boundaryDigest,
    authorityBoundary,
    nonClaims,
    receiptRef,
    issuedAt,
    signature,
  }
}

/**
 * Machine-only header projection for the quiet-door / agent-JSON response.
 * Never rendered on human surfaces and carries no readiness or capability copy.
 */
export function harnessQueryAuthorityReceiptHeaders(
  receipt: HarnessQueryAuthorityReceipt,
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-ae-authority-receipt': receipt.receiptRef,
    'x-ae-authority-boundary': receipt.boundaryScheme,
    'x-ae-authority-signature-posture': receipt.signature.posture,
  }
  if (receipt.signature.posture === 'local_hmac') {
    headers['x-ae-authority-signature'] = `${receipt.signature.keyIdentityRef}:${receipt.signature.signature}`
    headers['x-ae-authority-signed-at'] = receipt.signature.signedAt
  }
  return headers
}

/**
 * Convenience for machine-surface routes: resolve the signing key from an env
 * bag, build the receipt, and project it to headers in one call. `env` is passed
 * in (not read from `process`) to keep this pure and testable.
 */
export function agentAuthorityReceiptHeaders(input: {
  result: Pick<HarnessToolResult, 'toolId' | 'status' | 'resultHash'>
  surface: HarnessAuthorityReceiptSurface
  env?: Readonly<Record<string, string | undefined>>
  issuedAt?: number
}): Record<string, string> {
  const receipt = buildHarnessQueryAuthorityReceipt({
    result: input.result,
    surface: input.surface,
    ...(input.issuedAt === undefined ? {} : { issuedAt: input.issuedAt }),
    signing: resolveClearanceSigningKeyFromEnv(input.env ?? {}),
  })
  return harnessQueryAuthorityReceiptHeaders(receipt)
}

/**
 * Verify a receipt's HMAC signature against a secret (AE-side / secret holder).
 * Rebuilds the exact signed payload from the receipt's own stable fields.
 */
export function verifyHarnessQueryAuthorityReceipt(input: {
  receipt: HarnessQueryAuthorityReceipt
  secret?: string | undefined
}): ClearanceSignatureVerification {
  const { receipt } = input
  if (receipt.signature.posture !== 'local_hmac') {
    return { kind: 'rejected', reason: 'missing_clearance_signing_secret' }
  }

  return verifyClearanceSignature({
    kind: 'receipt',
    payload: receiptSigningPayload({
      receiptRef: receipt.receiptRef,
      toolId: receipt.toolId,
      surface: receipt.surface,
      status: receipt.status,
      sourceEvidenceHash: receipt.sourceEvidenceHash,
      boundaryDigest: receipt.boundaryDigest,
      nonClaims: receipt.nonClaims,
    }),
    keyIdentityRef: receipt.signature.keyIdentityRef,
    signedAt: receipt.signature.signedAt,
    signature: receipt.signature.signature,
    secret: input.secret,
  })
}

function signQueryAuthorityReceipt(input: {
  payload: StableHashValue
  signedAt: string
  signing: ClearanceSigningKeyResolution | undefined
}): HarnessQueryAuthoritySignature {
  const signing = input.signing
  if (signing === undefined || signing.kind === 'proof_gap') {
    return {
      posture: 'proof_gap',
      keyIdentityRef: signing?.keyIdentityRef ?? '',
      reason: signing?.kind === 'proof_gap' ? signing.reason : 'missing_clearance_signing_secret',
    }
  }

  const signed = signClearanceRecord({
    kind: 'receipt',
    payload: input.payload,
    secret: signing.secret,
    keyIdentityRef: signing.keyIdentityRef,
    signedAt: input.signedAt,
  })

  if (signed.kind === 'proof_gap') {
    return {
      posture: 'proof_gap',
      keyIdentityRef: signed.keyIdentityRef,
      reason: signed.reason,
    }
  }

  return {
    posture: 'local_hmac',
    keyIdentityRef: signed.keyIdentityRef,
    signedAt: signed.signedAt,
    signature: signed.signature,
  }
}

function receiptSigningPayload(input: {
  receiptRef: string
  toolId: string
  surface: HarnessAuthorityReceiptSurface
  status: HarnessToolStatus
  sourceEvidenceHash: string
  boundaryDigest: string
  nonClaims: readonly string[]
}): StableHashValue {
  return {
    version: HarnessQueryAuthorityReceiptVersion,
    boundaryScheme: HarnessAuthorityBoundaryScheme,
    receiptRef: input.receiptRef,
    toolId: input.toolId,
    surface: input.surface,
    status: input.status,
    sourceEvidenceHash: input.sourceEvidenceHash,
    boundaryDigest: input.boundaryDigest,
    nonClaims: [...input.nonClaims],
  }
}
