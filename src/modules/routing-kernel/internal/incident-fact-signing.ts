import { ed25519 } from '@noble/curves/ed25519'
import { bytesToHex } from '@noble/hashes/utils'

const encoder = new TextEncoder()
const privateKeyPattern = /^[0-9a-f]{64}$/
const publicKeyPattern = /^[0-9a-f]{64}$/

export type IncidentFactSigningKey = Readonly<{ keyId: string; privateKey: string }>
export type IncidentFactVerificationKey = Readonly<{ keyId: string; publicKey: string }>
export type IncidentFactSignature = Readonly<{
  signingKeyId: string
  signingPublicKey: string
  factSignature: string
}>

export function incidentFactPublicKey(privateKey: string): string {
  if (!privateKeyPattern.test(privateKey)) throw new Error('incident_fact_private_key_invalid')
  return bytesToHex(ed25519.getPublicKey(privateKey))
}

export function signIncidentFact(factDigest: string, key: IncidentFactSigningKey): IncidentFactSignature {
  if (key.keyId.trim().length === 0 || !privateKeyPattern.test(key.privateKey)) throw new Error('incident_fact_signing_key_invalid')
  return Object.freeze({
    signingKeyId: key.keyId,
    signingPublicKey: incidentFactPublicKey(key.privateKey),
    factSignature: `ed25519:${bytesToHex(ed25519.sign(encoder.encode(factDigest), key.privateKey))}`,
  })
}

export function verifyIncidentFact(
  factDigest: string,
  signature: IncidentFactSignature,
  trusted: readonly IncidentFactVerificationKey[],
): boolean {
  const trustedKey = trusted.find((key) => key.keyId === signature.signingKeyId)
  if (trustedKey === undefined || trustedKey.publicKey !== signature.signingPublicKey
    || !publicKeyPattern.test(signature.signingPublicKey)
    || !/^ed25519:[0-9a-f]{128}$/.test(signature.factSignature)) return false
  return ed25519.verify(signature.factSignature.slice('ed25519:'.length), encoder.encode(factDigest), signature.signingPublicKey)
}

export function resolveIncidentFactKeyring(env: Readonly<Record<string, string | undefined>>): Readonly<{
  active: IncidentFactSigningKey
  trusted: readonly IncidentFactVerificationKey[]
}> {
  const active = parseKey(env.ROUTING_KERNEL_FACT_SIGNING_KEY, privateKeyPattern, 'incident_fact_signing_key_invalid')
  const trusted = [{ keyId: active.keyId, publicKey: incidentFactPublicKey(active.material) }]
  const previous = env.ROUTING_KERNEL_FACT_PREVIOUS_PUBLIC_KEYS?.trim()
  if (previous !== undefined && previous.length > 0) {
    for (const value of previous.split(',')) {
      const parsed = parseKey(value.trim(), publicKeyPattern, 'incident_fact_previous_key_invalid')
      if (trusted.some((key) => key.keyId === parsed.keyId)) throw new Error('incident_fact_key_id_conflict')
      trusted.push({ keyId: parsed.keyId, publicKey: parsed.material })
    }
  }
  return Object.freeze({
    active: Object.freeze({ keyId: active.keyId, privateKey: active.material }),
    trusted: Object.freeze(trusted.map((key) => Object.freeze(key))),
  })
}

function parseKey(value: string | undefined, materialPattern: RegExp, error: string): { keyId: string; material: string } {
  const separator = value?.lastIndexOf(':') ?? -1
  const keyId = separator <= 0 ? '' : value!.slice(0, separator).trim()
  const material = separator <= 0 ? '' : value!.slice(separator + 1).trim().toLowerCase()
  if (keyId.length === 0 || !materialPattern.test(material)) throw new Error(error)
  return { keyId, material }
}
