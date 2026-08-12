import { signatureHeaders, verify, type Component, type Parameters, type RequestLike } from 'http-message-sig'
import { hmac } from '@noble/hashes/hmac'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { base64Codec, tryDecodeBase64Url } from '@/modules/common/base64-codec'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import { isRecord } from '@/modules/common/is-record'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { constantTimeStringEqual } from '@/lib/server/constant-time'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'

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
  'study',
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

export type SourceWriteAdmissionRequest = Readonly<{
  method: string
  initiatorOrigin: string
  targetOrigin: string
  targetPath: string
  targetQuery: string
  bodyDigest: string
}>

export type SourceWriteAdmission = SourceWriteAdmissionRequest & Readonly<{
  version: 'source-write:v2'
  scope: SourceWriteAdmissionScope
  keyId: string
  operationKey: string
  correlationId: string
  commandDigest: string
  issuedAt: number
  nonce: string
  signature: string
  signatureInput: string
}>

export type SourceWriteAdmissionFailureReason =
  | 'missing_source_write_admission'
  | 'missing_source_write_secret'
  | 'source_write_crypto_unavailable'
  | 'source_write_scope_mismatch'
  | 'source_write_key_family_mismatch'
  | 'unknown_source_write_key_id'
  | 'invalid_source_write_key_id'
  | 'source_write_operation_mismatch'
  | 'source_write_correlation_mismatch'
  | 'source_write_command_mismatch'
  | 'missing_source_write_request'
  | 'invalid_source_write_request'
  | 'source_write_method_mismatch'
  | 'source_write_origin_mismatch'
  | 'source_write_target_origin_mismatch'
  | 'source_write_path_mismatch'
  | 'source_write_query_mismatch'
  | 'source_write_body_mismatch'
  | 'invalid_source_write_body_digest'
  | 'stale_source_write_admission'
  | 'invalid_source_write_signature'

export type SourceWriteAdmissionVerification =
  | { kind: 'accepted'; admission: SourceWriteAdmission }
  | { kind: 'rejected'; reason: SourceWriteAdmissionFailureReason }

export class SourceWriteAdmissionError extends Error {
  readonly code: SourceWriteAdmissionFailureReason | 'client_exposed_source_write_secret' | 'source_write_provider_secret_reuse'

  constructor(code: SourceWriteAdmissionError['code'], message: string) {
    super(message)
    this.name = 'SourceWriteAdmissionError'
    this.code = code
  }
}

type Env = Record<string, string | undefined>
type SourceWriteSigningKey = Readonly<{ family: SourceWriteKeyFamily; keyId: string; secret: string }>
type UnsignedSourceWriteAdmission = Omit<SourceWriteAdmission, 'signature' | 'signatureInput'>

export const SOURCE_WRITE_NO_BODY_DIGEST = 'none' as const
export const SOURCE_WRITE_MAX_AGE_MS = 5 * 60_000
export const SOURCE_WRITE_CLOCK_SKEW_MS = 5_000

const nonProdRootSecretName = 'AE_SOURCE_WRITE_SECRET'
const sourceWriteKeySalt = 'agentic-economy:source-write:v2'
const sourceWriteSignatureAlgorithm = 'hmac-sha256' as const
const sourceWriteSignatureLabel = 'sig1'
const sourceWriteKeyIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._~-]{0,127})$/u
const sourceWriteSignatureComponents: Component[] = [
  '@scheme',
  '@authority',
  '@method',
  '@path',
  '@query',
  'content-digest',
  'x-ae-method',
  'x-ae-origin',
  'x-ae-body-digest',
  'x-ae-command-digest',
  'x-ae-scope',
  'x-ae-operation-key',
  'x-ae-correlation-id',
  'x-ae-issued-at',
  'x-ae-nonce',
]

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
  inquiry: 'dev-inquiry-v2',
  billing: 'dev-billing-v2',
  protected: 'dev-protected-v2',
  claim: 'dev-claim-v2',
  operator: 'dev-operator-v2',
  repair: 'dev-repair-v2',
  session: 'dev-session-v2',
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
    case 'study':
      return 'session'
  }
}

