import { hkdf } from '@noble/hashes/hkdf'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { constantTimeStringEqual } from '@/lib/server/constant-time'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

export const SourceWriteAdmissionScopeValues = [
  'owner_claim',
  'catalog_publish',
  'removal_dispute',
  'public_inquiry',
  'owner_inquiry',
  'protected_action',
  'billing',
  'admin_operator',
  'discovery_repair',
  'notification_repair',
  'harness_session',
  'agent_identity',
  'answer_thread',
] as const

export type SourceWriteAdmissionScope = (typeof SourceWriteAdmissionScopeValues)[number]

export const SourceWriteKeyFamilyValues = [
  'inquiry',
  'billing',
  'protected',
  'claim',
  'operator',
  'repair',
  'session',
] as const

export type SourceWriteKeyFamily = (typeof SourceWriteKeyFamilyValues)[number]

export type SourceWriteAdmissionRequest = {
  method: string
  origin: string
  pathname: string
  bodyDigest: string
}

export type SourceWriteAdmission = SourceWriteAdmissionRequest & {
  version: 'source-write:v1'
  scope: SourceWriteAdmissionScope
  keyId: string
  operationKey: string
  correlationId: string
  issuedAt: number
  nonce: string
  signature: string
}

export type SourceWriteAdmissionFailureReason =
  | 'missing_source_write_admission'
  | 'missing_source_write_secret'
  | 'source_write_crypto_unavailable'
  | 'source_write_scope_mismatch'
  | 'source_write_key_family_mismatch'
  | 'unknown_source_write_key_id'
  | 'source_write_operation_mismatch'
  | 'source_write_correlation_mismatch'
  | 'source_write_request_mismatch'
  | 'stale_source_write_admission'
  | 'invalid_source_write_signature'

export type SourceWriteAdmissionVerification =
  | { kind: 'accepted'; admission: SourceWriteAdmission }
  | { kind: 'rejected'; reason: SourceWriteAdmissionFailureReason }

export class SourceWriteAdmissionError extends Error {
  readonly code:
    | SourceWriteAdmissionFailureReason
    | 'client_exposed_source_write_secret'
    | 'source_write_provider_secret_reuse'
    | 'missing_source_write_request'

  constructor(code: SourceWriteAdmissionError['code'], message: string) {
    super(message)
    this.name = 'SourceWriteAdmissionError'
    this.code = code
  }
}

type Env = Record<string, string | undefined>

type SourceWriteSigningKey = Readonly<{
  family: SourceWriteKeyFamily
  keyId: string
  secret: string
}>

const nonProdRootSecretName = 'AE_SOURCE_WRITE_SECRET'
const sourceWriteKeySalt = 'agentic-economy:source-write:v2'
const defaultBodyDigest = 'none'

const familyEnvSuffix: Record<SourceWriteKeyFamily, string> = {
  inquiry: 'INQUIRY',
  billing: 'BILLING',
  protected: 'PROTECTED',
  claim: 'CLAIM',
  operator: 'OPERATOR',
  repair: 'REPAIR',
  session: 'SESSION',
}

const defaultDerivedKeyId: Record<SourceWriteKeyFamily, string> = {
  inquiry: 'dev-inquiry-v1',
  billing: 'dev-billing-v1',
  protected: 'dev-protected-v1',
  claim: 'dev-claim-v1',
  operator: 'dev-operator-v1',
  repair: 'dev-repair-v1',
  session: 'dev-session-v1',
}

export function sourceWriteKeyFamilyForScope(scope: SourceWriteAdmissionScope): SourceWriteKeyFamily {
  switch (scope) {
    case 'public_inquiry':
    case 'owner_inquiry':
      return 'inquiry'
    case 'billing':
      return 'billing'
    case 'protected_action':
      return 'protected'
    case 'owner_claim':
    case 'catalog_publish':
    case 'removal_dispute':
      return 'claim'
    case 'admin_operator':
      return 'operator'
    case 'discovery_repair':
    case 'notification_repair':
      return 'repair'
    case 'harness_session':
    case 'agent_identity':
    case 'answer_thread':
      return 'session'
  }
}

