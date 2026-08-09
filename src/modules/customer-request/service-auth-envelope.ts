import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { base64Codec, tryDecodeBase64Url } from '@/modules/common/base64-codec'
import type { StableHashValue } from '@/modules/common/stable-hash'

const MAX_ASSERTION_AGE_MS = 30_000

export function toStableHashValue(value: unknown): StableHashValue {
  if (!isBoundedJsonValue(value)) throw new Error('canonical_digest_value_invalid')
  return value
}

export type CustomerRequestServicePrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  scopes: readonly string[]
}>

export type CustomerRequestServiceAssertion = CustomerRequestServicePrincipal & Readonly<{
  issuedAt: number
  signature: string
}>

export async function createCustomerRequestServiceAssertion(input: Readonly<{
  key: string
  operation: string
  command: StableHashValue
  principal: CustomerRequestServicePrincipal
  issuedAt: number
}>): Promise<CustomerRequestServiceAssertion> {
  const material = assertionMaterial(input.operation, input.command, input.principal, input.issuedAt)
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(input.key, ['sign']), new TextEncoder().encode(material))
  return Object.freeze({ ...input.principal, scopes: Object.freeze([...input.principal.scopes].sort()), issuedAt: input.issuedAt, signature: base64Codec.toBase64Url(new Uint8Array(signature)) })
}

export async function verifyCustomerRequestServiceAssertion(input: Readonly<{
  key: string
  operation: string
  command: StableHashValue
  assertion: CustomerRequestServiceAssertion
  now?: number
}>): Promise<boolean> {
  const now = input.now ?? Date.now()
  if (!validPrincipal(input.assertion) || !Number.isSafeInteger(input.assertion.issuedAt)
    || input.assertion.issuedAt > now + 5_000 || now - input.assertion.issuedAt > MAX_ASSERTION_AGE_MS) return false
  const signature = tryDecodeBase64Url(input.assertion.signature)
  if (signature === undefined) return false
  return await crypto.subtle.verify(
    'HMAC',
    await hmacKey(input.key, ['verify']),
    new Uint8Array(signature).buffer,
    new TextEncoder().encode(assertionMaterial(input.operation, input.command, input.assertion, input.assertion.issuedAt)),
  )
}

function assertionMaterial(
  operation: string,
  command: StableHashValue,
  principal: CustomerRequestServicePrincipal,
  issuedAt: number,
): string {
  return canonicalDigest({
    contract: 'ae-customer-request-service-auth:v1', operation,
    commandDigest: canonicalDigest(command), principalId: principal.principalId,
    ownerId: principal.ownerId, credentialId: principal.credentialId,
    scopes: [...principal.scopes].sort(), issuedAt,
  })
}

function validPrincipal(value: CustomerRequestServicePrincipal): boolean {
  return valid(value.principalId) && valid(value.ownerId) && valid(value.credentialId)
    && value.scopes.length > 0 && value.scopes.length <= 32 && value.scopes.every(valid)
}

function valid(value: string): boolean { return value.trim().length > 0 && value.length <= 300 }

async function hmacKey(value: string, usages: Array<'sign' | 'verify'>) {
  if (value.length < 32) throw new Error('customer_request_service_key_invalid')
  return await crypto.subtle.importKey('raw', new TextEncoder().encode(value), { name: 'HMAC', hash: 'SHA-256' }, false, usages)
}

