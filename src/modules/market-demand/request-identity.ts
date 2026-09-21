import { canonicalDigest } from '@/modules/common/canonical-digest'

// Shared by the write and retry-read paths. Preserve the existing opaque
// identity material; a query change must conflict rather than produce a new ID.
export function marketRequestRef(input: Readonly<{
  principalId: string
  credentialId: string
  idempotencyKey: string
}>): string {
  return `market-request:v1:${canonicalDigest({
    principalId: input.principalId,
    credentialId: input.credentialId,
    idempotencyKey: input.idempotencyKey.trim(),
  }).replace('sha256:', '')}`
}
