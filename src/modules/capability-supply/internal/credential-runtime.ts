import { PUBLIC_CREDENTIAL_REF } from './transport-adapters'

export type CapabilityCredentialResolution = Readonly<
  | { kind: 'not_required'; reference: typeof PUBLIC_CREDENTIAL_REF }
  | { kind: 'ready'; reference: string; credential: string }
  | { kind: 'unavailable'; reference: string }
  | { kind: 'rejected'; reference: string }
>

type CredentialEnvironment = Readonly<Record<string, string | undefined>>

export function resolveCapabilityCredential(reference: string, environment: CredentialEnvironment = process.env): CapabilityCredentialResolution {
  if (reference === PUBLIC_CREDENTIAL_REF) return { kind: 'not_required', reference }
  const match = /^env:([A-Z][A-Z0-9_]{1,199})$/.exec(reference)
  if (match === null) return { kind: 'rejected', reference }
  const name = match[1]
  if (name === undefined) return { kind: 'rejected', reference }
  const value = environment[name]
  return value === undefined || value.trim().length === 0
    ? { kind: 'unavailable', reference }
    : { kind: 'ready', reference, credential: value }
}

export function credentialResolutionRefusal(result: CapabilityCredentialResolution): 'credential_unavailable' | 'credential_rejected' | undefined {
  return result.kind === 'unavailable' ? 'credential_unavailable' : result.kind === 'rejected' ? 'credential_rejected' : undefined
}
