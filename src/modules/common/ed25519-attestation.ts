import { ed25519 } from '@noble/curves/ed25519'
import { bytesToHex } from '@noble/hashes/utils'

const encoder = new TextEncoder()
const keyPattern = /^[0-9a-f]{64}$/

export type Ed25519SigningKey = Readonly<{ keyId: string; privateKey: string }>
export type Ed25519VerificationKey = Readonly<{ keyId: string; publicKey: string }>
export type Ed25519Attestation = Readonly<{
  signingKeyId: string
  signingPublicKey: string
  signature: string
}>

export function ed25519PublicKey(privateKey: string, invalidError: string): string {
  if (!keyPattern.test(privateKey)) throw new Error(invalidError)
  return bytesToHex(ed25519.getPublicKey(privateKey))
}

export function signEd25519Attestation(
  digest: string,
  key: Ed25519SigningKey,
  invalidError: string,
): Ed25519Attestation {
  if (key.keyId.trim().length === 0 || !keyPattern.test(key.privateKey)) throw new Error(invalidError)
  return Object.freeze({
    signingKeyId: key.keyId,
    signingPublicKey: ed25519PublicKey(key.privateKey, invalidError),
    signature: `ed25519:${bytesToHex(ed25519.sign(encoder.encode(digest), key.privateKey))}`,
  })
}

export function verifyEd25519Attestation(
  digest: string,
  attestation: Ed25519Attestation,
  trusted: readonly Ed25519VerificationKey[],
): boolean {
  const trustedKey = trusted.find((key) => key.keyId === attestation.signingKeyId)
  if (trustedKey === undefined || trustedKey.publicKey !== attestation.signingPublicKey
    || !keyPattern.test(attestation.signingPublicKey)
    || !/^ed25519:[0-9a-f]{128}$/.test(attestation.signature)) return false
  return ed25519.verify(
    attestation.signature.slice('ed25519:'.length),
    encoder.encode(digest),
    attestation.signingPublicKey,
  )
}

export function resolveEd25519Keyring(input: Readonly<{
  activeValue: string | undefined
  previousValues: string | undefined
  activeError: string
  previousError: string
  conflictError: string
}>): Readonly<{ active: Ed25519SigningKey; trusted: readonly Ed25519VerificationKey[] }> {
  const active = parseKey(input.activeValue, input.activeError)
  const trusted: Ed25519VerificationKey[] = [{
    keyId: active.keyId,
    publicKey: ed25519PublicKey(active.material, input.activeError),
  }]
  const previous = input.previousValues?.trim()
  if (previous !== undefined && previous.length > 0) {
    for (const value of previous.split(',')) {
      const parsed = parseKey(value.trim(), input.previousError)
      if (trusted.some((key) => key.keyId === parsed.keyId)) throw new Error(input.conflictError)
      trusted.push({ keyId: parsed.keyId, publicKey: parsed.material })
    }
  }
  return Object.freeze({
    active: Object.freeze({ keyId: active.keyId, privateKey: active.material }),
    trusted: Object.freeze(trusted.map((key) => Object.freeze(key))),
  })
}

function parseKey(value: string | undefined, error: string): { keyId: string; material: string } {
  const separator = value?.lastIndexOf(':') ?? -1
  const keyId = separator <= 0 ? '' : value!.slice(0, separator).trim()
  const material = separator <= 0 ? '' : value!.slice(separator + 1).trim().toLowerCase()
  if (keyId.length === 0 || !keyPattern.test(material)) throw new Error(error)
  return { keyId, material }
}