export function sourceWriteBodyDigest(body: string | Uint8Array): string {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return base64Codec.toBase64Url(sha256(bytes))
}

export function sourceWriteRequestFromAdmission(admission: SourceWriteAdmission): SourceWriteAdmissionRequest {
  return {
    method: admission.method,
    initiatorOrigin: admission.initiatorOrigin,
    targetOrigin: admission.targetOrigin,
    targetPath: admission.targetPath,
    targetQuery: admission.targetQuery,
    bodyDigest: admission.bodyDigest,
  }
}

function sourceWriteCommandValue(args: unknown): StableHashValue {
  if (!isRecord(args)) {
    throw new SourceWriteAdmissionError('invalid_source_write_request', 'Source write command args must be a plain object.')
  }
  const command: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (key === 'sourceWrite' || key === 'sourceWriteRequest') continue
    command[key] = value
  }
  if (!isBoundedJsonValue(command)) {
    throw new SourceWriteAdmissionError('invalid_source_write_request', 'Source write command args must be bounded Convex JSON.')
  }
  return command as StableHashValue
}

export function sourceWriteCommandBodyDigest(args: unknown): string {
  return sourceWriteBodyDigest(new TextEncoder().encode(stableStringify(sourceWriteCommandValue(args))))
}

export function sourceWriteCommandDigest(args: unknown): string {
  return canonicalDigest(sourceWriteCommandValue(args))
}

export function isSourceWriteBodyDigest(value: string, allowNoBody = false): boolean {
  if (allowNoBody && value === SOURCE_WRITE_NO_BODY_DIGEST) return true
  if (value.length !== 43 || !/^[A-Za-z0-9_-]+$/u.test(value)) return false
  return tryDecodeBase64Url(value)?.length === 32
}

export async function createSourceWriteAdmission(input: {
  env?: Env
  request: SourceWriteAdmissionRequest
  scope: SourceWriteAdmissionScope
  operationKey: string
  correlationId: string
  commandDigest: string
  now?: number
  nonce?: string
  allowNoBody?: boolean
}): Promise<SourceWriteAdmission> {
  validateSourceWriteRequest(input.request, input.allowNoBody === true)
  const signingKey = resolveActiveSourceWriteSigningKey(input.scope, input.env)
  const commandDigest = input.commandDigest
  if (commandDigest === undefined || !/^sha256:[0-9a-f]{64}$/u.test(commandDigest)) {
    throw new SourceWriteAdmissionError('source_write_command_mismatch', 'A canonical source write command digest is required.')
  }
  const issuedAt = input.now ?? new Date().getTime()
  if (!Number.isSafeInteger(issuedAt)) {
    throw new SourceWriteAdmissionError('stale_source_write_admission', 'Source write issuedAt must be a safe integer timestamp.')
  }
  const admission: UnsignedSourceWriteAdmission = {
    version: 'source-write:v2',
    scope: input.scope,
    keyId: signingKey.keyId,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    commandDigest,
    issuedAt,
    nonce: input.nonce ?? randomNonce(),
    ...input.request,
  }

  const headers = await signSourceWriteAdmission(signingKey.secret, admission)
  return { ...admission, signature: headers.Signature, signatureInput: headers['Signature-Input'] }
}