export function sourceWriteBodyDigest(body: string | Uint8Array | null | undefined): string {
  if (body === undefined || body === null) {
    return defaultBodyDigest
  }
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return base64UrlNoPadding(sha256(bytes))
}

export function sourceWriteContentDigestHeader(body: string | Uint8Array): string {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return `sha-256=:${base64Standard(sha256(bytes))}:`
}

export function createSourceWriteAdmission(input: {
  env?: Env
  request: SourceWriteAdmissionRequest
  scope: SourceWriteAdmissionScope
  operationKey: string
  correlationId: string
  now?: number
  nonce?: string
}): SourceWriteAdmission {
  const signingKey = resolveActiveSourceWriteSigningKey(input.scope, input.env)
  const admission: Omit<SourceWriteAdmission, 'signature'> = {
    version: 'source-write:v1',
    scope: input.scope,
    keyId: signingKey.keyId,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    issuedAt: input.now ?? Date.now(),
    nonce: input.nonce ?? randomNonce(),
    method: input.request.method,
    origin: input.request.origin,
    pathname: input.request.pathname,
    bodyDigest: input.request.bodyDigest,
  }

  return {
    ...admission,
    signature: sourceWriteSignature(signingKey.secret, admission),
  }
}

export function verifySourceWriteAdmission(input: {
  admission?: SourceWriteAdmission
  env?: Env
  expected: {
    scope: SourceWriteAdmissionScope
    operationKey: string
    correlationId: string
    request?: SourceWriteAdmissionRequest
  }
  now?: number
  maxAgeMs?: number
}): SourceWriteAdmissionVerification {
  if (input.admission === undefined) {
    return { kind: 'rejected', reason: 'missing_source_write_admission' }
  }

  if (input.admission.scope !== input.expected.scope) {
    return { kind: 'rejected', reason: 'source_write_scope_mismatch' }
  }

  if (sourceWriteKeyFamilyForScope(input.admission.scope) !== sourceWriteKeyFamilyForScope(input.expected.scope)) {
    return { kind: 'rejected', reason: 'source_write_key_family_mismatch' }
  }

  if (input.admission.operationKey !== input.expected.operationKey) {
    return { kind: 'rejected', reason: 'source_write_operation_mismatch' }
  }

  if (input.admission.correlationId !== input.expected.correlationId) {
    return { kind: 'rejected', reason: 'source_write_correlation_mismatch' }
  }

  if (input.expected.request !== undefined && !sameRequestBinding(input.admission, input.expected.request)) {
    return { kind: 'rejected', reason: 'source_write_request_mismatch' }
  }

  const maxAgeMs = input.maxAgeMs ?? 5 * 60_000
  const now = input.now ?? Date.now()
  if (Math.abs(now - input.admission.issuedAt) > maxAgeMs) {
    return { kind: 'rejected', reason: 'stale_source_write_admission' }
  }

  const verificationKey = resolveSourceWriteVerificationKey(input.admission, input.env)
  if (verificationKey === undefined) {
    return { kind: 'rejected', reason: 'unknown_source_write_key_id' }
  }

  const expectedSignature = sourceWriteSignature(verificationKey.secret, input.admission)
  if (!constantTimeStringEqual(input.admission.signature, expectedSignature)) {
    return { kind: 'rejected', reason: 'invalid_source_write_signature' }
  }

  return { kind: 'accepted', admission: input.admission }
}

function sourceWriteSigningPayload(admission: Omit<SourceWriteAdmission, 'signature'>): StableHashValue {
  return {
    version: admission.version,
    scope: admission.scope,
    keyId: admission.keyId,
    operationKey: admission.operationKey,
    correlationId: admission.correlationId,
    issuedAt: admission.issuedAt,
    nonce: admission.nonce,
    method: admission.method,
    origin: admission.origin,
    pathname: admission.pathname,
    bodyDigest: admission.bodyDigest,
  }
}

