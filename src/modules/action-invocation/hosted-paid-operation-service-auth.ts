import { canonicalDigest } from '@/modules/common/canonical-digest'

export const HOSTED_PAID_OPERATION_SERVICE_TOKEN_TTL_MS = 30_000
export const HOSTED_PAID_OPERATION_AGENT_SCOPE = 'paid_operation:invoke'

const TOKEN_PREFIX = 'hpo_service_v1'
const TOKEN_FORMAT = 'ae.hosted-paid-operation-service-token:v1'
const TOKEN_AUDIENCE = 'convex:hosted-paid-operation'
const MAX_CLOCK_SKEW_MS = 5_000

export type HostedPaidOperationServiceIntent =
  | Readonly<{ kind: 'create'; providerKey: 'A' | 'B' }>
  | Readonly<{
      kind: 'inspect'
      invocationRef: string
      expectedInvocationVersion: number
    }>
  | Readonly<{ kind: 'current_version'; invocationRef: string }>
  | Readonly<{
      kind: 'command'
      invocationRef: string
      commandId: string
      expectedInvocationVersion: number
      command: 'authorize' | 'execute' | 'reconcile'
      accept?: boolean
    }>

export type HostedPaidOperationServicePrincipal = Readonly<{
  principalRef: string
  callerRef: string
  credentialId: string
  scopes: readonly string[]
}>

export type VerifiedHostedPaidOperationServiceToken =
  HostedPaidOperationServicePrincipal & Readonly<{ tokenRef: string }>

type ServiceTokenClaims = Readonly<{
  format: typeof TOKEN_FORMAT
  audience: typeof TOKEN_AUDIENCE
  principalRef: string
  callerRef: string
  credentialId: string
  scopes: readonly string[]
  intentDigest: string
  issuedAt: number
  expiresAt: number
  nonce: string
}>

/**
 * Seals current server admission into a short-lived, command-bound token.
 * Identity is encrypted rather than copied into the public Convex argument.
 */
export async function createHostedPaidOperationServiceToken(input: Readonly<{
  key: string
  principal: HostedPaidOperationServicePrincipal
  intent: HostedPaidOperationServiceIntent
  issuedAt?: number
  randomBytes?: (length: number) => Uint8Array
}>): Promise<string> {
  const issuedAt = input.issuedAt ?? Date.now()
  if (!validKey(input.key)
    || !validPrincipal(input.principal)
    || !Number.isSafeInteger(issuedAt)
    || !exactIntent(input.intent)) {
    throw new Error('hosted_paid_operation_service_token_input_invalid')
  }
  const randomBytes = input.randomBytes ?? secureRandomBytes
  const iv = randomBytes(12)
  const nonceBytes = randomBytes(16)
  if (iv.length !== 12 || nonceBytes.length !== 16) {
    throw new Error('hosted_paid_operation_service_token_randomness_invalid')
  }
  const claims: ServiceTokenClaims = {
    format: TOKEN_FORMAT,
    audience: TOKEN_AUDIENCE,
    principalRef: input.principal.principalRef,
    callerRef: input.principal.callerRef,
    credentialId: input.principal.credentialId,
    scopes: [...input.principal.scopes].sort(),
    intentDigest: canonicalDigest(input.intent as never),
    issuedAt,
    expiresAt: issuedAt + HOSTED_PAID_OPERATION_SERVICE_TOKEN_TTL_MS,
    nonce: toBase64Url(nonceBytes),
  }
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: new TextEncoder().encode(TOKEN_AUDIENCE),
    },
    await serviceTokenKey(input.key, ['encrypt']),
    new TextEncoder().encode(JSON.stringify(claims)),
  )
  return `${TOKEN_PREFIX}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`
}

/**
 * Convex independently decrypts and binds the server token to the exact
 * public intent. Failure is ordinary unauthenticated admission.
 */
export async function verifyHostedPaidOperationServiceToken(input: Readonly<{
  key: string
  serviceToken: string
  intent: HostedPaidOperationServiceIntent
  now?: number
}>): Promise<VerifiedHostedPaidOperationServiceToken | undefined> {
  if (!validKey(input.key) || !exactIntent(input.intent)) return undefined
  const parts = input.serviceToken.split('.')
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return undefined
  const iv = fromBase64Url(parts[1] ?? '')
  const ciphertext = fromBase64Url(parts[2] ?? '')
  if (iv?.length !== 12 || ciphertext === undefined || ciphertext.length === 0) return undefined

  let claims: unknown
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: new TextEncoder().encode(TOKEN_AUDIENCE),
      },
      await serviceTokenKey(input.key, ['decrypt']),
      toArrayBuffer(ciphertext),
    )
    claims = JSON.parse(new TextDecoder().decode(plaintext))
  } catch {
    return undefined
  }
  if (!validClaims(claims, input.intent, input.now ?? Date.now())) return undefined
  return Object.freeze({
    principalRef: claims.principalRef,
    callerRef: claims.callerRef,
    credentialId: claims.credentialId,
    scopes: Object.freeze([...claims.scopes]),
    tokenRef: canonicalDigest({
      format: TOKEN_FORMAT,
      serviceToken: input.serviceToken,
    }),
  })
}

