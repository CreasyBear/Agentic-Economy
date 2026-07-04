import {
  ClearanceSigningKeyIdEnvName,
  ClearanceSigningSecretEnvName,
  type ClearanceSigningFailureReason,
} from './signing'

export type ClearanceSigningKeyResolution =
  | Readonly<{
      kind: 'resolved'
      secret: string
      keyIdentityRef: string
    }>
  | Readonly<{
      kind: 'proof_gap'
      reason: ClearanceSigningFailureReason
      keyIdentityRef: string
    }>

export function resolveClearanceSigningKeyFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): ClearanceSigningKeyResolution {
  const keyIdentityRef = normalizeEnvValue(env[ClearanceSigningKeyIdEnvName]) ?? ''
  const secret = normalizeEnvValue(env[ClearanceSigningSecretEnvName])

  if (keyIdentityRef.length === 0) {
    return {
      kind: 'proof_gap',
      reason: 'missing_clearance_key_identity',
      keyIdentityRef,
    }
  }

  if (secret === undefined) {
    return {
      kind: 'proof_gap',
      reason: 'missing_clearance_signing_secret',
      keyIdentityRef,
    }
  }

  return { kind: 'resolved', secret, keyIdentityRef }
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}