export async function verifySourceWriteAdmission(input: {
  admission?: SourceWriteAdmission
  env?: Env
  expected: {
    scope: SourceWriteAdmissionScope
    operationKey: string
    correlationId: string
    commandDigest?: string
    request?: SourceWriteAdmissionRequest
  }
  now?: number
  maxAgeMs?: number
  allowNoBody?: boolean
}): Promise<SourceWriteAdmissionVerification> {
  if (input.admission === undefined) return { kind: 'rejected', reason: 'missing_source_write_admission' }
  const admission = input.admission
  if (admission.version !== 'source-write:v2') return { kind: 'rejected', reason: 'invalid_source_write_signature' }
  if (!SourceWriteAdmissionScopeValues.includes(admission.scope)) return { kind: 'rejected', reason: 'source_write_scope_mismatch' }
  if (admission.scope !== input.expected.scope) return { kind: 'rejected', reason: 'source_write_scope_mismatch' }
  if (sourceWriteKeyFamilyForScope(admission.scope) !== sourceWriteKeyFamilyForScope(input.expected.scope)) {
    return { kind: 'rejected', reason: 'source_write_key_family_mismatch' }
  }
  if (!sourceWriteKeyIdPattern.test(admission.keyId)) return { kind: 'rejected', reason: 'invalid_source_write_key_id' }
  if (admission.operationKey !== input.expected.operationKey) return { kind: 'rejected', reason: 'source_write_operation_mismatch' }
  if (admission.correlationId !== input.expected.correlationId) return { kind: 'rejected', reason: 'source_write_correlation_mismatch' }
  if (!/^sha256:[0-9a-f]{64}$/u.test(admission.commandDigest)) {
    return { kind: 'rejected', reason: 'source_write_command_mismatch' }
  }
  if (input.expected.commandDigest !== undefined && admission.commandDigest !== input.expected.commandDigest) {
    return { kind: 'rejected', reason: 'source_write_command_mismatch' }
  }

  const allowNoBody = input.allowNoBody ?? input.expected.request === undefined
  try {
    validateSourceWriteRequest(admission, allowNoBody)
  } catch (error) {
    return { kind: 'rejected', reason: sourceWriteErrorReason(error) }
  }
  if (input.expected.request !== undefined) {
    try {
      validateSourceWriteRequest(input.expected.request, allowNoBody)
    } catch (error) {
      return { kind: 'rejected', reason: sourceWriteErrorReason(error) }
    }
    const mismatch = requestBindingMismatch(admission, input.expected.request)
    if (mismatch !== undefined) return { kind: 'rejected', reason: mismatch }
  }

  const maxAgeMs = input.maxAgeMs ?? SOURCE_WRITE_MAX_AGE_MS
  const now = input.now ?? new Date().getTime()
  if (!Number.isFinite(now) || !Number.isSafeInteger(admission.issuedAt)
    || admission.issuedAt > now + SOURCE_WRITE_CLOCK_SKEW_MS
    || now - admission.issuedAt > maxAgeMs) {
    return { kind: 'rejected', reason: 'stale_source_write_admission' }
  }

  const verificationKey = resolveSourceWriteVerificationKey(admission, input.env)
  if (verificationKey === undefined) return { kind: 'rejected', reason: 'unknown_source_write_key_id' }

  try {
    const expectedHeaders = await signSourceWriteAdmission(verificationKey.secret, admission)
    if (expectedHeaders['Signature-Input'] !== admission.signatureInput) {
      return { kind: 'rejected', reason: 'invalid_source_write_signature' }
    }

    const valid = await verify(
      sourceWriteMessage(admission, {
        signature: admission.signature,
        'signature-input': admission.signatureInput,
      }),
      (signedData, signature, parameters) => {
        if (!sourceWriteSignatureParametersMatch(admission, parameters)) return false
        const expectedSignature = sourceWriteHmac(verificationKey.secret, signedData)
        return constantTimeStringEqual(base64Codec.toBase64(signature), base64Codec.toBase64(expectedSignature))
      },
    )
    if (!valid) return { kind: 'rejected', reason: 'invalid_source_write_signature' }
  } catch {
    return { kind: 'rejected', reason: 'invalid_source_write_signature' }
  }

  return { kind: 'accepted', admission }
}

