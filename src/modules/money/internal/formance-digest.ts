import { canonicalDigest } from '@/modules/common/canonical-digest'

export function digestReference(kind: string, reference: unknown): string {
  return digestValue('account-segment', { kind, reference })
}

export function digestValue(kind: string, value: unknown): string {
  return stripDigest(canonicalDigest({ format: `ae.formance-${kind}:v1`, value }))
}

export function stripDigest(value: string): string {
  return value.slice('sha256:'.length)
}
