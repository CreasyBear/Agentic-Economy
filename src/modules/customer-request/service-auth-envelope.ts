import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

const MAX_ASSERTION_AGE_MS = 30_000

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
  return Object.freeze({ ...input.principal, scopes: Object.freeze([...input.principal.scopes].sort()), issuedAt: input.issuedAt, signature: toBase64Url(new Uint8Array(signature)) })
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
  const signature = fromBase64Url(input.assertion.signature)
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

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch { return undefined }
}