async function signSourceWriteAdmission(
  secret: string,
  admission: UnsignedSourceWriteAdmission | SourceWriteAdmission,
): Promise<{ Signature: string; 'Signature-Input': string }> {
  return signatureHeaders(sourceWriteMessage(admission), {
    signer: {
      keyid: admission.keyId,
      alg: sourceWriteSignatureAlgorithm,
      sign: (signedData) => sourceWriteHmac(secret, signedData),
    },
    components: sourceWriteSignatureComponents,
    key: sourceWriteSignatureLabel,
    created: new Date(admission.issuedAt),
    expires: new Date(admission.issuedAt + SOURCE_WRITE_MAX_AGE_MS + SOURCE_WRITE_CLOCK_SKEW_MS),
    nonce: admission.nonce,
  })
}

function sourceWriteSignatureParametersMatch(admission: SourceWriteAdmission, parameters: Parameters): boolean {
  return parameters.alg === sourceWriteSignatureAlgorithm
    && parameters.keyid === admission.keyId
    && parameters.nonce === admission.nonce
    && parameters.created?.getTime() === Math.floor(admission.issuedAt / 1000) * 1000
    && parameters.expires?.getTime() === Math.floor((admission.issuedAt + SOURCE_WRITE_MAX_AGE_MS + SOURCE_WRITE_CLOCK_SKEW_MS) / 1000) * 1000
}

function sourceWriteHmac(secret: string, signedData: string): Uint8Array {
  return hmac(sha256, secret, new TextEncoder().encode(signedData))
}

function sourceWriteMessage(
  admission: UnsignedSourceWriteAdmission | SourceWriteAdmission,
  signedHeaders: Record<string, string> = {},
): RequestLike {
  return {
    method: admission.method,
    url: `${admission.targetOrigin}${admission.targetPath}${admission.targetQuery}`,
    headers: {
      'content-digest': sourceWriteContentDigestHeader(admission.bodyDigest),
      'x-ae-method': admission.method,
      'x-ae-origin': admission.initiatorOrigin,
      'x-ae-body-digest': admission.bodyDigest,
      'x-ae-command-digest': admission.commandDigest,
      'x-ae-scope': admission.scope,
      'x-ae-operation-key': admission.operationKey,
      'x-ae-correlation-id': admission.correlationId,
      'x-ae-issued-at': String(admission.issuedAt),
      'x-ae-nonce': admission.nonce,
      ...signedHeaders,
    },
  }
}

function sourceWriteContentDigestHeader(bodyDigest: string): string {
  const digest = bodyDigest === SOURCE_WRITE_NO_BODY_DIGEST
    ? sha256(new Uint8Array())
    : tryDecodeBase64Url(bodyDigest)
  if (digest === undefined || digest.length !== 32) {
    throw new SourceWriteAdmissionError('invalid_source_write_body_digest', 'Source write body digest must be exactly 32-byte base64url.')
  }
  return `sha-256=:${base64Codec.toBase64(digest)}:`
}

export function resolveActiveSourceWriteSigningKey(scope: SourceWriteAdmissionScope, env: Env = readProcessEnv()): SourceWriteSigningKey {
  return resolveSourceWriteKeyring(sourceWriteKeyFamilyForScope(scope), env).active
}

function resolveSourceWriteVerificationKey(
  admission: Pick<SourceWriteAdmission, 'scope' | 'keyId'>,
  env: Env = readProcessEnv(),
): SourceWriteSigningKey | undefined {
  const family = sourceWriteKeyFamilyForScope(admission.scope)
  return resolveSourceWriteKeyring(family, env).accepted.find((key) => key.keyId === admission.keyId)
}