export function resolveActiveSourceWriteSigningKey(
  scope: SourceWriteAdmissionScope,
  env: Env = readProcessEnv()
): SourceWriteSigningKey {
  return resolveSourceWriteKeyring(sourceWriteKeyFamilyForScope(scope), env).active
}

function resolveSourceWriteVerificationKey(
  admission: Pick<SourceWriteAdmission, 'scope' | 'keyId'>,
  env: Env = readProcessEnv()
): SourceWriteSigningKey | undefined {
  const family = sourceWriteKeyFamilyForScope(admission.scope)
  return resolveSourceWriteKeyring(family, env).accepted.find((key) => key.keyId === admission.keyId)
}

export function sourceWriteSignature(secret: string, admission: Omit<SourceWriteAdmission, 'signature'>): string {
  return bytesToHex(hmac(sha256, secret, stableStringify(sourceWriteSigningPayload(admission))))
}

function resolveSourceWriteKeyring(family: SourceWriteKeyFamily, env: Env): {
  active: SourceWriteSigningKey
  accepted: readonly SourceWriteSigningKey[]
} {
  assertNoClientExposedSourceWriteKeys(env)
  const activeEnvName = activeKeyEnvName(family)
  const previousEnvName = previousKeysEnvName(family)
  const activeConfigured = parseConfiguredKey(readEnv(env, activeEnvName), family, activeEnvName)
  const previousConfigured = parseConfiguredKeys(readEnv(env, previousEnvName), family, previousEnvName)

  if (activeConfigured !== undefined) {
    assertNotProviderSecret(activeConfigured.secret, env, activeEnvName)
    for (const key of previousConfigured) {
      assertNotProviderSecret(key.secret, env, previousEnvName)
    }
    return {
      active: activeConfigured,
      accepted: uniqueKeys([activeConfigured, ...previousConfigured]),
    }
  }

  if (isProductionEnv(env)) {
    throw new SourceWriteAdmissionError(
      'missing_source_write_secret',
      `${activeEnvName} is required in production; ${nonProdRootSecretName} fallback is disabled.`
    )
  }

  const root = readEnv(env, nonProdRootSecretName)
  if (root === undefined) {
    throw new SourceWriteAdmissionError(
      'missing_source_write_secret',
      `${activeEnvName} is required, or ${nonProdRootSecretName} may derive scoped non-production keys.`
    )
  }
  assertNotProviderSecret(root, env, nonProdRootSecretName)

  const activeKeyId = readEnv(env, derivedKeyIdEnvName(family)) ?? defaultDerivedKeyId[family]
  const previousKeyIds = readCsvEnv(env, previousDerivedKeyIdsEnvName(family))
  const active = derivedSigningKey(family, activeKeyId, root)
  return {
    active,
    accepted: uniqueKeys([active, ...previousKeyIds.map((keyId) => derivedSigningKey(family, keyId, root))]),
  }
}

function sameRequestBinding(admission: SourceWriteAdmission, request: SourceWriteAdmissionRequest): boolean {
  return (
    admission.method === request.method &&
    admission.origin === request.origin &&
    admission.pathname === request.pathname &&
    admission.bodyDigest === request.bodyDigest
  )
}

function activeKeyEnvName(family: SourceWriteKeyFamily): string {
  return `AE_SOURCE_WRITE_KEY_${familyEnvSuffix[family]}`
}

function previousKeysEnvName(family: SourceWriteKeyFamily): string {
  return `AE_SOURCE_WRITE_PREVIOUS_KEYS_${familyEnvSuffix[family]}`
}

function derivedKeyIdEnvName(family: SourceWriteKeyFamily): string {
  return `AE_SOURCE_WRITE_DERIVED_KEY_ID_${familyEnvSuffix[family]}`
}