function validClaims(
  value: unknown,
  intent: HostedPaidOperationServiceIntent,
  now: number,
): value is ServiceTokenClaims {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const claims = value as Partial<ServiceTokenClaims>
  const issuedAt = claims.issuedAt
  const expiresAt = claims.expiresAt
  const keys = Object.keys(value).sort()
  const expectedKeys = [
    'audience',
    'callerRef',
    'credentialId',
    'expiresAt',
    'format',
    'intentDigest',
    'issuedAt',
    'nonce',
    'principalRef',
    'scopes',
  ].sort()
  if (keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || claims.format !== TOKEN_FORMAT
    || claims.audience !== TOKEN_AUDIENCE
    || typeof claims.principalRef !== 'string'
    || typeof claims.callerRef !== 'string'
    || typeof claims.credentialId !== 'string'
    || !Array.isArray(claims.scopes)
    || !claims.scopes.every((scope) => typeof scope === 'string')
    || typeof claims.intentDigest !== 'string'
    || typeof claims.nonce !== 'string'
    || typeof issuedAt !== 'number'
    || typeof expiresAt !== 'number'
    || !Number.isSafeInteger(issuedAt)
    || !Number.isSafeInteger(expiresAt)
    || !Number.isSafeInteger(now)) {
    return false
  }
  const principal: HostedPaidOperationServicePrincipal = {
    principalRef: claims.principalRef,
    callerRef: claims.callerRef,
    credentialId: claims.credentialId,
    scopes: claims.scopes,
  }
  return validPrincipal(principal)
    && claims.callerRef === `clerk_api_key:${claims.credentialId}`
    && claims.scopes.includes(HOSTED_PAID_OPERATION_AGENT_SCOPE)
    && claims.intentDigest === canonicalDigest(intent as never)
    && claims.nonce.length > 0
    && issuedAt <= now + MAX_CLOCK_SKEW_MS
    && expiresAt > now
    && expiresAt > issuedAt
    && expiresAt - issuedAt <= HOSTED_PAID_OPERATION_SERVICE_TOKEN_TTL_MS
}

function exactIntent(value: HostedPaidOperationServiceIntent): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).sort()
  if (value.kind === 'create') {
    return exactKeys(keys, ['kind', 'providerKey'])
      && (value.providerKey === 'A' || value.providerKey === 'B')
  }
  if (value.kind === 'inspect') {
    return exactKeys(keys, ['expectedInvocationVersion', 'invocationRef', 'kind'])
      && validRef(value.invocationRef)
      && validVersion(value.expectedInvocationVersion)
  }
  if (value.kind === 'current_version') {
    return exactKeys(keys, ['invocationRef', 'kind']) && validRef(value.invocationRef)
  }
  const expected = value.command === 'authorize'
    ? ['accept', 'command', 'commandId', 'expectedInvocationVersion', 'invocationRef', 'kind']
    : ['command', 'commandId', 'expectedInvocationVersion', 'invocationRef', 'kind']
  return value.kind === 'command'
    && exactKeys(keys, expected)
    && validRef(value.invocationRef)
    && validRef(value.commandId)
    && validVersion(value.expectedInvocationVersion)
    && (value.command === 'authorize' || value.command === 'execute' || value.command === 'reconcile')
    && (value.command === 'authorize'
      ? typeof value.accept === 'boolean'
      : value.accept === undefined)
}

function validPrincipal(value: HostedPaidOperationServicePrincipal): boolean {
  return validRef(value.principalRef)
    && validRef(value.callerRef)
    && validRef(value.credentialId)
    && value.scopes.length > 0
    && value.scopes.length <= 32
    && value.scopes.every(validRef)
}

function exactKeys(actual: readonly string[], expected: readonly string[]): boolean {
  const sorted = [...expected].sort()
  return actual.length === sorted.length
    && actual.every((key, index) => key === sorted[index])
}

function validVersion(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function validRef(value: string): boolean {
  return value.trim().length > 0 && value.length <= 300
}

function validKey(value: string): boolean {
  return value.length >= 32
}

async function serviceTokenKey(
  value: string,
  usages: Array<'encrypt' | 'decrypt'>,
): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, usages)
}

function secureRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return new Uint8Array(value).buffer
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function fromBase64Url(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return undefined
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=')
    const binary = atob(padded)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return undefined
  }
}