function resolveSourceWriteKeyring(family: SourceWriteKeyFamily, env: Env): { active: SourceWriteSigningKey; accepted: readonly SourceWriteSigningKey[] } {
  assertNoClientExposedSourceWriteKeys(env)
  const activeEnvName = activeKeyEnvName(family)
  const previousEnvName = previousKeysEnvName(family)
  const activeConfigured = parseConfiguredKey(readTrimmedEnv(env, activeEnvName), family, activeEnvName)
  const previousConfigured = parseConfiguredKeys(readTrimmedEnv(env, previousEnvName), family, previousEnvName)

  if (activeConfigured !== undefined) {
    assertNotProviderSecret(activeConfigured.secret, env, activeEnvName)
    for (const key of previousConfigured) assertNotProviderSecret(key.secret, env, previousEnvName)
    return { active: activeConfigured, accepted: uniqueKeys([activeConfigured, ...previousConfigured]) }
  }

  if (isProductionEnv(env)) {
    throw new SourceWriteAdmissionError('missing_source_write_secret', `${activeEnvName} is required in production; ${nonProdRootSecretName} fallback is disabled.`)
  }

  const root = readTrimmedEnv(env, nonProdRootSecretName)
  if (root === undefined) {
    throw new SourceWriteAdmissionError('missing_source_write_secret', `${activeEnvName} is required, or ${nonProdRootSecretName} may derive scoped non-production keys.`)
  }
  assertKeyMaterial(root, nonProdRootSecretName)
  assertNotProviderSecret(root, env, nonProdRootSecretName)

  const activeKeyId = readTrimmedEnv(env, derivedKeyIdEnvName(family)) ?? defaultDerivedKeyId[family]
  const previousKeyIds = readCsvEnv(env, previousDerivedKeyIdsEnvName(family))
  const active = derivedSigningKey(family, activeKeyId, root)
  return { active, accepted: uniqueKeys([active, ...previousKeyIds.map((keyId) => derivedSigningKey(family, keyId, root))]) }
}

function requestBindingMismatch(
  admission: SourceWriteAdmission,
  request: SourceWriteAdmissionRequest,
): Extract<SourceWriteAdmissionFailureReason, `${'source_write' | 'invalid'}_${string}`> | undefined {
  if (admission.method !== request.method) return 'source_write_method_mismatch'
  if (admission.initiatorOrigin !== request.initiatorOrigin) return 'source_write_origin_mismatch'
  if (admission.targetOrigin !== request.targetOrigin) return 'source_write_target_origin_mismatch'
  if (admission.targetPath !== request.targetPath) return 'source_write_path_mismatch'
  if (admission.targetQuery !== request.targetQuery) return 'source_write_query_mismatch'
  if (admission.bodyDigest !== request.bodyDigest) return 'source_write_body_mismatch'
  return undefined
}

function validateSourceWriteRequest(request: SourceWriteAdmissionRequest, allowNoBody: boolean): void {
  if (!isMethodToken(request.method)) {
    throw new SourceWriteAdmissionError('invalid_source_write_request', 'Source write method must be an HTTP token.')
  }
  if (!isOrigin(request.initiatorOrigin) || !isOrigin(request.targetOrigin)) {
    throw new SourceWriteAdmissionError('invalid_source_write_request', 'Source write origins must be absolute origins.')
  }
  if (!request.targetPath.startsWith('/') || request.targetPath.includes('?') || request.targetPath.includes('#')) {
    throw new SourceWriteAdmissionError('invalid_source_write_request', 'Source write targetPath must be an absolute path without query or fragment.')
  }
  if (request.targetQuery !== '' && (!request.targetQuery.startsWith('?') || request.targetQuery.includes('#'))) {
    throw new SourceWriteAdmissionError('invalid_source_write_request', 'Source write targetQuery must be empty or preserve the URL search string.')
  }
  try {
    new URL(`${request.targetOrigin}${request.targetPath}${request.targetQuery}`)
  } catch {
    throw new SourceWriteAdmissionError('invalid_source_write_request', 'Source write target URL is invalid.')
  }
  if (!isSourceWriteBodyDigest(request.bodyDigest, allowNoBody)) {
    throw new SourceWriteAdmissionError('invalid_source_write_body_digest', 'Source write body digest must be exactly 32-byte base64url.')
  }
}

function isMethodToken(value: string): boolean {
  return value.length > 0 && value.length <= 32 && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(value)
}

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === value && url.username === '' && url.password === '' && url.pathname === '/' && url.search === '' && url.hash === ''
  } catch {
    return false
  }
}