function previousDerivedKeyIdsEnvName(family: SourceWriteKeyFamily): string {
  return `AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_${familyEnvSuffix[family]}`
}

function parseConfiguredKeys(
  value: string | undefined,
  family: SourceWriteKeyFamily,
  envName: string
): readonly SourceWriteSigningKey[] {
  if (value === undefined) {
    return []
  }

  return value.split(',').map((entry) => parseConfiguredKey(entry.trim(), family, envName)).filter(isSigningKey)
}

function parseConfiguredKey(
  value: string | undefined,
  family: SourceWriteKeyFamily,
  envName: string
): SourceWriteSigningKey | undefined {
  if (value === undefined || value.length === 0) {
    return undefined
  }

  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1) {
    throw new SourceWriteAdmissionError(
      'missing_source_write_secret',
      `${envName} must use keyId:secret format so source-write signatures are rotation-addressable.`
    )
  }

  return {
    family,
    keyId: value.slice(0, separator).trim(),
    secret: value.slice(separator + 1).trim(),
  }
}

function isSigningKey(value: SourceWriteSigningKey | undefined): value is SourceWriteSigningKey {
  return value !== undefined
}

function uniqueKeys(keys: readonly SourceWriteSigningKey[]): readonly SourceWriteSigningKey[] {
  const seen = new Set<string>()
  const unique: SourceWriteSigningKey[] = []
  for (const key of keys) {
    if (seen.has(key.keyId)) {
      continue
    }
    seen.add(key.keyId)
    unique.push(key)
  }
  return unique
}

function derivedSigningKey(family: SourceWriteKeyFamily, keyId: string, root: string): SourceWriteSigningKey {
  return {
    family,
    keyId,
    secret: bytesToHex(hkdf(sha256, root, sourceWriteKeySalt, `${family}|${keyId}`, 32)),
  }
}

function assertNoClientExposedSourceWriteKeys(env: Env): void {
  const names = [
    nonProdRootSecretName,
    ...SourceWriteKeyFamilyValues.flatMap((family) => [
      activeKeyEnvName(family),
      previousKeysEnvName(family),
      derivedKeyIdEnvName(family),
      previousDerivedKeyIdsEnvName(family),
    ]),
  ]
  for (const name of names) {
    if (readEnv(env, `VITE_${name}`) !== undefined) {
      throw new SourceWriteAdmissionError(
        'client_exposed_source_write_secret',
        `${name} must not be configured with a client-exposed VITE_ prefix.`
      )
    }
  }
}

function assertNotProviderSecret(secret: string, env: Env, envName: string): void {
  const providerSecretNames = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'AUTUMN_SECRET_KEY', 'AUTUMN_WEBHOOK_SECRET']
  for (const providerName of providerSecretNames) {
    const providerSecret = readEnv(env, providerName)
    if (providerSecret !== undefined && constantTimeStringEqual(secret, providerSecret)) {
      throw new SourceWriteAdmissionError(
        'source_write_provider_secret_reuse',
        `${envName} must be independent of ${providerName}.`
      )
    }
  }
}

function isProductionEnv(env: Env): boolean {
  return readEnv(env, 'NODE_ENV') === 'production'
}

function readCsvEnv(env: Env, name: string): readonly string[] {
  const value = readEnv(env, name)
  if (value === undefined) {
    return []
  }
  return value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

function readProcessEnv(): Env {
  return typeof process === 'undefined' ? {} : process.env
}

function randomNonce(): string {
  const crypto = globalThis.crypto
  if (crypto?.randomUUID !== undefined) {
    return crypto.randomUUID()
  }

  if (crypto?.getRandomValues === undefined) {
    throw new SourceWriteAdmissionError('source_write_crypto_unavailable', 'Web Crypto is required for source write admission.')
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

function base64UrlNoPadding(bytes: Uint8Array): string {
  return base64Standard(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64Standard(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}
