import { degradeBackend } from '@/lib/observability/degrade-backend'

const BINDING_REF_PATTERN = /^eib_[0-9a-f]{32}$/u
const CREDENTIAL_REF_PATTERN = /^crd_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,499}$/u
const CLERK_USER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/u

export const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const

/** Build the exact provider identifier Convex receives from Clerk JWTs. */
export function clerkUserProviderIdentifier(
  issuer: string | undefined,
  userId: string,
): string | undefined {
  if (issuer === undefined || !CLERK_USER_ID_PATTERN.test(userId)) return undefined
  try {
    const parsed = new URL(issuer)
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      || parsed.username.length > 0
      || parsed.password.length > 0
      || parsed.search.length > 0
      || parsed.hash.length > 0
    ) return undefined
    const canonicalIssuer = parsed.href.replace(/\/+$/u, '')
    return canonicalIssuer.length === 0 ? undefined : `${canonicalIssuer}|${userId}`
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'clerkUserProviderIdentifier', reason: 'invalid_response' })
  }
}

declare const externalIdentityBindingRefBrand: unique symbol
declare const credentialRefBrand: unique symbol

type ExternalIdentityBindingRef = string & Readonly<{
  [externalIdentityBindingRefBrand]: 'ExternalIdentityBindingRef'
}>
type CredentialRef = string & Readonly<{ [credentialRefBrand]: 'CredentialRef' }>

export const KNOWN_EXTERNAL_PROVIDER_STATES = ['active', 'disabled', 'revoked'] as const
type KnownExternalProviderState = typeof KNOWN_EXTERNAL_PROVIDER_STATES[number]
type ExternalProviderState =
  | Readonly<{ kind: 'known'; value: KnownExternalProviderState }>
  | Readonly<{ kind: 'unknown'; value: string }>

type ExternalIdentityRegistryErrorCode =
  | 'credential_ref_invalid'
  | 'external_identity_binding_ref_invalid'
  | 'external_identity_provider_state_invalid'

export class ExternalIdentityRegistryError extends Error {
  readonly code: ExternalIdentityRegistryErrorCode

  constructor(code: ExternalIdentityRegistryErrorCode) {
    super(code)
    this.name = 'ExternalIdentityRegistryError'
    this.code = code
  }
}

export function externalIdentityBindingRef(value: string): ExternalIdentityBindingRef {
  if (!BINDING_REF_PATTERN.test(value)) {
    throw new ExternalIdentityRegistryError('external_identity_binding_ref_invalid')
  }
  return value as ExternalIdentityBindingRef
}

export function credentialRef(value: string): CredentialRef {
  if (!CREDENTIAL_REF_PATTERN.test(value)) {
    throw new ExternalIdentityRegistryError('credential_ref_invalid')
  }
  return value as CredentialRef
}

export function generateExternalIdentityBindingRef(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): ExternalIdentityBindingRef {
  return externalIdentityBindingRef(prefixedUuid('eib', randomUuid))
}

export function generateCredentialRef(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): CredentialRef {
  return credentialRef(prefixedUuid('crd', randomUuid))
}

export function externalProviderState(value: string): ExternalProviderState {
  if (!OPAQUE_REF_PATTERN.test(value)) {
    throw new ExternalIdentityRegistryError('external_identity_provider_state_invalid')
  }
  if ((KNOWN_EXTERNAL_PROVIDER_STATES as readonly string[]).includes(value)) {
    return Object.freeze({ kind: 'known', value: value as KnownExternalProviderState })
  }
  return Object.freeze({ kind: 'unknown', value })
}

function prefixedUuid(prefix: 'eib' | 'crd', randomUuid: () => string): string {
  const uuid = randomUuid()
  if (!UUID_PATTERN.test(uuid)) {
    throw new ExternalIdentityRegistryError(
      prefix === 'eib' ? 'external_identity_binding_ref_invalid' : 'credential_ref_invalid',
    )
  }
  return `${prefix}_${uuid.replaceAll('-', '')}`
}