function sourceWriteErrorReason(error: unknown): SourceWriteAdmissionFailureReason {
  if (error instanceof SourceWriteAdmissionError) return error.code as SourceWriteAdmissionFailureReason
  return 'invalid_source_write_request'
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

function parseConfiguredKeys(value: string | undefined, family: SourceWriteKeyFamily, envName: string): readonly SourceWriteSigningKey[] {
  if (value === undefined) return []
  return value.split(',').map((entry) => parseConfiguredKey(entry.trim(), family, envName)).filter(isSigningKey)
}

function parseConfiguredKey(value: string | undefined, family: SourceWriteKeyFamily, envName: string): SourceWriteSigningKey | undefined {
  if (value === undefined || value.length === 0) return undefined
  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1) {
    throw new SourceWriteAdmissionError('missing_source_write_secret', `${envName} must use keyId:secret format.`)
  }
  const keyId = value.slice(0, separator).trim()
  const secret = value.slice(separator + 1).trim()
  assertKeyId(keyId, envName)
  assertKeyMaterial(secret, envName)
  return { family, keyId, secret }
}

function isSigningKey(value: SourceWriteSigningKey | undefined): value is SourceWriteSigningKey {
  return value !== undefined
}

function uniqueKeys(keys: readonly SourceWriteSigningKey[]): readonly SourceWriteSigningKey[] {
  const seen = new Set<string>()
  const unique: SourceWriteSigningKey[] = []
  for (const key of keys) {
    if (seen.has(key.keyId)) continue
    seen.add(key.keyId)
    unique.push(key)
  }
  return unique
}

function derivedSigningKey(family: SourceWriteKeyFamily, keyId: string, root: string): SourceWriteSigningKey {
  assertKeyId(keyId, `${nonProdRootSecretName} derived key id`)
  assertKeyMaterial(root, nonProdRootSecretName)
  return { family, keyId, secret: bytesToHex(hkdf(sha256, root, sourceWriteKeySalt, `${family}|${keyId}`, 32)) }
}

function assertKeyId(keyId: string, envName: string): void {
  if (!sourceWriteKeyIdPattern.test(keyId)) {
    throw new SourceWriteAdmissionError('invalid_source_write_key_id', `${envName} key id must match ${sourceWriteKeyIdPattern.source}.`)
  }
}

function assertKeyMaterial(secret: string, envName: string): void {
  if (new TextEncoder().encode(secret).length < 32) {
    throw new SourceWriteAdmissionError('missing_source_write_secret', `${envName} must contain at least 32 bytes of key material.`)
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
    if (readTrimmedEnv(env, `VITE_${name}`) !== undefined) {
      throw new SourceWriteAdmissionError('client_exposed_source_write_secret', `${name} must not use a client-exposed VITE_ prefix.`)
    }
  }
}

function assertNotProviderSecret(secret: string, env: Env, envName: string): void {
  const providerSecretNames = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'AUTUMN_SECRET_KEY', 'AUTUMN_WEBHOOK_SECRET']
  for (const providerName of providerSecretNames) {
    const providerSecret = readTrimmedEnv(env, providerName)
    if (providerSecret !== undefined && constantTimeStringEqual(secret, providerSecret)) {
      throw new SourceWriteAdmissionError('source_write_provider_secret_reuse', `${envName} must be independent of ${providerName}.`)
    }
  }
}

function isProductionEnv(env: Env): boolean {
  return readTrimmedEnv(env, 'NODE_ENV') === 'production'
}
function readCsvEnv(env: Env, name: string): readonly string[] {
  const value = readTrimmedEnv(env, name)
  if (value === undefined) return []
  return value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
}
function readProcessEnv(): Env {
  return typeof process === 'undefined' ? {} : process.env
}
function randomNonce(): string {
  const crypto = globalThis.crypto
  if (crypto?.randomUUID !== undefined) return crypto.randomUUID()
  if (crypto?.getRandomValues === undefined) {
    throw new SourceWriteAdmissionError('source_write_crypto_unavailable', 'Web Crypto is required for source write admission.')
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}
